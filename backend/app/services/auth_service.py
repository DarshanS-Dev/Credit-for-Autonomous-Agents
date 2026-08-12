"""
auth_service.py

Session auth for the two permanent roles (Principal, Lender) -- distinct
and unrelated to credential_service.py's Ed25519 delegation mandates.
This is plain username/password + JWT for logging a human into their
dashboard; that's Ed25519 proving an agent was authorized by a principal.
Reusing config.py's existing jwt_secret_key/jwt_algorithm/jwt_expire_minutes
(HS256 is fine here -- it was only ruled out for mandates, where we
needed to prove a *specific external party* held a private key. Here,
WE issue and verify our own session tokens, so a shared secret is the
correct, simpler tool.)

Role is never a mutable field -- it's implied entirely by which table
(Principal vs Lender) the row lives in. The JWT still carries a `role`
claim so downstream dependencies can check it without a DB round-trip.
"""

from datetime import datetime, timedelta, timezone

import jwt, bcrypt

from app.config import settings

def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(subject_id: int, role: str) -> str:
    """
    role: "principal" | "lender" -- baked into the token so every
    subsequent request can check "is this token even allowed to hit a
    lender-only endpoint" without re-querying which table the id belongs to.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(subject_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Raises jwt.PyJWTError on expiry/tampering -- caller (dependency) converts to 401."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])