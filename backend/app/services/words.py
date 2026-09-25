import re


def count_words(text: str | None) -> int:
    return len(text.split()) if text and text.strip() else 0


def tidy_story(text: str) -> str:
    """Strip wrapping models sometimes add: 'Here is…:' lines, a markdown title,
    bold markers, surrounding quotes."""
    t = (text or "").replace("\r\n", "\n").strip()
    t = re.sub(r"^(here('| i)s|below is)[^\n]*:\s*\n+", "", t, flags=re.I)
    t = re.sub(r"^#{1,6}\s.*\n+", "", t)
    t = re.sub(r"^\*\*[^*\n]{1,80}\*\*\s*\n+", "", t)  # bold title line
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r'^["“](.*)["”]$', r"\1", t, flags=re.S)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def cap_words(text: str, max_words: int = 200) -> str:
    """If over the cap, cut back to the last complete sentence that fits."""
    if count_words(text) <= max_words:
        return text
    out, used = [], 0
    for para in re.split(r"\n\n+", text):
        sentences = re.findall(r"[^.!?]+[.!?]+[\"”’)]*\s*|[^.!?]+$", para) or [para]
        kept = []
        for s in sentences:
            n = count_words(s)
            if used + n > max_words:
                break
            kept.append(s.strip())
            used += n
        if kept:
            out.append(" ".join(kept))
        if len(kept) < len(sentences):
            break
    result = "\n\n".join(out).strip()
    return result or " ".join(text.split()[:max_words])
