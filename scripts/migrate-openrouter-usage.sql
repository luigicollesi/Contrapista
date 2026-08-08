CREATE TABLE IF NOT EXISTS public.openrouter_request_usage (
  id bigserial PRIMARY KEY,
  request_id text NOT NULL,
  api_key_slot smallint NOT NULL CHECK (api_key_slot BETWEEN 1 AND 7),
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cached_tokens integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  cache_write_tokens integer NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS openrouter_request_usage_created_at_idx
  ON public.openrouter_request_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS openrouter_request_usage_model_created_at_idx
  ON public.openrouter_request_usage (model, created_at DESC);
