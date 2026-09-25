CREATE TABLE coaches (
    coach_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_type         TEXT NOT NULL CHECK (coach_type IN ('IN', 'SO')),
    org_id             UUID,
    coach_name         TEXT,
    coach_email        TEXT,
    status             TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'deactivated')),
    auth_provider      TEXT CHECK (auth_provider IN ('google', 'linkedin', 'email')),
    cognito_sub        TEXT,
    website_url        TEXT,
    resume_s3_key      TEXT,
    photo_s3_key       TEXT,
    story_text         TEXT,
    coaching_niche     TEXT[],
    credential         TEXT[],
    clients_coached    TEXT,
    headline           TEXT,
    linkedin_handle    TEXT,
    story_heading      TEXT DEFAULT 'How I Help',
    coach_story        TEXT,
    bio_status         TEXT NOT NULL DEFAULT 'not_started'
                        CHECK (bio_status IN ('not_started', 'processing', 'done')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE magic_link_tokens (
    token           TEXT PRIMARY KEY,
    coach_id        UUID NOT NULL REFERENCES coaches(coach_id),
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE llm_use (
    llm_use_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID REFERENCES coaches(coach_id),
    org_id          UUID,
    purpose         TEXT NOT NULL,        -- e.g. 'generate_coach_story'
    provider        TEXT NOT NULL,        -- 'anthropic'
    model           TEXT NOT NULL,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    cost_usd        NUMERIC,
    status          TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tool_use (
    tool_use_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID REFERENCES coaches(coach_id),
    org_id          UUID,
    tool_name       TEXT NOT NULL,        -- e.g. 'firecrawl'
    purpose         TEXT NOT NULL,        -- e.g. 'website_crawl_for_story'
    credits_used    NUMERIC,
    status          TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);