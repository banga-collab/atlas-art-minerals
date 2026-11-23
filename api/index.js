/* Vercel entry point: every page and every /api/ call goes through server.js.
   Needs these environment variables in Vercel (Project › Settings › Environment Variables):
     GH_TOKEN      a GitHub fine-grained token with "Contents: read and write" on the two repositories below
     PUBLIC_REPO   owner/name of this site's repository           (e.g. banga-collab/atlas-art-minerals)
     PRIVATE_REPO  owner/name of the private data repository      (e.g. banga-collab/atlas-art-data)
   Everything the admin saves is committed to GitHub; see lib/vfs.js. */
"use strict";
const path = require("path");
const vfs = require("../lib/vfs");
const ROOT = path.join(__dirname, "..");
vfs.install(ROOT);

let app = null;
async function getApp() {
  if (!app) { await vfs.refresh(true); app = require("../server.js"); await vfs.flush("Démarrage du serveur"); }
  return app;
}

module.exports = async (req, res) => {
  if (!vfs.enabled) { res.statusCode = 500; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Configuration manquante : GH_TOKEN, PUBLIC_REPO et PRIVATE_REPO doivent être définis dans Vercel."); }
  try { await vfs.refresh(); } catch (e) { console.error("[vfs] refresh", e.message); }
  let handle;
  try { handle = await getApp(); } catch (e) {
    console.error("[vfs] start", e.message);
    res.statusCode = 503; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Retry-After", "60");
    const hint = e.status === 404 || e.status === 403 || e.status === 401
      ? "La clé GitHub (GH_TOKEN) n'a pas accès aux dépôts. Dans GitHub › Settings › Developer settings › Fine-grained tokens, donnez-lui l'accès à " + vfs.repos().public + " et " + vfs.repos().private + " avec « Contents : Read and write »."
      : "Connexion à GitHub impossible pour le moment. Réessayez dans une minute.";
    return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas Art Minerals</title><body style="font:16px/1.6 system-ui;background:#f7f3ec;color:#1a1918;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px"><main style="max-width:560px"><h1 style="font-size:22px">Le site redémarre…</h1><p>' + hint.replace(/</g, "&lt;") + "</p></main></body>");
  }
  const writes = req.method !== "GET" && req.method !== "HEAD";
  // hold the response of a save until GitHub has the commit, so an error can still be reported
  const orig = { writeHead: res.writeHead.bind(res), write: res.write.bind(res), end: res.end.bind(res), setHeader: res.setHeader.bind(res) };
  let head = null; const chunks = [];
  if (writes) { res.writeHead = (...a) => { head = a; return res; }; res.write = c => { chunks.push(Buffer.from(c)); return true; }; }
  res.end = (c, ...rest) => {
    if (c && typeof c !== "function") chunks.push(Buffer.from(c));
    try { handle.afterRequest(); } catch (e) { /* stats */ }
    if (writes) try { res.emit("aam-before-save", head ? head[0] : 200); } catch (e) { /* activity log */ }
    const label = writes ? (req.url.split("?")[0].replace("/api/", "Admin : ")) : "Statistiques";
    vfs.flush(label).then(() => true, e => { console.error("[vfs] flush", e.message); return e; }).then(r => {
      if (!writes) return orig.end(...(c !== undefined ? [c, ...rest] : []));
      if (r !== true && (!head || head[0] < 400)) {
        orig.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        return orig.end(JSON.stringify({ error: "Enregistrement sur GitHub impossible : " + r.message }));
      }
      if (head) orig.writeHead(...head);
      orig.end(Buffer.concat(chunks));
    });
    return res;
  };
  if (!writes) {   // GET: stream normally, only the final end is delayed by the (rare) stats commit
    res.write = orig.write;
    const endStream = res.end;
    res.end = (c, ...rest) => { if (c && typeof c !== "function") orig.write(c); chunks.length = 0; return endStream(undefined, ...rest); };
  }
  return handle(req, res);
};
