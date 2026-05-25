"""User auth: register, login, me, profiles."""

import secrets
from fastapi import APIRouter, HTTPException, Request

from database import SessionLocal
from auth import hash_password, verify_password, create_jwt, get_current_user
from models import User, Paste
from schemas import UserCreate, UserLogin, UserResponse

router = APIRouter()


@router.post("/api/auth/register", response_model=UserResponse)
def register(body: UserCreate):
    db = SessionLocal()
    if len(body.username) < 3:
        db.close(); raise HTTPException(400, "Username must be at least 3 characters")
    if len(body.password) < 6:
        db.close(); raise HTTPException(400, "Password must be at least 6 characters")
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        db.close(); raise HTTPException(409, "Username already taken")
    user = User(username=body.username, password_hash=hash_password(body.password))
    db.add(user); db.commit(); db.refresh(user)
    result = UserResponse(id=user.id, username=user.username, created_at=user.created_at)
    db.close()
    return result


@router.post("/api/auth/login")
def login(body: UserLogin):
    db = SessionLocal()
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        db.close(); raise HTTPException(401, "Invalid credentials")
    token = create_jwt(user.id, user.username)
    db.close()
    return {"token": token, "username": user.username}


@router.get("/api/auth/me")
def get_me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return {"id": user["sub"], "username": user["username"]}


@router.get("/api/users/{username}")
def get_user_profile(username: str):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        db.close(); raise HTTPException(404, "User not found")
    paste_count = db.query(Paste).filter(Paste.user_id == user.id, Paste.is_encrypted == False).count()
    db.close()
    return {"id": user.id, "username": user.username, "created_at": user.created_at.isoformat(), "paste_count": paste_count}


@router.get("/api/users/{username}/pastes")
def get_user_pastes(username: str, page: int = 1, per_page: int = 20):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        db.close(); raise HTTPException(404, "User not found")
    per_page = max(1, min(100, per_page))
    query = db.query(Paste).filter(Paste.user_id == user.id, Paste.is_encrypted == False)
    total = query.count()
    pastes = query.order_by(Paste.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    result = [{"id": p.id, "title": p.title, "language": p.language, "created_at": p.created_at.isoformat(), "view_count": p.view_count} for p in pastes]
    db.close()
    return {"pastes": result, "total": total, "page": page, "per_page": per_page}
