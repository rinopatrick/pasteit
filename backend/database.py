"""Database engine and session factory."""

import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import create_engine
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
