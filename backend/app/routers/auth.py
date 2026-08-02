"""
auth.py

Single signup/login endpoint pair for both roles. Role is passed as a
field (frontend's role-selection screen already knows it before reaching
this form) rather than split into /auth/principal/* and /auth/lender/*
-- avoids duplicating near-identical logic across two paths for a
distinction that's just "which table do I query."
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Principal, Lender
from app.schemas import SignupRequest, LoginRequest, TokenResponse, Role
from app.services.auth_service import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    if payload.role == Role.principal:
        if db.query(Principal).filter(Principal.email == payload.email).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
        if not payload.public_key:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "public_key required for principal signup")
        row = Principal(
            name=payload.name,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            public_key=payload.public_key,
        )
    else:
        if db.query(Lender).filter(Lender.email == payload.email).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
        row = Lender(
            name=payload.name,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            max_exposure_per_agent=0,
            total_platform_exposure_cap=0,
            min_score_required=0,
            allowed_agent_categories=[],
        )  # policy fields set properly at Lender Onboarding step, zeroed here

    db.add(row)
    db.commit()
    db.refresh(row)

    token = create_access_token(subject_id=row.id, role=payload.role.value)
    return TokenResponse(access_token=token, role=payload.role, id=row.id)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    model = Principal if payload.role == Role.principal else Lender
    row = db.query(model).filter(model.email == payload.email).first()

    if row is None or not verify_password(payload.password, row.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = create_access_token(subject_id=row.id, role=payload.role.value)
    return TokenResponse(access_token=token, role=payload.role, id=row.id)