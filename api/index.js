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
  const handle = await getApp();
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
