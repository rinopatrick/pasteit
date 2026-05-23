"""Self-hosted Pastebin — FastAPI backend with SQLite.
Features: CRUD, burn-after-read, expiry, password-protected (AES-GCM),
edit with token, paste forking, API key auth, admin stats, collections,
user accounts, RSS feed, import, download, CSP headers.
"""

import base64
import hashlib
import math
import os
import secrets
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

import nanoid
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine, func
from sqlalchemy.orm import declarative_base, sessionmaker

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

    user = get_current_user(request)
    user_id = user["sub"] if user else None

    paste = Paste(
        id=paste_id, title=paste_in.title, content=content,
        language=paste_in.language, burn_after_read=paste_in.burn_after_read,
        expires_at=expires_at, is_encrypted=is_encrypted,
        edit_token=edit_token, collection_id=paste_in.collection_id,
        user_id=user_id,
    )
    db.add(paste)
    db.commit()
    db.refresh(paste)

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


# ── Cleanup on startup ───────────────────────────────────────────────────

@app.on_event("startup")
def cleanup_expired():
    db = SessionLocal()
    now = datetime.utcnow()
    db.query(Paste).filter(Paste.expires_at != None, Paste.expires_at < now).delete()
    db.commit()
    db.close()
