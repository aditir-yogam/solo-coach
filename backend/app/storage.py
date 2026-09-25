"""MinIO (S3-compatible) access.

Two clients on purpose: `_internal` talks to MinIO from wherever the backend runs
(http://minio:9000 inside Docker); `_presigner` signs URLs for the host the
browser uses (http://localhost:9000). The signature covers the host, so a URL
signed for minio:9000 can't simply be rewritten."""
import time

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from . import logger
from .config import settings

_cfg = Config(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 2}, connect_timeout=5)


def _client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=_cfg,
    )


_internal = _client(settings.s3_endpoint)
_presigner = _client(settings.s3_public_endpoint)
BUCKET = settings.s3_bucket


def coach_prefix(coach: dict) -> str:
    """coaches/{coach_id} or orgs/{org_id}/coaches/{coach_id} (Stories 3 and 8)."""
    if coach.get("org_id"):
        return f"orgs/{coach['org_id']}/coaches/{coach['coach_id']}"
    return f"coaches/{coach['coach_id']}"


def check_bucket(attempts: int = 20):
    """Story 1 creates the bucket by hand. If it's missing we create it
    (S3_AUTO_CREATE_BUCKET=true) so a fresh `docker compose up` still works."""
    for i in range(1, attempts + 1):
        try:
            _internal.head_bucket(Bucket=BUCKET)
            return True
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code"))
            if code in ("404", "NoSuchBucket", "NotFound"):
                if settings.s3_auto_create_bucket:
                    _internal.create_bucket(Bucket=BUCKET)
                    logger.info("created bucket", bucket=BUCKET)
                    return True
                logger.error("bucket missing — create it in the MinIO console", bucket=BUCKET)
                return False
            logger.warn("object storage error", attempt=i, code=code)
        except Exception as exc:  # noqa: BLE001 — connection refused while MinIO boots
            logger.warn("waiting for object storage", attempt=i, error=type(exc).__name__)
        time.sleep(1)
    return False


def put_object(key: str, body: bytes, content_type: str) -> str:
    _internal.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType=content_type)
    return key


def get_object_bytes(key: str) -> bytes:
    return _internal.get_object(Bucket=BUCKET, Key=key)["Body"].read()


def presign_get(key: str) -> str:
    """Minted fresh on every call; never stored."""
    return _presigner.generate_presigned_url(
        "get_object", Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=settings.photo_url_ttl_seconds
    )
