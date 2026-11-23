/* Atlas Art Minerals — site server + /admin API.
   Zero dependencies (Node 18+). Run:  node server.js   (PORT and ADMIN_PASSWORD optional env vars)
   Data lives in ./data (catalog.json, site.json, admin.json). On every save the public
   files assets/js/products.js and assets/js/settings.js are regenerated, so the site stays static-friendly. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
// Serverless mode (Vercel): files written by the admin are stored in GitHub through lib/vfs.js (see api/index.js)
const SERVERLESS = !!process.env.GH_TOKEN;
const SESSION_KEY = crypto.createHash("sha256").update("aam-session|" + (process.env.APP_SECRET || process.env.GH_TOKEN || "")).digest();
const DATA = path.join(ROOT, "data");
const PORT = Number(process.env.PORT) || 4321;
const UPLOAD_DIR = path.join(ROOT, "assets", "products");
const MAX_JSON = 1024 * 1024 * 2;          // 2 MB for catalog/site saves
const MAX_UPLOAD = 1024 * 1024 * 7;        // ~5 MB image after base64 overhead
const SESSION_HOURS = 12;
// Behind Nginx / Hostinger / Render… start with TRUST_PROXY=1 so the real visitor IP (X-Forwarded-For) and HTTPS are used.
const TRUST_PROXY = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";
function clientIp(req) {
  if (TRUST_PROXY) { const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim(); if (xf) return xf; }
  return req.socket.remoteAddress || "?";
}
function isHttps(req) { return !!req.socket.encrypted || (TRUST_PROXY && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"); }
function sessionCookie(req, value, maxAge) { return "aam_admin=" + value + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + maxAge + (isHttps(req) ? "; Secure" : ""); }

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2"
};

/* ---------- JSON helpers ---------- */
function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; } }
function writeJSON(file, obj) { const tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, file); }

/* ---------- Admin credentials (scrypt hash) ---------- */
const ADMIN_FILE = path.join(DATA, "admin.json");
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 64).toString("hex"); }
function ensureAdmin() {
  let a = readJSON(ADMIN_FILE, null);
  if (!a || !a.salt || !a.hash) {
    const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
    const salt = crypto.randomBytes(16).toString("hex");
    a = { salt, hash: hashPw(pw, salt) };
    writeJSON(ADMIN_FILE, a);
    if (!process.env.ADMIN_PASSWORD) {
      fs.writeFileSync(path.join(DATA, "PREMIER-MOT-DE-PASSE.txt"),
        "Mot de passe initial de /admin : " + pw + "\n\nConnectez-vous, changez-le dans l'onglet « Mot de passe », puis supprimez ce fichier.\n");
      console.log("Mot de passe admin initial écrit dans data/PREMIER-MOT-DE-PASSE.txt");
    }
  }
  return a;
}
ensureAdmin();

/* ---------- Users, roles, 2FA (TOTP) ---------- */
const USERS_FILE = path.join(DATA, "users.json");
const ROLES = { admin: "Administrateur", editor: "Éditeur", sales: "Commercial" };
function loadUsers() {
  let u = readJSON(USERS_FILE, null);
  if (!Array.isArray(u) || !u.length) {                      // migrate the original single admin.json
    const a = readJSON(ADMIN_FILE, {});
    u = [{ id: "admin", username: "admin", name: "Administrateur", role: "admin", salt: a.salt, hash: a.hash, totp: "", created: Date.now() }];
    writeJSON(USERS_FILE, u);
  }
  return u;
}
function saveUsers(u) { writeJSON(USERS_FILE, u); }
function pwOk(user, pw) {
  if (!user || !user.salt) return false;
  const h = Buffer.from(hashPw(pw, user.salt), "hex"), ref = Buffer.from(user.hash, "hex");
  return h.length === ref.length && crypto.timingSafeEqual(h, ref);
}
function publicUser(u) { return { id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLES[u.role], totp: !!u.totp, created: u.created, lastLogin: u.lastLogin || 0 }; }
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32encode(buf) { let bits = "", out = ""; for (const b of buf) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function b32decode(s) { let bits = ""; for (const c of String(s).replace(/=+$/, "").toUpperCase()) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, "0"); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function hotp(secret, counter) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", b32decode(secret)).update(b).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}
function totpOk(secret, code) { const c = String(code || "").replace(/\s/g, ""), t = Math.floor(Date.now() / 30000); return /^\d{6}$/.test(c) && [-1, 0, 1].some(d => hotp(secret, t + d) === c); }

/* ---------- Sessions + login rate limit ---------- */
const SESSIONS_FILE = path.join(DATA, "sessions.json");
const tokHash = t => crypto.createHash("sha256").update(String(t)).digest("hex");
const sessions = new Map();           // sha256(token) -> { exp, uid }   (the raw token only lives in the browser cookie)
try { Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"))).forEach(([k, v]) => { if (v && v.exp > Date.now()) sessions.set(k, v); }); } catch (e) { /* first start */ }
let sessTimer = null;
function saveSessions() {
  if (SERVERLESS) return;
  clearTimeout(sessTimer);
  sessTimer = setTimeout(() => { const o = {}; for (const [k, v] of sessions) if (v.exp > Date.now()) o[k] = v; try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(o)); } catch (e) { /* disk issue: sessions stay in memory */ } }, 200);
}
const _sessDelete = sessions.delete.bind(sessions);
sessions.delete = k => { const r = _sessDelete(k); saveSessions(); return r; };
const attempts = new Map();           // ip -> { n, until }
function signTok(body) { return crypto.createHmac("sha256", SESSION_KEY).update(body).digest("base64url"); }
function newSession(uid) {
  if (SERVERLESS) { const u = loadUsers().find(x => x.id === uid) || {}; const body = Buffer.from(JSON.stringify({ u: uid, e: Date.now() + SESSION_HOURS * 3600e3, v: u.sv || 0 })).toString("base64url"); return body + "." + signTok(body); }
  const t = crypto.randomBytes(32).toString("hex"); sessions.set(tokHash(t), { exp: Date.now() + SESSION_HOURS * 3600e3, uid }); saveSessions(); return t; }
function cookies(req) { const out = {}; (req.headers.cookie || "").split(";").forEach(c => { const i = c.indexOf("="); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return out; }
function currentUser(req) {
  if (SERVERLESS) {
    const t = String(cookies(req).aam_admin || ""), i = t.indexOf("."); if (i < 1) return null;
    const body = t.slice(0, i), sig = t.slice(i + 1), good = signTok(body);
    if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    let d; try { d = JSON.parse(Buffer.from(body, "base64url").toString()); } catch (e) { return null; }
    if (!d || d.e < Date.now()) return null;
    const u = loadUsers().find(x => x.id === d.u); return u && (u.sv || 0) === d.v ? u : null;
  }
  const t = cookies(req).aam_admin, h = t && tokHash(t), s = h && sessions.get(h);
  if (!s) return null; if (s.exp < Date.now()) { sessions.delete(h); return null; }
  return loadUsers().find(u => u.id === s.uid) || null;
}
function authed(req) { return !!currentUser(req); }

/* ---------- Activity log ---------- */
const ACTIVITY_FILE = path.join(DATA, "activity.json");
function logActivity(user, action, detail) {
  const a = readJSON(ACTIVITY_FILE, []);
  a.unshift({ t: Date.now(), user: user ? user.name : "système", role: user ? user.role : "", action: cleanStr(action, 120), detail: cleanStr(detail || "", 200) });
  writeJSON(ACTIVITY_FILE, a.slice(0, 1000));
}
function limited(ip) { const a = attempts.get(ip); return a && a.n >= 8 && a.until > Date.now(); }
function failed(ip) { const a = attempts.get(ip) || { n: 0, until: 0 }; if (a.until < Date.now()) { a.n = 0; } a.n++; a.until = Date.now() + 15 * 60e3; attempts.set(ip, a); }

/* ---------- Catalog + site settings ---------- */
const CATALOG_FILE = path.join(DATA, "catalog.json");
const SITE_FILE = path.join(DATA, "site.json");
const FAMILY_IDS = ["light", "lamps", "bowls", "objects", "onyx"];
const SITE_KEYS = ["phone", "whatsapp", "email", "address", "founded", "customers", "companies", "team", "warehouses", "topbar"];

function cleanStr(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 300); }
function slug(s) { return cleanStr(s, 120).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "piece"; }
function cleanImg(v) {
  const s = cleanStr(v, 500);
  if (!s) return "";
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;                       // external photo URL from Excel
  if (/^assets\/[a-z0-9_\-\/.]+\.(webp|png|jpe?g)$/i.test(s) && !s.includes("..")) return s;
  return "";
}
function num(v) { const n = parseFloat(String(v == null ? "" : v).replace(",", ".").replace(/[^0-9.\-]/g, "")); return isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 10000) / 10000 : ""; }
const VAR_NUM = ["weight", "l", "w", "h", "pl", "pw", "ph", "packWeight", "volume"];
/* Optional detail fields (Excel import): categories, long text, status, size variants, gallery */
function productExtras(p) {
  const o = {};
  ["retailCat", "retailSub", "retailSubsub", "wsCat", "wsSub", "status"].forEach(k => { const v = cleanStr(p[k], 80); if (v) o[k] = v; });
  const long = String(p.longDescription == null ? "" : p.longDescription).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000); if (long) o.longDescription = long;
  if (Array.isArray(p.variants)) {
    const vs = p.variants.slice(0, 40).map(v => {
      if (!v || typeof v !== "object") return null;
      const x = { size: cleanStr(v.size, 40), ref: cleanStr(v.ref, 60) };
      VAR_NUM.forEach(k => { const n = num(v[k]); if (n !== "") x[k] = n; });
      const im = cleanImg(v.img); if (im) x.img = im;
      return Object.keys(x).some(k => x[k] !== "") ? x : null;
    }).filter(Boolean);
    if (vs.length) o.variants = vs;
  }
  if (Array.isArray(p.images)) { const ims = [...new Set(p.images.map(cleanImg).filter(Boolean))].slice(0, 12); if (ims.length) o.images = ims; }
  return o;
}
function cleanProduct(p, seen, ids) {
  ids = ids || loadCatalog().families.map(f => f.id);
  const name = cleanStr(p.name, 140);
  if (!name) return null;
  let id = slug(p.id || name);
  let base = id, k = 2; while (seen.has(id)) id = base + "-" + k++;
  seen.add(id);
  return {
    id, name,
    family: ids.includes(p.family) ? p.family : (ids.includes("objects") ? "objects" : ids[0] || "objects"),
    finish: cleanStr(p.finish, 60) || "Selenite",
    bg: ["white", "cloth", "scene"].includes(p.bg) ? p.bg : "white",
    ref: cleanStr(p.ref, 60),
    sizes: cleanStr(p.sizes, 200),
    description: cleanStr(p.description, 1200),
    img: cleanImg(p.img),
    featured: Number(p.featured) > 0 ? Math.min(Number(p.featured), 999) : 0,
    ...productExtras(p)
  };
}
/* Download a product photo from a link found in Excel (Google Drive, Dropbox, any public URL).
   Only public http(s) hosts, images only, 8 MB max, private/internal addresses refused. */
