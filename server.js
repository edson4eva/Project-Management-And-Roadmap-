// Platforms Branch Project & Roadmap App - application server.
//
// This exists so the app can do the two things a browser alone cannot: share a
// portfolio between people with real permissions, and tell them when something
// changed. Everything else still lives in the client.
//
// Design notes worth knowing before changing anything here:
// - Portfolio records are stored per workspace as one JSON document per kind,
//   matching the shapes the client already uses. The server does not interpret
//   them, so it can never invent portfolio content.
// - Permissions are checked on the server for every request. A viewer is
//   refused a write even if the client would have allowed it.
// - A share link is a capability: it carries a role and an optional filter
//   scope, and it can be revoked or expired. It never grants more than viewer
//   or editor, and never member management.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, query, withTransaction, membershipFor, atLeast, RECORD_KINDS, ROLES } from "./db.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(HERE, "public");
const PORT = Number(process.env.PORT || 8080);
const SESSION_DAYS = 30;
const SESSION_COOKIE = "pbsession";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// node-postgres maps a JS array onto a Postgres array literal, which a jsonb
// column refuses. Every jsonb parameter goes through here instead.
function jsonParam(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived.toString("hex"));
    });
  });
}

async function passwordMatches(password, salt, expected) {
  const actual = await hashPassword(password, salt);
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function token() {
  return randomBytes(24).toString("base64url");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function displayNameFromEmail(email) {
  const local = normalizeEmail(email).split("@")[0] || "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(" ") || "Colleague";
}

function readCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(header.split(";").map(part => {
    const index = part.indexOf("=");
    if (index === -1) return [part.trim(), ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function send(response, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": typeof body === "string" || Buffer.isBuffer(body) ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(payload);
}

function fail(response, status, message) {
  send(response, status, { error: message });
}

async function readJsonBody(request, limit = 4_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!chunks.length) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Body is not valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Sessions and identity
// ---------------------------------------------------------------------------

async function currentUser(request) {
  const sessionToken = readCookies(request)[SESSION_COOKIE];
  if (!sessionToken) return null;
  const { rows } = await query(
    `SELECT u.id, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [sessionToken]
  );
  return rows[0] || null;
}

async function startSession(response, userId) {
  const sessionToken = token();
  await query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [sessionToken, userId, String(SESSION_DAYS)]
  );
  response.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}; Secure`
  ]);
  return sessionToken;
}

// ---------------------------------------------------------------------------
// Live updates. Each open stream belongs to one workspace; a change writes an
// event row and then pushes it to whoever is listening.
// ---------------------------------------------------------------------------

const streams = new Map(); // workspaceId -> Set of { response, userId, name }

function addStream(workspaceId, entry) {
  if (!streams.has(workspaceId)) streams.set(workspaceId, new Set());
  streams.get(workspaceId).add(entry);
}

function removeStream(workspaceId, entry) {
  const set = streams.get(workspaceId);
  if (!set) return;
  set.delete(entry);
  if (!set.size) streams.delete(workspaceId);
}

function pushToStreams(workspaceId, payload, exceptToken) {
  const set = streams.get(workspaceId);
  if (!set) return 0;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  let delivered = 0;
  for (const entry of set) {
    if (exceptToken && entry.clientToken === exceptToken) continue;
    try {
      entry.response.write(frame);
      delivered += 1;
    } catch {
      removeStream(workspaceId, entry);
    }
  }
  return delivered;
}

function viewersOf(workspaceId) {
  const set = streams.get(workspaceId);
  if (!set) return [];
  const seen = new Map();
  for (const entry of set) {
    if (entry.userId && !seen.has(entry.userId)) seen.set(entry.userId, entry.name);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

async function recordEvent(workspaceId, actor, kind, summary, payload = {}, options = {}) {
  const { rows } = await query(
    `INSERT INTO events (workspace_id, actor_id, actor_name, kind, summary, payload)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    [workspaceId, actor?.id || null, actor?.name || "A shared link", kind, summary, jsonParam(payload)]
  );
  const event = rows[0];
  // Everyone in the workspace except the person who did it gets told.
  await query(
    `INSERT INTO notifications (workspace_id, user_id, event_id)
     SELECT $1, user_id, $2 FROM members WHERE workspace_id = $1 AND ($3::int IS NULL OR user_id <> $3)`,
    [workspaceId, event.id, actor?.id || null]
  );
  pushToStreams(workspaceId, {
    type: "event",
    id: Number(event.id),
    kind,
    summary,
    actor: actor?.name || "A shared link",
    actorId: actor?.id || null,
    payload,
    at: event.created_at
  }, options.exceptToken);
  return event;
}

// ---------------------------------------------------------------------------
// Workspace access. Either a signed-in member, or a share-link capability.
// ---------------------------------------------------------------------------

async function accessFor(request, workspaceId) {
  const user = await currentUser(request);
  if (user) {
    const role = await membershipFor(workspaceId, user.id);
    if (role) return { user, role, viaShare: null };
  }
  const shareToken = request.headers["x-share-token"];
  if (shareToken) {
    const { rows } = await query(
      `SELECT * FROM share_links
        WHERE token = $1 AND workspace_id = $2 AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())`,
      [shareToken, workspaceId]
    );
    if (rows[0]) return { user: user || null, role: rows[0].role, viaShare: rows[0] };
  }
  return { user, role: null, viaShare: null };
}

async function snapshotFor(workspaceId) {
  const [records, workspace, members, links, events] = await Promise.all([
    query(`SELECT kind, data, version, updated_at FROM records WHERE workspace_id = $1`, [workspaceId]),
    query(`SELECT id, name, created_at FROM workspaces WHERE id = $1`, [workspaceId]),
    query(
      `SELECT m.user_id AS id, u.name, u.email, m.role
         FROM members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1 ORDER BY m.role, u.name`,
      [workspaceId]
    ),
    query(
      `SELECT token, role, label, scope, created_at, expires_at
         FROM share_links WHERE workspace_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [workspaceId]
    ),
    query(
      `SELECT id, actor_name, kind, summary, created_at FROM events
        WHERE workspace_id = $1 ORDER BY id DESC LIMIT 40`,
      [workspaceId]
    )
  ]);
  const data = {};
  const versions = {};
  records.rows.forEach(row => {
    data[row.kind] = row.data;
    versions[row.kind] = row.version;
  });
  return {
    workspace: workspace.rows[0] || null,
    records: data,
    versions,
    members: members.rows,
    shareLinks: links.rows,
    events: events.rows.map(row => ({ ...row, id: Number(row.id) })),
    viewers: viewersOf(workspaceId)
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [];

function route(method, pattern, handler, options = {}) {
  routes.push({ method, pattern, handler, options });
}

route("POST", /^\/api\/auth\/register$/, async (request, response) => {
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email.includes("@")) return fail(response, 400, "Enter a valid email address.");
  if (password.length < 8) return fail(response, 400, "Use a password of at least 8 characters.");
  const existing = await query(`SELECT id FROM users WHERE lower(email) = $1`, [email]);
  if (existing.rows.length) return fail(response, 409, "An account already exists for that email address.");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, salt);
  const name = String(body.name || "").trim() || displayNameFromEmail(email);
  const created = await withTransaction(async client => {
    const user = await client.query(
      `INSERT INTO users (email, name, password_hash, password_salt) VALUES ($1, $2, $3, $4) RETURNING id, email, name`,
      [email, name, passwordHash, salt]
    );
    const workspace = await client.query(
      `INSERT INTO workspaces (name, created_by) VALUES ($1, $2) RETURNING id, name`,
      [String(body.workspaceName || "").trim() || `${name}'s portfolio`, user.rows[0].id]
    );
    await client.query(
      `INSERT INTO members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspace.rows[0].id, user.rows[0].id]
    );
    return { user: user.rows[0], workspace: workspace.rows[0] };
  });
  await startSession(response, created.user.id);
  send(response, 201, { user: created.user, workspace: { ...created.workspace, role: "owner" } });
});

route("POST", /^\/api\/auth\/login$/, async (request, response) => {
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const { rows } = await query(
    `SELECT id, email, name, password_hash, password_salt FROM users WHERE lower(email) = $1`,
    [email]
  );
  const user = rows[0];
  // The same answer either way, so the response cannot be used to learn which
  // email addresses have accounts.
  if (!user || !(await passwordMatches(String(body.password || ""), user.password_salt, user.password_hash))) {
    return fail(response, 401, "That email address and password do not match an account.");
  }
  await startSession(response, user.id);
  send(response, 200, { user: { id: user.id, email: user.email, name: user.name } });
});

route("POST", /^\/api\/auth\/logout$/, async (request, response) => {
  const sessionToken = readCookies(request)[SESSION_COOKIE];
  if (sessionToken) await query(`DELETE FROM sessions WHERE token = $1`, [sessionToken]);
  response.setHeader("Set-Cookie", [`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`]);
  send(response, 200, { ok: true });
});

route("GET", /^\/api\/me$/, async (request, response) => {
  const user = await currentUser(request);
  if (!user) return send(response, 200, { user: null, workspaces: [] });
  const { rows } = await query(
    `SELECT w.id, w.name, m.role,
            (SELECT count(*) FROM members m2 WHERE m2.workspace_id = w.id) AS member_count
       FROM members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 ORDER BY w.id`,
    [user.id]
  );
  const unread = await query(
    `SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [user.id]
  );
  send(response, 200, {
    user,
    workspaces: rows.map(row => ({ ...row, member_count: Number(row.member_count) })),
    unread: unread.rows[0].count
  });
});

route("POST", /^\/api\/workspaces$/, async (request, response) => {
  const user = await currentUser(request);
  if (!user) return fail(response, 401, "Sign in first.");
  const body = await readJsonBody(request);
  const name = String(body.name || "").trim();
  if (!name) return fail(response, 400, "Name the workspace.");
  const created = await withTransaction(async client => {
    const workspace = await client.query(
      `INSERT INTO workspaces (name, created_by) VALUES ($1, $2) RETURNING id, name`,
      [name, user.id]
    );
    await client.query(
      `INSERT INTO members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspace.rows[0].id, user.id]
    );
    return workspace.rows[0];
  });
  send(response, 201, { workspace: { ...created, role: "owner" } });
});

route("GET", /^\/api\/workspaces\/(\d+)\/snapshot$/, async (request, response, [workspaceId]) => {
  const access = await accessFor(request, Number(workspaceId));
  if (!access.role) return fail(response, 403, "You do not have access to that workspace.");
  const snapshot = await snapshotFor(Number(workspaceId));
  send(response, 200, {
    ...snapshot,
    // A share link never sees who else has access, and only ever its own scope.
    members: access.viaShare ? [] : snapshot.members,
    shareLinks: access.viaShare ? [] : snapshot.shareLinks,
    role: access.role,
    viaShare: access.viaShare
      ? { label: access.viaShare.label, role: access.viaShare.role, scope: access.viaShare.scope }
      : null,
    user: access.user ? { id: access.user.id, name: access.user.name, email: access.user.email } : null
  });
});

route("PUT", /^\/api\/workspaces\/(\d+)\/records\/([a-z]+)$/, async (request, response, [workspaceId, kind]) => {
  if (!RECORD_KINDS.includes(kind)) return fail(response, 400, "Unknown record kind.");
  const access = await accessFor(request, Number(workspaceId));
  if (!access.role) return fail(response, 403, "You do not have access to that workspace.");
  if (!atLeast(access.role, "editor")) return fail(response, 403, "Your role is view only, so this change was not saved.");
  const body = await readJsonBody(request);
  if (body.data === undefined) return fail(response, 400, "Nothing to save.");
  // A stale writer is told rather than silently overwriting a colleague.
  const existing = await query(`SELECT version FROM records WHERE workspace_id = $1 AND kind = $2`, [Number(workspaceId), kind]);
  const currentVersion = existing.rows[0]?.version || 0;
  if (body.baseVersion !== undefined && Number(body.baseVersion) !== currentVersion) {
    const fresh = await query(`SELECT data, version FROM records WHERE workspace_id = $1 AND kind = $2`, [Number(workspaceId), kind]);
    return send(response, 409, {
      error: "Someone else changed this while you were editing.",
      current: fresh.rows[0]?.data ?? null,
      version: currentVersion
    });
  }
  const saved = await query(
    `INSERT INTO records (workspace_id, kind, data, version, updated_by)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (workspace_id, kind)
     DO UPDATE SET data = $3, version = records.version + 1, updated_at = now(), updated_by = $4
     RETURNING version`,
    [Number(workspaceId), kind, jsonParam(body.data), access.user?.id || null]
  );
  const version = saved.rows[0].version;
  const actor = access.user || { id: null, name: access.viaShare ? `${access.viaShare.label || "A shared link"} (link)` : "A shared link" };
  pushToStreams(Number(workspaceId), { type: "records", kind, data: body.data, version, actor: actor.name }, request.headers["x-client-token"]);
  if (body.summary) {
    await recordEvent(Number(workspaceId), actor, kind, String(body.summary).slice(0, 200), body.detail || {}, { exceptToken: request.headers["x-client-token"] });
  }
  send(response, 200, { version });
});

route("GET", /^\/api\/workspaces\/(\d+)\/events$/, async (request, response, [workspaceId], url) => {
  const access = await accessFor(request, Number(workspaceId));
  if (!access.role) return fail(response, 403, "You do not have access to that workspace.");
  const since = Number(url.searchParams.get("since") || 0);
  const { rows } = await query(
    `SELECT id, actor_name, kind, summary, payload, created_at FROM events
      WHERE workspace_id = $1 AND id > $2 ORDER BY id DESC LIMIT 100`,
    [Number(workspaceId), since]
  );
  send(response, 200, { events: rows.map(row => ({ ...row, id: Number(row.id) })) });
});

route("GET", /^\/api\/workspaces\/(\d+)\/stream$/, async (request, response, [workspaceId], url) => {
  const access = await accessFor(request, Number(workspaceId));
  if (!access.role) return fail(response, 403, "You do not have access to that workspace.");
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.write(`retry: 4000\n\n`);
  const entry = {
    response,
    userId: access.user?.id || null,
    name: access.user?.name || "A shared link",
    clientToken: url.searchParams.get("client") || ""
  };
  addStream(Number(workspaceId), entry);
  pushToStreams(Number(workspaceId), { type: "presence", viewers: viewersOf(Number(workspaceId)) });
  const heartbeat = setInterval(() => {
    try { response.write(`: keep-alive\n\n`); } catch { /* the close handler tidies up */ }
  }, 25000);
  request.on("close", () => {
    clearInterval(heartbeat);
    removeStream(Number(workspaceId), entry);
    pushToStreams(Number(workspaceId), { type: "presence", viewers: viewersOf(Number(workspaceId)) });
  });
});

route("POST", /^\/api\/workspaces\/(\d+)\/members$/, async (request, response, [workspaceId]) => {
  const access = await accessFor(request, Number(workspaceId));
  if (!atLeast(access.role, "owner") || access.viaShare) return fail(response, 403, "Only an owner can change who has access.");
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const role = ROLES.includes(body.role) ? body.role : "viewer";
  const { rows } = await query(`SELECT id, name, email FROM users WHERE lower(email) = $1`, [email]);
  if (!rows[0]) return fail(response, 404, "No one with that email address has an account yet. They can create one, then be added.");
  await query(
    `INSERT INTO members (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3`,
    [Number(workspaceId), rows[0].id, role]
  );
  await recordEvent(Number(workspaceId), access.user, "members", `${access.user.name} gave ${rows[0].name} ${role} access`);
  send(response, 200, { member: { ...rows[0], role } });
});

route("DELETE", /^\/api\/workspaces\/(\d+)\/members\/(\d+)$/, async (request, response, [workspaceId, userId]) => {
  const access = await accessFor(request, Number(workspaceId));
  if (!atLeast(access.role, "owner") || access.viaShare) return fail(response, 403, "Only an owner can change who has access.");
  const owners = await query(`SELECT count(*)::int AS count FROM members WHERE workspace_id = $1 AND role = 'owner'`, [Number(workspaceId)]);
  const target = await query(`SELECT role FROM members WHERE workspace_id = $1 AND user_id = $2`, [Number(workspaceId), Number(userId)]);
  if (!target.rows[0]) return fail(response, 404, "That person does not have access.");
  if (target.rows[0].role === "owner" && owners.rows[0].count <= 1) {
    return fail(response, 400, "A workspace needs at least one owner, so this one cannot be removed.");
  }
  const removed = await query(
    `DELETE FROM members WHERE workspace_id = $1 AND user_id = $2 RETURNING user_id`,
    [Number(workspaceId), Number(userId)]
  );
  if (removed.rows.length) await recordEvent(Number(workspaceId), access.user, "members", `${access.user.name} removed someone's access`);
  send(response, 200, { ok: true });
});

route("POST", /^\/api\/workspaces\/(\d+)\/share$/, async (request, response, [workspaceId]) => {
  const access = await accessFor(request, Number(workspaceId));
  if (!atLeast(access.role, "owner") || access.viaShare) return fail(response, 403, "Only an owner can create a share link.");
  const body = await readJsonBody(request);
  const role = body.role === "editor" ? "editor" : "viewer";
  const days = Number(body.expiresInDays);
  const shareToken = token();
  const { rows } = await query(
    `INSERT INTO share_links (token, workspace_id, role, label, scope, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::int IS NULL THEN NULL ELSE now() + ($7 || ' days')::interval END)
     RETURNING token, role, label, scope, created_at, expires_at`,
    [shareToken, Number(workspaceId), role, String(body.label || "").trim().slice(0, 60), jsonParam(body.scope || {}), access.user.id,
      Number.isFinite(days) && days > 0 ? String(Math.min(365, Math.round(days))) : null]
  );
  await recordEvent(Number(workspaceId), access.user, "share", `${access.user.name} created a ${role} share link`);
  send(response, 201, { link: rows[0] });
});

route("DELETE", /^\/api\/workspaces\/(\d+)\/share\/([A-Za-z0-9_-]+)$/, async (request, response, [workspaceId, shareToken]) => {
  const access = await accessFor(request, Number(workspaceId));
  if (!atLeast(access.role, "owner") || access.viaShare) return fail(response, 403, "Only an owner can revoke a share link.");
  const { rows } = await query(
    `UPDATE share_links SET revoked_at = now() WHERE token = $1 AND workspace_id = $2 AND revoked_at IS NULL RETURNING token`,
    [shareToken, Number(workspaceId)]
  );
  if (rows.length) await recordEvent(Number(workspaceId), access.user, "share", `${access.user.name} revoked a share link`);
  send(response, 200, { ok: Boolean(rows.length) });
});

// Resolving a link is how an invited person finds out which workspace it opens.
route("GET", /^\/api\/share\/([A-Za-z0-9_-]+)$/, async (request, response, [shareToken]) => {
  const { rows } = await query(
    `SELECT s.token, s.workspace_id, s.role, s.label, s.scope, s.expires_at, w.name AS workspace_name
       FROM share_links s JOIN workspaces w ON w.id = s.workspace_id
      WHERE s.token = $1 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [shareToken]
  );
  if (!rows[0]) return fail(response, 404, "That link has been revoked or has expired.");
  send(response, 200, { link: rows[0] });
});

route("GET", /^\/api\/notifications$/, async (request, response) => {
  const user = await currentUser(request);
  if (!user) return fail(response, 401, "Sign in first.");
  const { rows } = await query(
    `SELECT n.id, n.workspace_id, n.read_at, e.actor_name, e.kind, e.summary, e.created_at, w.name AS workspace_name
       FROM notifications n
       JOIN events e ON e.id = n.event_id
       JOIN workspaces w ON w.id = n.workspace_id
      WHERE n.user_id = $1 ORDER BY n.id DESC LIMIT 60`,
    [user.id]
  );
  send(response, 200, { notifications: rows.map(row => ({ ...row, id: Number(row.id) })) });
});

route("POST", /^\/api\/notifications\/read$/, async (request, response) => {
  const user = await currentUser(request);
  if (!user) return fail(response, 401, "Sign in first.");
  await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [user.id]);
  send(response, 200, { ok: true });
});

route("GET", /^\/api\/health$/, async (request, response) => {
  try {
    await query("SELECT 1");
    send(response, 200, { ok: true, database: "reachable" });
  } catch (error) {
    send(response, 503, { ok: false, database: "unreachable", detail: error.message });
  }
});

// ---------------------------------------------------------------------------
// Static files. index.html carries a build stamp so a redeploy is visible and
// cannot be served from a stale cache.
// ---------------------------------------------------------------------------

let indexCache = null;

async function buildStamp() {
  const [app, styles] = await Promise.all([
    readFile(join(PUBLIC_DIR, "app.js")),
    readFile(join(PUBLIC_DIR, "styles.css"))
  ]);
  return createHash("md5").update(app).update(styles).digest("hex").slice(0, 8);
}

async function serveIndex(response) {
  if (!indexCache) {
    const [html, stamp] = await Promise.all([readFile(join(PUBLIC_DIR, "index.html"), "utf8"), buildStamp()]);
    indexCache = html.replaceAll("__BUILD__", stamp);
  }
  response.writeHead(200, {
    "Content-Type": MIME[".html"],
    "Cache-Control": "no-cache, must-revalidate"
  });
  response.end(indexCache);
}

async function serveStatic(pathname, response) {
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^\/+/, "");
  const target = join(PUBLIC_DIR, relative);
  if (!target.startsWith(PUBLIC_DIR)) return fail(response, 403, "Not allowed.");
  try {
    const info = await stat(target);
    if (info.isDirectory()) return serveIndex(response);
    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": MIME[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-cache, must-revalidate"
    });
    response.end(body);
  } catch {
    // Unknown paths fall through to the app, so a shared link still opens it.
    return serveIndex(response);
  }
}

// ---------------------------------------------------------------------------
// Request dispatch
// ---------------------------------------------------------------------------

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    for (const entry of routes) {
      if (entry.method !== request.method) continue;
      const match = entry.pattern.exec(url.pathname);
      if (!match) continue;
      return await entry.handler(request, response, match.slice(1), url);
    }
    if (url.pathname.startsWith("/api/")) return fail(response, 404, "No such endpoint.");
    if (url.pathname === "/" || url.pathname === "/index.html") return serveIndex(response);
    return await serveStatic(url.pathname, response);
  } catch (error) {
    console.error(`${request.method} ${url.pathname} failed:`, error.message);
    if (!response.headersSent) fail(response, 500, "The server could not complete that request.");
    else response.end();
  }
});

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Deploy with `publish-app pm-roadmap --database`.");
    process.exit(1);
  }
  await migrate();
  server.listen(PORT, "0.0.0.0", () => console.log(`Listening on ${PORT}`));
}

if (process.env.PB_SERVER_IMPORT !== "1") start();

export { server, start };
