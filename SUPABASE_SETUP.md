# Supabase Setup Guide (Step by Step)

This guide walks you through setting up Supabase for Super Task.

## What You Will Configure

1. Supabase project and API keys
2. Auth with email magic links
3. Redirect URLs for web and future Android use
4. Database schema (profiles, groups, tasks)
5. Row Level Security (RLS)
6. Local app config file for Supabase keys

---

## 1. Create Supabase Project

1. Go to Supabase and sign in.
2. Create or select your organization.
3. Click New project.
4. Fill in:
   1. Project name (for example: super-task-dev)
   2. Strong database password (save this securely)
   3. Region closest to you
5. Wait for provisioning to complete.

---

## 2. Copy API Values

1. In Supabase, open Project Settings.
2. Open API (or Data API in newer UI).
3. Copy these values:
   1. Project URL
   2. anon public key

Important:
- Use only URL + anon key in frontend code.
- Never expose service_role key in frontend files.

---

## 3. Configure Authentication

1. Open Authentication.
2. Open URL Configuration.
3. Set Site URL:
   - Your hosted web URL later
   - For local testing now, use your local served URL (for example http://localhost:5500 if using Live Server)
4. Add Redirect URLs:
   - local URL(s) you test with
   - hosted URL(s) you deploy to
5. Open Providers (or Sign In Methods).
6. Enable Email provider.
7. Ensure Magic Link / OTP is enabled.

Optional (recommended later):
- Configure custom SMTP for better email reliability and branding.

---

## 4. Run Initial SQL Migration

1. Open SQL Editor in Supabase.
2. Create a new query.
3. Paste the script below.
4. Run it.

```sql
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_groups_updated_at on public.groups;
create trigger trg_groups_updated_at
before update on public.groups
for each row
execute function public.set_updated_at();

create unique index if not exists ux_groups_user_name_active
on public.groups (user_id, lower(name))
where deleted_at is null;

create index if not exists ix_groups_user_id on public.groups (user_id);
create index if not exists ix_groups_user_updated_at on public.groups (user_id, updated_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_name text not null,
  title text not null check (char_length(title) <= 120),
  due_date date,
  priority text not null default 'Low' check (priority in ('High', 'Medium', 'Low', 'None')),
  notes text not null default '' check (char_length(notes) <= 1000),
  completed boolean not null default false,
  sort_order integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

create index if not exists ix_tasks_user_id on public.tasks (user_id);
create index if not exists ix_tasks_user_sort on public.tasks (user_id, sort_order);
create index if not exists ix_tasks_user_updated_at on public.tasks (user_id, updated_at desc);
create index if not exists ix_tasks_user_group on public.tasks (user_id, group_name);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.tasks enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists groups_select_own on public.groups;
create policy groups_select_own
on public.groups
for select
using (user_id = auth.uid());

drop policy if exists groups_insert_own on public.groups;
create policy groups_insert_own
on public.groups
for insert
with check (user_id = auth.uid());

drop policy if exists groups_update_own on public.groups;
create policy groups_update_own
on public.groups
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists groups_delete_own on public.groups;
create policy groups_delete_own
on public.groups
for delete
using (user_id = auth.uid());

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
on public.tasks
for select
using (user_id = auth.uid());

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
on public.tasks
for insert
with check (user_id = auth.uid());

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own
on public.tasks
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own
on public.tasks
for delete
using (user_id = auth.uid());
```

---

## 4b. Enable Realtime

The app subscribes to Postgres changes on `tasks` and `groups` so open
tabs/devices stay in sync without a manual refresh. Enable Realtime on both
tables:

1. In the Supabase dashboard, go to Database -> Replication (or Table Editor ->
   select table -> Realtime toggle).
2. Enable Realtime for the `tasks` table and the `groups` table.

RLS policies above already scope these changes to `user_id = auth.uid()`, so
each user only receives events for their own rows.

---

## 5. Configure This Repo

1. Open auth config example file.
2. Copy it to a real local config file.
3. Set your Supabase URL and anon key.

Use this as template:

```js
window.SUPER_TASK_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

Current template file in this repo:
- auth-config.example.js

Recommended local file (do not commit secrets):
- auth-config.js

Then load it before auth.js in index.html.

---

## 6. Verify Auth End-to-End

1. Run the app locally.
2. Enter your email in the auth gate.
3. Click Send sign-in link.
4. Open link from your email.
5. Confirm app returns signed-in state.
6. Confirm sign out works.

---

## 7. Common Issues

### Magic link email does not arrive

1. Check spam/junk.
2. Confirm Email provider and OTP are enabled.
3. Confirm redirect URL is allowed.
4. Configure custom SMTP if needed.

### Redirect loops or signed-out after link

1. Check Site URL exactly matches runtime URL.
2. Check Redirect URLs include your local/hosted URL.
3. Confirm browser is not blocking third-party storage/cookies.

### Permission denied on tables

1. Confirm RLS is enabled.
2. Confirm policies were created.
3. Confirm rows include correct user_id.

---

## 8. Next Step After Setup

After this setup is done, the next milestone is wiring authenticated CRUD to tasks/groups via Supabase while keeping local fallback and then adding sync behavior.
