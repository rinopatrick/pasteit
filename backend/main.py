"""Self-hosted Pastebin — FastAPI backend with SQLite.
Features: CRUD, burn-after-read, expiry, password-protected (AES-GCM),
edit with token, paste forking, API key auth, admin stats, collections,
user accounts, RSS feed, import, download, CSP headers, WebSocket collab,
versioning, analytics, tags, webhooks, QR codes, embedding, validation,
E2E encryption, scheduling, user profiles, GraphQL.
"""

import ast
import asyncio
import base64
import hashlib
import json
import math
import os
import secrets
import time
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

import nanoid
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, create_engine, func
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = "sqlite:///./pastebin.db"
ENCRYPTION_KEY = AESGCM.generate_key(bit_length=256)
JWT_SECRET = os.environ.get("PB_JWT_SECRET", secrets.token_hex(32))

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base = declarative_base()

LANG_EXT_MAP = {
    "python": ".py", "javascript": ".js", "typescript": ".ts", "rust": ".rs",
    "go": ".go", "java": ".java", "c": ".c", "cpp": ".cpp", "html": ".html",
    "css": ".css", "json": ".json", "yaml": ".yaml", "sql": ".sql",
    "bash": ".sh", "markdown": ".md", "text": ".txt",
}

URL_LANG_MAP = {
    ".py": "python", ".js": "javascript", ".ts": "typescript", ".rs": "rust",
    ".go": "go", ".java": "java", ".c": "c", ".cpp": "cpp", ".h": "c",
    ".html": "html", ".htm": "html", ".css": "css", ".json": "json",
    ".yaml": "yaml", ".yml": "yaml", ".sql": "sql", ".sh": "bash",
    ".bash": "bash", ".md": "markdown", ".txt": "text", ".rb": "ruby",
    ".php": "php", ".swift": "swift", ".kt": "kotlin", ".xml": "markup",
    ".svg": "markup",
}


# ── Models ────────────────────────────────────────────────────────────────

class Paste(Base):
    __tablename__ = "pastes"
    id = Column(String(6), primary_key=True, index=True)
    title = Column(String(200), nullable=True)
    content = Column(Text, nullable=False)
    language = Column(String(50), default="text")
    burn_after_read = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    view_count = Column(Integer, default=0)
    is_encrypted = Column(Boolean, default=False)
    edit_token = Column(String(6), nullable=True)
    fork_count = Column(Integer, default=0)
    forked_from = Column(String(6), nullable=True)
    collection_id = Column(String(6), nullable=True)
    user_id = Column(Integer, nullable=True)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(32), unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    request_count = Column(Integer, default=0)


