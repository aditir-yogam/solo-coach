"""Resume PDF -> text (local extraction with pypdf, no metered API, no tool_use row)."""
import io
import re

from pypdf import PdfReader

MAX_CHARS = 12000


def is_pdf(data: bytes) -> bool:
    return isinstance(data, (bytes, bytearray)) and data[:5] == b"%PDF-"


def extract_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    text = re.sub(r"[ \t]+", " ", text.replace("\r", "\n"))
    return re.sub(r"\n{3,}", "\n\n", text).strip()[:MAX_CHARS]
