-- ChordDemo: song library (analysed beats + chords). Lyrics are never stored.
-- Read and written only through the chorddemo-api Edge Function (postgres.js on SUPABASE_DB_URL),
-- so the schema is not exposed to PostgREST and anon/authenticated get no access.

create schema if not exists chorddemo;
revoke all on schema chorddemo from anon, authenticated;

create table if not exists chorddemo.songs (
  id           text primary key check (id ~ '^[A-Za-z0-9_-]{11}$'),  -- YouTube video id
  title        text not null,
  artist       text not null,
  duration     real,
  bpm          real,
  data         jsonb not null,   -- beats, downbeats, chords, bass, lyricsFound, models
  analysed_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists songs_artist_title_idx on chorddemo.songs (lower(artist), lower(title));

alter table chorddemo.songs enable row level security;
revoke all on all tables in schema chorddemo from anon, authenticated;