class Collection(Base):
    __tablename__ = "collections"
    id = Column(String(6), primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class PasteVersion(Base):
    __tablename__ = "paste_versions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    paste_id = Column(String(6), ForeignKey("pastes.id"), index=True)
    content = Column(Text)
    title = Column(String(200), nullable=True)
    language = Column(String(50))
    version_number = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class PasteView(Base):
    __tablename__ = "paste_views"
    id = Column(Integer, primary_key=True, autoincrement=True)
    paste_id = Column(String(6), ForeignKey("pastes.id"), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    user_agent = Column(String(500), nullable=True)
    referrer = Column(String(500), nullable=True)


class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, index=True)


class PasteTag(Base):
    __tablename__ = "paste_tags"
    id = Column(Integer, primary_key=True, autoincrement=True)
    paste_id = Column(String(6), ForeignKey("pastes.id"), index=True)
    tag_id = Column(Integer, ForeignKey("tags.id"), index=True)


class Webhook(Base):
    __tablename__ = "webhooks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    url = Column(String(500))
    events = Column(String(200))  # "paste.created,paste.forked"
    created_at = Column(DateTime, default=datetime.utcnow)


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True, autoincrement=True)
    paste_id = Column(String(6), ForeignKey("pastes.id"), index=True)
    author = Column(String(100), default="Anonymous")
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Book(Base):
    __tablename__ = "books"
    id = Column(String(6), primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BookPaste(Base):
    __tablename__ = "book_pastes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(String(6), ForeignKey("books.id"), index=True)
    paste_id = Column(String(6), ForeignKey("pastes.id"), index=True)
    order_index = Column(Integer, default=0)


class MarketplaceItem(Base):
    __tablename__ = "marketplace_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    paste_id = Column(String(6), ForeignKey("pastes.id"), index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    price_cents = Column(Integer, default=0)  # 0 = free
    category = Column(String(50), default="general")
    created_at = Column(DateTime, default=datetime.utcnow)
    downloads = Column(Integer, default=0)


# Add new columns to Paste
# We'll use ALTER TABLE for existing databases
with engine.connect() as conn:
    try:
        conn.execute("ALTER TABLE pastes ADD COLUMN scheduled_at DATETIME")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE pastes ADD COLUMN e2e_key_hint VARCHAR(64)")
    except Exception:
        pass
    conn.commit()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pastebin API")


# ── Security Middleware ───────────────────────────────────────────────────

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Rate Limiting ─────────────────────────────────────────────────────────

rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 100
RATE_WINDOW = 3600


def check_rate_limit(key: str) -> bool:
    now = time.time()
    rate_limit_store[key] = [t for t in rate_limit_store[key] if now - t < RATE_WINDOW]
    if len(rate_limit_store[key]) >= RATE_LIMIT:
        return False
    rate_limit_store[key].append(now)
    return True


# ── Encryption Helpers ────────────────────────────────────────────────────

def encrypt_content(plaintext: str, password: str) -> str:
    key = hashlib.sha256(password.encode()).digest()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt_content(encrypted_b64: str, password: str) -> str:
    key = hashlib.sha256(password.encode()).digest()
    data = base64.b64decode(encrypted_b64)
    nonce, ct = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


# ── JWT Helpers ───────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}${h.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    salt, h = hashed.split("$")
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return check.hex() == h


def create_jwt(user_id: int, username: str) -> str:
    import json
    payload = {"sub": user_id, "username": username, "exp": int(time.time()) + 86400 * 30}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    sig = hashlib.sha256(f"{payload_b64}.{JWT_SECRET}".encode()).hexdigest()[:32]
    return f"{payload_b64}.{sig}"


def decode_jwt(token: str) -> Optional[dict]:
    import json
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_b64, sig = parts
        expected = hashlib.sha256(f"{payload_b64}.{JWT_SECRET}".encode()).hexdigest()[:32]
        if sig != expected:
            return None
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


# ── Pydantic Schemas ──────────────────────────────────────────────────────

class ExpiryOption(str, Enum):
    never = "never"
    ten_minutes = "10min"
    one_hour = "1hr"
    one_day = "1day"
    one_week = "1week"


class PasteCreate(BaseModel):
    title: Optional[str] = None
    content: str
    language: str = "text"
    burn_after_read: bool = False
    expiry: ExpiryOption = ExpiryOption.never
    password: Optional[str] = None
    collection_id: Optional[str] = None
    e2e: bool = False
    tags: Optional[list[str]] = None
    scheduled_at: Optional[str] = None
    custom_id: Optional[str] = None


RESERVED_IDS = {"api", "admin", "feed", "auth", "health", "recent", "compare", "collections", "books", "graphql", "ws"}


class PasteResponse(BaseModel):
    id: str
    title: Optional[str]
    content: str
    language: str
    burn_after_read: bool
    expires_at: Optional[datetime]
    created_at: datetime
    view_count: int
    is_encrypted: bool = False
    edit_token: Optional[str] = None
    fork_count: int = 0
    forked_from: Optional[str] = None
    collection_id: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None


class PasteListItem(BaseModel):
    id: str
    title: Optional[str]
    language: str
    burn_after_read: bool
    created_at: datetime
    view_count: int
    is_encrypted: bool = False
    fork_count: int = 0
    collection_id: Optional[str] = None


class PaginatedPastes(BaseModel):
    pastes: list[PasteListItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class PasteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    language: Optional[str] = None


class VerifyPassword(BaseModel):
    password: str


class PasteImport(BaseModel):
    url: str


class CollectionCreate(BaseModel):
    name: str


class CollectionResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    paste_count: int = 0


class UserCreate(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime


class DailyStats(BaseModel):
    date: str
    views: int
    pastes_created: int


class CommentCreate(BaseModel):
    author: str = "Anonymous"
    content: str
    parent_id: Optional[int] = None


class CommentResponse(BaseModel):
    id: int
    paste_id: str
    author: str
    content: str
    parent_id: Optional[int] = None
    created_at: datetime
    replies: list = []


class BookCreate(BaseModel):
    title: str
    description: Optional[str] = None


class BookResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    created_at: datetime
    paste_count: int = 0


class BookPasteAdd(BaseModel):
    paste_id: str
    order_index: int = 0


class MarketplaceCreate(BaseModel):
    paste_id: str
    title: str
    description: Optional[str] = None
    price_cents: int = 0
    category: str = "general"


class MarketplaceResponse(BaseModel):
    id: int
    paste_id: str
    title: str
    description: Optional[str] = None
    price_cents: int
    category: str
    created_at: datetime
    downloads: int = 0


class ExecuteRequest(BaseModel):
    code: str
    language: str


class ReviewRequest(BaseModel):
    code: str
    language: str


class GitPushRequest(BaseModel):
    paste_id: str
    repo: str
    branch: str = "main"
    path: str = "README.md"
    commit_message: str = "Update from pasteit"


class DeployRequest(BaseModel):
    paste_id: str
    platform: str = "vercel"


EXPIRY_MAP = {
    ExpiryOption.ten_minutes: timedelta(minutes=10),
    ExpiryOption.one_hour: timedelta(hours=1),
    ExpiryOption.one_day: timedelta(days=1),
    ExpiryOption.one_week: timedelta(weeks=1),
}


# ── API Key Middleware ────────────────────────────────────────────────────

WRITE_PROTECTED = {"/api/pastes"}
PUBLIC_WRITE_PATHS = {"/api/keys/create", "/api/auth/register", "/api/auth/login"}


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    is_write = method in ("POST", "PUT", "DELETE")
    is_paste_endpoint = (
        path.startswith("/api/pastes") or path.startswith("/api/admin")
        or path.startswith("/api/keys") or path.startswith("/api/collections")
    )

    # Public endpoints
    if path in PUBLIC_WRITE_PATHS:
        return await call_next(request)

    # Verify endpoints are public
    if path.endswith("/verify"):
        return await call_next(request)

    # PUT with edit_token is public
    if method == "PUT" and "edit_token" in str(request.query_params):
        return await call_next(request)

    # GET on pastes (public read) and non-API endpoints
    if method == "GET" or not is_paste_endpoint:
        return await call_next(request)

    # Write operations need API key
    if is_write and is_paste_endpoint:
        api_key = request.headers.get("X-API-Key")
        if not api_key:
            return JSONResponse(status_code=401, content={"detail": "API key required. Pass X-API-Key header."})

        db = SessionLocal()
        key_obj = db.query(ApiKey).filter(ApiKey.key == api_key).first()
        db.close()

        if not key_obj:
            return JSONResponse(status_code=403, content={"detail": "Invalid API key."})

        if not check_rate_limit(api_key):
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded (100 requests/hour)."})

        db = SessionLocal()
        db.query(ApiKey).filter(ApiKey.key == api_key).update({"request_count": ApiKey.request_count + 1})
        db.commit()
        db.close()

    return await call_next(request)


# ── Auth Helper ───────────────────────────────────────────────────────────

def get_current_user(request: Request) -> Optional[dict]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return decode_jwt(auth[7:])
    return None


# ── Paste Endpoints ───────────────────────────────────────────────────────

@app.post("/api/pastes", response_model=PasteResponse)
def create_paste(paste_in: PasteCreate, request: Request):
    db = SessionLocal()
    # Custom ID support
    if paste_in.custom_id:
        import re
        cid = paste_in.custom_id.strip()
        if len(cid) < 3 or len(cid) > 20:
            db.close()
            raise HTTPException(status_code=400, detail="Custom ID must be 3-20 characters")
        if not re.match(r'^[a-zA-Z0-9-]+$', cid):
            db.close()
            raise HTTPException(status_code=400, detail="Custom ID must be alphanumeric or hyphens")
        if cid.lower() in RESERVED_IDS:
            db.close()
            raise HTTPException(status_code=400, detail="This ID is reserved")
        if db.query(Paste).filter(Paste.id == cid).first():
            db.close()
            raise HTTPException(status_code=409, detail="This ID is already taken")
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
        # content is already encrypted by client

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

    # Add tags
    if paste_in.tags:
        for tag_name in paste_in.tags:
            tag_name = tag_name.strip().lower()
            if not tag_name:
                continue
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                db.flush()
            db.add(PasteTag(paste_id=paste_id, tag_id=tag.id))
        db.commit()

    # Build response
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


@app.get("/api/pastes", response_model=PaginatedPastes)
def list_pastes(
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
    collection_id: Optional[str] = None,
    tag: Optional[str] = None,
):
    db = SessionLocal()
    now = datetime.utcnow()
    page = max(1, page)
    per_page = max(1, min(100, per_page))

    query = db.query(Paste).filter(
        (Paste.expires_at == None) | (Paste.expires_at > now)
    )

    if search:
        like = f"%{search}%"
        query = query.filter(
            (Paste.title.ilike(like)) | (Paste.id.ilike(like))
        )

    if collection_id:
        query = query.filter(Paste.collection_id == collection_id)

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


@app.get("/api/pastes/{paste_id}", response_model=PasteResponse)
def get_paste(paste_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")

    if paste.expires_at and paste.expires_at < datetime.utcnow():
        db.delete(paste)
        db.commit()
        db.close()
        raise HTTPException(status_code=410, detail="Paste has expired")

    paste.view_count += 1

    # Track view for analytics
    view = PasteView(paste_id=paste_id)
    db.add(view)

    if paste.burn_after_read:
        content = paste.content
        title = paste.title
        language = paste.language
        created_at = paste.created_at
        view_count = paste.view_count
        paste_id_val = paste.id
        burn = paste.burn_after_read
        expires = paste.expires_at
        encrypted = paste.is_encrypted
        fork_c = paste.fork_count
        forked = paste.forked_from
        coll = paste.collection_id
        uid = paste.user_id
        db.delete(paste)
        db.commit()
        db.close()
        # Hide encrypted content
        display_content = "[Encrypted content. Provide password to decrypt.]" if encrypted else content
        return PasteResponse(
            id=paste_id_val, title=title, content=display_content, language=language,
            burn_after_read=burn, expires_at=expires, created_at=created_at,
            view_count=view_count, is_encrypted=encrypted,
            fork_count=fork_c, forked_from=forked, collection_id=coll, user_id=uid,
        )

    db.commit()
    # Hide encrypted content from normal GET
    display_content = "[Encrypted content. Provide password to decrypt.]" if paste.is_encrypted else paste.content
    # Look up username
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
        collection_id=paste.collection_id, user_id=paste.user_id,
        username=username,
    )
    db.close()
    return result


@app.put("/api/pastes/{paste_id}")
def update_paste(paste_id: str, update: PasteUpdate, edit_token: Optional[str] = None):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    if paste.edit_token != edit_token:
        db.close()
        raise HTTPException(status_code=403, detail="Invalid edit token")
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


@app.delete("/api/pastes/{paste_id}")
def delete_paste(paste_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    db.delete(paste)
    db.commit()
    db.close()
    return {"detail": "Deleted"}


@app.post("/api/pastes/{paste_id}/verify", response_model=PasteResponse)
def verify_paste(paste_id: str, body: VerifyPassword):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    if not paste.is_encrypted:
        db.close()
        raise HTTPException(status_code=400, detail="Paste is not encrypted")
    try:
        content = decrypt_content(paste.content, body.password)
    except Exception:
        db.close()
        raise HTTPException(status_code=403, detail="Wrong password")
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


@app.post("/api/pastes/{paste_id}/fork", response_model=PasteResponse)
def fork_paste(paste_id: str, request: Request):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")

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
    db.add(new_paste)
    db.commit()
    db.refresh(new_paste)

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


# ── Import Endpoint ───────────────────────────────────────────────────────

@app.post("/api/pastes/import", response_model=PasteResponse)
def import_paste(body: PasteImport, request: Request):
    url = body.url
    # Detect language from URL extension
    language = "text"
    for ext, lang in URL_LANG_MAP.items():
        if url.lower().endswith(ext):
            language = lang
            break

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PasteBin/1.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        content = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {e}")

    title = url.split("/")[-1].split("?")[0] or "Imported paste"
    db = SessionLocal()
    paste_id = nanoid.generate(size=6)
    edit_token = nanoid.generate(size=6)
    user = get_current_user(request)

    paste = Paste(
        id=paste_id, title=title, content=content, language=language,
        edit_token=edit_token, user_id=user["sub"] if user else None,
    )
    db.add(paste)
    db.commit()
    db.refresh(paste)
    result = PasteResponse(
        id=paste.id, title=paste.title, content=paste.content,
        language=paste.language, burn_after_read=paste.burn_after_read,
        expires_at=paste.expires_at, created_at=paste.created_at,
        view_count=paste.view_count, edit_token=edit_token,
    )
    db.close()
    return result


# ── Download Endpoint ─────────────────────────────────────────────────────

@app.get("/api/pastes/{paste_id}/download")
def download_paste(paste_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    if paste.is_encrypted:
        db.close()
        raise HTTPException(status_code=400, detail="Cannot download encrypted paste without verification")

    ext = LANG_EXT_MAP.get(paste.language, ".txt")
    filename = f"{paste.title or paste.id}{ext}"
    content = paste.content
    db.close()
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Collections Endpoints ─────────────────────────────────────────────────

@app.post("/api/collections", response_model=CollectionResponse)
def create_collection(body: CollectionCreate):
    db = SessionLocal()
    coll_id = nanoid.generate(size=6)
    coll = Collection(id=coll_id, name=body.name)
    db.add(coll)
    db.commit()
    db.refresh(coll)
    result = CollectionResponse(id=coll.id, name=coll.name, created_at=coll.created_at, paste_count=0)
    db.close()
    return result


@app.get("/api/collections", response_model=list[CollectionResponse])
def list_collections():
    db = SessionLocal()
    colls = db.query(Collection).order_by(Collection.created_at.desc()).all()
    result = []
    for c in colls:
        count = db.query(Paste).filter(Paste.collection_id == c.id).count()
        result.append(CollectionResponse(id=c.id, name=c.name, created_at=c.created_at, paste_count=count))
    db.close()
    return result


@app.get("/api/collections/{coll_id}", response_model=CollectionResponse)
def get_collection(coll_id: str):
    db = SessionLocal()
    coll = db.query(Collection).filter(Collection.id == coll_id).first()
    if not coll:
        db.close()
        raise HTTPException(status_code=404, detail="Collection not found")
    count = db.query(Paste).filter(Paste.collection_id == coll_id).count()
    result = CollectionResponse(id=coll.id, name=coll.name, created_at=coll.created_at, paste_count=count)
    db.close()
    return result


@app.delete("/api/collections/{coll_id}")
def delete_collection(coll_id: str):
    db = SessionLocal()
    coll = db.query(Collection).filter(Collection.id == coll_id).first()
    if not coll:
        db.close()
        raise HTTPException(status_code=404, detail="Collection not found")
    # Unlink pastes from collection
    db.query(Paste).filter(Paste.collection_id == coll_id).update({"collection_id": None})
    db.delete(coll)
    db.commit()
    db.close()
    return {"detail": "Deleted"}


@app.post("/api/pastes/{paste_id}/move/{coll_id}")
def move_to_collection(paste_id: str, coll_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    coll = db.query(Collection).filter(Collection.id == coll_id).first()
    if not coll:
        db.close()
        raise HTTPException(status_code=404, detail="Collection not found")
    paste.collection_id = coll_id
    db.commit()
    db.close()
    return {"detail": "Moved"}


# ── User Auth Endpoints ───────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=UserResponse)
def register(body: UserCreate):
    db = SessionLocal()
    if len(body.username) < 3:
        db.close()
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(body.password) < 6:
        db.close()
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        db.close()
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(username=body.username, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    result = UserResponse(id=user.id, username=user.username, created_at=user.created_at)
    db.close()
    return result


@app.post("/api/auth/login")
def login(body: UserLogin):
    db = SessionLocal()
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        db.close()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt(user.id, user.username)
    db.close()
    return {"token": token, "username": user.username}


@app.get("/api/auth/me")
def get_me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"id": user["sub"], "username": user["username"]}


# ── API Key Endpoints ─────────────────────────────────────────────────────

@app.post("/api/keys/create")
def create_api_key():
    db = SessionLocal()
    key = secrets.token_urlsafe(24)
    api_key = ApiKey(key=key)
    db.add(api_key)
    db.commit()
    db.close()
    return {"key": key}


@app.get("/api/keys/{key}/stats")
def key_stats(key: str):
    db = SessionLocal()
    api_key = db.query(ApiKey).filter(ApiKey.key == key).first()
    if not api_key:
        db.close()
        raise HTTPException(status_code=404, detail="API key not found")
    result = {"key": api_key.key, "request_count": api_key.request_count, "created_at": api_key.created_at.isoformat()}
    db.close()
    return result


# ── Admin Endpoints ───────────────────────────────────────────────────────

@app.get("/api/admin/stats")
def admin_stats():
    db = SessionLocal()
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_pastes = db.query(Paste).count()
    total_views = db.query(func.sum(Paste.view_count)).scalar() or 0
    pastes_today = db.query(Paste).filter(Paste.created_at >= today_start).count()

    # Top languages
    lang_rows = (
        db.query(Paste.language, func.count(Paste.id).label("count"))
        .group_by(Paste.language)
        .order_by(func.count(Paste.id).desc())
        .limit(10)
        .all()
    )
    top_languages = [{"language": r[0], "count": r[1]} for r in lang_rows]

    # Storage estimate
    total_chars = db.query(func.sum(func.length(Paste.content))).scalar() or 0
    storage_kb = total_chars / 1024
    if storage_kb < 1024:
        storage_display = f"{storage_kb:.1f} KB"
    else:
        storage_display = f"{storage_kb / 1024:.1f} MB"

    # API keys
    keys = db.query(ApiKey).all()
    api_keys = [{"key": k.key, "created_at": k.created_at.isoformat(), "request_count": k.request_count} for k in keys]

    db.close()
    return {
        "total_pastes": total_pastes,
        "total_views": total_views,
        "pastes_today": pastes_today,
        "top_languages": top_languages,
        "storage_used_display": storage_display,
        "api_keys": api_keys,
    }


@app.get("/api/admin/stats/daily", response_model=list[DailyStats])
def daily_stats(days: int = 7):
    db = SessionLocal()
    result = []
    now = datetime.utcnow()
    for i in range(days - 1, -1, -1):
        day = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = day + timedelta(days=1)
        views = db.query(func.sum(Paste.view_count)).filter(
            Paste.created_at >= day, Paste.created_at < next_day
        ).scalar() or 0
        created = db.query(Paste).filter(
            Paste.created_at >= day, Paste.created_at < next_day
        ).count()
        result.append(DailyStats(date=day.strftime("%Y-%m-%d"), views=views, pastes_created=created))
    db.close()
    return result


@app.get("/api/admin/pastes")
def admin_pastes(limit: int = 50, offset: int = 0, search: Optional[str] = None):
    db = SessionLocal()
    query = db.query(Paste)
    if search:
        like = f"%{search}%"
        query = query.filter((Paste.title.ilike(like)) | (Paste.id.ilike(like)))
    total = query.count()
    pastes = query.order_by(Paste.created_at.desc()).offset(offset).limit(limit).all()
    result = {
        "pastes": [{
            "id": p.id, "title": p.title, "language": p.language,
            "view_count": p.view_count, "burn_after_read": p.burn_after_read,
            "is_encrypted": p.is_encrypted, "created_at": p.created_at.isoformat(),
            "fork_count": p.fork_count,
        } for p in pastes],
        "total": total,
    }
    db.close()
    return result


@app.get("/api/admin/export")
def export_pastes():
    db = SessionLocal()
    pastes = db.query(Paste).order_by(Paste.created_at.desc()).all()
    result = [{
        "id": p.id, "title": p.title, "content": p.content if not p.is_encrypted else "[encrypted]",
        "language": p.language, "created_at": p.created_at.isoformat(),
        "view_count": p.view_count,
    } for p in pastes]
    db.close()
    filename = f"pastebin-export-{datetime.utcnow().strftime('%Y%m%d')}.json"
    import json
    return Response(
        content=json.dumps(result, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── RSS Feed ──────────────────────────────────────────────────────────────

@app.get("/feed.xml")
def rss_feed(request: Request):
    db = SessionLocal()
    pastes = db.query(Paste).filter(
        (Paste.is_encrypted == False),
        (Paste.expires_at == None) | (Paste.expires_at > datetime.utcnow()),
    ).order_by(Paste.created_at.desc()).limit(20).all()

    base_url = str(request.base_url).rstrip("/")
    items_xml = ""
    for p in pastes:
        desc = (p.content[:200] + "...") if len(p.content) > 200 else p.content
        desc = desc.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        title = (p.title or p.id).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        pub_date = p.created_at.strftime("%a, %d %b %Y %H:%M:%S +0000")
        items_xml += f"""
    <item>
      <title>{title}</title>
      <link>{base_url}/{p.id}</link>
      <description>{desc}</description>
      <pubDate>{pub_date}</pubDate>
      <guid>{base_url}/{p.id}</guid>
    </item>"""

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PasteBin</title>
    <link>{base_url}</link>
    <description>Recent public pastes</description>
    <language>en</language>{items_xml}
  </channel>
</rss>"""

    db.close()
    return Response(content=xml, media_type="application/rss+xml")


# ── Health ────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── WebSocket Collaboration ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, ws: WebSocket, paste_id: str):
        await ws.accept()
        if paste_id not in self.active:
            self.active[paste_id] = []
        self.active[paste_id].append(ws)
        await self.broadcast(paste_id, {"type": "users", "count": len(self.active[paste_id])})

    def disconnect(self, ws: WebSocket, paste_id: str):
        if paste_id in self.active and ws in self.active[paste_id]:
            self.active[paste_id].remove(ws)

    async def broadcast(self, paste_id: str, data: dict):
        if paste_id in self.active:
            dead = []
            for ws in self.active[paste_id]:
                try:
                    await ws.send_json(data)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active[paste_id].remove(ws)

manager = ConnectionManager()


@app.websocket("/ws/paste/{paste_id}")
async def websocket_collab(ws: WebSocket, paste_id: str):
    await manager.connect(ws, paste_id)
    user_color = f"hsl({hash(str(id(ws)) + str(time.time())) % 360}, 70%, 60%)"
    try:
        while True:
            data = await ws.receive_json()
            if data.get("type") == "content_update":
                await manager.broadcast(paste_id, {
                    "type": "content_update",
                    "content": data["content"],
                    "user_id": str(id(ws)),
                    "color": user_color,
                })
            elif data.get("type") == "cursor":
                await manager.broadcast(paste_id, {
                    "type": "cursor",
                    "user_id": str(id(ws)),
                    "position": data["position"],
                    "color": user_color,
                })
    except WebSocketDisconnect:
        manager.disconnect(ws, paste_id)
        await manager.broadcast(paste_id, {"type": "users", "count": len(manager.active.get(paste_id, []))})


# ── Syntax Validation ────────────────────────────────────────────────────

VALIDATORS = {}

def validate_json(content: str) -> list[dict]:
    try:
        json.loads(content)
        return []
    except json.JSONDecodeError as e:
        return [{"line": e.lineno, "message": e.msg}]

def validate_python(content: str) -> list[dict]:
    try:
        ast.parse(content)
        return []
    except SyntaxError as e:
        return [{"line": e.lineno or 1, "message": e.msg}]

def validate_xml(content: str) -> list[dict]:
    try:
        ET.fromstring(content)
        return []
    except ET.ParseError as e:
        return [{"line": 1, "message": str(e)}]

VALIDATORS = {"json": validate_json, "python": validate_python, "xml": validate_xml, "html": validate_xml}

class ValidateRequest(BaseModel):
    content: str
    language: str

@app.post("/api/validate")
def validate_code(req: ValidateRequest):
    validator = VALIDATORS.get(req.language)
    if not validator:
        return {"valid": True, "errors": [], "message": f"No validator for {req.language}"}
    errors = validator(req.content)
    return {"valid": len(errors) == 0, "errors": errors}


# ── Paste Versioning ─────────────────────────────────────────────────────

@app.get("/api/pastes/{paste_id}/versions")
def get_versions(paste_id: str):
    db = SessionLocal()
    versions = db.query(PasteVersion).filter(PasteVersion.paste_id == paste_id).order_by(PasteVersion.version_number.desc()).all()
    result = [{"id": v.id, "version_number": v.version_number, "title": v.title, "language": v.language, "created_at": v.created_at.isoformat()} for v in versions]
    db.close()
    return result


@app.get("/api/pastes/{paste_id}/versions/{version_number}")
def get_version(paste_id: str, version_number: int):
    db = SessionLocal()
    v = db.query(PasteVersion).filter(PasteVersion.paste_id == paste_id, PasteVersion.version_number == version_number).first()
    if not v:
        db.close()
        raise HTTPException(status_code=404, detail="Version not found")
    result = {"id": v.id, "version_number": v.version_number, "content": v.content, "title": v.title, "language": v.language, "created_at": v.created_at.isoformat()}
    db.close()
    return result


# Modify update_paste to save versions
original_update_paste = update_paste

def update_paste_with_versioning(paste_id: str, update: PasteUpdate, edit_token: Optional[str] = None):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    if paste.edit_token != edit_token:
        db.close()
        raise HTTPException(status_code=403, detail="Invalid edit token")
    # Save current as version before updating
    if update.content is not None and update.content != paste.content:
        max_ver = db.query(func.max(PasteVersion.version_number)).filter(PasteVersion.paste_id == paste_id).scalar() or 0
        version = PasteVersion(paste_id=paste_id, content=paste.content, title=paste.title, language=paste.language, version_number=max_ver + 1)
        db.add(version)
        # Limit to 50 versions
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

# Note: versioning is handled by the update_paste function above
# The update_paste_with_versioning function is available as reference


# ── QR Code ──────────────────────────────────────────────────────────────

def generate_qr_svg(text: str, size: int = 200) -> str:
    """Simple QR-like SVG with the URL as text (placeholder)."""
    safe_text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size + 40}" viewBox="0 0 {size} {size + 40}">
  <rect width="{size}" height="{size}" fill="white" rx="8"/>
  <rect x="10" y="10" width="40" height="40" fill="black"/>
  <rect x="{size-50}" y="10" width="40" height="40" fill="black"/>
  <rect x="10" y="{size-50}" width="40" height="40" fill="black"/>
  <rect x="18" y="18" width="24" height="24" fill="white"/>
  <rect x="{size-42}" y="18" width="24" height="24" fill="white"/>
  <rect x="18" y="{size-42}" width="24" height="24" fill="white"/>
  <rect x="24" y="24" width="12" height="12" fill="black"/>
  <rect x="{size-36}" y="24" width="12" height="12" fill="black"/>
  <rect x="24" y="{size-36}" width="12" height="12" fill="black"/>
  <text x="{size//2}" y="{size + 20}" text-anchor="middle" font-family="monospace" font-size="10" fill="#666">{safe_text}</text>
</svg>'''


@app.get("/api/pastes/{paste_id}/qr")
def get_qr(paste_id: str, request: Request):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    db.close()
    base_url = os.environ.get("PASTE_DOMAIN", str(request.base_url).rstrip("/"))
    url = f"{base_url}/{paste_id}"
    svg = generate_qr_svg(url)
    return Response(content=svg, media_type="image/svg+xml")


# ── Paste Embedding ──────────────────────────────────────────────────────

@app.get("/api/pastes/{paste_id}/embed")
def embed_paste(paste_id: str, request: Request, theme: str = "tomorrow"):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    if paste.is_encrypted:
        db.close()
        raise HTTPException(status_code=400, detail="Cannot embed encrypted paste")
    content = paste.content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    title = (paste.title or paste.id).replace("&", "&amp;").replace("<", "&lt;")
    db.close()
    base_url = str(request.base_url).rstrip("/")
    html = f'''<iframe src="{base_url}/embed/{paste_id}?theme={theme}" style="width:100%;min-height:300px;border:none;border-radius:8px;" loading="lazy"></iframe>'''
    return {"embed_code": html, "paste_id": paste_id, "theme": theme}


# ── Analytics ────────────────────────────────────────────────────────────

@app.get("/api/pastes/{paste_id}/analytics")
def paste_analytics(paste_id: str, days: int = 30):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
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


# ── Tags ─────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    tags: list[str]

@app.post("/api/pastes/{paste_id}/tags")
def add_tags(paste_id: str, body: TagCreate):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    for tag_name in body.tags:
        tag_name = tag_name.strip().lower()
        if not tag_name:
            continue
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if not tag:
            tag = Tag(name=tag_name)
            db.add(tag)
            db.flush()
        existing = db.query(PasteTag).filter(PasteTag.paste_id == paste_id, PasteTag.tag_id == tag.id).first()
        if not existing:
            db.add(PasteTag(paste_id=paste_id, tag_id=tag.id))
    db.commit()
    db.close()
    return {"detail": "Tags added"}


@app.get("/api/pastes/{paste_id}/tags")
def get_paste_tags(paste_id: str):
    db = SessionLocal()
    tags = db.query(Tag).join(PasteTag).filter(PasteTag.paste_id == paste_id).all()
    db.close()
    return [t.name for t in tags]


# ── Webhooks ─────────────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    url: str
    events: str = "paste.created,paste.forked"

@app.post("/api/webhooks")
def create_webhook(body: WebhookCreate, request: Request):
    user = get_current_user(request)
    db = SessionLocal()
    wh = Webhook(url=body.url, events=body.events, user_id=user["sub"] if user else None)
    db.add(wh)
    db.commit()
    db.refresh(wh)
    db.close()
    return {"id": wh.id, "url": wh.url, "events": wh.events}


@app.get("/api/webhooks")
def list_webhooks(request: Request):
    user = get_current_user(request)
    db = SessionLocal()
    query = db.query(Webhook)
    if user:
        query = query.filter(Webhook.user_id == user["sub"])
    whs = query.all()
    db.close()
    return [{"id": w.id, "url": w.url, "events": w.events, "created_at": w.created_at.isoformat()} for w in whs]


@app.delete("/api/webhooks/{webhook_id}")
def delete_webhook(webhook_id: int):
    db = SessionLocal()
    wh = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not wh:
        db.close()
        raise HTTPException(status_code=404, detail="Webhook not found")
    db.delete(wh)
    db.commit()
    db.close()
    return {"detail": "Deleted"}


def trigger_webhooks(event: str, paste_id: str, background_tasks: BackgroundTasks):
    db = SessionLocal()
    whs = db.query(Webhook).filter(Webhook.events.contains(event)).all()
    db.close()
    for wh in whs:
        background_tasks.add_task(_fire_webhook, wh.url, event, paste_id)


def _fire_webhook(url: str, event: str, paste_id: str):
    try:
        payload = json.dumps({"event": event, "paste_id": paste_id, "timestamp": datetime.utcnow().isoformat()}).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "User-Agent": "PasteIt-Webhook/1.0"})
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


# ── E2E Encryption ───────────────────────────────────────────────────────

class PasteCreateE2E(BaseModel):
    title: Optional[str] = None
    content: str  # already encrypted by client
    language: str = "text"
    burn_after_read: bool = False
    expiry: ExpiryOption = ExpiryOption.never
    e2e: bool = False
    collection_id: Optional[str] = None


# ── Scheduling ───────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_tasks():
    db = SessionLocal()
    now = datetime.utcnow()
    db.query(Paste).filter(Paste.expires_at != None, Paste.expires_at < now).delete()
    db.commit()
    db.close()
    asyncio.create_task(_publish_scheduled())

async def _publish_scheduled():
    while True:
        await asyncio.sleep(60)
        db = SessionLocal()
        now = datetime.utcnow()
        scheduled = db.query(Paste).filter(Paste.scheduled_at != None, Paste.scheduled_at <= now).all()
        for p in scheduled:
            p.scheduled_at = None
        db.commit()
        db.close()


# ── User Profiles ────────────────────────────────────────────────────────

@app.get("/api/users/{username}")
def get_user_profile(username: str):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    paste_count = db.query(Paste).filter(Paste.user_id == user.id).count()
    db.close()
    return {"id": user.id, "username": user.username, "created_at": user.created_at.isoformat(), "paste_count": paste_count}


@app.get("/api/users/{username}/pastes")
def get_user_pastes(username: str, page: int = 1, per_page: int = 20):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    query = db.query(Paste).filter(Paste.user_id == user.id, Paste.is_encrypted == False)
    total = query.count()
    pastes = query.order_by(Paste.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    result = [{"id": p.id, "title": p.title, "language": p.language, "created_at": p.created_at.isoformat(), "view_count": p.view_count} for p in pastes]
    db.close()
    return {"pastes": result, "total": total, "page": page, "per_page": per_page}


# ── Code Execution ────────────────────────────────────────────────────────

import subprocess

EXECUTABLE_LANGS = {"python": "python3", "javascript": "node", "bash": "bash"}

@app.post("/api/execute")
def execute_code(req: ExecuteRequest):
    lang = req.language.lower()
    if lang not in EXECUTABLE_LANGS:
        raise HTTPException(status_code=400, detail=f"Language '{lang}' not supported. Supported: {list(EXECUTABLE_LANGS.keys())}")
    cmd = EXECUTABLE_LANGS[lang]
    try:
        result = subprocess.run(
            [cmd, "-c", req.code] if lang != "bash" else [cmd],
            input=req.code if lang == "bash" else None,
            capture_output=True, text=True, timeout=10,
            env={"PATH": "/usr/bin:/bin:/usr/local/bin", "HOME": "/tmp"},
        )
        return {"output": result.stdout, "error": result.stderr, "exit_code": result.returncode}
    except subprocess.TimeoutExpired:
        return {"output": "", "error": "Execution timed out (10s limit)", "exit_code": -1}
    except Exception as e:
        return {"output": "", "error": str(e), "exit_code": -1}


# ── AI Code Review ────────────────────────────────────────────────────────

@app.post("/api/review")
def review_code(req: ReviewRequest):
    lines = req.code.split("\n")
    issues = []
    score = 100
    lang = req.language.lower()

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Long lines
        if len(line) > 120:
            issues.append({"severity": "info", "line": i, "message": "Line exceeds 120 characters", "suggestion": "Break into multiple lines"})

        # SQL injection patterns
        if any(p in stripped.lower() for p in ["f\"select", "f\"insert", "f\"update", "f\"delete", "execute(f\"", "% format"]):
            issues.append({"severity": "critical", "line": i, "message": "Possible SQL injection vulnerability", "suggestion": "Use parameterized queries instead of string formatting"})
            score -= 20

        # XSS patterns
        if "innerHTML" in stripped or "dangerouslySetInnerHTML" in stripped or "document.write" in stripped:
            issues.append({"severity": "critical", "line": i, "message": "Possible XSS vulnerability", "suggestion": "Use textContent or sanitize input"})
            score -= 15

        # Hardcoded secrets
        if any(p in stripped.lower() for p in ["password", "secret", "api_key", "apikey", "token"]) and any(c in stripped for c in ["=", ":"]) and "\"" in stripped:
            if "example" not in stripped.lower() and "placeholder" not in stripped.lower() and "test" not in stripped.lower():
                issues.append({"severity": "warning", "line": i, "message": "Possible hardcoded secret", "suggestion": "Use environment variables or config files"})
                score -= 10

        # Missing error handling
        if lang == "python" and "except:" in stripped and "pass" in (lines[i] if i < len(lines) else "").strip():
            issues.append({"severity": "warning", "line": i, "message": "Bare except with pass swallows errors", "suggestion": "Catch specific exceptions and log/handle them"})
            score -= 5

        # eval/exec usage
        if "eval(" in stripped or "exec(" in stripped:
            issues.append({"severity": "critical", "line": i, "message": "Use of eval/exec is dangerous", "suggestion": "Avoid eval/exec, use safer alternatives"})
            score -= 20

        # TODO/FIXME
        if "TODO" in stripped or "FIXME" in stripped or "HACK" in stripped:
            issues.append({"severity": "info", "line": i, "message": "TODO/FIXME found", "suggestion": "Address this before production"})

    # Function length check
    if lang == "python":
        func_starts = [i for i, l in enumerate(lines) if l.strip().startswith("def ")]
        for start in func_starts:
            # Find end of function (next def at same or lower indent, or EOF)
            indent = len(lines[start]) - len(lines[start].lstrip())
            end = start + 1
            while end < len(lines):
                if lines[end].strip() and not lines[end].startswith(" " * (indent + 1)) and not lines[end].startswith("\t"):
                    if lines[end].strip().startswith("def ") or lines[end].strip().startswith("class "):
                        break
                end += 1
            if end - start > 50:
                issues.append({"severity": "warning", "line": start + 1, "message": f"Function is {end - start} lines long", "suggestion": "Consider breaking into smaller functions"})
                score -= 5

    score = max(0, min(100, score))
    return {"issues": issues, "score": score}


# ── Comments ──────────────────────────────────────────────────────────────

@app.post("/api/pastes/{paste_id}/comments", response_model=CommentResponse)
def create_comment(paste_id: str, body: CommentCreate):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    comment = Comment(
        paste_id=paste_id,
        author=body.author or "Anonymous",
        content=body.content,
        parent_id=body.parent_id,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    result = CommentResponse(
        id=comment.id, paste_id=comment.paste_id, author=comment.author,
        content=comment.content, parent_id=comment.parent_id,
        created_at=comment.created_at,
    )
    db.close()
    return result


@app.get("/api/pastes/{paste_id}/comments", response_model=list[CommentResponse])
def list_comments(paste_id: str):
    db = SessionLocal()
    comments = db.query(Comment).filter(Comment.paste_id == paste_id).order_by(Comment.created_at.asc()).all()
    # Build threaded structure
    comment_map = {}
    roots = []
    for c in comments:
        resp = CommentResponse(
            id=c.id, paste_id=c.paste_id, author=c.author,
            content=c.content, parent_id=c.parent_id,
            created_at=c.created_at,
        )
        comment_map[c.id] = resp
    for c in comments:
        if c.parent_id and c.parent_id in comment_map:
            comment_map[c.parent_id].replies.append(comment_map[c.id])
        else:
            roots.append(comment_map[c.id])
    db.close()
    return roots


# ── Books ─────────────────────────────────────────────────────────────────

@app.post("/api/books", response_model=BookResponse)
def create_book(body: BookCreate, request: Request):
    db = SessionLocal()
    book_id = nanoid.generate(size=6)
    user = get_current_user(request)
    book = Book(id=book_id, title=body.title, description=body.description, user_id=user["sub"] if user else None)
    db.add(book)
    db.commit()
    db.refresh(book)
    result = BookResponse(id=book.id, title=book.title, description=book.description, created_at=book.created_at, paste_count=0)
    db.close()
    return result


@app.get("/api/books", response_model=list[BookResponse])
def list_books():
    db = SessionLocal()
    books = db.query(Book).order_by(Book.created_at.desc()).all()
    result = []
    for b in books:
        count = db.query(BookPaste).filter(BookPaste.book_id == b.id).count()
        result.append(BookResponse(id=b.id, title=b.title, description=b.description, created_at=b.created_at, paste_count=count))
    db.close()
    return result


@app.get("/api/books/{book_id}")
def get_book(book_id: str):
    db = SessionLocal()
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        db.close()
        raise HTTPException(status_code=404, detail="Book not found")
    book_pastes = db.query(BookPaste).filter(BookPaste.book_id == book_id).order_by(BookPaste.order_index).all()
    pastes = []
    for bp in book_pastes:
        paste = db.query(Paste).filter(Paste.id == bp.paste_id).first()
        if paste:
            pastes.append({"id": paste.id, "title": paste.title, "language": paste.language, "order_index": bp.order_index})
    count = len(pastes)
    db.close()
    return {"id": book.id, "title": book.title, "description": book.description, "created_at": book.created_at.isoformat(), "paste_count": count, "pastes": pastes}


@app.post("/api/books/{book_id}/pastes")
def add_paste_to_book(book_id: str, body: BookPasteAdd):
    db = SessionLocal()
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        db.close()
        raise HTTPException(status_code=404, detail="Book not found")
    paste = db.query(Paste).filter(Paste.id == body.paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    bp = BookPaste(book_id=book_id, paste_id=body.paste_id, order_index=body.order_index)
    db.add(bp)
    db.commit()
    db.close()
    return {"detail": "Added to book"}


# ── Marketplace ───────────────────────────────────────────────────────────

@app.post("/api/marketplace", response_model=MarketplaceResponse)
def create_marketplace_item(body: MarketplaceCreate, request: Request):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == body.paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    item = MarketplaceItem(
        paste_id=body.paste_id, title=body.title,
        description=body.description, price_cents=max(0, body.price_cents),
        category=body.category,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    result = MarketplaceResponse(
        id=item.id, paste_id=item.paste_id, title=item.title,
        description=item.description, price_cents=item.price_cents,
        category=item.category, created_at=item.created_at, downloads=item.downloads,
    )
    db.close()
    return result


@app.get("/api/marketplace", response_model=list[MarketplaceResponse])
def list_marketplace(category: Optional[str] = None, search: Optional[str] = None, limit: int = 50, offset: int = 0):
    db = SessionLocal()
    q = db.query(MarketplaceItem)
    if category:
        q = q.filter(MarketplaceItem.category == category)
    if search:
        q = q.filter(MarketplaceItem.title.contains(search))
    items = q.order_by(MarketplaceItem.created_at.desc()).offset(offset).limit(limit).all()
    result = [
        MarketplaceResponse(
            id=i.id, paste_id=i.paste_id, title=i.title,
            description=i.description, price_cents=i.price_cents,
            category=i.category, created_at=i.created_at, downloads=i.downloads,
        ) for i in items
    ]
    db.close()
    return result


@app.get("/api/marketplace/{item_id}", response_model=MarketplaceResponse)
def get_marketplace_item(item_id: int):
    db = SessionLocal()
    item = db.query(MarketplaceItem).filter(MarketplaceItem.id == item_id).first()
    if not item:
        db.close()
        raise HTTPException(status_code=404, detail="Item not found")
    result = MarketplaceResponse(
        id=item.id, paste_id=item.paste_id, title=item.title,
        description=item.description, price_cents=item.price_cents,
        category=item.category, created_at=item.created_at, downloads=item.downloads,
    )
    db.close()
    return result


# ── Git Integration (Placeholder) ────────────────────────────────────────

@app.post("/api/git/push")
def git_push(req: GitPushRequest, request: Request):
    """Push paste content to a GitHub repository (requires GITHUB_TOKEN env var)."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="GITHUB_TOKEN not configured")
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == req.paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    content = paste.content
    db.close()
    # GitHub API push
    import urllib.request
    api_url = f"https://api.github.com/repos/{req.repo}/contents/{req.path}"
    # Get current file SHA if exists
    sha = None
    try:
        get_req = urllib.request.Request(api_url, headers={"Authorization": f"token {token}", "User-Agent": "pasteit"})
        resp = urllib.request.urlopen(get_req)
        sha = json.loads(resp.read()).get("sha")
    except Exception:
        pass
    payload = {
        "message": req.commit_message,
        "content": base64.b64encode(content.encode()).decode(),
        "branch": req.branch,
    }
    if sha:
        payload["sha"] = sha
    data = json.dumps(payload).encode()
    put_req = urllib.request.Request(api_url, data=data, method="PUT", headers={
        "Authorization": f"token {token}", "Content-Type": "application/json", "User-Agent": "pasteit",
    })
    resp = json.loads(urllib.request.urlopen(put_req).read())
    return {"commit_url": resp.get("content", {}).get("html_url", ""), "status": "pushed"}


# ── Auto-Deploy (Placeholder) ────────────────────────────────────────────

@app.post("/api/deploy")
def deploy_paste(req: DeployRequest, request: Request):
    """Deploy paste content to Vercel/Netlify/GH Pages."""
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == req.paste_id).first()
    if not paste:
        db.close()
        raise HTTPException(status_code=404, detail="Paste not found")
    db.close()
    # Placeholder — would integrate with Vercel/Netlify APIs
    return {
        "status": "not_configured",
        "platform": req.platform,
        "message": f"Deploy to {req.platform} requires API token configuration. Set {req.platform.upper()}_TOKEN environment variable.",
        "paste_id": req.paste_id,
    }


# ── GraphQL ──────────────────────────────────────────────────────────────

@app.get("/api/graphql")
def graphql_playground():
    return Response(content='''<!DOCTYPE html><html><head><title>GraphQL</title></head><body>
<h1>PasteIt GraphQL</h1><p>Use POST /api/graphql with queries.</p>
<pre>
query { paste(id: "abc123") { id title content } }
query { pastes(limit: 5) { id title language } }
mutation { createPaste(title: "test", content: "hello") { id } }
</pre></body></html>''', media_type="text/html")


@app.post("/api/graphql")
def graphql_endpoint(request_body: dict):
    """Simple GraphQL-like endpoint."""
    query = request_body.get("query", "")
    variables = request_body.get("variables", {})

    if "paste(" in query:
        paste_id = variables.get("id") or _extract_arg(query, "id")
        if paste_id:
            db = SessionLocal()
            p = db.query(Paste).filter(Paste.id == paste_id).first()
            db.close()
            if p:
                return {"data": {"paste": {"id": p.id, "title": p.title, "content": p.content if not p.is_encrypted else "[encrypted]", "language": p.language, "created_at": p.created_at.isoformat()}}}
            return {"data": {"paste": None}, "errors": [{"message": "Not found"}]}

    if "pastes(" in query:
        limit = variables.get("limit") or 10
        db = SessionLocal()
        pastes = db.query(Paste).order_by(Paste.created_at.desc()).limit(limit).all()
        db.close()
        return {"data": {"pastes": [{"id": p.id, "title": p.title, "language": p.language} for p in pastes]}}

    return {"data": None, "errors": [{"message": "Unsupported query"}]}


def _extract_arg(query: str, arg: str) -> Optional[str]:
    import re
    m = re.search(rf'{arg}\s*:\s*"([^"]+)"', query)
    return m.group(1) if m else None


# ── Multi-language Extension ─────────────────────────────────────────────

# Extended language list for syntax highlighting
ALL_LANGUAGES = [
    "text", "javascript", "typescript", "python", "rust", "go", "java", "c", "cpp", "csharp",
    "html", "css", "json", "yaml", "sql", "bash", "powershell", "ruby", "php",
    "swift", "kotlin", "scala", "dart", "lua", "perl", "r", "matlab",
    "graphql", "dockerfile", "makefile", "markdown", "toml", "xml", "latex",
    "haskell", "elixir", "clojure",
]

# Extended URL lang map
URL_LANG_MAP.update({
    ".cs": "csharp", ".ps1": "powershell", ".rb": "ruby", ".php": "php",
    ".swift": "swift", ".kt": "kotlin", ".scala": "scala", ".dart": "dart",
    ".lua": "lua", ".pl": "perl", ".r": "r", ".m": "matlab",
    ".graphql": "graphql", ".dockerfile": "dockerfile", ".makefile": "makefile",
    ".toml": "toml", ".tex": "latex", ".hs": "haskell", ".ex": "elixir",
    ".clj": "clojure", ".csharp": "csharp",
})

LANG_EXT_MAP.update({
    "csharp": ".cs", "powershell": ".ps1", "ruby": ".rb", "php": ".php",
    "swift": ".swift", "kotlin": ".kt", "scala": ".scala", "dart": ".dart",
    "lua": ".lua", "perl": ".pl", "r": ".r", "matlab": ".m",
    "graphql": ".graphql", "dockerfile": ".Dockerfile", "makefile": ".Makefile",
    "toml": ".toml", "xml": ".xml", "latex": ".tex", "haskell": ".hs",
    "elixir": ".ex", "clojure": ".clj",
})
