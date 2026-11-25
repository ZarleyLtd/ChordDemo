/**
 * Stomper API — Supabase Edge Function (shared "Apps" project, schema `stomper`).
 *
 * Public reads (the web app):
 *   GET  ?action=list            -> { songs: [{ id, title, artist }] }
 *   GET  ?action=song&id=<vid>   -> { song: { id, title, artist, duration, bpm, beats, downbeats, chords, bass, ... } }
 * Writes (the analyser on the home PC), need the STOMPER_WRITE_KEY secret:
 *   POST { action: "save",   key, song }
 *   POST { action: "update", key, id, title?, artist? }
 *   POST { action: "delete", key, id }
 *
 * Secrets: SUPABASE_DB_URL (provided by Supabase), STOMPER_WRITE_KEY.
 * Deploy:  supabase functions deploy stomper-api --no-verify-jwt
 */
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-cache" },
  });
}

let _sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (_sql) return _sql;
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new Error("Missing SUPABASE_DB_URL");
  _sql = postgres(url, { max: 4, idle_timeout: 20, connect_timeout: 10, prepare: false });
  return _sql;
}

function requireKey(key: unknown) {
  const want = Deno.env.get("STOMPER_WRITE_KEY") ?? "";
  if (!want || key !== want) throw Object.assign(new Error("Not allowed"), { status: 403 });
}

function requireId(id: unknown): string {
  if (typeof id !== "string" || !ID_RE.test(id)) throw Object.assign(new Error("Bad song id"), { status: 400 });
  return id;
}

async function list() {
  const rows = await db()`select id, title, artist from stomper.songs order by lower(artist), lower(title)`;
  return { songs: rows };
}

async function song(id: string) {
  const [r] = await db()`select id, title, artist, duration, bpm, data, analysed_at from stomper.songs where id = ${id}`;
  if (!r) throw Object.assign(new Error("Song not found"), { status: 404 });
  return {
    song: {
      ...r.data, id: r.id, title: r.title, artist: r.artist, duration: r.duration, bpm: r.bpm,
      analysedAt: r.analysed_at,
    },
  };
}

async function save(s: Record<string, unknown>) {
  const id = requireId(s?.id);
  const title = String(s.title ?? "").trim(), artist = String(s.artist ?? "").trim();
  if (!title || !artist) throw Object.assign(new Error("Title and artist are required"), { status: 400 });
  if (!Array.isArray(s.beats) || !Array.isArray(s.chords)) {
    throw Object.assign(new Error("beats and chords are required"), { status: 400 });
  }
  const { id: _i, title: _t, artist: _a, duration, bpm, analysedAt, ...data } = s;
  const when = new Date(String(analysedAt ?? ""));
  const analysed = isNaN(when.getTime()) ? new Date() : when;
  await db()`
    insert into stomper.songs (id, title, artist, duration, bpm, data, analysed_at, updated_at)
    values (${id}, ${title}, ${artist}, ${(duration ?? null) as number | null}, ${(bpm ?? null) as number | null},
            ${db().json(data as never)}, ${analysed}, now())
    on conflict (id) do update set title = excluded.title, artist = excluded.artist, duration = excluded.duration,
      bpm = excluded.bpm, data = excluded.data, analysed_at = excluded.analysed_at, updated_at = now()`;
  return { ok: true, id };
}

async function update(b: Record<string, unknown>) {
  const id = requireId(b.id);
  const title = b.title == null ? null : String(b.title).trim();
  const artist = b.artist == null ? null : String(b.artist).trim();
  const rows = await db()`
    update stomper.songs set title = coalesce(nullif(${title}, ''), title),
      artist = coalesce(nullif(${artist}, ''), artist), updated_at = now()
    where id = ${id} returning id`;
  if (!rows.length) throw Object.assign(new Error("Song not found"), { status: 404 });
  return { ok: true, id };
}

async function remove(id: string) {
  await db()`delete from stomper.songs where id = ${id}`;
  return { ok: true, id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") {
      const u = new URL(req.url);
      const action = u.searchParams.get("action") || "list";
      if (action === "list") return json(await list());
      if (action === "song") return json(await song(requireId(u.searchParams.get("id"))));
      return json({ error: "Unknown action" }, 400);
    }
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      requireKey(b.key);
      if (b.action === "save") return json(await save(b.song));
      if (b.action === "update") return json(await update(b));
      if (b.action === "delete") return json(await remove(requireId(b.id)));
      return json({ error: "Unknown action" }, 400);
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 500) console.error(e);
    return json({ error: (e as Error).message }, status);
  }
});