const dns = require("dns").promises, net = require("net");
function privateIp(ip) {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); if (l.startsWith("::ffff:")) return privateIp(l.slice(7)); return l === "::1" || l === "::" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l); }
  const [a, b2] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b2 === 254) || (a === 172 && b2 >= 16 && b2 <= 31) || (a === 192 && b2 === 168) || (a === 100 && b2 >= 64 && b2 <= 127) || a >= 224;
}
function directLink(u) {
  let m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/.exec(u) || /drive\.google\.com\/.*[?&]id=([\w-]{10,})/.exec(u);
  if (m) return "https://drive.google.com/uc?export=download&id=" + m[1];
  if (/^https:\/\/(www\.)?dropbox\.com\//.test(u)) return u.replace(/([?&])dl=0/, "$1dl=1").replace(/^(?!.*[?&]dl=1)(.*)$/, (x) => x + (x.includes("?") ? "&" : "?") + "dl=1");
  return u;
}
async function fetchImage(raw) {
  let u = directLink(raw.trim());
  for (let hop = 0; hop < 5; hop++) {
    let parsed; try { parsed = new URL(u); } catch (e) { throw new Error("Lien invalide."); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Lien invalide (http ou https uniquement).");
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
    if (!addrs.length) throw new Error("Site introuvable : " + host);
    if (addrs.some(a => privateIp(a.address))) throw new Error("Adresse interne refusée.");
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Mozilla/5.0 (photo import)" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = new URL(r.headers.get("location"), u).href; continue; }
    if (!r.ok) throw new Error("Le lien répond " + r.status + (r.status === 403 || r.status === 401 ? " (fichier non partagé publiquement ?)" : "") + ".");
    const len = Number(r.headers.get("content-length") || 0); if (len > 8 * 1024 * 1024) throw new Error("Photo trop lourde (max 8 Mo).");
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 8 * 1024 * 1024) throw new Error("Photo trop lourde (max 8 Mo).");
    const sig = buf.slice(0, 12).toString("hex");
    const type = sig.startsWith("89504e47") ? "png" : sig.startsWith("ffd8ff") ? "jpeg" : (sig.startsWith("52494646") && buf.slice(8, 12).toString() === "WEBP") ? "webp" : "";
    if (!type) throw new Error(/text\/html/.test(r.headers.get("content-type") || "") ? "Le lien mène à une page web, pas à une image (partage public requis)." : "Ce fichier n'est pas une image JPG, PNG ou WEBP.");
    return "data:image/" + type + ";base64," + buf.toString("base64");
  }
  throw new Error("Trop de redirections.");
}
/* ---------- Outgoing email (quote alerts, newsletter welcome) — tiny SMTP client, no dependency ---------- */
const MAIL_FILE = path.join(DATA, "mail.json");
function loadMail() { return readJSON(MAIL_FILE, {}); }
const hdr = v => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim();
const b64 = v => Buffer.from(String(v), "utf8").toString("base64");
function smtpSend(cfg, msg) {
  const tls = require("tls");
  return new Promise((resolve, reject) => {
    const port = Number(cfg.port) || 587, implicit = port === 465 || cfg.secure === true;
    let sock = implicit ? tls.connect({ host: cfg.host, port, servername: cfg.host }) : net.connect({ host: cfg.host, port });
    let buf = "", waiting = null, finished = false;
    const fail = e => { if (finished) return; finished = true; try { sock.destroy(); } catch (x) { /* closed */ } reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error("Délai dépassé : serveur email injoignable.")), 25000);
    const onData = d => {
      buf += d.toString("utf8");
      const lines = buf.split("\r\n"); if (lines.length < 2) return;
      for (let i = 0; i < lines.length - 1; i++) { const m = /^(\d{3})([ -])/.exec(lines[i]); if (m && m[2] === " ") { const all = lines.slice(0, i + 1).join("\n"); buf = lines.slice(i + 1).join("\r\n"); const w = waiting; waiting = null; if (w) w(+m[1], all); return; } }
    };
    const attach = sk => { sk.on("data", onData); sk.on("error", fail); };
    attach(sock);
    const next = () => new Promise(r => { waiting = (code, text) => r({ code, text }); });
    const cmd = (line, ok) => { const p = next(); sock.write(line + "\r\n"); return p.then(r => { if (!ok.includes(r.code)) throw new Error("Serveur email : " + r.text.split("\n").pop()); return r; }); };
    (async () => {
      let r = await next(); if (r.code !== 220) throw new Error("Serveur email : " + r.text);
      r = await cmd("EHLO atlas-art", [250]);
      if (!implicit && /STARTTLS/i.test(r.text)) {
        await cmd("STARTTLS", [220]);
        sock.removeListener("data", onData);
        sock = tls.connect({ socket: sock, servername: cfg.host }); attach(sock);
        await new Promise((res2, rej2) => { sock.once("secureConnect", res2); sock.once("error", rej2); });
        r = await cmd("EHLO atlas-art", [250]);
      }
      if (cfg.user) { await cmd("AUTH LOGIN", [334]); await cmd(b64(cfg.user), [334]); await cmd(b64(cfg.pass || ""), [235]); }
      const from = hdr(cfg.from || cfg.user);
      await cmd("MAIL FROM:<" + from + ">", [250]);
      for (const to of msg.to) await cmd("RCPT TO:<" + hdr(to) + ">", [250, 251]);
      await cmd("DATA", [354]);
      const body = b64(msg.text).replace(/.{1,76}/g, m => m + "\r\n");
      const data = ["From: " + (cfg.fromName ? "=?UTF-8?B?" + b64(hdr(cfg.fromName)) + "?= " : "") + "<" + from + ">", "To: " + msg.to.map(hdr).join(", "),
        "Subject: =?UTF-8?B?" + b64(hdr(msg.subject)) + "?=", "Date: " + new Date().toUTCString(), "Message-ID: <" + crypto.randomBytes(12).toString("hex") + "@atlas-art>",
        "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64"].concat(msg.replyTo ? ["Reply-To: " + hdr(msg.replyTo)] : []).concat(msg.headers || []).join("\r\n") + "\r\n\r\n" + body;
      await cmd(data + "\r\n.", [250]);
      try { sock.write("QUIT\r\n"); } catch (e) { /* ignore */ }
      finished = true; clearTimeout(timer); sock.end(); resolve();
    })().catch(e => { clearTimeout(timer); fail(e); });
  });
}
function mailReady() { const m = loadMail(); return !!(m.host && m.to && (m.from || m.user)); }
function notifyLead(lead) {
  const m = loadMail(); if (!mailReady() || m.notifyLeads === false) return;
  const lines = ["Nouvelle demande de devis sur le site Atlas Art Minerals", "",
    "Nom : " + lead.name, "Société : " + lead.company, "Pays : " + lead.country, "Email : " + lead.email].concat(lead.phone ? ["Téléphone / WhatsApp : " + lead.phone] : []).concat(lead.type ? ["Type : " + lead.type] : [])
    .concat(["", lead.items.length ? "Pièces demandées :" : "Demande générale."]).concat(lead.items.map((i, k) => (k + 1) + ". " + i.name + " (" + i.finish + ")" + (i.size || i.ref ? " — " + [i.size ? "taille " + i.size : "", i.ref ? "réf. " + i.ref : ""].filter(Boolean).join(", ") : "") + " × " + i.qty + (i.note ? " — " + i.note : "")))
    .concat(lead.message ? ["", "Message :", lead.message] : []).concat(["", "Voir et suivre la demande : /admin/#/leads"]);
  smtpSend(m, { to: String(m.to).split(/[,;\s]+/).filter(Boolean).slice(0, 5), subject: "Demande de devis — " + lead.company + " (" + lead.country + ")", text: lines.join("\n"), replyTo: lead.email })
    .then(() => logMailOk(), e => logMailErr(e));
}
let mailLast = { ok: null, t: 0, error: "" };
function logMailOk() { mailLast = { ok: true, t: Date.now(), error: "" }; }
function logMailErr(e) { mailLast = { ok: false, t: Date.now(), error: e.message }; console.error("[mail]", e.message); }
/* newsletter: signed unsubscribe link */
const SECRET_FILE = path.join(DATA, "secret.key");
let SECRET; try { SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim(); } catch (e) { SECRET = crypto.randomBytes(32).toString("hex"); try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(SECRET_FILE, SECRET); } catch (x) { /* read-only disk */ } }
const unsubToken = email => crypto.createHmac("sha256", SECRET).update("unsub:" + String(email).toLowerCase()).digest("hex").slice(0, 24);
function siteBase(req) { const u = (loadSite().siteUrl || "").replace(/\/+$/, ""); return u || ((isHttps(req) ? "https://" : "http://") + req.headers.host); }
function unsubLink(req, email) { return siteBase(req) + "/api/unsubscribe?e=" + encodeURIComponent(email) + "&t=" + unsubToken(email); }
function loadCatalog() { return readJSON(CATALOG_FILE, { families: [], products: [] }); }
function loadSite() { return readJSON(SITE_FILE, {}); }

function writePublicFiles() {
  const cat = loadCatalog(), site = loadSite();
  const products = cat.products.map(p => {
    const o = { id: p.id, name: p.name, family: p.family, finish: p.finish, bg: p.bg };
    if (p.img) o.img = p.img; if (p.ref) o.ref = p.ref; if (p.sizes) o.sizes = p.sizes;
    if (p.description) o.description = p.description; if (p.featured) o.featured = p.featured;
    ["longDescription", "variants", "images", "retailCat", "retailSub", "retailSubsub", "wsCat", "wsSub"].forEach(k => { if (p[k]) o[k] = p[k]; });
    return o;
  });
  const js = "/* Généré par /admin — ne pas modifier à la main (voir data/catalog.json). */\n" +
    "window.AAM_FAMILIES = " + JSON.stringify(cat.families, null, 1) + ";\n" +
    "window.AAM_PRODUCTS = " + JSON.stringify(products, null, 1) + ";\n";
  fs.writeFileSync(path.join(ROOT, "assets", "js", "products.js"), js);
  const contact = { phone: site.phone, phoneHref: "tel:" + String(site.phone || "").replace(/[^\d+]/g, ""), whatsapp: String(site.whatsapp || "").replace(/\D/g, ""), email: site.email, address: site.address };
  fs.writeFileSync(path.join(ROOT, "assets", "js", "settings.js"),
    "/* Généré par /admin — ne pas modifier à la main (voir data/site.json). */\n" +
    "window.AAM_SITE = " + JSON.stringify(site, null, 1) + ";\nwindow.AAM_CONTACT = " + JSON.stringify(contact, null, 1) + ";\n");
}

/* ---------- HTTP helpers ---------- */
function send(res, code, body, headers) {
  const h = Object.assign({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" }, headers || {});
  if (typeof body === "object" && !Buffer.isBuffer(body)) { body = JSON.stringify(body); h["Content-Type"] = "application/json; charset=utf-8"; h["Cache-Control"] = "no-store"; }
  res.writeHead(code, h); res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(Object.assign(new Error("too large"), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(Object.assign(new Error("bad json"), { code: 400 })); } });
    req.on("error", reject);
  });
}
function sameOrigin(req) {
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const ip = clientIp(req);
  if (req.method !== "GET" && !sameOrigin(req)) return send(res, 403, { error: "origin" });

  if (url.pathname === "/api/login" && req.method === "POST") {
    if (limited(ip)) return send(res, 429, { error: "Trop d'essais. Réessayez dans 15 minutes." });
    const b = await readBody(req, 10_000);
    const users = loadUsers(), uname = cleanStr(b.username || "admin", 60).trim().toLowerCase() || "admin";
    const user = users.find(u => u.username === uname);
    const pwIn = String(b.password || "");
    if (!pwOk(user, pwIn) && !(pwIn.trim() !== pwIn && pwOk(user, pwIn.trim()))) { failed(ip); return send(res, 401, { error: "Identifiant ou mot de passe incorrect." }); }
    if (user.totp) {
      if (!b.code) return send(res, 401, { need2fa: true, error: "Entrez le code à 6 chiffres de votre application d'authentification." });
      if (!totpOk(user.totp, b.code)) { failed(ip); return send(res, 401, { need2fa: true, error: "Code incorrect." }); }
    }
    attempts.delete(ip);
    user.lastLogin = Date.now(); saveUsers(users); logActivity(user, "Connexion", ip);
    const t = newSession(user.id);
    return send(res, 200, { ok: true, user: publicUser(user) }, { "Set-Cookie": sessionCookie(req, t, SESSION_HOURS * 3600) });
  }
  if (url.pathname === "/api/logout" && req.method === "POST") {
    const t = cookies(req).aam_admin; if (t) sessions.delete(tokHash(t));
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }
  if (url.pathname === "/api/session") { const u = currentUser(req); return send(res, 200, { authed: !!u, user: u ? publicUser(u) : null }); }

  /* Public endpoints (site visitors): quote requests, statistics, newsletter */
  const pub = await apiPublic(req, res, url, ip);
  if (pub !== null) return;

  const user = currentUser(req);
  if (!user) return send(res, 401, { error: "Session expirée. Reconnectez-vous." });
  if (!allowed(user.role, url.pathname, req.method)) return send(res, 403, { error: "Votre rôle (" + ROLES[user.role] + ") ne permet pas cette action." });
  if (req.method !== "GET") { let logged = false; const logIt = code => { if (logged) return; logged = true; if (code < 400) logActivity(user, activityLabel(url.pathname, req.method), url.searchParams.get("f") || ""); }; res.on("aam-before-save", logIt); res.on("finish", () => logIt(res.statusCode)); }
  req.user = user;

  if (url.pathname === "/api/catalog" && req.method === "GET") return send(res, 200, loadCatalog());
  if (url.pathname === "/api/catalog" && req.method === "PUT") {
    const b = await readBody(req, MAX_JSON * 8);
    if (!Array.isArray(b.products)) return send(res, 400, { error: "Format invalide." });
    if (b.products.length > 5000) return send(res, 400, { error: "Trop de produits (max 5000)." });
    const seen = new Set(), ids = loadCatalog().families.map(f => f.id);
    const products = b.products.map(p => cleanProduct(p || {}, seen, ids)).filter(Boolean);
    const cat = loadCatalog(); cat.products = products; writeJSON(CATALOG_FILE, cat); writePublicFiles();
    return send(res, 200, { ok: true, count: products.length, products });
  }
  if (url.pathname === "/api/site" && req.method === "GET") return send(res, 200, loadSite());
  if (url.pathname === "/api/site" && req.method === "PUT") {
    const b = await readBody(req, 50_000); const site = loadSite();
    SITE_KEYS.forEach(k => { if (k in b) site[k] = cleanStr(b[k], k === "address" || k === "topbar" ? 200 : 80); });
    if ("logo" in b) site.logo = cleanImg(b.logo);
    if ("imgMax" in b) site.imgMax = Math.max(400, Math.min(4000, parseInt(b.imgMax, 10) || 1800));
    if ("imgQuality" in b) site.imgQuality = Math.max(50, Math.min(95, parseInt(b.imgQuality, 10) || 82));
    if ("imgWebp" in b) site.imgWebp = !!b.imgWebp;
    writeJSON(SITE_FILE, site); writePublicFiles();
    return send(res, 200, { ok: true, site });
  }
  if (url.pathname === "/api/upload" && req.method === "POST") {
    const b = await readBody(req, MAX_UPLOAD);
    const m = /^data:image\/(webp|png|jpeg);base64,([a-z0-9+/=]+)$/i.exec(String(b.dataUrl || ""));
    if (!m) return send(res, 400, { error: "Image WEBP, JPG ou PNG uniquement." });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 5 * 1024 * 1024) return send(res, 413, { error: "Image trop lourde (max 5 Mo)." });
    const sig = buf.slice(0, 12).toString("hex");
    const ok = (m[1] === "png" && sig.startsWith("89504e47")) || (m[1] === "jpeg" && sig.startsWith("ffd8ff")) || (m[1] === "webp" && sig.startsWith("52494646") && buf.slice(8, 12).toString() === "WEBP");
    if (!ok) return send(res, 400, { error: "Fichier image invalide." });
    const ext = m[1] === "jpeg" ? "jpg" : m[1].toLowerCase();
    const name = slug(b.name || "photo") + "-" + crypto.randomBytes(3).toString("hex") + "." + ext;
    const folder = b.folder === "library" ? "uploads" : "products";
    fs.writeFileSync(path.join(ROOT, "assets", folder, name), buf);
    return send(res, 200, { ok: true, path: "assets/" + folder + "/" + name, size: buf.length });
  }
  if (url.pathname === "/api/fetch-image" && req.method === "POST") {
    const b = await readBody(req, 4000);
    try { return send(res, 200, { ok: true, dataUrl: await fetchImage(String(b.url || "")) }); }
    catch (e) { return send(res, 400, { error: e.message || "Photo introuvable." }); }
  }
  if (url.pathname === "/api/pages" && req.method === "GET") return send(res, 200, PAGES);
  if (url.pathname === "/api/page" && req.method === "PUT") {
    const b = await readBody(req, MAX_JSON);
    const page = PAGES.find(p => p.file === b.file);
    if (!page) return send(res, 400, { error: "Page inconnue." });
    const files = new Set([page.file]);
    const hasGlobal = ["texts", "links", "images", "sections"].some(g => Object.keys(b[g] || {}).some(k => k.startsWith("g-")));
    if (hasGlobal) PAGES.forEach(p => files.add(p.file));
    files.forEach(f => {
      const fp = path.join(ROOT, f), src = fs.readFileSync(fp, "utf8");
      const out = applyEdits(src, b, f !== page.file);
      if (out !== src) { backup(f); fs.writeFileSync(fp, out); }
    });
    return send(res, 200, { ok: true, files: Array.from(files) });
  }
  if (url.pathname === "/api/password" && req.method === "POST") {
    const b = await readBody(req, 10_000); const users = loadUsers(), me = users.find(u => u.id === user.id);
    if (!pwOk(me, b.current || "")) return send(res, 401, { error: "Mot de passe actuel incorrect." });
    if (String(b.next || "").length < 10) return send(res, 400, { error: "Le nouveau mot de passe doit faire au moins 10 caractères." });
    me.salt = crypto.randomBytes(16).toString("hex"); me.hash = hashPw(b.next, me.salt); if (SERVERLESS) me.sv = (me.sv || 0) + 1; saveUsers(users);
    const t = cookies(req).aam_admin;
    for (const [k, s] of sessions) if (s.uid === me.id && k !== tokHash(t)) sessions.delete(k);
    if (me.id === "admin") { try { fs.unlinkSync(path.join(DATA, "PREMIER-MOT-DE-PASSE.txt")); } catch (e) { /* already gone */ } }
    return send(res, 200, { ok: true }, SERVERLESS ? { "Set-Cookie": sessionCookie(req, newSession(me.id), SESSION_HOURS * 3600) } : undefined);
  }
  if ((await apiPlus(req, res, url, user)) !== null) return;
  if ((await apiCms(req, res, url)) !== null) return;
  return send(res, 404, { error: "not found" });
}

/* ---------- Visual page editor: apply edits straight into the HTML files ---------- */
const PAGES = [
  { file: "index.html", label: "Accueil" }, { file: "collection.html", label: "Collection" },
  { file: "workshop.html", label: "Atelier" }, { file: "trade.html", label: "Trade & private label" },
  { file: "quote.html", label: "Devis / contact" }, { file: "journal.html", label: "Journal (liste)" },
  { file: "article.html", label: "Journal (article)" }, { file: "legal.html", label: "Mentions légales" },
  { file: "privacy.html", label: "Confidentialité" }, { file: "product.html", label: "Fiche produit (modèle commun)" }, { file: "404.html", label: "Page 404" }
];
const BACKUPS = path.join(DATA, "backups");
fs.mkdirSync(BACKUPS, { recursive: true });
const KEY_RE = /^(g|home|coll|work|trade|quote|jour|art|legal|priv|nf|prod)-[tis]\d{1,4}$/;
const escAttr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = s => String(s).replace(/&(?![a-z]+;|#\d+;|#x[0-9a-f]+;)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function safeHref(h) {
  h = String(h || "").trim();
  if (!h || h.length > 500) return null;
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(h)) return h.replace(/["<>\s]/g, "");
  if (/^[a-z0-9_\-\/.]+\.html(#[a-z0-9_\-]*)?$/i.test(h) && !h.includes("..")) return h;
  return null;
}
const INLINE_OK = { br: [], em: [], strong: [], b: [], i: [], span: ["class", "data-site", "data-total", "data-family-n"], a: ["href", "target", "rel", "data-wa", "data-tel", "data-mail", "class"] };
function sanitizeInline(html) {
  html = String(html || "").slice(0, 8000).replace(/<\/(div|p)>\s*<(div|p)[^>]*>/gi, "<br>").replace(/<\/?(div|p)[^>]*>/gi, "");
  let out = "", last = 0; const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g; let m;
  while ((m = re.exec(html))) {
    out += escText(html.slice(last, m.index)); last = re.lastIndex;
    const tag = m[2].toLowerCase(), allowed = INLINE_OK[tag];
    if (!allowed) continue;
    if (m[1]) { if (tag !== "br") out += "</" + tag + ">"; continue; }
    if (tag === "br") { out += "<br>"; continue; }
    let attrs = ""; const ar = /([a-zA-Z-]+)(?:\s*=\s*"([^"]*)")?/g; let a;
    while ((a = ar.exec(m[3]))) {
      const n = a[1].toLowerCase(); if (!allowed.includes(n)) continue;
      let v = a[2] == null ? "" : a[2].replace(/&amp;/g, "&");
      if (n === "href") { v = safeHref(v); if (v == null) continue; }
      attrs += a[2] == null ? " " + n : " " + n + '="' + escAttr(v) + '"';
    }
    out += "<" + tag + attrs + ">";
  }
  return out + escText(html.slice(last));
}
function findElement(src, attr, key) {
  const idx = src.indexOf(attr + '="' + key + '"');
  if (idx < 0) return null;
  const s = src.lastIndexOf("<", idx), e = src.indexOf(">", idx);
  const tag = /^<([a-zA-Z0-9]+)/.exec(src.slice(s))[1].toLowerCase();
  if (tag === "img") return { tag, s, e: e + 1 };
  const re = new RegExp("<(/?)" + tag + "\\b[^>]*>", "gi"); re.lastIndex = e + 1;
  let depth = 1, m;
  while ((m = re.exec(src))) { depth += m[1] ? -1 : 1; if (depth === 0) return { tag, s, e: e + 1, ci: m.index, ce: re.lastIndex }; }
  return null;
}
function setAttr(startTag, name, value) {
  const re = new RegExp("\\s" + name + '="[^"]*"');
  if (value == null) return startTag.replace(re, "");
  return re.test(startTag) ? startTag.replace(re, " " + name + '="' + escAttr(value) + '"') : startTag.replace(/\s*\/?>$/, m => " " + name + '="' + escAttr(value) + '"' + m);
}
function applyEdits(src, ed, onlyGlobal) {
  const want = k => KEY_RE.test(k) && (onlyGlobal ? k.startsWith("g-") : true);
  Object.keys(ed.texts || {}).filter(want).forEach(k => {
    const el = findElement(src, "data-edit", k); if (!el || el.ci == null) return;
    src = src.slice(0, el.e) + sanitizeInline(ed.texts[k]) + src.slice(el.ci);
  });
  Object.keys(ed.links || {}).filter(want).forEach(k => {
    const el = findElement(src, "data-edit", k); if (!el || el.tag !== "a") return;
    const h = safeHref(ed.links[k]); if (h == null) return;
    let st = src.slice(el.s, el.e); st = setAttr(st, "href", h);
    if (/^https?:/i.test(h)) { st = setAttr(st, "target", "_blank"); st = setAttr(st, "rel", "noopener"); }
    st = st.replace(/\sdata-(wa|tel|mail)(?=[\s>])/g, "");
    src = src.slice(0, el.s) + st + src.slice(el.e);
  });
  Object.keys(ed.images || {}).filter(want).forEach(k => {
    const el = findElement(src, "data-edit", k); if (!el || el.tag !== "img") return;
    const im = ed.images[k] || {}; let st = src.slice(el.s, el.e);
    const img = cleanImg(im.src); if (img) st = setAttr(st, "src", img);
    if (typeof im.alt === "string") st = setAttr(st, "alt", cleanStr(im.alt, 200));
    src = src.slice(0, el.s) + st + src.slice(el.e);
    if (typeof im.caption === "string") {
      const fs0 = src.lastIndexOf("<figure", el.s), fe = src.indexOf(">", fs0) + 1;
      if (fs0 >= 0 && !src.slice(fe, el.s).trim() && /data-caption="/.test(src.slice(fs0, fe)))
        src = src.slice(0, fs0) + setAttr(src.slice(fs0, fe), "data-caption", cleanStr(im.caption, 120)) + src.slice(fe);
    }
  });
  Object.keys(ed.sections || {}).filter(want).forEach(k => {
    const el = findElement(src, "data-section", k); if (!el) return;
    let st = src.slice(el.s, el.e).replace(/\shidden(?=[\s>])/, "");
    if (ed.sections[k]) st = st.replace(/\s*>$/, " hidden>");
    src = src.slice(0, el.s) + st + src.slice(el.e);
  });
  if (!onlyGlobal && typeof ed.title === "string" && ed.title.trim())
    src = src.replace(/<title>[\s\S]*?<\/title>/, "<title>" + escText(cleanStr(ed.title, 120)) + "</title>");
  if (!onlyGlobal && typeof ed.description === "string")
    src = src.replace(/(<meta name="description" content=")[^"]*(")/, "$1" + escAttr(cleanStr(ed.description, 300)) + "$2");
  return src;
}
function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(path.join(ROOT, file), path.join(BACKUPS, file.replace(".html", "") + "-" + stamp + ".html"));
  const all = fs.readdirSync(BACKUPS).filter(f => f.startsWith(file.replace(".html", "") + "-") && !f.includes("before-editor")).sort();
  all.slice(0, Math.max(0, all.length - 30)).forEach(f => { try { fs.unlinkSync(path.join(BACKUPS, f)); } catch (e) { /* ignore */ } });
}

/* =====================================================================
   CMS: journal (articles, authors, categories), families, appearance,
   asset library + image engine, deployment (status, export, restore)
   ===================================================================== */
const JOURNAL_FILE = path.join(DATA, "journal.json");
function loadJournal() { return readJSON(JOURNAL_FILE, { posts: [], authors: [], categories: [] }); }

const RICH_OK = Object.assign({}, INLINE_OK, { p: [], h2: [], h3: [], ul: [], ol: [], li: [], blockquote: [], img: ["src", "alt"], figure: [], figcaption: [] });
function sanitizeRich(html) {
  html = String(html || "").slice(0, 100000).replace(/<(\/?)div\b[^>]*>/gi, "<$1p>");
  let out = "", last = 0; const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g; let m;
  while ((m = re.exec(html))) {
    out += escText(html.slice(last, m.index)); last = re.lastIndex;
    const tag = m[2].toLowerCase(), allowed = RICH_OK[tag];
    if (!allowed) continue;
    if (m[1]) { if (tag !== "br" && tag !== "img") out += "</" + tag + ">"; continue; }
    if (tag === "br") { out += "<br>"; continue; }
    let attrs = "", ok = true; const ar = /([a-zA-Z-]+)(?:\s*=\s*"([^"]*)")?/g; let a;
    while ((a = ar.exec(m[3]))) {
      const n = a[1].toLowerCase(); if (!allowed.includes(n)) continue;
      let v = a[2] == null ? "" : a[2].replace(/&amp;/g, "&");
      if (n === "href") { v = safeHref(v); if (v == null) continue; }
      if (n === "src") { v = cleanImg(v); if (!v) { ok = false; break; } }
      attrs += " " + n + '="' + escAttr(v) + '"';
    }
    if (!ok) continue;
    out += "<" + tag + attrs + (tag === "img" ? ' loading="lazy">' : ">");
  }
  return out + escText(html.slice(last));
}
function uniqueId(base, seen) { let id = slug(base), b = id, k = 2; while (seen.has(id)) id = b + "-" + k++; seen.add(id); return id; }
function cleanJournal(j) {
  const cats = [], cs = new Set();
  (Array.isArray(j.categories) ? j.categories : []).slice(0, 200).forEach(c => { const name = cleanStr(c && c.name, 60); if (name) cats.push({ id: uniqueId(c.id || name, cs), name, description: cleanStr(c.description, 300) }); });
  const auths = [], as = new Set();
  (Array.isArray(j.authors) ? j.authors : []).slice(0, 200).forEach(a => { const name = cleanStr(a && a.name, 80); if (name) auths.push({ id: uniqueId(a.id || name, as), name, role: cleanStr(a.role, 80), photo: cleanImg(a.photo), bio: cleanStr(a.bio, 600) }); });
  const catIds = cats.map(c => c.id), authIds = auths.map(a => a.id);
  const posts = [], ps = new Set();
  (Array.isArray(j.posts) ? j.posts : []).slice(0, 2000).forEach(p => {
    const title = cleanStr(p && p.title, 160); if (!title) return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : new Date().toISOString().slice(0, 10);
    posts.push({
      id: uniqueId(p.id || p.slug || title, ps), title, excerpt: cleanStr(p.excerpt, 400), body: sanitizeRich(p.body), cover: cleanImg(p.cover),
      category: catIds.includes(p.category) ? p.category : "", author: authIds.includes(p.author) ? p.author : "", date,
      status: p.status === "published" ? "published" : "draft", seoTitle: cleanStr(p.seoTitle, 120), seoDescription: cleanStr(p.seoDescription, 300)
    });
  });
  posts.sort((a, b) => b.date.localeCompare(a.date));
  return { posts, authors: auths, categories: cats };
}
function writeJournalPublic() {
  const j = loadJournal();
  const pub = { posts: j.posts.filter(p => p.status === "published"), authors: j.authors, categories: j.categories };
  fs.writeFileSync(path.join(ROOT, "assets", "js", "journal.js"), "/* Généré par /admin — voir data/journal.json. */\nwindow.AAM_JOURNAL = " + JSON.stringify(pub, null, 1) + ";\n");
}

/* ---------- Appearance ---------- */
const THEMES = ["light", "night", "sand", "stone"];
const FONTS = {
  manrope: { css: '"Manrope"', g: null }, figtree: { css: '"Figtree"', g: "Figtree:wght@400;500;600;700" },
  instrument: { css: '"Instrument Sans"', g: "Instrument+Sans:wght@400;500;600;700" }, dmsans: { css: '"DM Sans"', g: "DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700" },
  bricolage: { css: '"Bricolage Grotesque"', g: "Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700" }
};
function hexToOklch(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return null;
  const n = parseInt(m[1], 16), lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin(n >> 16 & 255), g = lin(n >> 8 & 255), b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * mm - 0.0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * mm + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * mm - 0.8086757660 * s;
  const C = Math.sqrt(A * A + B * B); let H = Math.atan2(B, A) * 180 / Math.PI; if (H < 0) H += 360;
  return { L, C, H };
}
function writeAppearance() {
  const s = loadSite(), lines = ["/* Généré par /admin › Apparence — ne pas modifier à la main. */"];
  const f = FONTS[s.font] || FONTS.manrope;
  if (f.g) lines.unshift('@import url("https://fonts.googleapis.com/css2?family=' + f.g + '&display=swap");');
  const vars = [];
  const o = hexToOklch(s.accent);
  if (o) { const L = o.L.toFixed(3), C = o.C.toFixed(3), H = o.H.toFixed(1); vars.push("--accent: oklch(" + L + " " + C + " " + H + ")", "--accent-hover: oklch(" + Math.max(0, o.L - 0.06).toFixed(3) + " " + C + " " + H + ")"); }
  if (f.g) vars.push("--f: " + f.css + ", system-ui, sans-serif");
  const r = Number(s.radius); if (r >= 0 && r <= 24 && s.radius !== "" && s.radius != null) vars.push("--r: " + r + "px");
  if (vars.length) lines.push(":root { " + vars.join("; ") + "; }");
  if (s.showTopbar === false) lines.push(".topbar { display: none !important; }");
  fs.writeFileSync(path.join(ROOT, "assets", "css", "custom.css"), lines.join("\n") + "\n");
  const theme = THEMES.includes(s.theme) ? s.theme : "light";
  PAGES.forEach(p => {
    const fp = path.join(ROOT, p.file); if (!fs.existsSync(fp)) return;
    const src = fs.readFileSync(fp, "utf8");
    const out = src.replace(/<html lang="en"[^>]*>/, '<html lang="en"' + (theme !== "light" ? ' data-theme="' + theme + '"' : "") + ">");
    if (out !== src) fs.writeFileSync(fp, out);
  });
}

/* ---------- Asset library ---------- */
const ASSET_DIRS = ["assets/products", "assets/photos", "assets/uploads", "assets"];
fs.mkdirSync(path.join(ROOT, "assets", "uploads"), { recursive: true });
function referenceText() {
  let t = ""; [CATALOG_FILE, SITE_FILE, JOURNAL_FILE].forEach(f => { try { t += fs.readFileSync(f, "utf8"); } catch (e) { /* none */ } });
  PAGES.forEach(p => { try { t += fs.readFileSync(path.join(ROOT, p.file), "utf8"); } catch (e) { /* none */ } });
  try { t += fs.readFileSync(path.join(ROOT, "assets", "css", "gallery.css"), "utf8"); } catch (e) { /* none */ }
  return t;
}
function listAssets() {
  const ref = referenceText(), out = [];
  ASSET_DIRS.forEach(d => {
    const abs = path.join(ROOT, d); if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).forEach(f => {
      if (!/\.(webp|png|jpe?g|svg)$/i.test(f)) return;
      const st = fs.statSync(path.join(abs, f)); if (!st.isFile()) return;
      const rel = d + "/" + f;
      out.push({ path: rel, folder: d.replace("assets/", "").replace("assets", "site"), size: st.size, modified: st.mtimeMs, used: ref.includes(rel) || (d === "assets" && ref.includes(f)) });
    });
  });
  return out.sort((a, b) => b.modified - a.modified);
}
function assetPathOk(p) {
  p = String(p || "");
  if (!/^assets\/(products\/|photos\/|uploads\/)?[a-z0-9_\-.]+\.(webp|png|jpe?g|svg)$/i.test(p) || p.includes("..")) return false;
  return fs.existsSync(path.join(ROOT, p));
}
function replaceEverywhere(from, to) {
  [CATALOG_FILE, SITE_FILE, JOURNAL_FILE].forEach(f => {
    if (!fs.existsSync(f)) return; const s = fs.readFileSync(f, "utf8"); if (s.includes(from)) fs.writeFileSync(f, s.split(from).join(to));
  });
  PAGES.forEach(p => { const fp = path.join(ROOT, p.file); if (!fs.existsSync(fp)) return; const s = fs.readFileSync(fp, "utf8"); if (s.includes(from)) { backup(p.file); fs.writeFileSync(fp, s.split(from).join(to)); } });
  writePublicFiles(); writeJournalPublic();
}
function decodeImage(dataUrl) {
  const m = /^data:image\/(webp|png|jpeg);base64,([a-z0-9+/=]+)$/i.exec(String(dataUrl || ""));
  if (!m) return { error: "Image WEBP, JPG ou PNG uniquement." };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 5 * 1024 * 1024) return { error: "Image trop lourde (max 5 Mo)." };
  const sig = buf.slice(0, 12).toString("hex");
  const ok = (m[1] === "png" && sig.startsWith("89504e47")) || (m[1] === "jpeg" && sig.startsWith("ffd8ff")) || (m[1] === "webp" && sig.startsWith("52494646") && buf.slice(8, 12).toString() === "WEBP");
  if (!ok) return { error: "Fichier image invalide." };
  return { buf, ext: m[1] === "jpeg" ? "jpg" : m[1].toLowerCase() };
}

/* ---------- Deployment ---------- */
function dirSize(d) { let n = 0; try { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; }); } catch (e) { /* none */ } return n; }
function listBackups() {
  return fs.readdirSync(BACKUPS).filter(f => /\.html$/.test(f) && !f.includes("before-editor")).map(f => {
    const st = fs.statSync(path.join(BACKUPS, f));
    return { file: f, page: f.replace(/-(before-editor|\d{4}-.*)\.html$/, "") + ".html", time: st.mtimeMs, size: st.size };
  }).sort((a, b) => b.time - a.time);
}

async function apiCms(req, res, url) {
  const P = url.pathname, M = req.method;
  /* Journal */
  if (P === "/api/journal" && M === "GET") return send(res, 200, loadJournal());
  if (P === "/api/journal" && M === "PUT") {
    const b = await readBody(req, MAX_JSON * 4); const j = cleanJournal(b || {});
    writeJSON(JOURNAL_FILE, j); writeJournalPublic(); return send(res, 200, Object.assign({ ok: true }, j));
  }
  /* Product families */
  if (P === "/api/families" && M === "PUT") {
    const b = await readBody(req, 100_000); const cat = loadCatalog(), seen = new Set(), fams = [];
    (Array.isArray(b.families) ? b.families : []).slice(0, 50).forEach(f => { const name = cleanStr(f && f.name, 60); if (name) fams.push({ id: uniqueId(f.id || name, seen), name, blurb: cleanStr(f.blurb, 300) }); });
    if (!fams.length) return send(res, 400, { error: "Il faut au moins une famille." });
    const ids = fams.map(f => f.id), orphan = cat.products.filter(p => !ids.includes(p.family));
    if (orphan.length) return send(res, 400, { error: orphan.length + " produit(s) utilisent une famille supprimée. Déplacez-les d'abord." });
    cat.families = fams; writeJSON(CATALOG_FILE, cat); writePublicFiles();
    return send(res, 200, { ok: true, families: fams });
  }
  /* Appearance */
  if (P === "/api/appearance" && M === "PUT") {
    const b = await readBody(req, 20_000), s = loadSite();
    if ("theme" in b) s.theme = THEMES.includes(b.theme) ? b.theme : "light";
    if ("font" in b) s.font = FONTS[b.font] ? b.font : "manrope";
    if ("accent" in b) s.accent = /^#[0-9a-f]{6}$/i.test(b.accent) ? b.accent.toLowerCase() : "";
    if ("radius" in b) s.radius = Math.max(0, Math.min(24, parseInt(b.radius, 10) || 0));
    if ("showTopbar" in b) s.showTopbar = !!b.showTopbar;
    writeJSON(SITE_FILE, s); writePublicFiles(); writeAppearance();
    return send(res, 200, { ok: true, site: s });
  }
  /* Assets */
  if (P === "/api/assets" && M === "GET") return send(res, 200, listAssets());
  if (P === "/api/asset" && M === "DELETE") {
    const b = await readBody(req, 10_000);
    if (!assetPathOk(b.path)) return send(res, 400, { error: "Fichier introuvable." });
    if (referenceText().includes(b.path)) return send(res, 400, { error: "Cette image est utilisée sur le site. Remplacez-la d'abord." });
    fs.unlinkSync(path.join(ROOT, b.path)); return send(res, 200, { ok: true });
  }
  if (P === "/api/asset/optimize" && M === "POST") {
    const b = await readBody(req, MAX_UPLOAD);
    if (!assetPathOk(b.path)) return send(res, 400, { error: "Fichier introuvable." });
    const img = decodeImage(b.dataUrl); if (img.error) return send(res, 400, { error: img.error });
    const oldAbs = path.join(ROOT, b.path), oldSize = fs.statSync(oldAbs).size;
    if (img.buf.length >= oldSize) return send(res, 200, { ok: true, skipped: true, path: b.path, before: oldSize, after: oldSize });
    let base = b.path.replace(/\.[a-z]+$/i, ""), np = base + "." + img.ext;
    if (np === b.path) { fs.writeFileSync(oldAbs, img.buf); return send(res, 200, { ok: true, path: np, before: oldSize, after: img.buf.length }); }
    let k = 2; while (fs.existsSync(path.join(ROOT, np))) np = base + "-" + k++ + "." + img.ext;
    fs.writeFileSync(path.join(ROOT, np), img.buf);
    replaceEverywhere(b.path, np);
    if (!referenceText().includes(b.path)) { try { fs.unlinkSync(oldAbs); } catch (e) { /* ignore */ } }
    return send(res, 200, { ok: true, path: np, before: oldSize, after: img.buf.length });
  }
  /* Deployment */
  if (P === "/api/status" && M === "GET") {
    const cat = loadCatalog(), j = loadJournal(), assets = listAssets();
    return send(res, 200, {
      node: process.version, uptime: Math.round(process.uptime()), port: PORT, startedAt: Date.now() - process.uptime() * 1000,
      products: cat.products.length, families: cat.families.length, posts: j.posts.length, published: j.posts.filter(p => p.status === "published").length,
      authors: j.authors.length, categories: j.categories.length, pages: PAGES.length,
      assets: assets.length, unusedAssets: assets.filter(a => !a.used).length, heavyAssets: assets.filter(a => a.size > 400 * 1024).length,
      assetsBytes: dirSize(path.join(ROOT, "assets")), dataBytes: dirSize(DATA), backups: listBackups().slice(0, 40),
      firstPassword: fs.existsSync(path.join(DATA, "PREMIER-MOT-DE-PASSE.txt"))
    });
  }
  if (P === "/api/export" && M === "GET") {
    const body = JSON.stringify(snapshot(), null, 1);
    return send(res, 200, body, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="atlas-art-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json"', "Cache-Control": "no-store" });
  }
  if (P === "/api/import-data" && M === "POST") {
    const b = await readBody(req, MAX_JSON * 8);
    if (b.catalog && Array.isArray(b.catalog.products) && Array.isArray(b.catalog.families)) {
      const fs2 = new Set(), fams = b.catalog.families.map(f => ({ id: uniqueId(f.id || f.name, fs2), name: cleanStr(f.name, 60), blurb: cleanStr(f.blurb, 300) })).filter(f => f.name);
      const seen = new Set(), ids = fams.map(f => f.id);
      writeJSON(CATALOG_FILE, { families: fams, products: b.catalog.products.map(p => cleanProduct(p || {}, seen, ids)).filter(Boolean) });
    }
    if (b.site && typeof b.site === "object") { const s = {}; SITE_KEYS.forEach(k => { if (k in b.site) s[k] = cleanStr(b.site[k], 200); }); ["theme", "font", "accent", "radius", "showTopbar"].forEach(k => { if (k in b.site) s[k] = b.site[k]; }); if (b.site.logo) s.logo = cleanImg(b.site.logo); writeJSON(SITE_FILE, Object.assign(loadSite(), s)); }
    if (b.journal && typeof b.journal === "object") writeJSON(JOURNAL_FILE, cleanJournal(b.journal));
    const restored = restoreExtras(b);
    writePublicFiles(); writeJournalPublic(); writeAppearance();
    if (restored.length) { writeI18nPublic(); applyMenus(); }
    return send(res, 200, { ok: true });
  }
  if (P === "/api/page-restore" && M === "POST") {
    const b = await readBody(req, 10_000);
    const f = String(b.backup || "");
    if (!/^[a-z]+-[a-z0-9\-]+\.html$/i.test(f) || f.includes("..") || !fs.existsSync(path.join(BACKUPS, f))) return send(res, 400, { error: "Version introuvable." });
    const page = PAGES.find(p => f.startsWith(p.file.replace(".html", "") + "-"));
    if (!page) return send(res, 400, { error: "Page inconnue." });
    backup(page.file); fs.copyFileSync(path.join(BACKUPS, f), path.join(ROOT, page.file)); writeAppearance();
    return send(res, 200, { ok: true, page: page.file });
  }
  return null;
}

/* =====================================================================
   PLUS: roles, activity labels, leads (quote requests), statistics,
   newsletter, translations, menus, SEO, users/2FA, maintenance, auto backups
   ===================================================================== */
const EDITOR_OK = /^\/api\/(catalog|journal|families|page|pages|upload|fetch-image|assets|asset|asset\/optimize|i18n|menu|me|password|2fa\/.*)$/;
const SALES_OK = /^\/api\/(leads|lead|leads\.csv|stats|subscribers|subscriber|subscribers\.csv|me|password|2fa\/.*)$/;
const READ_ALL = /^\/api\/(site|status|catalog|journal|pages)$/;
function allowed(role, p, method) {
  if (role === "admin") return true;
  if (method === "GET" && READ_ALL.test(p)) return true;
  if (role === "editor") return EDITOR_OK.test(p);
  if (role === "sales") return SALES_OK.test(p);
  return false;
}
const LABELS = {
  "/api/catalog": "Produits modifiés", "/api/journal": "Journal modifié", "/api/families": "Familles modifiées", "/api/page": "Page modifiée",
  "/api/upload": "Image téléversée", "/api/fetch-image": "Photo récupérée depuis un lien", "/api/asset": "Média supprimé", "/api/asset/optimize": "Image optimisée", "/api/site": "Paramètres du site",
  "/api/appearance": "Apparence modifiée", "/api/password": "Mot de passe changé", "/api/import-data": "Sauvegarde restaurée", "/api/page-restore": "Version de page restaurée",
  "/api/lead": "Demande de devis mise à jour", "/api/i18n": "Traductions modifiées", "/api/i18n-settings": "Langues modifiées", "/api/menu": "Menus modifiés",
  "/api/seo": "SEO modifié", "/api/users": "Utilisateur créé", "/api/user": "Utilisateur modifié", "/api/2fa/enable": "Double authentification activée",
  "/api/2fa/disable": "Double authentification désactivée", "/api/settings-plus": "Maintenance / cookies / sauvegardes", "/api/subscriber": "Abonné supprimé", "/api/auto-backup": "Sauvegarde créée", "/api/mail": "Réglages email modifiés", "/api/publish": "Site publié en ligne", "/api/mail/test": "Email de test envoyé"
};
function activityLabel(p, m) { return (m === "DELETE" ? "Suppression · " : "") + (LABELS[p] || p.replace("/api/", "")); }

/* ---------- Simple per-IP rate limiter for public endpoints ---------- */
const hits = new Map();
function rate(ip, key, max, windowMs) {
  const k = key + "|" + ip, now = Date.now(), h = hits.get(k) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; } h.n++; hits.set(k, h); return h.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h.t > 3600e3) hits.delete(k); }, 600e3).unref();
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const BOT_RE = /bot|crawl|spider|slurp|headless|preview|lighthouse|monitor|curl|wget|python/i;

/* ---------- Leads ---------- */
const LEADS_FILE = path.join(DATA, "leads.json");
const LEAD_STATUS = ["new", "progress", "quoted", "won", "lost"];
function loadLeads() { return readJSON(LEADS_FILE, []); }
function csvCell(v) { v = String(v == null ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csv(rows) { return "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n"; }

/* ---------- Statistics (cookie-free, aggregated per day) ---------- */
const STATS_FILE = path.join(DATA, "stats.json");
const stats = readJSON(STATS_FILE, { salt: crypto.randomBytes(8).toString("hex"), days: {} });
if (SERVERLESS) stats.days = {};   // per-instance counter, merged into stats.json by flushStats()
let statsDirty = false;
function today() { return new Date().toISOString().slice(0, 10); }
function dayRec(d) { return stats.days[d] || (stats.days[d] = { v: 0, u: 0, uh: [], p: {}, prod: {}, ref: {}, lang: {}, dev: {}, q: 0, nl: 0 }); }
function inc(o, k, n) { if (!k) return; k = String(k).slice(0, 120); o[k] = (o[k] || 0) + (n || 1); }
function mergeStats(into, add) {
  Object.entries(add.days || {}).forEach(([d, r]) => {
    const t = into.days[d] || (into.days[d] = { v: 0, u: 0, uh: [], p: {}, prod: {}, ref: {}, lang: {}, dev: {}, q: 0, nl: 0 });
    t.v += r.v || 0; t.q += r.q || 0; t.nl += r.nl || 0;
    (r.uh || []).forEach(h => { if (!t.uh.includes(h) && t.uh.length < 20000) t.uh.push(h); }); t.u = Math.max(t.u + 0, t.uh.length);
    ["p", "prod", "ref", "lang", "dev"].forEach(k => Object.entries(r[k] || {}).forEach(([a, n]) => { t[k][a] = (t[k][a] || 0) + n; }));
  });
}
let lastStatsFlush = Date.now();
function flushStats() {
  if (!statsDirty) return;
  if (SERVERLESS) {
    const fresh = readJSON(STATS_FILE, { salt: stats.salt, days: {} }); fresh.days = fresh.days || {};
    mergeStats(fresh, stats); const keep = Object.keys(fresh.days).sort().slice(-400), d = {}; keep.forEach(k => d[k] = fresh.days[k]); fresh.days = d;
    writeJSON(STATS_FILE, fresh); stats.days = {}; statsDirty = false; lastStatsFlush = Date.now(); return;
  }
 const keep = Object.keys(stats.days).sort().slice(-400); const d = {}; keep.forEach(k => d[k] = stats.days[k]); stats.days = d; writeJSON(STATS_FILE, stats); statsDirty = false; }
setInterval(flushStats, 60e3).unref();
process.on("SIGINT", () => { flushStats(); process.exit(0); }); process.on("SIGTERM", () => { flushStats(); process.exit(0); });
function statsReport(days) {
  if (SERVERLESS) flushStats();
  const src = SERVERLESS ? readJSON(STATS_FILE, { days: {} }) : stats;
  const out = { series: [], totals: { v: 0, u: 0, q: 0, nl: 0 }, pages: {}, products: {}, refs: {}, langs: {}, devices: {} };
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), r = (src.days || {})[d] || {};
    out.series.push({ d, v: r.v || 0, u: r.u || 0, q: r.q || 0 });
    ["v", "u", "q", "nl"].forEach(k => out.totals[k] += r[k] || 0);
    [["p", "pages"], ["prod", "products"], ["ref", "refs"], ["lang", "langs"], ["dev", "devices"]].forEach(([a, b]) => Object.entries(r[a] || {}).forEach(([k, n]) => inc(out[b], k, n)));
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const names = {}; loadCatalog().products.forEach(p => names[p.id] = p.name);
  return { series: out.series, totals: out.totals, pages: top(out.pages, 12), products: top(out.products, 12).map(([id, n]) => [names[id] || id, n]), refs: top(out.refs, 10), langs: top(out.langs, 10), devices: top(out.devices, 3) };
}

/* ---------- Newsletter ---------- */
const SUBS_FILE = path.join(DATA, "subscribers.json");
function loadSubs() { return readJSON(SUBS_FILE, []); }

/* ---------- Translations ---------- */
const I18N_FILE = path.join(DATA, "i18n.json");
const LANGS = { en: { name: "English" }, fr: { name: "Français" }, ar: { name: "العربية", rtl: true }, es: { name: "Español" } };
function loadI18n() { const j = readJSON(I18N_FILE, {}); j.on = j.on || { en: true, fr: true, ar: false, es: false }; j.def = j.def || "en"; j.texts = j.texts || {}; return j; }
/* ---------- Menus ---------- */
const MENU_FILE = path.join(DATA, "menu.json");
function loadMenu() {
  return readJSON(MENU_FILE, {
    header: [["Collection", "collection.html", "Collection", "المجموعة", "Colección"], ["Workshop", "workshop.html", "Atelier", "الورشة", "Taller"], ["Trade & private label", "trade.html", "Trade & marque privée", "التجارة والعلامة الخاصة", "Comercio y marca propia"], ["Journal", "journal.html", "Journal", "المجلة", "Diario"], ["Contact", "quote.html#contact", "Contact", "اتصل بنا", "Contacto"]]
      .map(([en, href, fr, ar, es]) => ({ href, label: { en, fr, ar, es } })),
    footer: [["The workshop", "workshop.html", "L'atelier", "الورشة", "El taller"], ["Trade & private label", "trade.html", "Trade & marque privée", "التجارة والعلامة الخاصة", "Comercio y marca propia"], ["Journal", "journal.html", "Journal", "المجلة", "Diario"], ["Questions", "trade.html#faq", "Questions", "أسئلة", "Preguntas"], ["Quote list", "quote.html", "Liste de devis", "قائمة الأسعار", "Lista de presupuesto"]]
      .map(([en, href, fr, ar, es]) => ({ href, label: { en, fr, ar, es } }))
  });
}
function cleanMenu(list) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map(it => {
    const href = safeHref(it && it.href); const label = {};
    Object.keys(LANGS).forEach(l => { const v = cleanStr(it && it.label && it.label[l], 60); if (v) label[l] = v; });
    return href && label.en ? { href, label } : null;
  }).filter(Boolean);
}
function applyMenus() {
  const m = loadMenu();
  PAGES.forEach(pg => {
    const fp = path.join(ROOT, pg.file); if (!fs.existsSync(fp)) return;
    let s = fs.readFileSync(fp, "utf8"); const o = s;
    const navLinks = m.header.map((it, i) => '<a href="' + escAttr(it.href) + '"' + (it.href.split("#")[0] === pg.file ? ' aria-current="page"' : "") + ' data-menu="h' + i + '">' + escText(it.label.en) + "</a>").join("\n      ");
    s = s.replace(/(<nav id="site-nav" aria-label="Main">)[\s\S]*?(<\/nav>)/, "$1\n      " + navLinks + "\n    $2");
    const footLinks = m.footer.map((it, i) => '<li><a href="' + escAttr(it.href) + '" data-menu="f' + i + '">' + escText(it.label.en) + "</a></li>").join("\n        ");
    if (/<ul data-menu-list="footer">/.test(s)) s = s.replace(/(<ul data-menu-list="footer">)[\s\S]*?(<\/ul>)/, "$1\n        " + footLinks + "\n      $2");
    else s = s.replace(/(<h2[^>]*>Company<\/h2>\s*)<ul>[\s\S]*?<\/ul>/, '$1<ul data-menu-list="footer">\n        ' + footLinks + "\n      </ul>");
    if (s !== o) { backup(pg.file); fs.writeFileSync(fp, s); }
  });
}
function writeI18nPublic() {
  const j = loadI18n(), m = loadMenu();
  const langs = Object.keys(LANGS).filter(l => l === j.def || j.on[l]).map(l => ({ code: l, name: LANGS[l].name, rtl: !!LANGS[l].rtl }));
  const menus = {}; langs.forEach(({ code }) => { menus[code] = { h: m.header.map(it => it.label[code] || it.label.en), f: m.footer.map(it => it.label[code] || it.label.en) }; });
  const texts = {}; langs.forEach(({ code }) => { if (j.texts[code]) texts[code] = j.texts[code]; });
  fs.writeFileSync(path.join(ROOT, "assets", "js", "i18n.js"), "/* Généré par /admin › Traductions. */\nwindow.AAM_I18N = " + JSON.stringify({ def: j.def, langs, texts, menus }) + ";\n");
}

