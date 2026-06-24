# Phirepass UI

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Database schema

```sql
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  provider text NOT NULL,
  email text NOT NULL UNIQUE,
  password text,
  username text NOT NULL,
  avatar_url text NOT NULL,
  roles text[] NOT NULL DEFAULT '{user}'::text[],
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pat_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token_id text NOT NULL UNIQUE,
  token_hash text NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  scopes text[] NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  expires_at timestamp with time zone,
  CONSTRAINT pat_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT pat_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text,
  public_key text NOT NULL UNIQUE,
  hostname text NOT NULL DEFAULT ''::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  last_seen timestamp with time zone,
  revoked boolean NOT NULL DEFAULT false,
  CONSTRAINT nodes_pkey PRIMARY KEY (id),
  CONSTRAINT nodes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.auth_challenges (
  node_id uuid NOT NULL,
  challenge text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT auth_challenges_pkey PRIMARY KEY (node_id),
  CONSTRAINT auth_challenges_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE
);

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
   'phirepass-auth-challenge-cleanup',
   '* * * * *', -- every minute
   $$DELETE FROM auth_challenges WHERE expires_at <= NOW();$$
);
```
