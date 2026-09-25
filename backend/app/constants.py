# Option lists verbatim from the Page 2 wireframe / epic Story 7.
NICHE_OPTIONS = ["Executive & leadership", "Business", "Life", "Career", "Health & wellness", "ADHD & neurodiversity", "Other"]
CREDENTIAL_OPTIONS = ["ICF", "EMCC", "Another body", "In training", "Not credentialed"]
CLIENT_COUNT_OPTIONS = ["Just starting", "1–5", "6–25", "25+"]

PROVIDERS = ("google", "linkedin")

# Tenancy detection (Story 2): stub lookup of fake org codes -> org_id.
# Real org resolution is out of scope.
ORG_CODES = {
    "acme": "11111111-1111-4111-8111-111111111111",
    "northstar": "22222222-2222-4222-8222-222222222222",
}

# PATCH /api/v1/app/coaches/{coach_id} may change these and nothing else (Story 12).
EDITABLE_FIELDS = ("coach_name", "headline", "linkedin_handle", "coach_email", "story_heading", "coach_story", "photo_s3_key")
