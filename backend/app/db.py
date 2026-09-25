"""PostgreSQL access (psycopg 3 + connection pool). Plain parameterised SQL —
no ORM, no migrations: the schema is exactly init.sql."""
import time
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import logger
from .config import settings

pool = ConnectionPool(
    settings.database_url, min_size=1, max_size=10, open=False, kwargs={"row_factory": dict_row, "connect_timeout": 5}
)


def open_pool(attempts: int = 30):
    for i in range(1, attempts + 1):
        try:
            pool.open(wait=True, timeout=5)
            with pool.connection() as conn:
                conn.execute("SELECT 1")
            return
        except Exception as exc:  # noqa: BLE001
            logger.warn("waiting for postgres", attempt=i, error=str(exc)[:120])
            time.sleep(1)
    raise RuntimeError("Postgres is not reachable")


def fetch_one(sql: str, params=()):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchone()


def fetch_all(sql: str, params=()):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchall()


def execute(sql: str, params=()) -> int:
    with pool.connection() as conn:
        return conn.execute(sql, params).rowcount


@contextmanager
def transaction():
    with pool.connection() as conn:
        with conn.transaction():
            yield conn
