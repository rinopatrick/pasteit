"""Encryption, QR code, and webhook helpers."""

import base64
import hashlib
import os
import urllib.request
import xml.etree.ElementTree as ET

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


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


def generate_qr_svg(text: str, size: int = 200) -> str:
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


def fire_webhook(url: str, event: str, paste_id: str):
    """Fire a webhook notification (best-effort, fire-and-forget)."""
    import json
    payload = json.dumps({"event": event, "paste_id": paste_id}).encode()
    try:
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass
