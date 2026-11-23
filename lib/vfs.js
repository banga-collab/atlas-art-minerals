/* Atlas Art Minerals — "GitHub as a disk" for serverless hosting (Vercel).
   Vercel functions cannot keep files. When GH_TOKEN is set, this module makes the files the admin writes live in GitHub:
   - public content (pages, products, photos, translations…) -> PUBLIC_REPO (the site's own repository);
   - private data (accounts, quote requests, subscribers, statistics, backups…) -> PRIVATE_REPO (a private repository).
   It patches Node's fs for those paths only, so server.js keeps its simple synchronous code:
   - before each request the latest state of both repositories is loaded in memory (text files) — refresh();
   - writes are kept in memory and committed in ONE commit per repository when the request ends — flush();
   - photos are not loaded in memory: they are served from the deployment, or from raw.githubusercontent.com when just uploaded.
   Code files (server.js, admin/*.js, gallery.css…) are always read from the deployment bundle. */
"use strict";
const fs = require("fs"), path = require("path"), { Readable } = require("stream");

const TOKEN = process.env.GH_TOKEN || "";
const BRANCH = process.env.GH_BRANCH || "main";
const PUBLIC_REPO = process.env.PUBLIC_REPO || "";      // "owner/name"
const PRIVATE_REPO = process.env.PRIVATE_REPO || "";    // "owner/name"
const API = process.env.GH_API || "https://api.github.com";
const RAW = process.env.GH_RAW || "https://raw.githubusercontent.com";
let ROOT = "";
const enabled = !!(TOKEN && PUBLIC_REPO && PRIVATE_REPO);

const PUBLIC_DATA = new Set(["data/catalog.json", "data/site.json", "data/journal.json", "data/i18n.json", "data/menu.json", "data/redirects.json"]);
const WRITABLE = /^(data\/.+|[^/]+\.html|assets\/(products|uploads|photos)\/.+|assets\/js\/(products|settings|i18n|journal)\.js|assets\/css\/custom\.css)$/;
const WRITABLE_DIRS = /^(data|data\/backups|data\/backups\/auto|assets\/(products|uploads|photos))$/;
const TEXT = /\.(json|html|js|css|txt|key|csv|md|svg)$/i;
const repoOf = rel => (rel.startsWith("data/") && !PUBLIC_DATA.has(rel)) ? "priv" : "pub";
const R = { pub: { name: PUBLIC_REPO }, priv: { name: PRIVATE_REPO } };
for (const k in R) Object.assign(R[k], { head: "", etag: "", tree: new Map(), text: new Map(), pending: new Map(), checked: 0, raw: new Map() });

async function gh(method, url, body, extra) {
  const r = await fetch(API + url, { method, headers: Object.assign({ Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "atlas-art-admin" }, body ? { "Content-Type": "application/json" } : {}, extra || {}), body: body ? JSON.stringify(body) : undefined });
  if (r.status === 304) return { status: 304 };
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* not json */ }
  if (!r.ok) { const e = new Error("GitHub " + method + " " + url.split("?")[0] + " -> " + r.status + " " + ((j && j.message) || txt.slice(0, 120))); e.status = r.status; throw e; }
  return { status: r.status, json: j, etag: r.headers.get("etag") || "" };
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }

/* -------- load the latest commit of a repository (only what changed) -------- */
async function load(key, force) {
  const S = R[key];
  if (!force && Date.now() - S.checked < 2000) return;
  const ref = await gh("GET", "/repos/" + S.name + "/git/ref/heads/" + BRANCH, null, S.etag && !force ? { "If-None-Match": S.etag } : {});
  S.checked = Date.now();
  if (ref.status === 304) return;
  S.etag = ref.etag;
  const head = ref.json.object.sha; if (head === S.head && !force) return;
  const commit = await gh("GET", "/repos/" + S.name + "/git/commits/" + head);
  const tree = await gh("GET", "/repos/" + S.name + "/git/trees/" + commit.json.tree.sha + "?recursive=1");
  const next = new Map(); tree.json.tree.forEach(e => { if (e.type === "blob") next.set(e.path, { sha: e.sha, size: e.size }); });
  const want = [...next.keys()].filter(p => WRITABLE.test(p) && TEXT.test(p) && repoOf(p) === key && (!S.tree.get(p) || S.tree.get(p).sha !== next.get(p).sha || !S.text.has(p)));
  const got = await pool(want, 8, async p => { const b = await gh("GET", "/repos/" + S.name + "/git/blobs/" + next.get(p).sha); return Buffer.from(b.json.content, "base64"); });
  want.forEach((p, i) => S.text.set(p, got[i]));
  for (const p of [...S.text.keys()]) if (!next.has(p)) S.text.delete(p);
  S.tree = next; S.head = head;
}
async function refresh(force) { if (!enabled) return; await Promise.all([load("pub", force), load("priv", force)]); }

/* -------- commit everything written during the request -------- */
let flushing = Promise.resolve();
function hasPending() { return R.pub.pending.size + R.priv.pending.size > 0; }
async function commitRepo(key, message) {
  const S = R[key]; if (!S.pending.size) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const changes = [...S.pending.entries()];
    const entries = await pool(changes, 6, async ([p, buf]) => {
      if (buf === null) return S.tree.has(p) ? { path: p, mode: "100644", type: "blob", sha: null } : null;
      const b = await gh("POST", "/repos/" + S.name + "/git/blobs", { content: buf.toString("base64"), encoding: "base64" });
      return { path: p, mode: "100644", type: "blob", sha: b.json.sha };
    });
    const list = entries.filter(Boolean);
    if (!list.length) { S.pending.clear(); return; }
    const base = await gh("GET", "/repos/" + S.name + "/git/commits/" + S.head);
    const tree = await gh("POST", "/repos/" + S.name + "/git/trees", { base_tree: base.json.tree.sha, tree: list });
    const commit = await gh("POST", "/repos/" + S.name + "/git/commits", { message, tree: tree.json.sha, parents: [S.head] });
    try {
      await gh("PATCH", "/repos/" + S.name + "/git/refs/heads/" + BRANCH, { sha: commit.json.sha, force: false });
    } catch (e) {
      if (e.status !== 422 && e.status !== 409) throw e;
      // someone else committed meanwhile: reload and replay our changes on top
      const mine = new Map(S.pending); await load(key, true); S.pending = mine; continue;
    }
    changes.forEach(([p, buf]) => {
      if (S.pending.get(p) === buf) S.pending.delete(p);
      if (buf === null) { S.tree.delete(p); S.text.delete(p); S.raw.delete(p); }
      else { S.tree.set(p, { sha: "local", size: buf.length }); if (TEXT.test(p)) S.text.set(p, buf); else { S.raw.set(p, buf); if (S.raw.size > 40) S.raw.delete(S.raw.keys().next().value); } }
    });
    S.head = commit.json.sha; S.etag = ""; S.checked = Date.now();
    return commit.json.sha;
  }
  throw new Error("Enregistrement impossible : conflit répété avec GitHub, réessayez.");
}
function flush(label) {
  if (!enabled || !hasPending()) return flushing;
  const msg = (label || "Modification depuis l'admin");
  flushing = flushing.catch(() => {}).then(async () => {
    await commitRepo("priv", msg);
    // public content is served fresh by the function, a new deployment is only needed for photos: skip it
    await commitRepo("pub", msg + " [skip-deploy]");
  });
  return flushing;
}
/* empty commit without the skip tag: makes Vercel redeploy (photos become static files) */
async function deployNow() {
  const S = R.pub; await load("pub", true);
  const base = await gh("GET", "/repos/" + S.name + "/git/commits/" + S.head);
  const c = await gh("POST", "/repos/" + S.name + "/git/commits", { message: "Publication du site", tree: base.json.tree.sha, parents: [S.head] });
  await gh("PATCH", "/repos/" + S.name + "/git/refs/heads/" + BRANCH, { sha: c.json.sha, force: false });
  S.head = c.json.sha; S.etag = "";
  return c.json.sha;
}

