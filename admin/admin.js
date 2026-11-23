/* Atlas Art Minerals — admin dashboard (products, Excel import, site info, password). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var src = function (img) { return !img ? "" : /^https?:/i.test(img) ? img : "../" + img; };

  var families = [], products = [], famName = {};

  /* ---------- API ---------- */
  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && url !== "/api/login" && url !== "/api/password") { showLogin(); }
          if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
          return j;
        });
      });
  }
  var toastT;
  function toast(msg, bad) { var t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, 2600); }

  /* ---------- Auth ---------- */
  function showLogin() { $("#app").hidden = true; $("#login").hidden = false; setTimeout(function () { $("#pw").focus(); }, 30); }
  function showApp() {
    api("GET", "/api/session").then(function (s) {
      window.AAM_USER = s.user || { role: "admin", name: "" };
      var role = window.AAM_USER.role;
      $$("[data-roles]").forEach(function (el) { el.hidden = el.getAttribute("data-roles").split(" ").indexOf(role) < 0; });
      var mn = $("#me-name"); if (mn) mn.textContent = window.AAM_USER.name ? window.AAM_USER.name + " · " + window.AAM_USER.roleLabel : "Mon compte";
      $("#login").hidden = true; $("#app").hidden = false;
      if (role !== "sales") loadAll();
      setTimeout(route, 0);
    });
  }
  window.AAM_ADMIN = {
    api: function (m, u, b) { return api(m, u, b); }, toast: function (m, b) { toast(m, b); },
    reloadCatalog: function () { loadAll(); }, families: function () { return families; }, products: function () { return products; },
    openProduct: function () { openEdit(null); }
  };
  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault(); var b = $("button[type=submit]", e.target); b.disabled = true; $("#login-err").textContent = "";
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ username: $("#un").value.trim(), password: $("#pw").value, code: $("#code").value.trim() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) { $("#pw").value = ""; $("#code").value = ""; $("#code-row").hidden = true; try { showApp(); } catch (err) { location.reload(); } return; }
        if (j.need2fa) { $("#code-row").hidden = false; $("#code").focus(); }
        $("#login-err").textContent = j.error || "Erreur " + r.status;
      }); })
      .catch(function () { $("#login-err").textContent = "Le serveur ne répond pas. Vérifiez que « node server.js » est lancé, puis réessayez."; })
      .then(function () { b.disabled = false; });
  });
  $("#logout").addEventListener("click", function () { api("POST", "/api/logout").then(showLogin); });

  /* ---------- Router (sidebar) ---------- */
  var VIEWS = {
    overview: ["Vue d'ensemble", "Site web", ["overview"]],
    articles: ["Articles", "Gestion du contenu", ["articles"]],
    pages: ["Pages", "Gestion du contenu", ["pages"]],
    products: ["Produits", "Gestion du contenu", ["products"]],
    "import": ["Import Excel", "Gestion du contenu", ["import"]],
    authors: ["Auteurs", "Gestion du contenu", ["authors"]],
    categories: ["Catégories", "Gestion du contenu", ["categories"]],
    templates: ["Modèles", "Apparence", ["templates"]],
    customize: ["Personnalisation du modèle", "Apparence", ["customize"]],
    assets: ["Gérer les médias", "Médias", ["assets"]],
    upload: ["Téléverser un média", "Médias", ["upload"]],
    engine: ["Moteur d'images", "Médias", ["engine"]],
    deployment: ["Déploiement", "Site web", ["deployment"]],
    settings: ["Paramètres", "Site web", ["site", "cookies"]],
    leads: ["Demandes de devis", "Ventes", ["leads"]],
    stats: ["Statistiques", "Ventes", ["stats"]],
    menus: ["Menus", "Gestion du contenu", ["menus"]],
    translations: ["Traductions", "Gestion du contenu", ["translations"]],
    subscribers: ["Abonnés newsletter", "Marketing", ["subscribers"]],
    seo: ["SEO", "Marketing", ["seo"]],
    users: ["Utilisateurs", "Équipe", ["users"]],
    activity: ["Journal d'activité", "Équipe", ["activity"]],
    account: ["Mon compte", "Équipe", ["password", "account"]]
  };
  var ROLE_VIEWS = {
    admin: null,
    editor: ["overview", "articles", "pages", "products", "import", "authors", "categories", "menus", "translations", "assets", "upload", "engine", "account"],
    sales: ["overview", "leads", "stats", "subscribers", "account"]
  };
  var currentView = null;
  function route() {
    if ($("#app").hidden) return;
    var v = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
    var allowedViews = ROLE_VIEWS[(window.AAM_USER || {}).role];
    if (!VIEWS[v] || (allowedViews && allowedViews.indexOf(v) < 0)) { v = "overview"; history.replaceState(null, "", "#/overview"); }
    var def = VIEWS[v];
    $$(".panel").forEach(function (p) { p.hidden = def[2].indexOf(p.id.replace("tab-", "")) < 0; });
    $$(".side [data-view]").forEach(function (a) { if (a.getAttribute("data-view") === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#view-title").textContent = def[0]; $("#view-crumb").textContent = def[1];
    document.title = def[0] + " — Administration Atlas Art";
    $("#side").classList.remove("open"); $("#side-toggle").setAttribute("aria-expanded", "false");
    currentView = v;
    if (v === "import") loadXLSX().catch(function () {});
    if (v === "pages" && window.AAM_EDITOR) window.AAM_EDITOR.open();
    if (window.AAM_CMS) window.AAM_CMS.show(v);
    if (window.AAM_PLUS) window.AAM_PLUS.show(v);
    var main = $(".main"); if (main) main.scrollTop = 0; window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  $("#side-toggle").addEventListener("click", function () { var o = $("#side").classList.toggle("open"); this.setAttribute("aria-expanded", o ? "true" : "false"); });

  /* ---------- Load ---------- */
  function loadAll() {
    api("GET", "/api/catalog").then(function (c) {
      families = c.families || []; products = c.products || []; famName = {};
      families.forEach(function (f) { famName[f.id] = f.name; });
      var opts = families.map(function (f) { return '<option value="' + f.id + '">' + esc(f.name) + "</option>"; }).join("");
      $("#fam-filter").innerHTML = '<option value="">Toutes les familles</option>' + opts;
      $("#e-family").innerHTML = opts;
      renderRows();
    }).catch(function (e) { toast(e.message, true); });
    api("GET", "/api/site").then(function (s) { $$("#site-form [name]").forEach(function (i) { i.value = s[i.name] || ""; }); paintLogo(s.logo); });
  }
  function paintLogo(p) {
    var el = $("#logo-preview"); if (!el) return;
    var u = p ? 'url("../' + p + '")' : ""; el.style.webkitMaskImage = u; el.style.maskImage = u;
  }
  $("#logo-file").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    if (!/^image\/(png|webp)$/.test(f.type)) { toast("Logo en PNG ou WEBP transparent.", true); return; }
    var rd = new FileReader();
    rd.onload = function () {
      api("POST", "/api/upload", { dataUrl: rd.result, name: "logo" }).then(function (r) {
        $("#s-logo").value = r.path; paintLogo(r.path); toast("Logo chargé. Cliquez « Enregistrer » pour l'appliquer.");
      }).catch(function (e) { toast(e.message, true); });
    };
    rd.readAsDataURL(f);
  });

  /* ---------- Products list ---------- */
  function renderRows() {
    var q = $("#q").value.trim().toLowerCase(), f = $("#fam-filter").value;
    var list = products.filter(function (p) {
      return (!f || p.family === f) && (!q || (p.name + " " + p.ref + " " + p.finish + " " + p.description).toLowerCase().indexOf(q) > -1);
    });
    $("#rows").innerHTML = list.map(function (p) {
      return '<tr data-id="' + esc(p.id) + '">' +
        '<td><div class="thumb ' + esc(p.bg) + '">' + (p.img ? '<img src="' + esc(src(p.img)) + '" alt="" loading="lazy">' : "") + "</div></td>" +
        '<td class="nm">' + esc(p.name) + ((p.variants && p.variants.length) || p.description ? "<small>" + (p.variants && p.variants.length ? p.variants.length + " taille(s) · " : "") + esc(p.description || "") + "</small>" : "") + "</td>" +
        "<td>" + esc(famName[p.family] || p.family) + "</td><td>" + esc(p.finish) + '</td><td class="muted">' + esc(p.ref || "—") + "</td>" +
        '<td style="text-align:center"><button class="star" type="button" data-star aria-pressed="' + (p.featured ? "true" : "false") + '" aria-label="Vedette : ' + esc(p.name) + '">★</button></td>' +
        '<td><div class="acts"><button class="ghost" type="button" data-edit>Modifier</button><a class="ghost" href="../product.html?p=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" aria-label="Voir la page de ' + esc(p.name) + '">Voir ↗</a></div></td></tr>';
    }).join("");
    $("#rows-empty").hidden = list.length > 0;
    $("#count-pill").textContent = products.length;
  }
  $("#q").addEventListener("input", renderRows);
  $("#fam-filter").addEventListener("change", renderRows);
  $("#rows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr"); if (!tr) return;
    var p = products.find(function (x) { return x.id === tr.getAttribute("data-id"); }); if (!p) return;
    if (e.target.closest("[data-edit]")) openEdit(p);
    if (e.target.closest("[data-star]")) {
      p.featured = p.featured ? 0 : nextFeatured();
      save("Vedette mise à jour.");
    }
  });
  function nextFeatured() { return products.reduce(function (m, p) { return Math.max(m, p.featured || 0); }, 0) + 1; }
  function save(msg) {
    return api("PUT", "/api/catalog", { products: products }).then(function (r) { products = r.products; renderRows(); if (msg) toast(msg); return r; })
      .catch(function (e) { toast(e.message, true); throw e; });
  }

  /* ---------- Edit dialog ---------- */
  var dlg = $("#edit"), editing = null, gal = [];   // gal: [{ path }] or [{ dataUrl, name }] (not uploaded yet); gal[0] = main photo
  function galSrc(g) { return g.dataUrl || src(g.path); }
  function renderGal() {
    var bg = $("#e-bg").value;
    setPhoto(gal[0] ? galSrc(gal[0]) : "", bg);
    $("#e-gal").innerHTML = gal.map(function (g, i) {
      return '<div class="g-item' + (i === 0 ? " main" : "") + '" data-i="' + i + '"><span class="ph ' + esc(bg) + '"><img src="' + esc(galSrc(g)) + '" alt=""></span>' +
        '<span class="g-acts">' + (i === 0 ? '<b title="Photo principale">★</b>' : '<button type="button" class="mini" data-g="main" title="Mettre en photo principale" aria-label="Photo principale">★</button>') +
        (i > 0 ? '<button type="button" class="mini" data-g="left" aria-label="Avancer" title="Avancer">‹</button>' : "") + (i < gal.length - 1 ? '<button type="button" class="mini" data-g="right" aria-label="Reculer" title="Reculer">›</button>' : "") +
        '<button type="button" class="mini danger-t" data-g="rm" aria-label="Retirer cette photo">×</button></span>' + (g.dataUrl ? '<small class="g-new">nouvelle</small>' : "") + "</div>";
    }).join("");
  }
  function addPrepared(dataUrl, name) { gal.push({ dataUrl: dataUrl, name: name }); renderGal(); }
  function finishesList() {
    var s = {}; products.forEach(function (p) { if (p.finish) s[p.finish] = 1; });
    $("#finishes").innerHTML = Object.keys(s).map(function (f) { return '<option value="' + esc(f) + '">'; }).join("");
  }
  function setPhoto(url, bg) {
    $("#ph").className = "ph " + (bg || "");
    $("#ph-img").hidden = !url; $("#ph-none").hidden = !!url;
    if (url) $("#ph-img").src = url;
  }
  function openEdit(p) {
    editing = p || null; finishesList(); $("#e-link").hidden = true; $("#e-link-url").value = "";
    var f = $("#edit-form"); f.reset(); $$(".field.invalid", f).forEach(function (x) { x.classList.remove("invalid"); });
    $("#edit-title").textContent = p ? "Modifier le produit" : "Nouveau produit";
    $("#e-del").hidden = !p;
    $("#e-view").hidden = !(p && p.id); if (p && p.id) $("#e-view").href = "../product.html?p=" + encodeURIComponent(p.id);
    var d = p || { name: "", family: ($("#fam-filter").value || "light"), finish: "White selenite", ref: "", sizes: "", description: "", bg: "white", featured: 0, img: "" };
    $("#e-name").value = d.name; $("#e-family").value = d.family; $("#e-finish").value = d.finish; $("#e-ref").value = d.ref || "";
    $("#e-sizes").value = d.sizes || ""; $("#e-desc").value = d.description || ""; $("#e-bg").value = d.bg; $("#e-feat").checked = !!d.featured;
    $("#e-long").value = d.longDescription || "";
    var vs = d.variants || [], cats = [d.retailCat, d.retailSub, d.retailSubsub].filter(Boolean).join(" › "), ws = [d.wsCat, d.wsSub].filter(Boolean).join(" › ");
    var nv = function (x) { return x === undefined || x === "" ? "—" : esc(x); };
    $("#e-vars").hidden = !vs.length && !cats && !ws && !d.status;
    $("#e-vars").innerHTML = (cats ? "<p><b>Retail</b> : " + esc(cats) + "</p>" : "") + (ws ? "<p><b>Wholesale</b> : " + esc(ws) + "</p>" : "") + (d.status ? "<p><b>Statut</b> : " + esc(d.status) + "</p>" : "") +
      (vs.length ? "<b>" + vs.length + " taille(s) importée(s) depuis Excel</b><div class='table-wrap'><table><thead><tr><th>Taille</th><th>Réf.</th><th>Poids g</th><th>Produit L×l×H cm</th><th>Emballage cm</th><th>Poids emb. g</th><th>Volume</th></tr></thead><tbody>" +
        vs.map(function (v) { return "<tr><td>" + nv(v.size) + "</td><td>" + nv(v.ref) + "</td><td>" + nv(v.weight) + "</td><td>" + [v.l, v.w, v.h].map(nv).join(" × ") + "</td><td>" + [v.pl, v.pw, v.ph].map(nv).join(" × ") + "</td><td>" + nv(v.packWeight) + "</td><td>" + nv(v.volume) + "</td></tr>"; }).join("") +
        "</tbody></table></div><p class='muted small'>Pour modifier les tailles, corrigez le fichier Excel et réimportez-le (les produits sont mis à jour par référence ou par nom).</p>" : "");
    gal = []; [d.img].concat(d.images || []).forEach(function (u) { if (u && !gal.some(function (g) { return g.path === u; })) gal.push({ path: u }); });
    renderGal();
    dlg.showModal(); $("#e-name").focus();
  }
  $("#add").addEventListener("click", function () { openEdit(null); });
  $$("[data-close]", dlg).forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  $("#e-bg").addEventListener("change", renderGal);
  $("#e-gal").addEventListener("click", function (e) {
    var b = e.target.closest("[data-g]"); if (!b) return;
    var i = +b.closest("[data-i]").getAttribute("data-i"), act = b.getAttribute("data-g"), g = gal[i];
    if (act === "rm") gal.splice(i, 1);
    if (act === "main") { gal.splice(i, 1); gal.unshift(g); }
    if (act === "left" && i > 0) { gal[i] = gal[i - 1]; gal[i - 1] = g; }
    if (act === "right" && i < gal.length - 1) { gal[i] = gal[i + 1]; gal[i + 1] = g; }
    renderGal();
  });
  $("#ph-lib").addEventListener("click", function () { if (window.AAM_PICK) window.AAM_PICK(function (p) { if (p && !gal.some(function (g) { return g.path === p; })) { gal.push({ path: p }); renderGal(); } }); });
  $("#ph-link").addEventListener("click", function () { var box = $("#e-link"); box.hidden = !box.hidden; if (!box.hidden) $("#e-link-url").focus(); });
  function fetchLink() {
    var u = $("#e-link-url").value.trim(), btn = $("#e-link-go"); if (!/^https?:\/\//i.test(u)) { toast("Collez un lien qui commence par http(s)://", true); return; }
    btn.disabled = true; btn.textContent = "Récupération…";
    api("POST", "/api/fetch-image", { url: u }).then(function (r) { return fetch(r.dataUrl); }).then(function (res) { return res.blob(); })
      .then(function (b) { return window.AAM_IMG.prepare(new File([b], "photo", { type: b.type })); })
      .then(function (d) { addPrepared(d, $("#e-name").value || "photo"); $("#e-link-url").value = ""; $("#e-link").hidden = true; toast("Photo ajoutée. Cliquez « Enregistrer » pour la garder."); })
      .catch(function (err) { toast(err.message, true); }).then(function () { btn.disabled = false; btn.textContent = "Récupérer"; });
  }
  $("#e-link-go").addEventListener("click", fetchLink);
  $("#e-link-url").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); fetchLink(); } });
  $("#ph-file").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files || []); e.target.value = ""; if (!files.length) return;
    files.reduce(function (chain, file) {
      return chain.then(function () {
        if (!/^image\/(webp|jpeg|png)$/.test(file.type)) { toast(file.name + " : WEBP, JPG ou PNG uniquement.", true); return; }
        return window.AAM_IMG.prepare(file).then(function (dataUrl) { addPrepared(dataUrl, $("#e-name").value || file.name.replace(/\.\w+$/, "")); }).catch(function (er) { toast(file.name + " : " + er.message, true); });
      });
    }, Promise.resolve());
  });
  $("#edit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#e-name").value.trim();
    $("#e-name").closest(".field").classList.toggle("invalid", !name);
    if (!name) { $("#e-name").focus(); return; }
    var btn = $("#e-save"); btn.disabled = true;
    // upload the new photos one by one, keeping the order chosen in the gallery
    var up = gal.reduce(function (chain, g) {
      return chain.then(function () { if (!g.dataUrl) return; return api("POST", "/api/upload", { dataUrl: g.dataUrl, name: name }).then(function (r) { g.path = r.path; delete g.dataUrl; }); });
    }, Promise.resolve());
    up.then(function () {
      var paths = gal.map(function (g) { return g.path; }).filter(Boolean);
      var data = { name: name, family: $("#e-family").value, finish: $("#e-finish").value.trim(), ref: $("#e-ref").value.trim(), sizes: $("#e-sizes").value.trim(), description: $("#e-desc").value.trim(), longDescription: $("#e-long").value.trim(), bg: $("#e-bg").value };
      if (editing) {
        Object.assign(editing, data); editing.img = paths[0] || ""; editing.images = paths;
        editing.featured = $("#e-feat").checked ? (editing.featured || nextFeatured()) : 0;
      } else {
        data.img = paths[0] || ""; data.images = paths; data.featured = $("#e-feat").checked ? nextFeatured() : 0;
        products.unshift(data);
      }
      return save(editing ? "Produit enregistré." : "Produit ajouté.");
    }).then(function () { dlg.close(); }).catch(function (err) { toast(err.message, true); }).then(function () { btn.disabled = false; });
  });
  $("#e-del").addEventListener("click", function () {
    if (!editing) return;
    if (!confirm("Supprimer « " + editing.name + " » du catalogue ? Cette action est définitive.")) return;
    products = products.filter(function (p) { return p !== editing; });
    save("Produit supprimé.").then(function () { dlg.close(); });
  });

  /* ---------- Site info ---------- */
  $("#site-form").addEventListener("submit", function (e) {
    e.preventDefault(); var b = {}; $$("#site-form [name]").forEach(function (i) { b[i.name] = i.value.trim(); });
    api("PUT", "/api/site", b).then(function () { toast("Informations enregistrées. Le site est à jour."); }).catch(function (err) { toast(err.message, true); });
  });

  /* ---------- Password ---------- */
  $("#pw-form").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target, err = $("#pw-err"); err.textContent = "";
    if (f.next.value.length < 10) { err.textContent = "Le nouveau mot de passe doit faire au moins 10 caractères."; return; }
    if (f.next.value !== f.next2.value) { err.textContent = "Les deux mots de passe ne correspondent pas."; return; }
    api("POST", "/api/password", { current: f.current.value, next: f.next.value }).then(function () { f.reset(); toast("Mot de passe changé."); })
      .catch(function (x) { err.textContent = x.message; });
  });

  /* ---------- Excel import (with photos) ----------
     Understands catalogues like:  REF | Nº | Photos | NAME | Retail (Category, Subcategory, Sub-subcategory) |
     Wholesale (Category, Subcategory) | Size | Weight | Product (cm) L W H | Packaging (cm) L W H | Weight pack |
     VOLUME | Pictures (Jpeg, Webp links) | Current status | Description (Short, Long)
     - two header rows (group + sub-column) are combined, merged cells are filled in;
     - consecutive rows with the same Nº (or the same name) become ONE product with several sizes;
     - photos pasted into the sheet are extracted from the .xlsx, otherwise the Webp / Jpeg links are downloaded. */
  var libsLoading = {}, sheetRows = [], headers = [], sheetImages = {}, sheetFile = "";
  var FIELDS = [
    ["name", "Nom *", ["name label", "name", "nom", "designation", "article", "produit", "product name", "libelle", "title", "titre"], ["weight", "pack"]],
    ["ref", "Référence (par taille)", ["ref", "reference", "sku", "code article", "code"], ["pictures"]],
    ["group", "Nº (regroupe les tailles)", ["n", "no", "nº", "num", "numero", "number", "#"], []],
    ["photo", "Colonne des photos collées", ["photos", "photo", "image", "images", "picture", "img"], ["link", "jpeg", "webp", "pictures jpeg", "pictures webp"]],
    ["family", "Famille du site", ["famille", "family"], []],
    ["finish", "Matière", ["matiere", "material", "materiau", "finition", "finish", "stone", "pierre"], []],
    ["retailCat", "Retail · catégorie", ["retail category", "retail categorie"], ["sub"]],
    ["retailSub", "Retail · sous-catégorie", ["retail subcategory", "retail sous categorie"], ["sub subcategory"]],
    ["retailSubsub", "Retail · sous-sous-catégorie", ["retail sub subcategory", "retail subsubcategory"], []],
    ["wsCat", "Wholesale · catégorie", ["wholesale category", "gros categorie"], ["sub"]],
    ["wsSub", "Wholesale · sous-catégorie", ["wholesale subcategory", "gros sous categorie"], []],
    ["size", "Taille", ["size", "taille", "sizes", "tailles"], []],
    ["weight", "Poids (g)", ["weight gramme", "weight g", "poids", "weight"], ["pack", "packaging", "emballage"]],
    ["l", "Produit · longueur (cm)", ["product cm length", "product length", "longueur", "length"], ["packaging", "pack", "emballage"]],
    ["w", "Produit · largeur (cm)", ["product cm width", "product width", "largeur", "width"], ["packaging", "pack", "emballage"]],
    ["h", "Produit · hauteur (cm)", ["product cm hight", "product cm height", "product height", "hauteur", "height", "hight"], ["packaging", "pack", "emballage"]],
    ["pl", "Emballage · longueur (cm)", ["packaging cm length", "packaging length", "emballage longueur"], []],
    ["pw", "Emballage · largeur (cm)", ["packaging cm width", "packaging width", "emballage largeur"], []],
    ["ph", "Emballage · hauteur (cm)", ["packaging cm hight", "packaging cm height", "packaging height", "emballage hauteur"], []],
    ["packWeight", "Poids emballé (g)", ["weight pack gramme", "weight pack", "poids emballe", "packed weight"], []],
    ["volume", "Volume", ["volume cm", "volume"], []],
    ["webp", "Lien photo Webp", ["pictures webp", "webp"], []],
    ["jpeg", "Lien photo Jpeg", ["pictures jpeg", "jpeg", "jpg", "lien photo", "url photo"], []],
    ["status", "Statut", ["current status", "status", "statut", "etat"], []],
    ["description", "Description courte", ["description short", "short description", "short", "description courte", "description", "desc"], ["long"]],
    ["longDescription", "Description longue", ["description long", "long description", "long", "description longue", "details"], []],
    ["featured", "Vedette", ["vedette", "featured", "best seller", "bestseller", "top"], []]
  ];
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/º/g, "").replace(/[^a-z0-9#]+/g, " ").trim(); }
  function hasWords(h, phrase) { return (" " + h + " ").indexOf(" " + phrase + " ") > -1; }
  function loadLib(url, test) {
    if (test()) return Promise.resolve();
    if (libsLoading[url]) return libsLoading[url];
    return (libsLoading[url] = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = url;
      s.onload = res; s.onerror = function () { libsLoading[url] = null; rej(new Error("Impossible de charger le lecteur Excel (connexion internet ?).")); };
      document.head.appendChild(s);
    }));
  }
  function loadXLSX() {
    return Promise.all([
      loadLib("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", function () { return !!window.XLSX; }),
      loadLib("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", function () { return !!window.JSZip; })
    ]);
  }
  function strictFamily(v) {
    var t = norm(v); if (!t) return "";
    for (var i = 0; i < families.length; i++) if (norm(families[i].id) === t || norm(families[i].name) === t) return families[i].id;
    if (/onyx/.test(t)) return "onyx";
    if (/tealight|t light|bougie|bougeoir|candle|votive|hurricane|photophore/.test(t)) return "light";
    if (/lamp|lampe|tower|tour|obelisk|obelisque|pyramid|pyramide|lumiere|lighting/.test(t)) return "lamps";
    if (/bowl|bol|tray|plateau|box|boite|boxe|jar|pot|coupe|vide poche|tajine|plat|storage|rangement/.test(t)) return "bowls";
    if (/plate|frame|cadre|bookend|coaster|sous verre|wand|slab|moon|sphere|ball|figurine|decor object/.test(t)) return "objects";
    return "";
  }
  function guessFamily() {
    for (var i = 0; i < arguments.length; i++) { var f = strictFamily(arguments[i]); if (f) return f; }
    return families.some(function (f) { return f.id === "objects"; }) ? "objects" : (families[0] || {}).id || "objects";
  }
  function guessFinish(name, sub) {
    var t = norm(name + " " + sub);
    if (/nectar|orange|honey/.test(t)) return "Nectar selenite";
    if (/banded onyx|brown onyx|zebra/.test(t)) return "Banded onyx";
    if (/white onyx/.test(t)) return "White onyx";
    if (/onyx/.test(t)) return "Onyx";
    if (/calcite/.test(t)) return "Calcite";
    if (/selenite/.test(t)) return "White selenite";
    return "Selenite";
  }

  /* --- 1. read the sheet: merged cells filled, hyperlinks kept, absolute row numbers kept --- */
  function readSheet(ws) {
    var range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1"), grid = {};
    function cellVal(c) {
      if (!c) return "";
      if (c.l && c.l.Target && (c.t !== "n")) return c.l.Target;                       // "Link" cells -> the real URL
      if (c.t === "n") return c.v;
      return c.w != null && c.t !== "s" ? c.w : (c.v == null ? "" : c.v);
    }
    for (var r = range.s.r; r <= range.e.r; r++) { grid[r] = []; for (var c = range.s.c; c <= range.e.c; c++) grid[r][c - range.s.c] = cellVal(ws[XLSX.utils.encode_cell({ r: r, c: c })]); }
    (ws["!merges"] || []).forEach(function (m) {
      var v = grid[m.s.r] ? grid[m.s.r][m.s.c - range.s.c] : "";
      for (var r = m.s.r; r <= m.e.r; r++) for (var c = m.s.c; c <= m.e.c; c++) if (grid[r] && (r !== m.s.r || c !== m.s.c)) grid[r][c - range.s.c] = v;
    });
    var rows = [];
    for (var r2 = range.s.r; r2 <= range.e.r; r2++) rows.push({ r: r2, cells: grid[r2], merged: {} });
    return { rows: rows, c0: range.s.c };
  }
  var HEAD_WORDS = ["ref", "name", "nom", "size", "taille", "weight", "poids", "photo", "photos", "description", "category", "categorie", "volume", "status", "length", "width", "price", "prix", "famille", "family", "material", "matiere", "n", "no", "short", "long", "label", "packaging", "pictures", "retail", "wholesale", "jpeg", "webp", "hight", "height", "subcategory"];
  function headerScore(cells) {
    var n = 0, nums = 0;
    cells.forEach(function (v) { if (typeof v === "number") nums++; var t = norm(v); if (t && t.split(" ").some(function (w) { return HEAD_WORDS.indexOf(w) > -1; })) n++; });
    return nums > 2 ? 0 : n;
  }
  function detectHeaders(rows) {
    var best = -1, score = 0;
    for (var i = 0; i < Math.min(rows.length, 15); i++) { var s = headerScore(rows[i].cells); if (s > score) { score = s; best = i; } }
    if (best < 0 || score < 2) return null;
    var noNum = function (row) { return row && headerScore(row.cells) >= 2 && !row.cells.some(function (v) { return typeof v === "number"; }); };
    if (best > 0 && noNum(rows[best - 1])) best--;          // the best row was the sub-header: the group row is just above
    var top = rows[best].cells, next = rows[best + 1], sub = null;
    // the next row is a sub-header if it has header words and no numbers (e.g. Label, Category, Length, Short…)
    if (next && headerScore(next.cells) >= 2 && !next.cells.some(function (v) { return typeof v === "number"; })) sub = next.cells;
    var hdr = top.map(function (t, i) {
      var a = String(t || "").trim(), b = sub ? String(sub[i] || "").trim() : "";
      if (!b || norm(b) === norm(a)) return a || ("Colonne " + (i + 1));
      return a ? a + " " + b : b;
    });
    return { headers: hdr, start: best + (sub ? 2 : 1) };
  }

  /* --- 2. photos inside the .xlsx: drawings anchored to cells + Excel 365 "picture in cell" --- */
  function xml(text) { return new DOMParser().parseFromString(text, "application/xml"); }
  function tags(doc, local) { return Array.prototype.slice.call(doc.getElementsByTagNameNS("*", local)); }
  function relsOf(zip, partPath) {
    var dir = partPath.replace(/[^/]+$/, ""), file = dir + "_rels/" + partPath.split("/").pop() + ".rels";
    var f = zip.file(file); if (!f) return Promise.resolve({});
    return f.async("string").then(function (t) {
      var map = {}; tags(xml(t), "Relationship").forEach(function (r) { map[r.getAttribute("Id")] = resolvePath(dir, r.getAttribute("Target")); }); return map;
    });
  }
  function resolvePath(dir, target) {
    if (!target) return "";
    if (target.charAt(0) === "/") return target.slice(1);
    var parts = (dir + target).split("/"), out = [];
    parts.forEach(function (p) { if (p === "..") out.pop(); else if (p && p !== ".") out.push(p); });
    return out.join("/");
  }
  function mediaBlob(zip, p) {
    var f = zip.file(p); if (!f) return Promise.resolve(null);
    var ext = (p.split(".").pop() || "").toLowerCase(), type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[ext];
    if (!type) return Promise.resolve({ unsupported: ext });
    return f.async("blob").then(function (b) { return { blob: new Blob([b], { type: type }), key: p }; });
  }
  function extractImages(buf) {
    // returns { "row:col": {blob,key} } with 0-based absolute row/col of the first sheet
    var out = {}, unsupported = 0;
    return JSZip.loadAsync(buf).then(function (zip) {
      var wbFile = zip.file("xl/workbook.xml"); if (!wbFile) return { images: out, unsupported: 0 };
      return Promise.all([wbFile.async("string"), relsOf(zip, "xl/workbook.xml")]).then(function (a) {
        var sheet = tags(xml(a[0]), "sheet")[0]; if (!sheet) return null;
        var rid = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sheet.getAttribute("r:id");
        var sheetPath = a[1][rid] || "xl/worksheets/sheet1.xml";
        return Promise.all([zip.file(sheetPath) ? zip.file(sheetPath).async("string") : "", relsOf(zip, sheetPath)]).then(function (b) {
          var jobs = [];
          // 2a. floating pictures (drawings)
          tags(xml(b[0] || "<x/>"), "drawing").forEach(function (d) {
            var id = d.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || d.getAttribute("r:id");
            var dp = b[1][id]; if (!dp || !zip.file(dp)) return;
            jobs.push(Promise.all([zip.file(dp).async("string"), relsOf(zip, dp)]).then(function (c) {
              var doc = xml(c[0]), sub = [];
              ["twoCellAnchor", "oneCellAnchor"].forEach(function (kind) {
                tags(doc, kind).forEach(function (anc) {
                  var from = tags(anc, "from")[0], blip = tags(anc, "blip")[0]; if (!from || !blip) return;
                  var row = +tags(from, "row")[0].textContent, col = +tags(from, "col")[0].textContent;
                  var rowOff = +((tags(from, "rowOff")[0] || {}).textContent || 0);
                  var to = tags(anc, "to")[0];
                  // a picture that starts in the lower part of a cell belongs to the next row
                  if (to && rowOff > 0) { var toRow = +tags(to, "row")[0].textContent; if (toRow > row && rowOff > 120000) row += 1; }
                  var emb = blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed");
                  var mp = c[1][emb]; if (!mp) return;
                  sub.push(mediaBlob(zip, mp).then(function (m) { if (!m) return; if (m.unsupported) { unsupported++; return; } var k = row + ":" + col; if (!out[k]) out[k] = m; }));
                });
              });
              return Promise.all(sub);
            }));
          });
          // 2b. pictures placed IN cells (Excel 365): cell vm -> metadata -> rich value -> rel -> media
          var vmCells = [];
          tags(xml(b[0] || "<x/>"), "c").forEach(function (c) { if (c.getAttribute("vm")) vmCells.push([c.getAttribute("r"), +c.getAttribute("vm")]); });
          if (vmCells.length && zip.file("xl/metadata.xml") && zip.file("xl/richData/rdrichvalue.xml")) {
            jobs.push(Promise.all([zip.file("xl/metadata.xml").async("string"), zip.file("xl/richData/rdrichvalue.xml").async("string"),
              zip.file("xl/richData/richValueRel.xml") ? zip.file("xl/richData/richValueRel.xml").async("string") : "", relsOf(zip, "xl/richData/richValueRel.xml")]).then(function (d) {
              var meta = xml(d[0]), vmBk = tags(tags(meta, "valueMetadata")[0] || meta, "bk"), fut = tags(meta, "futureMetadata")[0], futBk = fut ? tags(fut, "bk") : [];
              var rvs = tags(xml(d[1]), "rv"), rels = d[2] ? tags(xml(d[2]), "rel") : [];
              return Promise.all(vmCells.map(function (vc) {
                try {
                  var rc = tags(vmBk[vc[1] - 1], "rc")[0], fi = +rc.getAttribute("v");
                  var rvb = tags(futBk[fi], "rvb")[0], rv = rvs[+rvb.getAttribute("i")];
                  var relIdx = +tags(rv, "v")[0].textContent, rel = rels[relIdx];
                  var rid2 = rel.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || rel.getAttribute("r:id");
                  var mp = d[3][rid2]; var pos = XLSX.utils.decode_cell(vc[0]);
                  return mediaBlob(zip, mp).then(function (m) { if (!m) return; if (m.unsupported) { unsupported++; return; } var k = pos.r + ":" + pos.c; if (!out[k]) out[k] = m; });
                } catch (e) { return null; }
              }));
            }));
          }
          return Promise.all(jobs);
        });
      }).then(function () { return { images: out, unsupported: unsupported }; });
    });
  }

  /* --- 3. file chosen --- */
  $("#xl").addEventListener("change", function (e) {
    var file = e.target.files[0]; $("#xl-err").textContent = ""; if (!file) return;
    $("#xl-status").textContent = "Lecture du fichier…";
    loadXLSX().then(function () {
      return file.arrayBuffer();
    }).then(function (buf) {
      var wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: false });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var sh = readSheet(ws), hd = detectHeaders(sh.rows);
      if (!hd) throw new Error("Impossible de trouver la ligne d'en-têtes (REF, NAME, Size…) dans la première feuille.");
      headers = hd.headers;
      // header parts ("Product (cm) Length" -> "product", "cm", "length"…) to recognise extra heading rows
      var headWords = {}; HEAD_WORDS.forEach(function (w) { headWords[w] = 1; });
      headers.forEach(function (h) { headWords[norm(h)] = 1; norm(h).split(" ").forEach(function (w) { if (w.length > 1) headWords[w] = 1; }); });
      var looksLikeHeading = function (r) {
        var hits = 0, nums = 0;
        r.cells.forEach(function (c) { if (typeof c === "number") nums++; var t = norm(c); if (t && headWords[t]) hits++; });
        return (hits >= 3 && nums === 0) || (hits >= 5 && nums <= 1);
      };
      sheetRows = sh.rows.slice(hd.start).filter(function (r) { return r.cells.some(function (c) { return String(c).trim(); }) && !looksLikeHeading(r); });
      sheetRows.forEach(function (r) { r.c0 = sh.c0; });
      sheetFile = file.name;
      var isZip = /\.xlsx$|\.xlsm$/i.test(file.name);
      return (isZip ? extractImages(buf) : Promise.resolve({ images: {}, unsupported: 0 })).then(function (im) {
        sheetImages = im.images; sheetImages.__unsupported = im.unsupported;
        $("#xl-status").textContent = "";
        buildMap();
      });
    }).catch(function (err) { $("#xl-status").textContent = ""; $("#xl-err").textContent = err.message || "Fichier illisible."; });
  });
  function guessCol(f, nh, used) {
    var best = -1, bestLen = 0;
    f[2].forEach(function (phrase) {
      var p = norm(phrase) || phrase;
      nh.forEach(function (h, i) {
        if (used[i] || !hasWords(h, p)) return;
        if (f[3].some(function (x) { return hasWords(h, norm(x)) && !hasWords(p, norm(x)); })) return;
        var exact = h === p ? 1000 : 0, len = p.length + exact;
        if (len > bestLen) { bestLen = len; best = i; }
      });
    });
    return best;
  }
  function buildMap() {
    var nh = headers.map(norm), used = {}, guesses = {};
    // most specific fields first so "weight pack" doesn't steal "weight"
    FIELDS.slice().sort(function (a, b) { return b[2][0].length - a[2][0].length; }).forEach(function (f) { var g = guessCol(f, nh, used); if (g > -1) { used[g] = 1; guesses[f[0]] = g; } });
    $("#map").innerHTML = FIELDS.map(function (f) {
      var guess = f[0] in guesses ? guesses[f[0]] : -1;
      return '<label>' + f[1] + '<select data-field="' + f[0] + '"><option value="-1">— ignorer —</option>' +
        headers.map(function (h, i) { return '<option value="' + i + '"' + (i === guess ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select></label>";
    }).join("");
    $("#map-card").hidden = false;
    $$("#map select").forEach(function (s) { s.addEventListener("change", preview); });
    preview();
  }

  /* --- 4. rows -> products (one product per Nº / name, one variant per row) --- */
  function mapped() {
    var m = {}; $$("#map select").forEach(function (s) { m[s.getAttribute("data-field")] = Number(s.value); });
    var g = function (row, k) { return m[k] >= 0 ? row.cells[m[k]] : ""; };
    var s = function (row, k) { var v = g(row, k); return String(v == null ? "" : v).trim(); };
    var groups = [], cur = null, lastKey = null;
    sheetRows.forEach(function (row) {
      var key = s(row, "group") || s(row, "name");
      if (!key) key = "row" + row.r;
      if (!cur || key !== lastKey) { cur = { rows: [] }; groups.push(cur); lastKey = key; }
      cur.rows.push(row);
    });
    var photoCol = m.photo >= 0 ? m.photo + (sheetRows[0] ? sheetRows[0].c0 : 0) : -1;
    function rowImage(row) {
      if (photoCol > -1 && sheetImages[row.r + ":" + photoCol]) return { emb: sheetImages[row.r + ":" + photoCol] };
      for (var k in sheetImages) { if (k.indexOf(row.r + ":") === 0) return { emb: sheetImages[k] }; }   // picture anywhere on the row
      var link = [s(row, "webp"), s(row, "jpeg")].filter(function (u) { return /^https?:\/\//i.test(u); })[0];
      return link ? { url: link } : null;
    }
    return groups.map(function (gr) {
      var first = function (k) { for (var i = 0; i < gr.rows.length; i++) { var v = s(gr.rows[i], k); if (v) return v; } return ""; };
      var name = first("name"); if (!name) return null;
      var variants = gr.rows.map(function (row) {
        var v = { size: s(row, "size"), ref: s(row, "ref") };
        ["weight", "l", "w", "h", "pl", "pw", "ph", "packWeight", "volume"].forEach(function (k) { var x = g(row, k); if (x !== "" && x != null) v[k] = x; });
        v._img = rowImage(row);
        return v;
      }).filter(function (v) { return v.size || v.ref || v.weight || v.l || v._img; });
      var refs = variants.map(function (v) { return v.ref; }).filter(Boolean);
      var sizes = variants.map(function (v) { return v.size; }).filter(Boolean);
      var feat = norm(first("featured"));
      return {
        name: name, ref: refs[0] || "", family: m.family >= 0 && first("family") ? guessFamily(first("family")) : guessFamily(/onyx/i.test(name + " " + first("wsCat") + " " + first("finish")) ? "onyx" : "", first("wsSub"), first("retailSubsub"), first("retailSub"), first("wsCat"), name),
        finish: first("finish") || guessFinish(name, first("wsCat")), sizes: sizes.join(" · "), description: first("description"), longDescription: first("longDescription"),
        retailCat: first("retailCat"), retailSub: first("retailSub"), retailSubsub: first("retailSubsub"), wsCat: first("wsCat"), wsSub: first("wsSub"), status: first("status"),
        variants: variants.length > 1 || (variants[0] && (variants[0].size || variants[0].weight || variants[0].l)) ? variants : [],
        _imgs: variants.map(function (v) { return v._img; }).filter(Boolean), _refs: refs,
        bg: "white", featured: /^(1|oui|yes|x|true|vrai)$/.test(feat) ? 1 : 0
      };
    }).filter(Boolean);
  }
  var thumbUrls = [];
  function preview() {
    thumbUrls.forEach(URL.revokeObjectURL); thumbUrls = [];
    var list = mapped(), nEmb = 0, nLink = 0, nNone = 0, nVar = 0;
    list.forEach(function (p) { nVar += Math.max(1, p.variants.length); var i = p._imgs[0]; if (!i) nNone++; else if (i.emb) nEmb++; else nLink++; });
    var unsup = sheetImages.__unsupported;
    $("#map-info").innerHTML = esc(sheetFile) + " · <b>" + list.length + " produit(s)</b>, " + nVar + " taille(s) · photos : " + nEmb + " dans le fichier, " + nLink + " par lien, " + nNone + " sans photo" +
      (unsup ? " · <span class='warn-t'>" + unsup + " image(s) dans un format non pris en charge (EMF/GIF…)</span>" : "") + ". Vérifiez les colonnes ci-dessous.";
    $("#preview").innerHTML = "<thead><tr><th>Photo</th><th>Nom</th><th>Réf.</th><th>Famille</th><th>Tailles</th><th>Catégories</th><th>Description</th></tr></thead><tbody>" +
      list.slice(0, 15).map(function (p) {
        var i = p._imgs[0], th = "—";
        if (i && i.emb) { var u = URL.createObjectURL(i.emb.blob); thumbUrls.push(u); th = "<div class='thumb white'><img src='" + u + "' alt=''></div>"; }
        else if (i && i.url) th = "<span class='muted small'>lien</span>";
        var dims = p.variants.map(function (v) { return esc(v.size || "·") + (v.l ? " <small class='muted'>" + [v.l, v.w, v.h].filter(function (x) { return x !== undefined && x !== ""; }).join("×") + " cm</small>" : ""); }).join("<br>");
        return "<tr><td>" + th + "</td><td class='nm'>" + esc(p.name) + "<small>" + esc(p.finish) + (p.status ? " · " + esc(p.status) : "") + "</small></td><td class='muted'>" + esc(p._refs.join(", ")) + "</td><td>" + esc(famName[p.family] || p.family) + "</td><td>" + (dims || esc(p.sizes) || "—") + "</td><td class='muted small'>" + esc([p.retailCat, p.retailSub, p.retailSubsub].filter(Boolean).join(" › ")) + (p.wsSub ? "<br>" + esc([p.wsCat, p.wsSub].filter(Boolean).join(" › ")) : "") + "</td><td class='muted small'>" + esc(p.description.slice(0, 90)) + (p.description.length > 90 ? "…" : "") + "</td></tr>";
      }).join("") + (list.length > 15 ? '<tr><td colspan="7" class="muted">… et ' + (list.length - 15) + " autres</td></tr>" : "") + "</tbody>";
    $("#do-import").textContent = "Importer " + list.length + " produit" + (list.length > 1 ? "s" : "");
    $("#do-import").disabled = list.length === 0;
  }

  /* --- 5. import: upload photos (deduplicated), then merge into the catalogue --- */
  function uploadEmbedded(emb, name) {
    var file = new File([emb.blob], name + "." + (emb.blob.type.split("/")[1] || "png"), { type: emb.blob.type });
    return window.AAM_IMG.prepare(file).then(function (d) { return api("POST", "/api/upload", { dataUrl: d, name: name }); }).then(function (r) { return r.path; });
  }
  function uploadLink(url, name) {
    return api("POST", "/api/fetch-image", { url: url }).then(function (r) { return fetch(r.dataUrl); }).then(function (res) { return res.blob(); })
      .then(function (b) { return window.AAM_IMG.prepare(new File([b], name, { type: b.type })); })
      .then(function (d) { return api("POST", "/api/upload", { dataUrl: d, name: name }); }).then(function (r) { return r.path; });
  }
  $("#do-import").addEventListener("click", function () {
    var list = mapped(); if (!list.length) return;
    var mode = $("input[name=mode]:checked").value, withPhotos = !$("#xl-nophotos") || !$("#xl-nophotos").checked;
    if (mode === "replace" && !confirm("Remplacer les " + products.length + " produits actuels par les " + list.length + " produits du fichier ?")) return;
    var btn = $("#do-import"), prog = $("#xl-progress"); btn.disabled = true;
    var jobs = [], cache = {}, failed = [];
    if (withPhotos) list.forEach(function (p) { p.variants.concat(p.variants.length ? [] : [{ _img: p._imgs[0] }]).forEach(function (v) { if (v._img) jobs.push([p, v]); }); });
    var done = 0, total = jobs.length;
    function step() {
      prog.hidden = !total; prog.max = total || 1; prog.value = done;
      $("#xl-status").textContent = total ? "Photos : " + done + " / " + total + "…" : "";
    }
    step();
    var chain = Promise.resolve();
    jobs.forEach(function (j) {
      chain = chain.then(function () {
        var p = j[0], v = j[1], key = v._img.emb ? "e:" + v._img.emb.key : "u:" + v._img.url, base = (p.name + " " + (v.size || "")).trim();
        var pr = cache[key] || (cache[key] = (v._img.emb ? uploadEmbedded(v._img.emb, base) : uploadLink(v._img.url, base)));
        return pr.then(function (path) { v.img = path; }).catch(function (err) { failed.push(p.name + (v.size ? " (" + v.size + ")" : "") + " : " + err.message); })
          .then(function () { done++; step(); });
      });
    });
    chain.then(function () {
      var added = 0, updated = 0;
      list.forEach(function (n) {
        var imgs = []; n.variants.forEach(function (v) { if (v.img && imgs.indexOf(v.img) < 0) imgs.push(v.img); delete v._img; });
        if (!n.variants.length && n._imgs[0] && n._imgs[0].path) imgs.push(n._imgs[0].path);
        var single = !n.variants.length && jobs.filter(function (j) { return j[0] === n; })[0];
        if (single && single[1].img) imgs.push(single[1].img);
        n.img = imgs[0] || ""; n.images = imgs; delete n._imgs;
        var refs = n._refs.map(norm); delete n._refs;
        if (mode === "replace") return;
        var hit = products.find(function (p) {
          var pr = [p.ref].concat((p.variants || []).map(function (v) { return v.ref; })).filter(Boolean).map(norm);
          return refs.some(function (r) { return pr.indexOf(r) > -1; }) || norm(p.name) === norm(n.name);
        });
        if (hit) {
          Object.keys(n).forEach(function (k) {
            if (k === "featured" || k === "bg") return;
            var val = n[k]; if (val === "" || val == null || (Array.isArray(val) && !val.length)) return;
            hit[k] = val;
          });
          if (n.featured && !hit.featured) hit.featured = nextFeatured();
          n._hit = true; updated++;
        } else { if (n.featured) n.featured = nextFeatured(); }
      });
      if (mode === "replace") { products = list; added = list.length; }
      else list.forEach(function (n) { if (!n._hit) { products.push(n); added++; } delete n._hit; });
      return save().then(function () {
        toast(added + " ajouté(s), " + updated + " mis à jour" + (failed.length ? ", " + failed.length + " photo(s) non récupérée(s)" : "") + ".", !!failed.length);
        $("#xl-status").textContent = ""; prog.hidden = true;
        $("#xl-failed").hidden = !failed.length;
        $("#xl-failed").innerHTML = failed.length ? "<b>Photos non récupérées</b> (ajoutez-les depuis la fiche produit) :<ul>" + failed.slice(0, 50).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "";
        if (!failed.length) { $("#map-card").hidden = true; $("#xl").value = ""; location.hash = "#/products"; }
      });
    }).catch(function (err) { toast(err.message, true); }).then(function () { btn.disabled = false; });
  });

  /* ---------- Boot ---------- */
  api("GET", "/api/session").then(function (s) { if (s.authed) showApp(); else showLogin(); }).catch(showLogin);
})();
