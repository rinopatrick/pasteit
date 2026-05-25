"""Pydantic schemas."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


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


class ValidateRequest(BaseModel):
    content: str
    language: str


class TagCreate(BaseModel):
    tags: list[str]


class PasteCreateE2E(BaseModel):
    title: Optional[str] = None
    content: str
    language: str = "text"


class WebhookCreate(BaseModel):
    url: str
    events: str = "paste.created,paste.forked"
