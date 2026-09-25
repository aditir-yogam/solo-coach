import json
import sys
from datetime import datetime, timezone


def _log(level: str, message: str, **meta):
    line = {"t": datetime.now(timezone.utc).isoformat(timespec="seconds"), "level": level, "message": message, **meta}
    print(json.dumps(line, default=str), file=sys.stderr if level == "error" else sys.stdout, flush=True)


def info(message: str, **meta):
    _log("info", message, **meta)


def warn(message: str, **meta):
    _log("warn", message, **meta)


def error(message: str, **meta):
    _log("error", message, **meta)
