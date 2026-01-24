-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_id uuid NOT NULL,
  name text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT nodes_pkey PRIMARY KEY (id),
  CONSTRAINT nodes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT nodes_token_id_fkey FOREIGN KEY (token_id) REFERENCES public.pat_tokens(id)
);
CREATE TABLE public.pat_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token_id text NOT NULL UNIQUE,
  token_hash text NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  scopes ARRAY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  expires_at timestamp with time zone,
  CONSTRAINT pat_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT pat_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  provider USER-DEFINED NOT NULL,
  email text NOT NULL UNIQUE,
  password text,
  username text NOT NULL,
  avatar_url text NOT NULL,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
