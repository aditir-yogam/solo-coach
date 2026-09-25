"""Every SQL statement in the app. Column names match init.sql exactly; nothing
here creates, alters or drops anything."""
import hashlib
import secrets
import uuid
from datetime import datetime, timezone


from . import db

COLUMNS = """coach_id, coach_type, org_id, coach_name, coach_email, status, auth_provider, cognito_sub,
  website_url, resume_s3_key, photo_s3_key, story_text, coaching_niche, credential, clients_coached,
  headline, linkedin_handle, story_heading, coach_story, bio_status, created_at, updated_at"""


def _row(r):
    if r is None:
        return None
    r = dict(r)
    for k in ("coach_id", "org_id"):
        if r.get(k) is not None:
            r[k] = str(r[k])
    return r


# ---------------------------------------------------------------- coaches
def coach_by_id(coach_id: str):
    return _row(db.fetch_one(f"SELECT {COLUMNS} FROM coaches WHERE coach_id = %s", (coach_id,)))


def coach_by_email(email: str):
    # Story 3 step 4. coach_email has no UNIQUE constraint, so this check is the guard.
    return _row(db.fetch_one(
        f"SELECT {COLUMNS} FROM coaches WHERE lower(coach_email) = lower(%s) ORDER BY created_at LIMIT 1", (email,)))


def email_taken_by_other(email: str, coach_id: str) -> bool:
    return db.fetch_one(
        "SELECT 1 FROM coaches WHERE lower(coach_email) = lower(%s) AND coach_id <> %s LIMIT 1", (email, coach_id)) is not None


def new_coach_id() -> str:
    return str(uuid.uuid4())


def insert_coach(*, coach_id, coach_type, org_id, name, email, status, auth_provider, cognito_sub=None, photo_s3_key=None):
    """Stories 3/4/5: only these columns are set; everything else keeps its default/null."""
    return _row(db.fetch_one(
        f"""INSERT INTO coaches (coach_id, coach_type, org_id, coach_name, coach_email, status, auth_provider, cognito_sub, photo_s3_key)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {COLUMNS}""",
        (coach_id, coach_type, org_id, name, email, status, auth_provider, cognito_sub, photo_s3_key)))


def refresh_social_login(coach_id: str, cognito_sub: str):
    db.execute(
        "UPDATE coaches SET cognito_sub = %s, status = 'active', updated_at = now() WHERE coach_id = %s AND status <> 'deactivated'",
        (cognito_sub, coach_id))


def set_pending_name(coach_id: str, name: str):
    db.execute("UPDATE coaches SET coach_name = %s, updated_at = now() WHERE coach_id = %s AND status = 'pending'", (name, coach_id))


_WRITABLE = {  # the only keys update_coach_fields turns into column names
    "story_text", "website_url", "resume_s3_key", "coaching_niche", "credential", "clients_coached",
    "coach_name", "headline", "linkedin_handle", "coach_email", "story_heading", "coach_story", "photo_s3_key",
}


def update_coach_fields(coach_id: str, fields: dict):
    if not fields:
        return coach_by_id(coach_id)
    bad = set(fields) - _WRITABLE
    if bad:
        raise ValueError(f"refusing to write non-whitelisted columns: {bad}")
    sets = ", ".join(f"{k} = %s" for k in fields)
    return _row(db.fetch_one(
        f"UPDATE coaches SET {sets}, updated_at = now() WHERE coach_id = %s RETURNING {COLUMNS}",
        (*fields.values(), coach_id)))


def claim_processing(coach_id: str) -> bool:
    """Atomic: only one request can move a coach into 'processing'. Guards
    against double-clicks, resubmits and duplicate llm_use / tool_use rows."""
    return db.fetch_one(
        "UPDATE coaches SET bio_status = 'processing', updated_at = now() "
        "WHERE coach_id = %s AND bio_status <> 'processing' RETURNING coach_id", (coach_id,)) is not None


def set_story_done(coach_id: str, story: str):
    db.execute("UPDATE coaches SET coach_story = %s, bio_status = 'done', updated_at = now() WHERE coach_id = %s", (story, coach_id))


def set_bio_not_started(coach_id: str):
    # Story 9 step 7: on failure the UI must not spin forever.
    db.execute("UPDATE coaches SET bio_status = 'not_started', updated_at = now() WHERE coach_id = %s", (coach_id,))


def release_orphaned_processing() -> int:
    # On boot nothing can still be generating (runs are in-process).
    return db.execute("UPDATE coaches SET bio_status = 'not_started', updated_at = now() WHERE bio_status = 'processing'")


# ------------------------------------------------------ magic_link_tokens
def generate_token() -> str:
    return secrets.token_urlsafe(32)  # Story 5: 32-byte URL-safe string


def hash_token(raw: str) -> str:
    # The token column stores a SHA-256 of the token; the raw value only exists in the email.
    return hashlib.sha256(raw.encode()).hexdigest()


def insert_token(token_hash: str, coach_id: str, ttl_hours: int):
    db.execute(
        "INSERT INTO magic_link_tokens (token, coach_id, expires_at, used_at) VALUES (%s, %s, now() + make_interval(hours => %s), NULL)",
        (token_hash, coach_id, ttl_hours))


def consume_token(raw: str) -> tuple[str, str | None]:
    """Story 5 step 5, inside one transaction with the row locked.
    Returns (status, coach_id): not_found | used | expired | ok."""
    if not raw or len(raw) > 200:
        return "not_found", None
    token_hash = hash_token(raw)
    with db.transaction() as conn:
        row = conn.execute(
            "SELECT coach_id, expires_at, used_at FROM magic_link_tokens WHERE token = %s FOR UPDATE", (token_hash,)).fetchone()
        if row is None:
            return "not_found", None
        coach_id = str(row["coach_id"])
        if row["used_at"] is not None:
            return "used", coach_id
        if row["expires_at"] <= datetime.now(timezone.utc):
            return "expired", coach_id
        conn.execute("UPDATE magic_link_tokens SET used_at = now() WHERE token = %s", (token_hash,))
        conn.execute("UPDATE coaches SET status = 'active', updated_at = now() WHERE coach_id = %s", (coach_id,))
        return "ok", coach_id


# ------------------------------------------------------ llm_use / tool_use
def insert_llm_use(*, coach_id, org_id, provider, model, input_tokens=None, output_tokens=None, cost_usd=None, status, error_message=None):
    db.execute(
        """INSERT INTO llm_use (coach_id, org_id, purpose, provider, model, input_tokens, output_tokens, cost_usd, status, error_message)
           VALUES (%s, %s, 'generate_coach_story', %s, %s, %s, %s, %s, %s, %s)""",
        (coach_id, org_id, provider, model, input_tokens, output_tokens, cost_usd, status, error_message))


def insert_tool_use(*, coach_id, org_id, credits_used, status, error_message=None):
    db.execute(
        """INSERT INTO tool_use (coach_id, org_id, tool_name, purpose, credits_used, status, error_message)
           VALUES (%s, %s, 'firecrawl', 'website_crawl_for_story', %s, %s, %s)""",
        (coach_id, org_id, credits_used, status, error_message))


def latest_story_run(coach_id: str):
    return db.fetch_one(
        "SELECT status, created_at FROM llm_use WHERE coach_id = %s AND purpose = 'generate_coach_story' ORDER BY created_at DESC LIMIT 1",
        (coach_id,))
