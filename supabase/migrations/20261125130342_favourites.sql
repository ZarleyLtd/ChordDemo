-- Per-account favourite songs. song_id is a YouTube video id; it has no foreign key to stomper.songs
-- because songs that haven't been analysed yet can still be played (and favourited).
-- Read and written only through the stomper-api Edge Function.

create table if not exists stomper.favourites (
  account_id  uuid not null references stomper.accounts (id) on delete cascade,
  song_id     text not null check (song_id ~ '^[A-Za-z0-9_-]{11}$'),
  created_at  timestamptz not null default now(),
  primary key (account_id, song_id)
);

alter table stomper.favourites enable row level security;
revoke all on all tables in schema stomper from anon, authenticated;
