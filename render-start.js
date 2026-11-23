/* Atlas Art Minerals — start script for Render (or any host with a persistent disk).
   Render only keeps files written inside the disk (SITE_ROOT, e.g. /var/data/site). On every start this script
   copies the app from the Git repository to the disk, then runs it from there:
   - a file that does not exist on the disk yet is copied (first start: pages, photos, products, translations…);
   - a file the admin has NOT changed since the previous deploy is updated to the new version from Git;
   - a file changed in the admin (edited page, new photo, products, quote requests, accounts…) is never overwritten.
   Without SITE_ROOT it simply runs server.js from this folder (local use). */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const SRC = __dirname, DST = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : "";
if (!DST || DST === SRC) { require("./server.js"); return; }

const SKIP = /^(\.git|node_modules|deploy|photos-upscaled|mockups2?|design-concept)([\\/]|$)|^(render-start\.js|render\.yaml|package\.json|\.gitignore|README\.md)$/;
const hash = f => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
const STATE = path.join(DST, ".deploy-state.json");
let prev = {}; try { prev = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) { /* first start */ }
const next = {}; let copied = 0, updated = 0, kept = 0;
(function walk(rel) {
  for (const n of fs.readdirSync(path.join(SRC, rel))) {
    const r = rel ? rel + "/" + n : n;
    if (SKIP.test(r)) continue;
    const s = path.join(SRC, r), d = path.join(DST, r);
    if (fs.statSync(s).isDirectory()) { walk(r); continue; }
    const h = hash(s); next[r] = h;
    if (!fs.existsSync(d)) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); copied++; continue; }
    if (prev[r] === h) continue;                                   // repository file unchanged since last deploy
    const dh = hash(d);
    if (dh === h) continue;                                         // already identical
    if (!prev[r] || dh === prev[r]) { fs.copyFileSync(s, d); updated++; }   // not touched in the admin -> new version
    else kept++;                                                    // changed in the admin -> keep it
  }
})("");
fs.mkdirSync(DST, { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(next));
console.log("[render-start] " + DST + " : " + copied + " copiés, " + updated + " mis à jour, " + kept + " gardés (modifiés dans l'admin)");
process.env.TRUST_PROXY = process.env.TRUST_PROXY || "1";
require(path.join(DST, "server.js"));
