-- Stomper user accounts (Connect-style): handle + password, one-time invite codes, admin-issued
-- reset codes, and sessions. Accounts are either regular users or admins (is_admin).
-- An invite carries the account type it grants. Codes and session tokens are stored as SHA-256
-- hashes, passwords as bcrypt. Read and written only through the stomper-api Edge Function.

create table if not exists stomper.accounts (
  id             uuid primary key default gen_random_uuid(),
  handle         text not null,
  password_hash  text not null,
  is_admin       boolean not null default false,
  invite_id      uuid null,
  disabled_at    timestamptz null,
  last_seen_at   timestamptz null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint accounts_handle_unique unique (handle),
  constraint accounts_handle_format check (handle ~ '^[a-z0-9]{3,20}$')
);

create table if not exists stomper.invites (
  id          uuid primary key default gen_random_uuid(),
  purpose     text not null check (purpose in ('register', 'reset')),
  code_hash   text not null unique,
  label       text null,
  is_admin    boolean not null default false,  -- register: the account type the invite grants
  account_id  uuid null references stomper.accounts (id) on delete cascade,  -- reset: whose password
  created_by  uuid null references stomper.accounts (id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz null,
  created_at  timestamptz not null default now()
);

alter table stomper.accounts drop constraint if exists accounts_invite_fk;
alter table stomper.accounts
  add constraint accounts_invite_fk foreign key (invite_id) references stomper.invites (id) on delete set null;

create table if not exists stomper.sessions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references stomper.accounts (id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz null
);

create index if not exists invites_pending_idx on stomper.invites (expires_at) where used_at is null;
create index if not exists sessions_account_idx on stomper.sessions (account_id);

alter table stomper.accounts enable row level security;
alter table stomper.invites enable row level security;
alter table stomper.sessions enable row level security;
revoke all on all tables in schema stomper from anon, authenticated;
