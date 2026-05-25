"""SQLAlchemy models."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from database import Base, engine


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
    scheduled_at = Column(DateTime, nullable=True)
    e2e_key_hint = Column(String(64), nullable=True)


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
    events = Column(String(200))
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
    price_cents = Column(Integer, default=0)
    category = Column(String(50), default="general")
    created_at = Column(DateTime, default=datetime.utcnow)
    downloads = Column(Integer, default=0)


def init_db():
    """Create all tables."""
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
