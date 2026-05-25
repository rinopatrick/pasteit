"""Paste CRUD, verify, fork, import, download, versions, validation, embed, QR, analytics, tags."""

import ast
import base64
import json
import math
import os
import re
import urllib.request
from datetime import datetime
from typing import Optional
from xml.etree.ElementTree import ParseError as XMLParseError, fromstring as xml_fromstring

import nanoid
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func

from database import SessionLocal, LANG_EXT_MAP, URL_LANG_MAP
from helpers import encrypt_content, decrypt_content, generate_qr_svg, fire_webhook
from auth import get_current_user
from models import Paste, PasteVersion, PasteView, Tag, PasteTag, User
from schemas import (
    PasteCreate, PasteResponse, PasteListItem, PaginatedPastes,
    PasteUpdate, VerifyPassword, PasteImport, RESERVED_IDS,
    ExpiryOption, ValidateRequest, TagCreate, DailyStats,
)

from datetime import timedelta

EXPIRY_MAP = {
    ExpiryOption.ten_minutes: timedelta(minutes=10),
    ExpiryOption.one_hour: timedelta(hours=1),
    ExpiryOption.one_day: timedelta(days=1),
    ExpiryOption.one_week: timedelta(weeks=1),
}

router = APIRouter()


@router.post("/api/pastes", response_model=PasteResponse)
def create_paste(paste_in: PasteCreate, request: Request):
    db = SessionLocal()
    if paste_in.custom_id:
        cid = paste_in.custom_id.strip()
        if len(cid) < 3 or len(cid) > 20:
            db.close(); raise HTTPException(400, "Custom ID must be 3-20 characters")
        if not re.match(r'^[a-zA-Z0-9-]+$', cid):
            db.close(); raise HTTPException(400, "Custom ID must be alphanumeric or hyphens")
        if cid.lower() in RESERVED_IDS:
            db.close(); raise HTTPException(400, "This ID is reserved")
        if db.query(Paste).filter(Paste.id == cid).first():
            db.close(); raise HTTPException(409, "This ID is already taken")
        paste_id = cid
    else:
        paste_id = nanoid.generate(size=6)
    edit_token = nanoid.generate(size=6)
    expires_at = None
    if paste_in.expiry != ExpiryOption.never:
        expires_at = datetime.utcnow() + EXPIRY_MAP[paste_in.expiry]
    content = paste_in.content
    is_encrypted = False
    if paste_in.password:
        content = encrypt_content(paste_in.content, paste_in.password)
        is_encrypted = True
    elif paste_in.e2e:
        is_encrypted = True
    scheduled_at = None
    if paste_in.scheduled_at:
        try:
            scheduled_at = datetime.fromisoformat(paste_in.scheduled_at)
        except Exception:
            pass
    user = get_current_user(request)
    user_id = user["sub"] if user else None
    paste = Paste(
        id=paste_id, title=paste_in.title, content=content,
        language=paste_in.language, burn_after_read=paste_in.burn_after_read,
        expires_at=expires_at, is_encrypted=is_encrypted,
        edit_token=edit_token, collection_id=paste_in.collection_id,
        user_id=user_id, scheduled_at=scheduled_at,
    )
    db.add(paste)
    db.commit()
    db.refresh(paste)
    if paste_in.tags:
        for tag_name in paste_in.tags:
            tag_name = tag_name.strip().lower()
            if not tag_name:
                continue
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if not tag:
                tag = Tag(name=tag_name); db.add(tag); db.flush()
            db.add(PasteTag(paste_id=paste_id, tag_id=tag.id))
        db.commit()
    result = PasteResponse(
        id=paste.id, title=paste.title, content=paste_in.content if not is_encrypted else "[Encrypted]",
        language=paste.language, burn_after_read=paste.burn_after_read,
        expires_at=paste.expires_at, created_at=paste.created_at,
        view_count=paste.view_count, is_encrypted=paste.is_encrypted,
        edit_token=edit_token, fork_count=paste.fork_count,
        forked_from=paste.forked_from, collection_id=paste.collection_id,
        user_id=paste.user_id, username=user["username"] if user else None,
    )
    db.close()
    return result


