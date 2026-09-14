// Schema and query helpers. One table holds each kind of portfolio record as
// JSON, so the documents the client already works with are stored as they are,
// while the tables around it carry what a shared app needs and a browser cannot
// provide: who someone is, what they are allowed to do, and what changed.
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 8),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export const ROLES = ["owner", "editor", "viewer"];
export const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };
export const RECORD_KINDS = [
  "projects", "teams", "strategy", "ideas", "feedback", "releases",
  "specs", "notes", "history", "fields", "views", "settings"
];

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(run) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email))`);
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role         TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
      added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id)
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS records (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL,
      data         JSONB NOT NULL,
      version      INTEGER NOT NULL DEFAULT 1,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (workspace_id, kind)
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS share_links (
      token        TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      role         TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
      label        TEXT NOT NULL DEFAULT '',
      scope        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id           BIGSERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name   TEXT NOT NULL DEFAULT '',
      kind         TEXT NOT NULL,
      summary      TEXT NOT NULL,
      payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS events_workspace_id_idx ON events (workspace_id, id DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id           BIGSERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id     BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      read_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at)`);
}

export async function membershipFor(workspaceId, userId) {
  if (!userId) return null;
  const { rows } = await query(
    `SELECT role FROM members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, Number(userId)]
  );
  return rows[0] ? rows[0].role : null;
}

export function atLeast(role, required) {
  return Boolean(role) && ROLE_RANK[role] >= ROLE_RANK[required];
}
