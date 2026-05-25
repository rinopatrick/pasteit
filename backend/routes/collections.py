"""Collection CRUD endpoints."""

import nanoid
from fastapi import APIRouter, HTTPException

from database import SessionLocal
from models import Collection, Paste
from schemas import CollectionCreate, CollectionResponse

router = APIRouter()


@router.post("/api/collections", response_model=CollectionResponse)
def create_collection(body: CollectionCreate):
    db = SessionLocal()
    coll_id = nanoid.generate(size=6)
    coll = Collection(id=coll_id, name=body.name)
    db.add(coll); db.commit(); db.refresh(coll)
    result = CollectionResponse(id=coll.id, name=coll.name, created_at=coll.created_at, paste_count=0)
    db.close()
    return result


@router.get("/api/collections", response_model=list[CollectionResponse])
def list_collections():
    db = SessionLocal()
    colls = db.query(Collection).order_by(Collection.created_at.desc()).all()
    result = []
    for c in colls:
        count = db.query(Paste).filter(Paste.collection_id == c.id).count()
        result.append(CollectionResponse(id=c.id, name=c.name, created_at=c.created_at, paste_count=count))
    db.close()
    return result


@router.get("/api/collections/{coll_id}", response_model=CollectionResponse)
def get_collection(coll_id: str):
    db = SessionLocal()
    coll = db.query(Collection).filter(Collection.id == coll_id).first()
    if not coll:
        db.close(); raise HTTPException(404, "Collection not found")
    count = db.query(Paste).filter(Paste.collection_id == coll_id).count()
    result = CollectionResponse(id=coll.id, name=coll.name, created_at=coll.created_at, paste_count=count)
    db.close()
    return result


@router.delete("/api/collections/{coll_id}")
def delete_collection(coll_id: str):
    db = SessionLocal()
    coll = db.query(Collection).filter(Collection.id == coll_id).first()
    if not coll:
        db.close(); raise HTTPException(404, "Collection not found")
    db.query(Paste).filter(Paste.collection_id == coll_id).update({"collection_id": None})
    db.delete(coll); db.commit(); db.close()
    return {"detail": "Deleted"}


@router.post("/api/pastes/{paste_id}/move/{coll_id}")
def move_to_collection(paste_id: str, coll_id: str):
    db = SessionLocal()
    paste = db.query(Paste).filter(Paste.id == paste_id).first()
    if not paste:
        db.close(); raise HTTPException(404, "Paste not found")
    coll = db.query(Collection).filter(Collection.id == coll_id).first()
    if not coll:
        db.close(); raise HTTPException(404, "Collection not found")
    paste.collection_id = coll_id
    db.commit(); db.close()
    return {"detail": "Moved"}
