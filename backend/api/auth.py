from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr

from backend.services.auth_service import (
    authenticate_user,
    get_ratings_summary,
    register_user,
    save_user_rating,
    verify_jwt,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class RatingRequest(BaseModel):
    stars: int
    feedback: str = ""
    name: str | None = None
    email: str | None = None


def _extract_token(authorization: str | None, x_auth_token: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    if x_auth_token:
        return x_auth_token.strip()
    return None


@router.post("/login")
def login(payload: LoginRequest):
    try:
        res = authenticate_user(payload.email, payload.password)
        return {"ok": True, **res}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Authentication failed: {exc}")


@router.post("/signup")
def signup(payload: SignupRequest):
    try:
        res = register_user(payload.name, payload.email, payload.password)
        return {"ok": True, **res}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Registration failed: {exc}")


@router.get("/me")
def current_user(
    authorization: str | None = Header(default=None),
    x_auth_token: str | None = Header(default=None),
):
    token = _extract_token(authorization, x_auth_token)
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")
    payload = verify_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {
        "authenticated": True,
        "user": {
            "name": payload.get("name", "User"),
            "email": payload.get("email", ""),
        },
    }


@router.post("/logout")
def logout():
    return {"ok": True}


@router.get("/rating")
def ratings_stats():
    return get_ratings_summary()


@router.post("/rating")
def post_rating(
    payload: RatingRequest,
    authorization: str | None = Header(default=None),
    x_auth_token: str | None = Header(default=None),
):
    token = _extract_token(authorization, x_auth_token)
    user_payload = verify_jwt(token) if token else None

    email = user_payload.get("email") if user_payload else payload.email
    name = user_payload.get("name") if user_payload else (payload.name or "User")

    if not email:
        raise HTTPException(status_code=400, detail="User email is required to submit a rating")

    try:
        saved = save_user_rating(email, name, payload.stars, payload.feedback)
        if not saved:
            raise HTTPException(status_code=500, detail="Database unable to save rating at this time")
        return {"ok": True, "message": "Thank you for your rating!"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
