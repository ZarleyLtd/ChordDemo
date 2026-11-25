// Stomper user accounts (Connect-style): one-time invite codes, handle + password, sessions,
// admin-issued reset codes. Accounts are regular users or admins.
// Passwords: bcrypt (bcryptjs, cost 10). Invite/reset codes and session tokens: SHA-256 hex.

import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const BCRYPT_COST = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HANDLE_RE = /^[a-z0-9]{3,20}$/;
const SESSION_DAYS = 90;
const INVITE_DAYS = 30;
const RESET_HOURS = 24;

// postgres.js client or transaction.
// deno-lint-ignore no-explicit-any
type Sql = any;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PublicAccount = { id: string; handle: string; isAdmin: boolean };
export type Actor = { accountId: string; handle: string; isAdmin: boolean };

// ---------------------------------------------------------------- helpers
const rateBuckets = new Map<string, { n: number; reset: number }>();
function rateOk(key: string, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now > b.reset) {
    rateBuckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (b.n >= max) return false;
  b.n += 1;
  return true;
}
function limit(key: string, max?: number) {
  if (!rateOk(key, max)) throw new ApiError("Too many attempts. Try again later.", 429);
}

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]!.trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

function randomCode(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const normCode = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
const normHandle = (v: unknown) => String(v ?? "").trim().toLowerCase();
const flag = (v: unknown) => v === true || v === "t" || v === "true" || v === 1;
const str = (v: unknown) => String(v ?? "").trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v: unknown, what: string) {
  const s = str(v);
  if (!UUID_RE.test(s)) throw new ApiError(what + " required");
  return s;
}

function validateHandle(handle: string) {
  if (!HANDLE_RE.test(handle)) throw new ApiError("Handle must be 3 to 20 letters or digits, with no spaces.");
}
function validatePassword(password: string) {
  if (password.length < 8) throw new ApiError("Password must be at least 8 characters.");
  if (password.length > 72) throw new ApiError("Password must be at most 72 characters.");
}

const publicAccount = (r: Record<string, unknown>): PublicAccount => ({
  id: String(r.id ?? r.account_id),
  handle: String(r.handle),
  isAdmin: flag(r.is_admin),
});

async function issueSession(sql: Sql, accountId: string) {
  const token = randomToken();
  await sql`
    insert into stomper.sessions (account_id, token_hash, expires_at)
    values (${accountId}::uuid, ${await sha256Hex(token)}, now() + make_interval(days => ${SESSION_DAYS}))`;
  await sql`update stomper.accounts set last_seen_at = now() where id = ${accountId}::uuid`;
  return token;
}

/** The signed-in account for a session token, or null. Extends the session on use. */
export async function readSession(sql: Sql, token: unknown): Promise<Actor | null> {
  const raw = typeof token === "string" ? token.trim() : "";
  if (!raw) return null;
  const [row] = await sql`
    select s.id as session_id, a.id as account_id, a.handle, a.is_admin, a.disabled_at
    from stomper.sessions s join stomper.accounts a on a.id = s.account_id
    where s.token_hash = ${await sha256Hex(raw)} and s.revoked_at is null and s.expires_at > now()
    limit 1`;
  if (!row || row.disabled_at) return null;
  await sql`
    update stomper.sessions set expires_at = now() + make_interval(days => ${SESSION_DAYS}), last_seen_at = now()
    where id = ${row.session_id}::uuid`;
  await sql`update stomper.accounts set last_seen_at = now() where id = ${row.account_id}::uuid`;
  return { accountId: String(row.account_id), handle: String(row.handle), isAdmin: flag(row.is_admin) };
}

async function requireSession(sql: Sql, token: unknown) {
  const actor = await readSession(sql, token);
  if (!actor) throw new ApiError("Session expired. Connect again.", 401);
  return actor;
}

async function requireAdmin(sql: Sql, token: unknown) {
  const actor = await requireSession(sql, token);
  if (!actor.isAdmin) throw new ApiError("Only admins can do that.", 403);
  return actor;
}

