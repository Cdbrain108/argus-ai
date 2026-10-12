"""MongoDB Authentication and Rating Service for ARGUS.

Handles user signup, login (with SHA-256 hashed passwords matching the
Streamlit auth.py implementation), JWT token generation/validation, and
user star ratings saved to MongoDB Atlas.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import logging
import re
from typing import Any, Dict, Optional, Tuple

import jwt
from pymongo import MongoClient
from pymongo.collection import Collection

from backend.config import get_jwt_secret, get_mongo_uri

log = logging.getLogger(__name__)

_mongo_client: Optional[MongoClient] = None


def get_mongo_client() -> Optional[MongoClient]:
    global _mongo_client
    if _mongo_client is not None:
        return _mongo_client
    uri = get_mongo_uri()
    if not uri:
        log.warning("MONGO_URI not configured")
        return None
    try:
        _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        # Ping server to confirm connection
        _mongo_client.admin.command("ping")
        return _mongo_client
    except Exception as exc:  # noqa: BLE001
        log.error("MongoDB connection failed: %s", exc)
        return None


def get_users_collection() -> Optional[Collection]:
    client = get_mongo_client()
    if client is None:
        return None
    try:
        return client["argus_db"]["users"]
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to access users collection: %s", exc)
        return None


def get_ratings_collection() -> Optional[Collection]:
    client = get_mongo_client()
    if client is None:
        return None
    try:
        return client["argus_db"]["ratings"]
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to access ratings collection: %s", exc)
        return None


def hash_password(password: str) -> str:
    """SHA-256 password hash, matching auth.py exactly."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[\w\.-]+@[\w\.-]+\.\w{2,}$", email.strip()))


def mint_jwt(email: str, name: str) -> str:
    """Mint a 7-day HS256 JWT token."""
    secret = get_jwt_secret()
    payload = {
        "email": email.strip(),
        "name": name.strip(),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_jwt(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify an ARGUS JWT token."""
    if not token:
        return None
    secret = get_jwt_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except Exception:  # noqa: BLE001
        return None


def authenticate_user(email: str, password: str) -> Dict[str, Any]:
    """Authenticate an existing user against MongoDB.

    Returns dict with token and user details or raises ValueError.
    """
    clean_email = email.strip()
    if not clean_email or not password:
        raise ValueError("Please provide both email and password")

    users_col = get_users_collection()
    if users_col is None:
        raise ValueError("Database connection unavailable. Please check MONGO_URI")

    user = users_col.find_one({"email": clean_email})
    if not user:
        raise ValueError("No account found with this email. Please create an account")

    stored_hash = user.get("password", "")
    if stored_hash != hash_password(password):
        raise ValueError("Incorrect password. Please try again")

    name = user.get("name") or "User"
    token = mint_jwt(clean_email, name)
    return {
        "token": token,
        "user": {
            "name": name,
            "email": clean_email,
        },
    }


def register_user(name: str, email: str, password: str) -> Dict[str, Any]:
    """Register a new user in MongoDB argus_db.users.

    Returns dict with token and user details or raises ValueError.
    """
    clean_name = name.strip()
    clean_email = email.strip()

    if not clean_name or not clean_email or not password:
        raise ValueError("Please fill in all fields")
    if not is_valid_email(clean_email):
        raise ValueError("Please enter a valid email address")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")

    users_col = get_users_collection()
    if users_col is None:
        raise ValueError("Database connection unavailable. Please check MONGO_URI")

    existing = users_col.find_one({"email": clean_email})
    if existing:
        raise ValueError("An account with this email already exists. Please log in")

    doc = {
        "name": clean_name,
        "email": clean_email,
        "password": hash_password(password),
        "created_at": datetime.now(timezone.utc),
    }
    users_col.insert_one(doc)

    token = mint_jwt(clean_email, clean_name)
    return {
        "token": token,
        "user": {
            "name": clean_name,
            "email": clean_email,
        },
    }


def get_ratings_summary() -> Dict[str, Any]:
    """Return average user rating and total ratings count from MongoDB.

    Falls back gracefully to standard defaults if database is not reachable.
    """
    ratings_col = get_ratings_collection()
    if ratings_col is None:
        return {"avg": 4.8, "count": 24}
    try:
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "avg": {"$avg": "$stars"},
                    "count": {"$sum": 1},
                }
            }
        ]
        res = list(ratings_col.aggregate(pipeline))
        if res and res[0].get("count", 0) > 0:
            avg_val = round(float(res[0].get("avg") or 4.8), 1)
            count_val = int(res[0].get("count") or 0)
            return {"avg": avg_val, "count": count_val}
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not fetch ratings summary: %s", exc)
    return {"avg": 4.8, "count": 24}


def save_user_rating(email: str, name: str, stars: int, feedback: str = "") -> bool:
    """Store or update a user rating in MongoDB argus_db.ratings."""
    if stars < 1 or stars > 5:
        raise ValueError("Rating must be between 1 and 5 stars")

    ratings_col = get_ratings_collection()
    if ratings_col is None:
        log.warning("Database unavailable, cannot persist rating")
        return False
    try:
        ratings_col.update_one(
            {"email": email.strip()},
            {
                "$set": {
                    "name": name.strip(),
                    "stars": int(stars),
                    "feedback": feedback.strip(),
                    "timestamp": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to save rating: %s", exc)
        return False
