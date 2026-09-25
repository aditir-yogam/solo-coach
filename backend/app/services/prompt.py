"""Builds the model input from the LOCKED template (prompts/story_prompt_template.txt).

The template file is kept byte-for-byte as provided. Everything above its first
'---' line is the instruction and is used verbatim with {story_heading}
substituted. The block between the '---' lines documents the three inputs to
insert; we insert them (Story 9 step 4) as clearly labelled sections."""
from pathlib import Path

TEMPLATE_PATH = Path(__file__).resolve().parents[2] / "prompts" / "story_prompt_template.txt"


def _instruction() -> str:
    text = TEMPLATE_PATH.read_text(encoding="utf-8")
    lines = text.splitlines()
    cut = next((i for i, line in enumerate(lines) if line.strip() == "---"), len(lines))
    return "\n".join(lines[:cut]).strip()


def build_prompt(story_heading: str, source_material: str, story_text: str | None) -> tuple[str, str]:
    """Returns (system, user)."""
    heading = story_heading or "How I Help"
    system = _instruction().replace("{story_heading}", heading)
    user = (
        f"Section title (story_heading): {heading}\n\n"
        f"<source_material>\n{source_material or '(no website, resume or quick answers were provided)'}\n</source_material>\n\n"
        f"<story_text>\n{story_text or '(the coach did not write a narrative)'}\n</story_text>"
    )
    return system, user
