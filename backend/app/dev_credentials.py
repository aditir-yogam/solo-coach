"""dev_local_credentials: DEV-ONLY password storage (Epic 1 addendum).

In production Cognito owns passwords entirely. This module exists only so the
email set-password / login flow can be exercised locally, and it is the ONLY
place in the code that touches the dev_local_credentials table. It never reads
or writes a password column on `coaches` (there is none). The completion pass
replaces these functions with Cognito calls.

Passwords are hashed with scrypt (Python standard library) and a random salt;
the plain text is never stored or logged.
"""
import base64
import hashlib
import hmac
import secrets

from . import db

_N, _R, _P, _DKLEN = 2**14, 8, 1, 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        algo, n, r, p, salt_b64, digest_b64 = (stored or "").split("$")
        if algo != "scrypt":
            return False
        salt, expected = base64.b64decode(salt_b64), base64.b64decode(digest_b64)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# A fixed dummy hash, so a login for an unknown email costs the same time as a
# wrong password (doesn't reveal which emails are registered).
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_or_dummy(password: str, stored: str | None) -> bool:
    if stored is None:
        verify_password(password, _DUMMY_HASH)
        return False
    return verify_password(password, stored)


def password_hash_for(coach_id: str) -> str | None:
    row = db.fetch_one("SELECT password_hash FROM dev_local_credentials WHERE coach_id = %s", (coach_id,))
    return row["password_hash"] if row else None


def has_password(coach_id: str) -> bool:
    return db.fetch_one("SELECT 1 FROM dev_local_credentials WHERE coach_id = %s", (coach_id,)) is not None


def insert_credentials(conn, coach_id: str, password_hash: str) -> bool:
    """Runs inside the caller's transaction. False if a row already exists."""
    return conn.execute(
        "INSERT INTO dev_local_credentials (coach_id, password_hash) VALUES (%s, %s) "
        "ON CONFLICT (coach_id) DO NOTHING RETURNING coach_id",
        (coach_id, password_hash)).fetchone() is not None