/* ---------- SEO ---------- */
const REDIRECTS_FILE = path.join(DATA, "redirects.json");
function loadRedirects() { return readJSON(REDIRECTS_FILE, []); }

/* ---------- Automatic backups ---------- */
const AUTO_DIR = path.join(BACKUPS, "auto"); fs.mkdirSync(AUTO_DIR, { recursive: true });
function snapshot() { const pages = {}; PAGES.forEach(pg => { try { pages[pg.file] = fs.readFileSync(path.join(ROOT, pg.file), "utf8"); } catch (e) { /* missing page */ } }); return { exportedAt: new Date().toISOString(), version: 2, catalog: loadCatalog(), site: loadSite(), journal: loadJournal(), i18n: loadI18n(), menu: loadMenu(), redirects: loadRedirects(), leads: loadLeads(), subscribers: loadSubs(), pages, users: loadUsers().map(u => ({ ...u })) }; }
/* restore the parts added in backup version 2 (translations, menus, redirects, quote requests, subscribers, page texts) */
function restoreExtras(b) {
  const done = [];
  if (b.i18n && typeof b.i18n === "object" && b.i18n.texts) {
    const j = loadI18n();
    Object.keys(LANGS).forEach(l => { if (b.i18n.on && l in b.i18n.on) j.on[l] = !!b.i18n.on[l]; });
    if (LANGS[b.i18n.def]) j.def = b.i18n.def;
    Object.keys(LANGS).forEach(l => { const src = b.i18n.texts[l]; if (!src || typeof src !== "object" || l === "en") return; const t = {}; Object.entries(src).forEach(([k, v]) => { if (KEY_RE.test(k)) { const x = sanitizeInline(v); if (x.trim()) t[k] = x; } }); j.texts[l] = t; });
    if (b.i18n.srcs && typeof b.i18n.srcs === "object") j.srcs = b.i18n.srcs;
    writeJSON(I18N_FILE, j); done.push("i18n");
  }
  if (b.menu && Array.isArray(b.menu.header) && Array.isArray(b.menu.footer)) { writeJSON(MENU_FILE, { header: cleanMenu(b.menu.header), footer: cleanMenu(b.menu.footer) }); done.push("menu"); }
  if (Array.isArray(b.redirects)) { writeJSON(REDIRECTS_FILE, b.redirects.slice(0, 500).map(r => ({ from: cleanStr(r.from, 300), to: cleanStr(r.to, 500), code: r.code === 302 ? 302 : 301 })).filter(r => r.from.startsWith("/") && r.to)); done.push("redirects"); }
  if (Array.isArray(b.leads)) { writeJSON(LEADS_FILE, b.leads.slice(0, 20000).filter(l => l && l.id && l.email)); done.push("leads"); }
  if (Array.isArray(b.subscribers)) { writeJSON(SUBS_FILE, b.subscribers.slice(0, 100000).filter(x => x && EMAIL_RE.test(String(x.email || "")))); done.push("subscribers"); }
  if (b.pages && typeof b.pages === "object") {
    PAGES.forEach(pg => { const h = b.pages[pg.file]; if (typeof h === "string" && /^<!doctype html/i.test(h.trim()) && h.length < 3e6) { try { backup(pg.file); } catch (e) { /* first version */ } fs.writeFileSync(path.join(ROOT, pg.file), h); } });
    done.push("pages");
  }
  return done;
}
function autoBackup(force) {
  if (loadSite().autoBackup === false && !force) return;
  const f = path.join(AUTO_DIR, "auto-" + today() + ".json");
  if (fs.existsSync(f) && !force) return;
  writeJSON(f, snapshot());
  const all = fs.readdirSync(AUTO_DIR).filter(n => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  all.slice(0, Math.max(0, all.length - 14)).forEach(n => { try { fs.unlinkSync(path.join(AUTO_DIR, n)); } catch (e) { /* ignore */ } });
}
setInterval(() => autoBackup(false), 3600e3).unref();

/* ---------- Public endpoints ---------- */
async function apiPublic(req, res, url, ip) {
  const P = url.pathname, M = req.method, ua = String(req.headers["user-agent"] || "");
  if (P === "/api/track" && M === "POST") {
    const b = await readBody(req, 4000).catch(() => ({}));
    if (BOT_RE.test(ua) || authed(req) || !rate(ip, "track", 600, 3600e3)) return send(res, 204, "");
    const r = dayRec(today()), t = b.t;
    if (t === "view") {
      r.v++; const h = crypto.createHash("sha256").update(stats.salt + today() + ip + ua).digest("hex").slice(0, 14);
      if (!r.uh.includes(h)) { if (r.uh.length < 20000) r.uh.push(h); r.u++; }
      inc(r.p, cleanStr(b.path, 100).replace(/[?#].*$/, "") || "/");
      let ref = "direct"; try { if (b.ref) { const hst = new URL(String(b.ref)).host; if (hst && hst !== req.headers.host) ref = hst.replace(/^www\./, ""); } } catch (e) { /* bad ref */ }
      inc(r.ref, ref); inc(r.lang, cleanStr(String(req.headers["accept-language"] || "?").split(",")[0], 12)); inc(r.dev, /mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Ordinateur");
    } else if (t === "product") inc(r.prod, cleanStr(b.id, 120));
    statsDirty = true; return send(res, 204, "");
  }
  if (P === "/api/leads" && M === "POST") {
    if (!rate(ip, "lead", 12, 3600e3)) return send(res, 429, { error: "Too many requests. Please try again later." });
    const b = await readBody(req, 60_000);
    if (b.website) return send(res, 200, { ok: true });                       // honeypot: silently drop bots
    const email = cleanStr(b.email, 200);
    if (!cleanStr(b.name, 100) || !EMAIL_RE.test(email)) return send(res, 400, { error: "Name and a valid email are required." });
    const names = {}; loadCatalog().products.forEach(p => names[p.id] = p);
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 300).map(it => {
      const p = names[it && it.id]; if (!p) return null;
      const vk = cleanStr(it.v, 60), x = vk && (p.variants || []).find(v => (v.ref || v.size) === vk);
      const o = { id: p.id, name: p.name, finish: p.finish, qty: Math.max(0, Math.min(999999, parseInt(it.qty, 10) || 0)), note: cleanStr(it.note, 140) };
      if (x) { if (x.size) o.size = x.size; if (x.ref) o.ref = x.ref; }
      return o;
    }).filter(Boolean);
    const lead = { id: "L" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex"), date: Date.now(), status: "new", name: cleanStr(b.name, 100), company: cleanStr(b.company, 120), country: cleanStr(b.country, 80), email, phone: cleanStr(b.phone, 40), type: cleanStr(b.type, 60), message: cleanStr(b.message, 3000), via: b.via === "whatsapp" ? "whatsapp" : "email", lang: cleanStr(b.lang, 5), items, notes: [] };
    const leads = loadLeads();
    // same person, same pieces, within 10 minutes (double click, email + WhatsApp) -> keep one request
    const sig = JSON.stringify(items.map(i => [i.id, i.ref || i.size || "", i.qty]));
    const dup = leads.find(l => l.email.toLowerCase() === email.toLowerCase() && Date.now() - l.date < 10 * 60e3 && JSON.stringify(l.items.map(i => [i.id, i.ref || i.size || "", i.qty])) === sig);
    if (dup) { if (lead.via !== dup.via) { dup.via2 = lead.via; writeJSON(LEADS_FILE, leads); } return send(res, 200, { ok: true, id: dup.id, duplicate: true }); }
    leads.unshift(lead); writeJSON(LEADS_FILE, leads.slice(0, 20000)); notifyLead(lead);
    dayRec(today()).q++; statsDirty = true;
    return send(res, 200, { ok: true, id: lead.id });
  }
  if (P === "/api/unsubscribe" && M === "GET") {
    const email = cleanStr(url.searchParams.get("e"), 200).toLowerCase(), tk = String(url.searchParams.get("t") || "");
    const ok = EMAIL_RE.test(email) && tk.length === 24 && crypto.timingSafeEqual(Buffer.from(tk), Buffer.from(unsubToken(email)));
    if (ok) { const subs = loadSubs(); const rest = subs.filter(x => x.email !== email); if (rest.length !== subs.length) writeJSON(SUBS_FILE, rest); }
    const msg = ok ? "You are unsubscribed. You will not receive our news anymore." : "This unsubscribe link is not valid. Write to us and we will remove your address.";
    return send(res, ok ? 200 : 400, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Newsletter — Atlas Art Minerals</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3ec;color:#1a1918;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}img{height:48px;margin-bottom:24px}a{color:#8a6b2e}</style></head><body><main><img src="/assets/brand/atlas-art-logo-horizontal.svg" alt="Atlas Art Minerals"><h1 style="font-size:22px">' + escText(msg) + '</h1><p><a href="/">Back to the website</a></p></main></body></html>', { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  }
  if (P === "/api/subscribe" && M === "POST") {
    if (!rate(ip, "sub", 8, 3600e3)) return send(res, 429, { error: "Too many requests." });
    const b = await readBody(req, 4000);
    if (b.website) return send(res, 200, { ok: true });
    const email = cleanStr(b.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: "Please enter a valid email." });
    const subs = loadSubs();
    if (!subs.some(s => s.email === email)) {
      subs.unshift({ email, date: Date.now(), lang: cleanStr(b.lang, 5), source: cleanStr(b.source, 60) }); writeJSON(SUBS_FILE, subs); dayRec(today()).nl++; statsDirty = true;
      const m = loadMail();
      if (mailReady() && m.welcome !== false) smtpSend(m, { to: [email], subject: "Atlas Art Minerals — you are subscribed", headers: ["List-Unsubscribe: <" + unsubLink(req, email) + ">"],
        text: "Thank you for subscribing to news from the Atlas Art Minerals workshop in Agadir.\nWe write a few times a year: new selenite designs, trade fairs and workshop news.\n\nTo unsubscribe at any time: " + unsubLink(req, email) }).then(logMailOk, logMailErr); }
    return send(res, 200, { ok: true });
  }
  return null;
}

/* ---------- Authenticated endpoints ---------- */
async function apiPlus(req, res, url, user) {
  const P = url.pathname, M = req.method;
  if (P === "/api/me" && M === "GET") return send(res, 200, publicUser(user));
  /* Leads */
  if (P === "/api/leads" && M === "GET") return send(res, 200, loadLeads());
  if (P === "/api/lead" && M === "PUT") {
    const b = await readBody(req, 20_000), leads = loadLeads(), l = leads.find(x => x.id === b.id);
    if (!l) return send(res, 404, { error: "Demande introuvable." });
    if (LEAD_STATUS.includes(b.status)) l.status = b.status;
    if (b.note) l.notes.unshift({ t: Date.now(), by: user.name, text: cleanStr(b.note, 2000) });
    writeJSON(LEADS_FILE, leads); return send(res, 200, { ok: true, lead: l });
  }
  if (P === "/api/lead" && M === "DELETE") {
    const b = await readBody(req, 2000); writeJSON(LEADS_FILE, loadLeads().filter(x => x.id !== b.id)); return send(res, 200, { ok: true });
  }
  if (P === "/api/leads.csv" && M === "GET") {
    const st = { new: "Nouvelle", progress: "En cours", quoted: "Devis envoyé", won: "Gagnée", lost: "Perdue" };
    const rows = [["Date", "Statut", "Nom", "Société", "Pays", "Email", "Téléphone", "Profil", "Envoyé par", "Pièces", "Message", "Notes"]];
    loadLeads().forEach(l => rows.push([new Date(l.date).toISOString().slice(0, 16).replace("T", " "), st[l.status] || l.status, l.name, l.company, l.country, l.email, l.phone, l.type, l.via, l.items.map(i => i.name + " ×" + i.qty + (i.note ? " (" + i.note + ")" : "")).join(" | "), l.message, l.notes.map(n => n.text).join(" | ")]));
    return send(res, 200, csv(rows), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="demandes-devis-' + today() + '.csv"', "Cache-Control": "no-store" });
  }
  /* Statistics */
  if (P === "/api/stats" && M === "GET") { flushStats(); return send(res, 200, statsReport(Math.max(7, Math.min(365, parseInt(url.searchParams.get("days"), 10) || 30)))); }
  /* Subscribers */
  if (P === "/api/subscribers" && M === "GET") return send(res, 200, loadSubs());
  if (P === "/api/subscriber" && M === "DELETE") { const b = await readBody(req, 2000); writeJSON(SUBS_FILE, loadSubs().filter(s => s.email !== b.email)); return send(res, 200, { ok: true }); }
  /* Publish: rebuild the static site (deploy/) and push it to GitHub -> Vercel redeploys automatically */
  if (SERVERLESS && P === "/api/publish" && M === "GET") return send(res, 200, { ready: true, serverless: true, remote: "https://github.com/" + require("./lib/vfs").repos().public, last: "", siteUrl: loadSite().siteUrl || "" });
  if (SERVERLESS && P === "/api/publish" && M === "POST") { try { await require("./lib/vfs").deployNow(); return send(res, 200, { ok: true }); } catch (e) { return send(res, 500, { error: "Publication impossible : " + e.message }); } }
  if (P === "/api/publish" && M === "GET") {
    const dir = path.join(ROOT, "deploy"), cp = require("child_process");
    if (!fs.existsSync(path.join(dir, ".git"))) return send(res, 200, { ready: false });
    let remote = ""; try { remote = cp.execFileSync("git", ["remote", "get-url", "origin"], { cwd: dir, encoding: "utf8" }).trim(); } catch (e) { /* no remote */ }
    let last = ""; try { last = cp.execFileSync("git", ["log", "-1", "--format=%cI"], { cwd: dir, encoding: "utf8" }).trim(); } catch (e) { /* none */ }
    return send(res, 200, { ready: !!remote, remote: remote.replace(/\/\/[^@/]+@/, "//"), last, siteUrl: loadSite().siteUrl || "" });
  }
  if (P === "/api/publish" && M === "POST") {
    const dir = path.join(ROOT, "deploy"), cp = require("child_process");
    const run = (cmd, args, cwd) => new Promise((ok, ko) => cp.execFile(cmd, args, { cwd, timeout: 180000, env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", PORT: String(PORT) }) }, (e, out, err) => e ? ko(new Error((err || out || e.message).toString().trim().split("\n").slice(-3).join(" "))) : ok(String(out))));
    try {
      const out = await run(process.execPath, [path.join(ROOT, "export-static.js")], ROOT);
      await run("git", ["add", "-A"], dir);
      const changed = (await run("git", ["status", "--porcelain"], dir)).trim();
      if (!changed) return send(res, 200, { ok: true, nothing: true, info: out.trim() });
      await run("git", ["commit", "-qm", "Publication " + new Date().toISOString().slice(0, 16).replace("T", " ")], dir);
      await run("git", ["push", "-q", "origin", "main"], dir);
      return send(res, 200, { ok: true, info: out.trim(), files: changed.split("\n").length });
    } catch (e) { return send(res, 500, { error: "Publication impossible : " + e.message }); }
  }
  if (P === "/api/mail" && M === "GET") { const m = loadMail(); return send(res, 200, { host: m.host || "", port: m.port || 587, user: m.user || "", hasPass: !!m.pass, from: m.from || "", fromName: m.fromName || "Atlas Art Minerals", to: m.to || "", notifyLeads: m.notifyLeads !== false, welcome: m.welcome !== false, ready: mailReady(), last: mailLast }); }
  if (P === "/api/mail" && M === "PUT") {
    const b = await readBody(req, 5000), m = loadMail();
    ["host", "user", "from", "fromName", "to"].forEach(k => { if (k in b) m[k] = cleanStr(b[k], 200); });
    if ("port" in b) m.port = Math.min(65535, Math.max(1, Number(b.port) || 587));
    if (b.pass) m.pass = String(b.pass).slice(0, 300);
    if (b.clearPass) delete m.pass;
    ["notifyLeads", "welcome"].forEach(k => { if (k in b) m[k] = !!b[k]; });
    if (m.from && !EMAIL_RE.test(m.from)) return send(res, 400, { error: "Adresse d'expédition invalide." });
    if (m.to && !String(m.to).split(/[,;\s]+/).filter(Boolean).every(e => EMAIL_RE.test(e))) return send(res, 400, { error: "Adresse(s) de réception invalide(s)." });
    writeJSON(MAIL_FILE, m); return send(res, 200, { ok: true, ready: mailReady() });
  }
  if (P === "/api/mail/test" && M === "POST") {
    if (!mailReady()) return send(res, 400, { error: "Complétez d'abord serveur, expéditeur et destinataire." });
    const m = loadMail();
    try { await smtpSend(m, { to: String(m.to).split(/[,;\s]+/).filter(Boolean).slice(0, 5), subject: "Test — alertes du site Atlas Art Minerals", text: "Cet email confirme que les alertes de demandes de devis fonctionnent." }); logMailOk(); return send(res, 200, { ok: true }); }
    catch (e) { logMailErr(e); return send(res, 400, { error: e.message }); }
  }
  if (P === "/api/subscribers.csv" && M === "GET") {
    const rows = [["Email", "Date", "Langue", "Source", "Lien de désinscription (à mettre dans chaque envoi)"]]; loadSubs().forEach(s => rows.push([s.email, new Date(s.date).toISOString().slice(0, 10), s.lang, s.source, unsubLink(req, s.email)]));
    return send(res, 200, csv(rows), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="abonnes-' + today() + '.csv"', "Cache-Control": "no-store" });
  }
  /* Translations */
  if (P === "/api/i18n" && M === "GET") return send(res, 200, Object.assign(loadI18n(), { available: LANGS }));
  if (P === "/api/i18n" && M === "PUT") {
    const b = await readBody(req, MAX_JSON), j = loadI18n();
    if (!LANGS[b.lang] || b.lang === "en") return send(res, 400, { error: "Langue invalide." });
    const t = j.texts[b.lang] = j.texts[b.lang] || {};
    const srcs = j.srcs = j.srcs || {}; const sl = srcs[b.lang] = srcs[b.lang] || {};
    Object.entries(b.texts || {}).forEach(([k, v]) => { if (!KEY_RE.test(k)) return; const s = sanitizeInline(v); if (s.trim()) { t[k] = s; if (b.srcs && /^[a-f0-9]{8,16}$/.test(String(b.srcs[k] || ""))) sl[k] = String(b.srcs[k]); } else { delete t[k]; delete sl[k]; } });
    Object.entries(b.srcs || {}).forEach(([k, h]) => { if (KEY_RE.test(k) && t[k] && /^[a-f0-9]{8,16}$/.test(String(h))) sl[k] = String(h); });
    writeJSON(I18N_FILE, j); writeI18nPublic(); return send(res, 200, { ok: true, count: Object.keys(t).length });
  }
  if (P === "/api/i18n-settings" && M === "PUT") {
    const b = await readBody(req, 5000), j = loadI18n();
    Object.keys(LANGS).forEach(l => { if (b.on && l in b.on) j.on[l] = !!b.on[l]; });
    if (LANGS[b.def]) j.def = b.def; j.on[j.def] = true;
    writeJSON(I18N_FILE, j); writeI18nPublic(); return send(res, 200, { ok: true, i18n: j });
  }
  /* Menus */
  if (P === "/api/menu" && M === "GET") return send(res, 200, loadMenu());
  if (P === "/api/menu" && M === "PUT") {
    const b = await readBody(req, 50_000), menu = { header: cleanMenu(b.header), footer: cleanMenu(b.footer) };
    if (!menu.header.length) return send(res, 400, { error: "Le menu principal doit contenir au moins un lien." });
    writeJSON(MENU_FILE, menu); applyMenus(); writeI18nPublic(); return send(res, 200, { ok: true, menu });
  }
  /* SEO */
  if (P === "/api/seo" && M === "GET") { const s = loadSite(); return send(res, 200, { siteUrl: s.siteUrl || "", ogImage: s.ogImage || "", googleVerification: s.googleVerification || "", redirects: loadRedirects() }); }
  if (P === "/api/seo" && M === "PUT") {
    const b = await readBody(req, 100_000), s = loadSite();
    if ("siteUrl" in b) s.siteUrl = /^https?:\/\/[a-z0-9.\-]+(:\d+)?$/i.test(String(b.siteUrl).replace(/\/+$/, "")) ? String(b.siteUrl).replace(/\/+$/, "") : "";
    if ("ogImage" in b) s.ogImage = cleanImg(b.ogImage);
    if ("googleVerification" in b) s.googleVerification = cleanStr(b.googleVerification, 100).replace(/[^a-zA-Z0-9_\-]/g, "");
    writeJSON(SITE_FILE, s); writePublicFiles();
    if (Array.isArray(b.redirects)) writeJSON(REDIRECTS_FILE, b.redirects.slice(0, 500).map(r => {
      const from = cleanStr(r && r.from, 200), to = safeHref(r && r.to) || (/^\/[a-z0-9_\-\/.]*$/i.test(r && r.to) ? r.to : null);
      return /^\/[^\s"<>]*$/.test(from) && to ? { from, to, code: r.code === 302 ? 302 : 301 } : null;
    }).filter(Boolean));
    return send(res, 200, { ok: true });
  }
  /* Site settings: maintenance, cookies, auto backup */
  if (P === "/api/settings-plus" && M === "PUT") {
    const b = await readBody(req, 10_000), s = loadSite();
    if ("maintenance" in b) s.maintenance = !!b.maintenance;
    if ("maintenanceMsg" in b) s.maintenanceMsg = cleanStr(b.maintenanceMsg, 300);
    if ("cookieBanner" in b) s.cookieBanner = !!b.cookieBanner;
    if ("cookieText" in b) s.cookieText = cleanStr(b.cookieText, 300);
    if ("autoBackup" in b) s.autoBackup = !!b.autoBackup;
    writeJSON(SITE_FILE, s); writePublicFiles(); return send(res, 200, { ok: true, site: s });
  }
  if (P === "/api/auto-backups" && M === "GET") {
    return send(res, 200, fs.readdirSync(AUTO_DIR).filter(n => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse().map(n => ({ file: n, size: fs.statSync(path.join(AUTO_DIR, n)).size })));
  }
  if (P === "/api/auto-backup" && M === "GET") {
    const f = String(url.searchParams.get("f") || "");
    if (!/^auto-\d{4}-\d{2}-\d{2}\.json$/.test(f) || !fs.existsSync(path.join(AUTO_DIR, f))) return send(res, 404, { error: "Sauvegarde introuvable." });
    return send(res, 200, fs.readFileSync(path.join(AUTO_DIR, f)), { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="atlas-art-' + f + '"', "Cache-Control": "no-store" });
  }
  if (P === "/api/auto-backup" && M === "POST") { autoBackup(true); return send(res, 200, { ok: true }); }
  /* Users */
  if (P === "/api/users" && M === "GET") return send(res, 200, loadUsers().map(publicUser));
  if (P === "/api/users" && M === "POST") {
    const b = await readBody(req, 10_000), users = loadUsers();
    const username = cleanStr(b.username, 40).toLowerCase().replace(/[^a-z0-9._\-@]/g, "");
    if (!username || users.some(u => u.username === username)) return send(res, 400, { error: "Identifiant vide ou déjà utilisé." });
    if (!ROLES[b.role]) return send(res, 400, { error: "Rôle invalide." });
    if (String(b.password || "").length < 10) return send(res, 400, { error: "Mot de passe : 10 caractères minimum." });
    const salt = crypto.randomBytes(16).toString("hex");
    users.push({ id: "u" + crypto.randomBytes(5).toString("hex"), username, name: cleanStr(b.name, 80) || username, role: b.role, salt, hash: hashPw(b.password, salt), totp: "", created: Date.now() });
    saveUsers(users); return send(res, 200, { ok: true });
  }
  if (P === "/api/user" && M === "PUT") {
    const b = await readBody(req, 10_000), users = loadUsers(), u = users.find(x => x.id === b.id);
    if (!u) return send(res, 404, { error: "Utilisateur introuvable." });
    if (b.name) u.name = cleanStr(b.name, 80);
    if (b.role && ROLES[b.role]) {
      if (u.role === "admin" && b.role !== "admin" && users.filter(x => x.role === "admin").length < 2) return send(res, 400, { error: "Il faut garder au moins un administrateur." });
      u.role = b.role;
    }
    if (b.password) { if (String(b.password).length < 10) return send(res, 400, { error: "Mot de passe : 10 caractères minimum." }); if (SERVERLESS) u.sv = (u.sv || 0) + 1; u.salt = crypto.randomBytes(16).toString("hex"); u.hash = hashPw(b.password, u.salt); for (const [k, s] of sessions) if (s.uid === u.id) sessions.delete(k); }
    if (b.reset2fa) u.totp = "";
    saveUsers(users); return send(res, 200, { ok: true });
  }
  if (P === "/api/user" && M === "DELETE") {
    const b = await readBody(req, 2000), users = loadUsers(), u = users.find(x => x.id === b.id);
    if (!u) return send(res, 404, { error: "Utilisateur introuvable." });
    if (u.id === user.id) return send(res, 400, { error: "Vous ne pouvez pas supprimer votre propre compte." });
    if (u.role === "admin" && users.filter(x => x.role === "admin").length < 2) return send(res, 400, { error: "Il faut garder au moins un administrateur." });
    saveUsers(users.filter(x => x.id !== u.id)); for (const [k, s] of sessions) if (s.uid === u.id) sessions.delete(k);
    return send(res, 200, { ok: true });
  }
  /* 2FA for the current user */
  if (P === "/api/2fa/setup" && M === "POST") {
    const users = loadUsers(), me = users.find(u => u.id === user.id); me.totpPending = b32encode(crypto.randomBytes(20)); saveUsers(users);
    return send(res, 200, { secret: me.totpPending, uri: "otpauth://totp/" + encodeURIComponent("Atlas Art:" + me.username) + "?secret=" + me.totpPending + "&issuer=" + encodeURIComponent("Atlas Art Minerals") });
  }
  if (P === "/api/2fa/enable" && M === "POST") {
    const b = await readBody(req, 2000), users = loadUsers(), me = users.find(u => u.id === user.id);
    if (!me.totpPending || !totpOk(me.totpPending, b.code)) return send(res, 400, { error: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." });
    me.totp = me.totpPending; delete me.totpPending; saveUsers(users); return send(res, 200, { ok: true });
  }
  if (P === "/api/2fa/disable" && M === "POST") {
    const b = await readBody(req, 2000), users = loadUsers(), me = users.find(u => u.id === user.id);
    if (!pwOk(me, b.password || "")) return send(res, 401, { error: "Mot de passe incorrect." });
    me.totp = ""; saveUsers(users); return send(res, 200, { ok: true });
  }
  /* Activity */
  if (P === "/api/activity" && M === "GET") return send(res, 200, readJSON(ACTIVITY_FILE, []).slice(0, 500));
  return null;
}

/* ---------- Public HTML helpers: SEO tags, maintenance, sitemap, robots ---------- */
function productFor(url) { const id = url && url.searchParams.get("p"); return id ? loadCatalog().products.find(x => x.id === id) || null : null; }
function seoInject(html, reqPath, url) {
  const s = loadSite(), base = s.siteUrl || "";
  let title = (/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || "Atlas Art Minerals";
  let desc = (/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || "";
  let canon = reqPath === "/index.html" ? "/" : reqPath, ogImg = s.ogImage || "", ld = "";
  const prod = reqPath === "/product.html" ? productFor(url) : null;
  if (prod) {
    const fam = (loadCatalog().families.find(f => f.id === prod.family) || {}).name || "";
    title = escText(prod.name) + " — Atlas Art Minerals";
    desc = escAttr((prod.description || (prod.name + ", " + prod.finish + ". Hand-carved in Agadir, Morocco. Trade prices, minimums and private label on request.")).slice(0, 300));
    canon = "/product.html?p=" + encodeURIComponent(prod.id);
    if (prod.img && !/^https?:/i.test(prod.img)) ogImg = prod.img;
    html = html.replace(/<title>[\s\S]*?<\/title>/, "<title>" + title + "</title>").replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + desc + '">');
    html = html.replace('<h1 class="display-l" id="pd-name"></h1>', '<h1 class="display-l" id="pd-name">' + escText(prod.name) + "</h1>").replace('<p class="eyebrow util" id="pd-eyebrow"></p>', '<p class="eyebrow util" id="pd-eyebrow">' + escText(fam) + "</p>");
    const j = { "@context": "https://schema.org", "@type": "Product", name: prod.name, description: prod.description || undefined, sku: prod.ref || undefined, material: prod.finish, category: fam || undefined,
      brand: { "@type": "Brand", name: "Atlas Art Minerals" }, image: [prod.img].concat(prod.images || []).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).map(i => /^https?:/i.test(i) ? i : (base || "") + "/" + i) };
    ld = '<script type="application/ld+json">' + JSON.stringify(j).replace(/</g, "\\u003c") + "</script>\n";
  }
  let tags = ld;
  if (base) tags += '<link rel="canonical" href="' + escAttr(base + canon) + '">\n';
  tags += '<meta property="og:type" content="' + (prod ? "product" : "website") + '">\n<meta property="og:site_name" content="Atlas Art Minerals">\n<meta property="og:title" content="' + escAttr(title.replace(/&amp;/g, "&")) + '">\n<meta property="og:description" content="' + desc + '">\n';
  if (base && (prod || reqPath !== "/product.html")) tags += '<meta property="og:url" content="' + escAttr(base + canon) + '">\n';
  if (ogImg) tags += '<meta property="og:image" content="' + escAttr((base || "") + "/" + ogImg) + '">\n<meta name="twitter:card" content="summary_large_image">\n';
  if (reqPath === "/product.html" && !prod) tags += '<meta name="robots" content="noindex">\n';
  if (s.googleVerification) tags += '<meta name="google-site-verification" content="' + escAttr(s.googleVerification) + '">\n';
  html = html.replace(/<meta property="og:[^>]*>\n?/g, "");
  return html.replace("</head>", tags + "</head>");
}
function maintenancePage() {
  const s = loadSite();
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Atlas Art Minerals — back soon</title><link rel="icon" href="/assets/brand/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3ec;color:#1a1918;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}img{height:54px;margin-bottom:28px}h1{font-size:26px;margin:0 0 10px}p{color:#6b6661;max-width:46ch;margin:0 auto 6px}a{color:#8a6b2e}</style></head><body><main><img src="/assets/brand/atlas-art-logo-horizontal.svg" alt="Atlas Art Minerals"><h1>We will be back shortly.</h1><p>' + escText(s.maintenanceMsg || "Our website is being updated. For trade enquiries, contact us directly.") + '</p><p><a href="mailto:' + escAttr(s.email || "info@atlasart.com") + '">' + escText(s.email || "info@atlasart.com") + "</a> · " + escText(s.phone || "") + "</p></main></body></html>";
}
function sitemap() {
  const base = loadSite().siteUrl || "http://localhost:" + PORT;
  const urls = PAGES.filter(p => !["article.html", "404.html", "product.html"].includes(p.file)).map(p => [base + "/" + (p.file === "index.html" ? "" : p.file), fs.statSync(path.join(ROOT, p.file)).mtime]);
  loadJournal().posts.filter(p => p.status === "published").forEach(p => urls.push([base + "/article.html?a=" + encodeURIComponent(p.id), new Date(p.date + "T12:00:00Z")]));
  const catTime = fs.statSync(CATALOG_FILE).mtime;
  loadCatalog().products.forEach(p => urls.push([base + "/product.html?p=" + encodeURIComponent(p.id), catTime]));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(([u, d]) => "  <url><loc>" + escText(u) + "</loc><lastmod>" + new Date(d).toISOString().slice(0, 10) + "</lastmod></url>").join("\n") + "\n</urlset>\n";
}

/* ---------- Static files ---------- */
const BLOCKED = /^\/(data|node_modules)(\/|$)|^\/server\.js$|\/\./;
function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, "Bad request"); }
  if (p === "/admin" ) return send(res, 301, "", { Location: "/admin/" });
  if (p === "/robots.txt") { const base = loadSite().siteUrl || ""; return send(res, 200, "User-agent: *\nDisallow: /admin/\nDisallow: /api/\nAllow: /\n" + (base ? "Sitemap: " + base + "/sitemap.xml\n" : ""), { "Content-Type": "text/plain; charset=utf-8" }); }
  if (p === "/sitemap.xml") return send(res, 200, sitemap(), { "Content-Type": "application/xml; charset=utf-8" });
  const red = loadRedirects().find(r => r.from === p || r.from === p.replace(/\/$/, ""));
  if (red) return send(res, red.code, "", { Location: red.to });
  if (BLOCKED.test(p)) return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 404, "Not found");
  const isAdmin = p.startsWith("/admin/");
  const sendHtml = (code, fp, reqPath) => {
    let html = fs.readFileSync(fp, "utf8"); if (!isAdmin) html = seoInject(html, reqPath, url);
    const h = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": isAdmin ? "no-store" : "no-cache", "X-Content-Type-Options": "nosniff" };
    if (isAdmin) h["X-Frame-Options"] = "DENY"; else h["X-Frame-Options"] = "SAMEORIGIN";
    res.writeHead(code, h); res.end(req.method === "HEAD" ? undefined : html);
  };
  const wantsHtml = /\.html$/i.test(p);
  if (wantsHtml && !isAdmin && loadSite().maintenance && !authed(req)) return send(res, 503, maintenancePage(), { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3600", "Cache-Control": "no-store" });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      const nf = path.join(ROOT, "404.html");
      if (fs.existsSync(nf) && !isAdmin && !/\.(js|css|png|jpe?g|webp|svg|ico|json|woff2?)$/i.test(p)) return sendHtml(404, nf, "/404.html");
      return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === ".html") return sendHtml(p === "/product.html" && !productFor(url) && !authed(req) ? 404 : 200, file, p);
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff" };
    headers["Cache-Control"] = /\.(js|css|json)$/.test(ext) ? "no-cache" : "public, max-age=86400";
    if (isAdmin) headers["Cache-Control"] = "no-store";
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Boot ---------- */
if (!fs.existsSync(CATALOG_FILE) || !fs.existsSync(SITE_FILE)) console.warn("data/catalog.json ou data/site.json manquant.");
else writePublicFiles();
if (!fs.existsSync(JOURNAL_FILE)) writeJSON(JOURNAL_FILE, { posts: [], authors: [], categories: [] });
writeJournalPublic(); writeAppearance();
loadUsers();
if (!fs.existsSync(MENU_FILE)) { writeJSON(MENU_FILE, loadMenu()); applyMenus(); }
writeI18nPublic(); autoBackup(false);

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    serveStatic(req, res, url);
  } catch (e) {
    send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? "Fichier trop lourd." : e.code === 400 ? "Requête invalide." : "Erreur serveur." });
    if (!e.code) console.error(e);
  }
}
module.exports = handle;
module.exports.afterRequest = () => { if (statsDirty && (Date.now() - lastStatsFlush > 120e3)) flushStats(); };
if (!SERVERLESS) http.createServer(handle).listen(PORT, () => console.log("Atlas Art Minerals : http://localhost:" + PORT + "  ·  admin : http://localhost:" + PORT + "/admin/"));