@router.get("/api/pastes", response_model=PaginatedPastes)
def list_pastes(search: Optional[str] = None, page: int = 1, per_page: int = 20,
                collection_id: Optional[str] = None, tag: Optional[str] = None):
    db = SessionLocal()
    now = datetime.utcnow()
    page = max(1, page)
    per_page = max(1, min(100, per_page))
    query = db.query(Paste).filter((Paste.expires_at == None) | (Paste.expires_at > now))
    if search:
        like = f"%{search}%"
        query = query.filter((Paste.title.ilike(like)) | (Paste.id.ilike(like)))
    if collection_id:
        query = query.filter(Paste.collection_id == collection_id)
    if tag:
        query = query.join(PasteTag).join(Tag).filter(Tag.name == tag.lower())
    total = query.count()
    total_pages = max(1, math.ceil(total / per_page))
    pastes = query.order_by(Paste.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    result = PaginatedPastes(
        pastes=[PasteListItem(
            id=p.id, title=p.title, language=p.language,
            burn_after_read=p.burn_after_read, created_at=p.created_at,
            view_count=p.view_count, is_encrypted=p.is_encrypted,
            fork_count=p.fork_count, collection_id=p.collection_id,
        ) for p in pastes],
        total=total, page=page, per_page=per_page, total_pages=total_pages,
    )
    db.close()
    return result


@router.get("/api/pastes/{paste_id}", response_model=PasteResponse)
def get_paste(paste_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    if paste.scheduled_at and paste.scheduled_at > datetime.utcnow():
        db.close(); raise HTTPException(404, "Paste not found")
    if paste.expires_at and paste.expires_at < datetime.utcnow():
        db.delete(paste); db.commit(); db.close()
        raise HTTPException(410, "Paste has expired")
    paste.view_count += 1
    view = PasteView(paste_id=paste_id)
    db.add(view)
    if paste.burn_after_read:
        content = paste.content
        title = paste.title; language = paste.language; created_at = paste.created_at
        view_count = paste.view_count; pid = paste.id; burn = paste.burn_after_read
        expires = paste.expires_at; encrypted = paste.is_encrypted
        fork_c = paste.fork_count; forked = paste.forked_from
        coll = paste.collection_id; uid = paste.user_id
        db.delete(paste); db.commit(); db.close()
        display_content = "[Encrypted content. Provide password to decrypt.]" if encrypted else content
        return PasteResponse(id=pid, title=title, content=display_content, language=language,
            burn_after_read=burn, expires_at=expires, created_at=created_at,
            view_count=view_count, is_encrypted=encrypted,
            fork_count=fork_c, forked_from=forked, collection_id=coll, user_id=uid)
    db.commit()
    display_content = "[Encrypted content. Provide password to decrypt.]" if paste.is_encrypted else paste.content
    username = None
    if paste.user_id:
        user = db.query(User).filter(User.id == paste.user_id).first()
        if user:
            username = user.username
    result = PasteResponse(
        id=paste.id, title=paste.title, content=display_content,
        language=paste.language, burn_after_read=paste.burn_after_read,
        expires_at=paste.expires_at, created_at=paste.created_at,
        view_count=paste.view_count, is_encrypted=paste.is_encrypted,
        fork_count=paste.fork_count, forked_from=paste.forked_from,
        collection_id=paste.collection_id, user_id=paste.user_id, username=username,
    )
    db.close()
    return result


@router.put("/api/pastes/{paste_id}")
def update_paste(paste_id: str, update: PasteUpdate, edit_token: Optional[str] = None):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    if paste.edit_token != edit_token:
        db.close(); raise HTTPException(403, "Invalid edit token")
    if update.content is not None and update.content != paste.content:
        max_ver = db.query(func.max(PasteVersion.version_number)).filter(PasteVersion.paste_id == paste_id).scalar() or 0
        version = PasteVersion(paste_id=paste_id, content=paste.content, title=paste.title, language=paste.language, version_number=max_ver + 1)
        db.add(version)
        count = db.query(PasteVersion).filter(PasteVersion.paste_id == paste_id).count()
        if count >= 50:
            oldest = db.query(PasteVersion).filter(PasteVersion.paste_id == paste_id).order_by(PasteVersion.version_number.asc()).first()
            if oldest:
                db.delete(oldest)
    if update.title is not None:
        paste.title = update.title
    if update.content is not None:
        paste.content = update.content
    if update.language is not None:
        paste.language = update.language
    db.commit()
    db.refresh(paste)
    result = PasteResponse(
        id=paste.id, title=paste.title, content=paste.content,
        language=paste.language, burn_after_read=paste.burn_after_read,
        expires_at=paste.expires_at, created_at=paste.created_at,
        view_count=paste.view_count, is_encrypted=paste.is_encrypted,
        fork_count=paste.fork_count, forked_from=paste.forked_from,
        collection_id=paste.collection_id, user_id=paste.user_id,
    )
    db.close()
    return result


@router.delete("/api/pastes/{paste_id}")
def delete_paste(paste_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    db.delete(paste); db.commit(); db.close()
    return {"detail": "Deleted"}


@router.post("/api/pastes/{paste_id}/verify", response_model=PasteResponse)
def verify_paste(paste_id: str, body: VerifyPassword):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    if not paste.is_encrypted:
        db.close(); raise HTTPException(400, "Paste is not encrypted")
    try:
        content = decrypt_content(paste.content, body.password)
    except Exception:
        db.close(); raise HTTPException(403, "Wrong password")
    result = PasteResponse(
        id=paste.id, title=paste.title, content=content,
        language=paste.language, burn_after_read=paste.burn_after_read,
        expires_at=paste.expires_at, created_at=paste.created_at,
        view_count=paste.view_count, is_encrypted=True,
        fork_count=paste.fork_count, forked_from=paste.forked_from,
        collection_id=paste.collection_id, user_id=paste.user_id,
    )
    db.close()
    return result


@router.post("/api/pastes/{paste_id}/fork", response_model=PasteResponse)
def fork_paste(paste_id: str, request: Request):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    paste.fork_count += 1
    new_id = nanoid.generate(size=6)
    edit_token = nanoid.generate(size=6)
    user = get_current_user(request)
    new_paste = Paste(
        id=new_id, title=f"Fork of {paste.title or paste.id}",
        content=paste.content, language=paste.language,
        is_encrypted=paste.is_encrypted, edit_token=edit_token,
        forked_from=paste_id, user_id=user["sub"] if user else None,
    )
    db.add(new_paste); db.commit(); db.refresh(new_paste)
    display_content = "[Encrypted content. Provide password to decrypt.]" if new_paste.is_encrypted else new_paste.content
    result = PasteResponse(
        id=new_paste.id, title=new_paste.title, content=display_content,
        language=new_paste.language, burn_after_read=new_paste.burn_after_read,
        expires_at=new_paste.expires_at, created_at=new_paste.created_at,
        view_count=new_paste.view_count, is_encrypted=new_paste.is_encrypted,
        edit_token=edit_token, fork_count=new_paste.fork_count,
        forked_from=new_paste.forked_from, collection_id=new_paste.collection_id,
        user_id=new_paste.user_id,
    )
    db.close()
    return result


@router.post("/api/pastes/import", response_model=PasteResponse)
def import_paste(body: PasteImport, request: Request):
    url = body.url
    language = "text"
    for ext, lang in URL_LANG_MAP.items():
        if url.lower().endswith(ext):
            language = lang; break
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PasteBin/1.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        content = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(400, f"Failed to fetch URL: {e}")
    title = url.split("/")[-1].split("?")[0] or "Imported paste"
    db = SessionLocal()
    paste_id = nanoid.generate(size=6)
    edit_token = nanoid.generate(size=6)
    user = get_current_user(request)
    paste = Paste(id=paste_id, title=title, content=content, language=language,
        edit_token=edit_token, user_id=user["sub"] if user else None)
    db.add(paste); db.commit(); db.refresh(paste)
    result = PasteResponse(id=paste.id, title=paste.title, content=paste.content,
        language=paste.language, burn_after_read=paste.burn_after_read,
        expires_at=paste.expires_at, created_at=paste.created_at,
        view_count=paste.view_count, edit_token=edit_token)
    db.close()
    return result


@router.get("/api/pastes/{paste_id}/download")
def download_paste(paste_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    if paste.is_encrypted:
        db.close(); raise HTTPException(400, "Cannot download encrypted paste without verification")
    ext = LANG_EXT_MAP.get(paste.language, ".txt")
    filename = f"{paste.title or paste.id}{ext}"
    content = paste.content
    db.close()
    return Response(content=content, media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/api/pastes/{paste_id}/versions")
def get_versions(paste_id: str):
    db = SessionLocal()
    versions = db.query(PasteVersion).filter(PasteVersion.paste_id == paste_id).order_by(PasteVersion.version_number.desc()).all()
    result = [{"id": v.id, "version_number": v.version_number, "title": v.title, "language": v.language, "created_at": v.created_at.isoformat()} for v in versions]
    db.close()
    return result


@router.get("/api/pastes/{paste_id}/versions/{version_number}")
def get_version(paste_id: str, version_number: int):
    db = SessionLocal()
    v = db.query(PasteVersion).filter(PasteVersion.paste_id == paste_id, PasteVersion.version_number == version_number).first()
    if not v:
        db.close(); raise HTTPException(404, "Version not found")
    result = {"id": v.id, "version_number": v.version_number, "content": v.content, "title": v.title, "language": v.language, "created_at": v.created_at.isoformat()}
    db.close()
    return result


@router.get("/api/pastes/{paste_id}/qr")
def get_qr(paste_id: str, request: Request):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    db.close()
    base_url = os.environ.get("PASTE_DOMAIN", str(request.base_url).rstrip("/"))
    url = f"{base_url}/{paste_id}"
    svg = generate_qr_svg(url)
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/api/pastes/{paste_id}/embed")
def embed_paste(paste_id: str, request: Request, theme: str = "tomorrow"):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    if paste.is_encrypted:
        db.close(); raise HTTPException(400, "Cannot embed encrypted paste")
    db.close()
    base_url = str(request.base_url).rstrip("/")
    html = f'<iframe src="{base_url}/embed/{paste_id}?theme={theme}" style="width:100%;min-height:300px;border:none;border-radius:8px;" loading="lazy"></iframe>'
    return {"embed_code": html, "paste_id": paste_id, "theme": theme}


@router.get("/api/pastes/{paste_id}/analytics")
def paste_analytics(paste_id: str, days: int = 30):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    now = datetime.utcnow()
    views_by_day = []
    for i in range(days - 1, -1, -1):
        day = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = day + timedelta(days=1)
        count = db.query(PasteView).filter(PasteView.paste_id == paste_id, PasteView.timestamp >= day, PasteView.timestamp < next_day).count()
        views_by_day.append({"date": day.strftime("%Y-%m-%d"), "views": count})
    referrers = db.query(PasteView.referrer, func.count(PasteView.id)).filter(PasteView.paste_id == paste_id, PasteView.referrer != None).group_by(PasteView.referrer).order_by(func.count(PasteView.id).desc()).limit(10).all()
    db.close()
    return {"views_by_day": views_by_day, "referrers": [{"referrer": r[0], "count": r[1]} for r in referrers], "total_views": paste.view_count}


@router.post("/api/pastes/{paste_id}/tags")
def add_tags(paste_id: str, body: TagCreate):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    for tag_name in body.tags:
        tag_name = tag_name.strip().lower()
        if not tag_name:
            continue
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if not tag:
            tag = Tag(name=tag_name); db.add(tag); db.flush()
        existing = db.query(PasteTag).filter(PasteTag.paste_id == paste_id, PasteTag.tag_id == tag.id).first()
        if not existing:
            db.add(PasteTag(paste_id=paste_id, tag_id=tag.id))
    db.commit(); db.close()
    return {"detail": "Tags added"}


@router.get("/api/pastes/{paste_id}/tags")
def get_paste_tags(paste_id: str):
    db = SessionLocal()
    tags = db.query(Tag).join(PasteTag).filter(PasteTag.paste_id == paste_id).all()
    db.close()
    return [{"id": t.id, "name": t.name} for t in tags]


# ── Syntax Validation ────────────────────────────────────────────────────

def validate_json(content: str) -> list[dict]:
    try:
        json.loads(content); return []
    except json.JSONDecodeError as e:
        return [{"line": e.lineno, "message": e.msg}]

def validate_python(content: str) -> list[dict]:
    try:
        ast.parse(content); return []
    except SyntaxError as e:
        return [{"line": e.lineno or 1, "message": e.msg}]

def validate_xml(content: str) -> list[dict]:
    try:
        xml_fromstring(content); return []
    except XMLParseError as e:
        return [{"line": 1, "message": str(e)}]

VALIDATORS = {"json": validate_json, "python": validate_python, "xml": validate_xml, "html": validate_xml}


@router.post("/api/validate")
def validate_code(req: ValidateRequest):
    validator = VALIDATORS.get(req.language)
    if not validator:
        return {"valid": True, "errors": [], "message": f"No validator for {req.language}"}
    errors = validator(req.content)
    return {"valid": len(errors) == 0, "errors": errors}