// ---------------------------------------------------------------- public account actions
export async function register(sql: Sql, req: Request, b: Record<string, unknown>) {
  limit("register:" + clientIp(req));
  const code = normCode(b.inviteCode);
  const handle = normHandle(b.handle);
  const password = String(b.password ?? "");
  if (!code) throw new ApiError("Invite code is required");
  validateHandle(handle);
  validatePassword(password);
  const codeHash = await sha256Hex(code);
  const passwordHash = bcrypt.hashSync(password, BCRYPT_COST);
  try {
    return await sql.begin(async (tx: Sql) => {
      const [invite] = await tx`
        select id, is_admin from stomper.invites
        where code_hash = ${codeHash} and purpose = 'register' and used_at is null and expires_at > now()
        for update`;
      if (!invite) throw new ApiError("Invite code is invalid, used, or expired", 403);
      const taken = await tx`select 1 from stomper.accounts where handle = ${handle}`;
      if (taken.length) throw new ApiError("That handle is already taken");
      const [account] = await tx`
        insert into stomper.accounts (handle, password_hash, is_admin, invite_id)
        values (${handle}, ${passwordHash}, ${flag(invite.is_admin)}, ${invite.id}::uuid)
        returning id, handle, is_admin`;
      await tx`
        update stomper.invites set used_at = now(), account_id = ${account.id}::uuid where id = ${invite.id}::uuid`;
      return { sessionToken: await issueSession(tx, String(account.id)), account: publicAccount(account) };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError("That handle is already taken");
    throw e;
  }
}

export async function connect(sql: Sql, req: Request, b: Record<string, unknown>) {
  limit("connect:" + clientIp(req));
  const handle = normHandle(b.handle);
  const password = String(b.password ?? "");
  if (!handle || !password) throw new ApiError("Handle and password are required");
  limit("connect-h:" + handle, 8);
  const [account] = await sql`
    select id, handle, password_hash, is_admin, disabled_at from stomper.accounts where handle = ${handle}`;
  if (!account || !bcrypt.compareSync(password, String(account.password_hash))) {
    throw new ApiError("Handle or password is wrong", 403);
  }
  if (account.disabled_at) throw new ApiError("This account has been disabled.", 403);
  return { sessionToken: await issueSession(sql, String(account.id)), account: publicAccount(account) };
}

export async function resetPassword(sql: Sql, req: Request, b: Record<string, unknown>) {
  limit("reset:" + clientIp(req));
  const handle = normHandle(b.handle);
  const code = normCode(b.resetCode);
  const password = String(b.newPassword ?? "");
  if (!handle || !code) throw new ApiError("Handle and reset code are required");
  validatePassword(password);
  const [account] = await sql`select id, disabled_at from stomper.accounts where handle = ${handle}`;
  if (!account) throw new ApiError("Handle or reset code is wrong", 403);
  if (account.disabled_at) throw new ApiError("This account has been disabled.", 403);
  const codeHash = await sha256Hex(code);
  const passwordHash = bcrypt.hashSync(password, BCRYPT_COST);
  await sql.begin(async (tx: Sql) => {
    const [invite] = await tx`
      select id from stomper.invites
      where account_id = ${account.id}::uuid and code_hash = ${codeHash} and purpose = 'reset'
        and used_at is null and expires_at > now()
      for update`;
    if (!invite) throw new ApiError("Handle or reset code is wrong", 403);
    await tx`update stomper.accounts set password_hash = ${passwordHash}, updated_at = now() where id = ${account.id}::uuid`;
    await tx`update stomper.invites set used_at = now() where id = ${invite.id}::uuid`;
    // A new password signs the account out everywhere.
    await tx`update stomper.sessions set revoked_at = now() where account_id = ${account.id}::uuid and revoked_at is null`;
  });
  return { ok: true };
}

export async function signOut(sql: Sql, token: unknown) {
  const raw = typeof token === "string" ? token.trim() : "";
  if (raw) {
    await sql`update stomper.sessions set revoked_at = now() where token_hash = ${await sha256Hex(raw)} and revoked_at is null`;
  }
  return { ok: true };
}

export async function whoAmI(sql: Sql, token: unknown) {
  const actor = await requireSession(sql, token);
  return { account: { id: actor.accountId, handle: actor.handle, isAdmin: actor.isAdmin } };
}

// ---------------------------------------------------------------- favourites (any signed-in account)
const SONG_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function listFavourites(sql: Sql, b: Record<string, unknown>) {
  const me = await requireSession(sql, b.token);
  const rows = await sql`
    select song_id from stomper.favourites where account_id = ${me.accountId}::uuid order by created_at`;
  return { favourites: rows.map((r: Record<string, unknown>) => r.song_id) };
}

export async function setFavourite(sql: Sql, b: Record<string, unknown>) {
  const me = await requireSession(sql, b.token);
  const songId = str(b.songId);
  if (!SONG_ID_RE.test(songId)) throw new ApiError("Bad song id");
  const on = flag(b.on);
  if (on) {
    await sql`
      insert into stomper.favourites (account_id, song_id) values (${me.accountId}::uuid, ${songId})
      on conflict do nothing`;
  } else {
    await sql`delete from stomper.favourites where account_id = ${me.accountId}::uuid and song_id = ${songId}`;
  }
  return { ok: true, songId, on };
}

// ---------------------------------------------------------------- invites (admins, or the write key)
/** Issue a one-time code. register: a new account of the given type. reset: a password reset for one account. */
export async function createInvite(sql: Sql, b: Record<string, unknown>, createdBy: string | null) {
  const purpose = str(b.purpose) || "register";
  if (purpose !== "register" && purpose !== "reset") throw new ApiError("purpose must be register or reset");
  const label = str(b.label).slice(0, 80) || null;
  const isAdmin = purpose === "register" && flag(b.isAdmin);
  let accountId: string | null = null;
  if (purpose === "reset") {
    accountId = uuid(b.accountId, "The account that needs a reset code is");
    const found = await sql`select 1 from stomper.accounts where id = ${accountId}::uuid`;
    if (!found.length) throw new ApiError("Account not found", 404);
  }
  const code = randomCode(8);
  const hours = purpose === "reset" ? RESET_HOURS : INVITE_DAYS * 24;
  const [row] = await sql`
    insert into stomper.invites (purpose, code_hash, label, is_admin, account_id, created_by, expires_at)
    values (${purpose}, ${await sha256Hex(code)}, ${label}, ${isAdmin}, ${accountId}, ${createdBy},
            now() + make_interval(hours => ${hours}))
    returning id, expires_at`;
  return { code, id: row.id, purpose, label, isAdmin, expiresAt: row.expires_at };
}

// ---------------------------------------------------------------- admin actions
export async function issueInvite(sql: Sql, b: Record<string, unknown>) {
  const admin = await requireAdmin(sql, b.token);
  return await createInvite(sql, b, admin.accountId);
}

export async function listInvites(sql: Sql, b: Record<string, unknown>) {
  await requireAdmin(sql, b.token);
  const rows = await sql`
    select i.id, i.purpose, i.label, i.is_admin, i.expires_at, i.created_at, a.handle
    from stomper.invites i left join stomper.accounts a on a.id = i.account_id
    where i.used_at is null and i.expires_at > now()
    order by i.created_at desc`;
  return {
    invites: rows.map((r: Record<string, unknown>) => ({
      id: r.id, purpose: r.purpose, label: r.label, isAdmin: flag(r.is_admin),
      expiresAt: r.expires_at, createdAt: r.created_at, handle: r.handle,
    })),
  };
}

export async function revokeInvite(sql: Sql, b: Record<string, unknown>) {
  await requireAdmin(sql, b.token);
  const rows = await sql`
    update stomper.invites set used_at = now() where id = ${uuid(b.inviteId, "inviteId")}::uuid and used_at is null returning id`;
  if (!rows.length) throw new ApiError("Invite not found", 404);
  return { ok: true };
}

export async function listAccounts(sql: Sql, b: Record<string, unknown>) {
  await requireAdmin(sql, b.token);
  const rows = await sql`
    select id, handle, is_admin, disabled_at, created_at, last_seen_at from stomper.accounts order by handle`;
  return {
    accounts: rows.map((r: Record<string, unknown>) => ({
      id: r.id, handle: r.handle, isAdmin: flag(r.is_admin), disabled: r.disabled_at != null,
      createdAt: r.created_at, lastSeenAt: r.last_seen_at,
    })),
  };
}

/** Change another account between regular user and admin. Admins can't change their own type,
 *  so there is always at least one admin left. */
export async function setAccountType(sql: Sql, b: Record<string, unknown>) {
  const admin = await requireAdmin(sql, b.token);
  const accountId = uuid(b.accountId, "accountId");
  if (accountId === admin.accountId) throw new ApiError("You can't change your own account type.");
  const isAdmin = flag(b.isAdmin);
  const rows = await sql`
    update stomper.accounts set is_admin = ${isAdmin}, updated_at = now()
    where id = ${accountId}::uuid returning id, handle, is_admin`;
  if (!rows.length) throw new ApiError("Account not found", 404);
  return { ok: true, account: publicAccount(rows[0]) };
}
