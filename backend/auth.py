"""JWT and password authentication helpers."""

import base64
import hashlib
import json
import secrets
import time
from typing import Optional

from fastapi import Request

from database import JWT_SECRET


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}${h.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    salt, h = hashed.split("$")
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return check.hex() == h


def create_jwt(user_id: int, username: str) -> str:
    payload = {"sub": user_id, "username": username, "exp": int(time.time()) + 86400 * 30}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    sig = hashlib.sha256(f"{payload_b64}.{JWT_SECRET}".encode()).hexdigest()[:32]
    return f"{payload_b64}.{sig}"


def decode_jwt(token: str) -> Optional[dict]:
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


def get_current_user(request: Request) -> Optional[dict]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return decode_jwt(auth[7:])
    return None