/* -------- fs patch -------- */
function relOf(p) {
  if (typeof p !== "string" && !(p instanceof URL)) return null;
  const abs = path.resolve(String(p)); if (!abs.startsWith(ROOT + path.sep)) return null;
  return abs.slice(ROOT.length + 1).split(path.sep).join("/");
}
const real = {};
function lookup(rel) {
  const S = R[repoOf(rel)];
  if (S.pending.has(rel)) { const b = S.pending.get(rel); return b === null ? { gone: true } : { buf: b }; }
  if (S.text.has(rel)) return { buf: S.text.get(rel) };
  if (S.raw.has(rel)) return { buf: S.raw.get(rel) };
  if (S.tree.has(rel)) return { remote: S.tree.get(rel), repo: S };
  return null;
}
function enoent(p) { const e = new Error("ENOENT: no such file or directory, '" + p + "'"); e.code = "ENOENT"; return e; }
function children(relDir) {
  const pre = relDir ? relDir + "/" : "", names = new Map();
  for (const key of ["pub", "priv"]) {
    const S = R[key];
    const add = (p, gone) => { if (!p.startsWith(pre)) return; const rest = p.slice(pre.length); const i = rest.indexOf("/"); const n = i < 0 ? rest : rest.slice(0, i); if (!n) return; if (i >= 0) names.set(n, "dir"); else if (gone) { if (names.get(n) === "file") names.delete(n); } else names.set(n, "file"); };
    for (const p of S.tree.keys()) add(p, false);
    for (const [p, b] of S.pending) add(p, b === null);
  }
  return names;
}
function mkStat(size, dir) { const t = new Date(); return { size, isFile: () => !dir, isDirectory: () => !!dir, mtime: t, mtimeMs: +t, ctime: t, birthtime: t }; }
function statRel(rel) {
  if (WRITABLE_DIRS.test(rel)) return mkStat(0, true);
  const f = lookup(rel);
  if (f && !f.gone) return mkStat(f.buf ? f.buf.length : f.remote.size || 0, false);
  if (children(rel).size) return mkStat(0, true);
  return null;
}
function install(root) {
  if (!enabled || real.readFileSync) return;
  ROOT = path.resolve(root);
  ["readFileSync", "writeFileSync", "existsSync", "statSync", "readdirSync", "unlinkSync", "copyFileSync", "renameSync", "mkdirSync", "appendFileSync", "stat", "createReadStream"].forEach(k => { real[k] = fs[k]; });
  const mine = p => { const r = relOf(p); return r && (WRITABLE.test(r) || WRITABLE_DIRS.test(r)) ? r : null; };
  fs.readFileSync = function (p, opt) {
    const rel = mine(p); if (!rel) return real.readFileSync.apply(fs, arguments);
    const f = lookup(rel);
    if (!f || f.gone) { if (!f && real.existsSync(p) && !WRITABLE_DIRS.test(rel)) return real.readFileSync.apply(fs, arguments); throw enoent(p); }
    if (f.remote) { if (real.existsSync(p)) return real.readFileSync.apply(fs, arguments); const e = new Error("Fichier distant non chargé : " + rel); e.code = "EREMOTE"; throw e; }
    const enc = typeof opt === "string" ? opt : opt && opt.encoding;
    return enc ? f.buf.toString(enc) : Buffer.from(f.buf);
  };
  fs.writeFileSync = function (p, data, opt) {
    const rel = mine(p); if (!rel) return real.writeFileSync.apply(fs, arguments);
    const enc = typeof opt === "string" ? opt : (opt && opt.encoding) || "utf8";
    const buf = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(String(data), enc);
    const cur = lookup(rel); if (cur && cur.buf && cur.buf.equals(buf)) return;
    R[repoOf(rel)].pending.set(rel, buf);
  };
  fs.appendFileSync = function (p, data) {
    const rel = mine(p); if (!rel) return real.appendFileSync.apply(fs, arguments);
    let cur = ""; try { cur = fs.readFileSync(p, "utf8"); } catch (e) { /* new file */ }
    fs.writeFileSync(p, cur + String(data));
  };
  fs.existsSync = function (p) {
    const rel = mine(p); if (!rel) return real.existsSync.apply(fs, arguments);
    if (statRel(rel)) return true;
    const f = lookup(rel); if (f && f.gone) return false;
    return false;
  };
  fs.statSync = function (p, opt) {
    const rel = mine(p); if (!rel) return real.statSync.apply(fs, arguments);
    const st = statRel(rel); if (!st) { if (opt && opt.throwIfNoEntry === false) return undefined; throw enoent(p); } return st;
  };
  fs.stat = function (p, opt, cb) {
    if (typeof opt === "function") { cb = opt; opt = undefined; }
    const rel = mine(p); if (!rel) return real.stat.call(fs, p, cb);
    const st = statRel(rel); process.nextTick(() => st ? cb(null, st) : cb(enoent(p)));
  };
  fs.readdirSync = function (p, opt) {
    const rel = mine(p); if (!rel) return real.readdirSync.apply(fs, arguments);
    const names = children(rel); const list = [...names.keys()].sort();
    if (opt && opt.withFileTypes) return list.map(n => ({ name: n, isDirectory: () => names.get(n) === "dir", isFile: () => names.get(n) === "file" }));
    return list;
  };
  fs.unlinkSync = function (p) {
    const rel = mine(p); if (!rel) return real.unlinkSync.apply(fs, arguments);
    const f = lookup(rel); if (!f || f.gone) throw enoent(p);
    R[repoOf(rel)].pending.set(rel, null);
  };
  fs.copyFileSync = function (a, b) {
    if (!mine(a) && !mine(b)) return real.copyFileSync.apply(fs, arguments);
    fs.writeFileSync(b, fs.readFileSync(a));
  };
  fs.renameSync = function (a, b) {
    if (!mine(a) && !mine(b)) return real.renameSync.apply(fs, arguments);
    const buf = fs.readFileSync(a); fs.writeFileSync(b, buf);
    const ra = mine(a); if (ra) { const S = R[repoOf(ra)]; if (S.tree.has(ra)) S.pending.set(ra, null); else S.pending.delete(ra); }
  };
  fs.mkdirSync = function (p) { if (mine(p)) return undefined; return real.mkdirSync.apply(fs, arguments); };
  fs.createReadStream = function (p, opt) {
    const rel = mine(p); if (!rel) return real.createReadStream.apply(fs, arguments);
    const f = lookup(rel);
    if (f && f.buf) return Readable.from([Buffer.from(f.buf)]);
    if (real.existsSync(p)) return real.createReadStream.apply(fs, arguments);
    if (f && f.remote && f.repo === R.pub) {   // just uploaded, not in this deployment yet: stream it from GitHub
      const url = RAW + "/" + R.pub.name + "/" + R.pub.head + "/" + rel.split("/").map(encodeURIComponent).join("/");
      return Readable.fromWeb ? Readable.from((async function* () { const r = await fetch(url); if (!r.ok) throw enoent(p); yield Buffer.from(await r.arrayBuffer()); })()) : Readable.from([]);
    }
    const s = new Readable({ read() {} }); process.nextTick(() => s.destroy(enoent(p))); return s;
  };
}
module.exports = { enabled, install, refresh, flush, hasPending, deployNow, repos: () => ({ public: PUBLIC_REPO, private: PRIVATE_REPO }) };
