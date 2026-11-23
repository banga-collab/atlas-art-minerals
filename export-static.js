/* Atlas Art Minerals — builds the static public site in ./deploy for Vercel (or any static host).
   Usage:  node export-static.js            (the local server must be running on PORT, default 4321)
   What is copied: the public pages, assets/ (without the logo drafts), sitemap.xml, robots.txt, vercel.json.
   What is NEVER copied: admin/, data/ (accounts, quote requests, subscribers, passwords), server.js, drafts.
   On the static site, quote requests still go out by WhatsApp / email from the visitor's phone or computer;
   saving requests in the admin, newsletter sign-ups and statistics need the Node server (see ADMIN-GUIDE.md). */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = __dirname, OUT = path.join(ROOT, "deploy");
const PORT = Number(process.env.PORT) || 4321, LOCAL = "http://localhost:" + PORT;
const PAGES = ["index.html", "collection.html", "workshop.html", "trade.html", "quote.html", "journal.html", "article.html", "legal.html", "privacy.html", "product.html", "404.html"];
const SKIP_ASSETS = /^assets[\\/]brand[\\/](_old|concepts|concepts2|icon-variants|icons-v2|icons-v3|palettes)([\\/]|$)/;
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch (e) { return d; } };

function rmrfExceptGit(dir) {
  if (!fs.existsSync(dir)) return fs.mkdirSync(dir, { recursive: true });
  for (const n of fs.readdirSync(dir)) if (n !== ".git") fs.rmSync(path.join(dir, n), { recursive: true, force: true });
}
function copyDir(src, dst, rel) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    const r = path.join(rel, n), s = path.join(src, n), d = path.join(dst, n);
    if (SKIP_ASSETS.test(r) || n.startsWith(".")) continue;
    if (fs.statSync(s).isDirectory()) copyDir(s, d, r); else fs.copyFileSync(s, d);
  }
}
(async () => {
  const site = readJSON("site.json", {});
  const base = String(process.env.SITE_URL || site.siteUrl || "").replace(/\/+$/, "");
  rmrfExceptGit(OUT);
  copyDir(path.join(ROOT, "assets"), path.join(OUT, "assets"), "assets");
  // the static site has no server behind it: tell the scripts so they don't call /api/…
  fs.appendFileSync(path.join(OUT, "assets/js/settings.js"), "\nwindow.AAM_STATIC = true;\n");
  for (const pg of PAGES) {
    let html;
    if (pg === "product.html") html = fs.readFileSync(path.join(ROOT, pg), "utf8");   // filled in the browser from products.js
    else {
      const r = await fetch(LOCAL + "/" + pg).catch(() => null);
      if (!r) throw new Error("Le serveur local ne répond pas sur " + LOCAL + " : lancez d'abord « node server.js ».");
      html = await r.text();
      if (r.status === 503) throw new Error("Le mode maintenance est activé : désactivez-le avant de publier.");
    }
    html = html.replace(/<link rel="canonical" href="http:\/\/localhost[^"]*">\n?/g, "").replace(/<meta property="og:url" content="http:\/\/localhost[^"]*">\n?/g, "");
    if (base) html = html.replace(/content="\/assets\//g, 'content="' + base + "/assets/");
    fs.writeFileSync(path.join(OUT, pg), html);
  }
  // sitemap + robots (absolute addresses need the site address: Admin › SEO › Adresse du site, or SITE_URL=…)
  if (base) {
    const cat = readJSON("catalog.json", { products: [] }), j = readJSON("journal.json", { posts: [] }), today = new Date().toISOString().slice(0, 10);
    const urls = ["", "collection.html", "workshop.html", "trade.html", "quote.html", "journal.html", "legal.html", "privacy.html"].map(u => base + "/" + u)
      .concat(cat.products.map(p => base + "/product.html?p=" + encodeURIComponent(p.id)))
      .concat(j.posts.filter(p => p.status === "published").map(p => base + "/article.html?a=" + encodeURIComponent(p.id)));
    fs.writeFileSync(path.join(OUT, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => "  <url><loc>" + u.replace(/&/g, "&amp;") + "</loc><lastmod>" + today + "</lastmod></url>").join("\n") + "\n</urlset>\n");
  }
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\n" + (base ? "Sitemap: " + base + "/sitemap.xml\n" : ""));
  const redirects = readJSON("redirects.json", []).map(r => ({ source: r.from, destination: r.to.startsWith("/") || /^https?:/.test(r.to) ? r.to : "/" + r.to, permanent: r.code !== 302 }));
  fs.writeFileSync(path.join(OUT, "vercel.json"), JSON.stringify({
    cleanUrls: false, trailingSlash: false, redirects,
    headers: [
      { source: "/(.*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] },
      { source: "/assets/(products|photos|brand|uploads)/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] }
    ]
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, ".gitignore"), ".vercel\n");
  fs.writeFileSync(path.join(OUT, "README.md"), "# Atlas Art Minerals — site public\n\nCe dossier est généré automatiquement par `export-static.js` depuis l'administration locale. Ne pas modifier à la main : modifiez le site dans l'admin puis publiez.\n");
  // safety net: nothing private may leave
  const bad = [];
  (function walk(d) { for (const n of fs.readdirSync(d)) { if (n === ".git") continue; const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else if (/(^|[\\/])(data|admin)[\\/]|server\.js$|PREMIER-MOT-DE-PASSE|users\.json|sessions\.json|secret\.key|mail\.json|leads\.json|subscribers\.json/.test(path.relative(OUT, f))) bad.push(f); } })(OUT);
  if (bad.length) throw new Error("Fichiers privés trouvés dans deploy/ : " + bad.join(", "));
  let n = 0, size = 0; (function walk(d) { for (const x of fs.readdirSync(d)) { if (x === ".git") continue; const f = path.join(d, x); const st = fs.statSync(f); if (st.isDirectory()) walk(f); else { n++; size += st.size; } } })(OUT);
  console.log("Site statique prêt dans deploy/ : " + n + " fichiers, " + (size / 1048576).toFixed(1) + " Mo" + (base ? " · adresse " + base : " · (adresse du site non définie : pas de sitemap)"));
})().catch(e => { console.error("ÉCHEC : " + e.message); process.exit(1); });
