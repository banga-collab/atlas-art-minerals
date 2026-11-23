/* Atlas Art Minerals — CMS views: overview, articles, authors, categories, templates, customization,
   media library, upload, image engine, deployment. Relies on window.AAM_ADMIN (admin.js). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var A = function () { return window.AAM_ADMIN; };
  var api = function (m, u, b) { return A().api(m, u, b); };
  var toast = function (m, b) { A().toast(m, b); };
  var src = function (p) { return !p ? "" : /^https?:/i.test(p) ? p : "../" + p; };
  var kb = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko"; };
  var fmtDate = function (t) { var d = new Date(t); return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  var PAGE_LABEL = { "index.html": "Accueil", "collection.html": "Collection", "workshop.html": "Atelier", "trade.html": "Trade", "quote.html": "Devis", "journal.html": "Journal", "article.html": "Article" };

  var site = {}, journal = { posts: [], authors: [], categories: [] };
  function loadSite() { return api("GET", "/api/site").then(function (s) { site = s || {}; return site; }); }
  function loadJournal() { return api("GET", "/api/journal").then(function (j) { journal = j; return j; }); }
  function saveJournal(msg) { return api("PUT", "/api/journal", journal).then(function (j) { journal = { posts: j.posts, authors: j.authors, categories: j.categories }; if (msg) toast(msg); return j; }).catch(function (e) { toast(e.message, true); throw e; }); }

  /* ================= Image engine (client-side resize + WebP) ================= */
  window.AAM_IMG = {
    prepare: function (file) {
      return new Promise(function (resolve, reject) {
        if (!/^image\/(webp|jpeg|png)$/.test(file.type)) return reject(new Error("Photo WEBP, JPG ou PNG uniquement."));
        if (file.size > 15 * 1024 * 1024) return reject(new Error("Photo trop lourde (max 15 Mo avant optimisation)."));
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var max = Number(site.imgMax) || 1800, q = (Number(site.imgQuality) || 82) / 100, webp = site.imgWebp !== false;
          var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
          var c = document.createElement("canvas"); c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
          var type = webp ? "image/webp" : (file.type === "image/png" ? "image/png" : "image/jpeg");
          var out = c.toDataURL(type, q);
          if (type === "image/webp" && out.indexOf("data:image/webp") !== 0) out = c.toDataURL("image/jpeg", q);
          var approx = out.length * 0.75;
          if (scale === 1 && approx >= file.size) { var rd = new FileReader(); rd.onload = function () { resolve(rd.result); }; rd.onerror = function () { reject(new Error("Lecture impossible.")); }; rd.readAsDataURL(file); return; }
          if (approx > 5 * 1024 * 1024) return reject(new Error("Image encore trop lourde après optimisation (max 5 Mo)."));
          resolve(out);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
        img.src = url;
      });
    },
    reencode: function (path) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var max = Number(site.imgMax) || 1800, q = (Number(site.imgQuality) || 82) / 100;
          var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL(site.imgWebp !== false ? "image/webp" : "image/jpeg", q));
        };
        img.onerror = function () { reject(new Error("Image illisible")); };
        img.src = src(path) + "?r=" + Date.now();
      });
    }
  };
  function uploadFile(file, folder, name) {
    return window.AAM_IMG.prepare(file).then(function (d) { return api("POST", "/api/upload", { dataUrl: d, name: name || file.name.replace(/\.\w+$/, ""), folder: folder || "library" }); });
  }

  /* ================= Media picker ================= */
  var libCb = null, libItems = [];
  window.AAM_PICK = function (cb) { openLibrary(cb); };
  function openLibrary(cb) {
    libCb = cb; $("#lib-q").value = "";
    api("GET", "/api/assets").then(function (list) { libItems = list.filter(function (a) { return !/\.svg$/i.test(a.path); }); renderLib(); $("#lib-dlg").showModal(); });
  }
  function renderLib() {
    var q = $("#lib-q").value.trim().toLowerCase();
    $("#lib-grid").innerHTML = libItems.filter(function (a) { return !q || a.path.toLowerCase().indexOf(q) > -1; }).slice(0, 300).map(function (a) {
      return "<button type='button' class='as-card' data-p='" + esc(a.path) + "'><span class='as-th'><img src='" + esc(src(a.path)) + "' alt='' loading='lazy'></span><span class='as-nm'>" + esc(a.path.split("/").pop()) + "</span></button>";
    }).join("");
  }
  $("#lib-q").addEventListener("input", renderLib);
  $("#lib-grid").addEventListener("click", function (e) { var b = e.target.closest("[data-p]"); if (!b) return; $("#lib-dlg").close(); if (libCb) libCb(b.getAttribute("data-p")); });
  $$("[data-close-lib]").forEach(function (b) { b.addEventListener("click", function () { $("#lib-dlg").close(); }); });

  /* ================= Overview ================= */
  function showOverview() {
    Promise.all([api("GET", "/api/status"), loadJournal(), loadSite()]).then(function (r) {
      var s = r[0];
      var cards = [
        ["Produits", s.products, s.families + " familles", "#/products"], ["Articles", s.posts, s.published + " publié(s)", "#/articles"],
        ["Pages", s.pages, "modifiables", "#/pages"], ["Médias", s.assets, kb(s.assetsBytes) + " au total", "#/assets"],
        ["Auteurs", s.authors, s.categories + " catégories", "#/authors"], ["Versions", s.backups.length, "sauvegardes de pages", "#/deployment"]
      ];
      $("#ov-cards").innerHTML = cards.map(function (c) { return "<a class='ov-card' href='" + c[3] + "'><span>" + c[0] + "</span><b>" + c[1] + "</b><small>" + esc(c[2]) + "</small></a>"; }).join("");
      var act = s.backups.slice(0, 6).map(function (b) { return { t: b.time, txt: "Page « " + (PAGE_LABEL[b.page] || b.page) + " » modifiée" }; });
      journal.posts.slice(0, 4).forEach(function (p) { act.push({ t: new Date(p.date + "T12:00").getTime(), txt: (p.status === "published" ? "Article publié : " : "Brouillon : ") + p.title }); });
      act.sort(function (a, b) { return b.t - a.t; });
      $("#ov-activity").innerHTML = act.length ? act.slice(0, 8).map(function (a) { return "<li><span>" + esc(a.txt) + "</span><small>" + fmtDate(a.t) + "</small></li>"; }).join("") : "<li class='muted'>Rien pour l'instant.</li>";
      var checks = [];
      if (s.firstPassword) checks.push(["warn", "Changez le mot de passe initial", "#/settings"]);
      if (!site.whatsapp) checks.push(["warn", "Ajoutez votre numéro WhatsApp", "#/settings"]);
      if (s.heavyAssets) checks.push(["warn", s.heavyAssets + " image(s) lourde(s) à optimiser", "#/engine"]);
      if (s.unusedAssets) checks.push(["info", s.unusedAssets + " média(s) non utilisé(s)", "#/assets"]);
      if (!s.published) checks.push(["info", "Publiez votre premier article de journal", "#/articles"]);
      if (!checks.length) checks.push(["ok", "Tout est en ordre.", "#/overview"]);
      $("#ov-checks").innerHTML = checks.map(function (c) { return "<li class='" + c[0] + "'><a href='" + c[2] + "'>" + esc(c[1]) + " →</a></li>"; }).join("");
    }).catch(function (e) { toast(e.message, true); });
  }
  $$("[data-new-article]").forEach(function (a) { a.addEventListener("click", function () { loadJournal().then(function () { openPost(null); }); }); });

  /* ================= Articles ================= */
  var editingPost = null, coverPath = "";
  function catName(id) { var c = journal.categories.find(function (x) { return x.id === id; }); return c ? c.name : "—"; }
  function authName(id) { var a = journal.authors.find(function (x) { return x.id === id; }); return a ? a.name : "—"; }
  function renderPosts() {
    var q = $("#art-q").value.trim().toLowerCase(), st = $("#art-status").value;
    var list = journal.posts.filter(function (p) { return (!st || p.status === st) && (!q || (p.title + " " + p.excerpt).toLowerCase().indexOf(q) > -1); });
    $("#art-rows").innerHTML = list.map(function (p) {
      return "<tr data-id='" + esc(p.id) + "'><td><div class='thumb scene'>" + (p.cover ? "<img src='" + esc(src(p.cover)) + "' alt=''>" : "") + "</div></td>" +
        "<td class='nm'>" + esc(p.title) + (p.excerpt ? "<small>" + esc(p.excerpt) + "</small>" : "") + "</td><td>" + esc(catName(p.category)) + "</td><td>" + esc(authName(p.author)) + "</td>" +
        "<td class='muted'>" + esc(p.date) + "</td><td><span class='status " + p.status + "'>" + (p.status === "published" ? "Publié" : "Brouillon") + "</span></td>" +
        "<td><div class='acts'><button class='ghost' type='button' data-edit-post>Modifier</button>" + (p.status === "published" ? "<a class='ghost' href='../article.html?a=" + encodeURIComponent(p.id) + "' target='_blank' rel='noopener'>Voir ↗</a>" : "") + "</div></td></tr>";
    }).join("");
    $("#art-empty").hidden = list.length > 0;
  }
  function fillSelects() {
    $("#a-cat").innerHTML = "<option value=''>Sans catégorie</option>" + journal.categories.map(function (c) { return "<option value='" + esc(c.id) + "'>" + esc(c.name) + "</option>"; }).join("");
    $("#a-author").innerHTML = "<option value=''>Sans auteur</option>" + journal.authors.map(function (a) { return "<option value='" + esc(a.id) + "'>" + esc(a.name) + "</option>"; }).join("");
  }
  function setCover(p) { coverPath = p || ""; $("#a-cover-img").hidden = !p; $("#a-cover-none").hidden = !!p; if (p) $("#a-cover-img").src = src(p); }
  function toDisplay(html) { return String(html || "").replace(/src="assets\//g, 'src="../assets/'); }
  function fromDisplay(html) { return String(html || "").replace(/src="(?:https?:\/\/[^"]*?)?\.\.\/assets\//g, 'src="assets/').replace(/src="\/assets\//g, 'src="assets/'); }
  function openPost(p) {
    editingPost = p; fillSelects();
    $("#art-list-view").hidden = true; $("#art-form").hidden = false;
    $("#a-title").value = p ? p.title : ""; $("#a-excerpt").value = p ? p.excerpt : "";
    $("#a-body").innerHTML = p ? toDisplay(p.body) : "<p></p>";
    $("#a-status").value = p ? p.status : "draft"; $("#a-date").value = p ? p.date : new Date().toISOString().slice(0, 10);
    $("#a-cat").value = p ? p.category : ""; $("#a-author").value = p ? p.author : (journal.authors[0] ? journal.authors[0].id : "");
    $("#a-seo-t").value = p ? p.seoTitle : ""; $("#a-seo-d").value = p ? p.seoDescription : "";
    $("#a-title").closest(".field").classList.remove("invalid");
    $("#art-del").hidden = !p; setCover(p ? p.cover : ""); $("#a-title").focus();
  }
  function closePost() { $("#art-form").hidden = true; $("#art-list-view").hidden = false; renderPosts(); }
  function submitPost(status) {
    var title = $("#a-title").value.trim();
    $("#a-title").closest(".field").classList.toggle("invalid", !title);
    if (!title) { $("#a-title").focus(); return; }
    var data = { title: title, excerpt: $("#a-excerpt").value.trim(), body: fromDisplay($("#a-body").innerHTML), cover: coverPath, category: $("#a-cat").value, author: $("#a-author").value, date: $("#a-date").value, status: status || $("#a-status").value, seoTitle: $("#a-seo-t").value.trim(), seoDescription: $("#a-seo-d").value.trim() };
    if (editingPost) Object.assign(editingPost, data); else { journal.posts.unshift(data); editingPost = data; }
    saveJournal(data.status === "published" ? "Article publié." : "Brouillon enregistré.").then(function (j) {
      editingPost = j.posts.find(function (x) { return x.title === title && x.date === data.date; }) || null; closePost();
    });
  }
  $("#art-add").addEventListener("click", function () { openPost(null); });
  $("#art-back").addEventListener("click", closePost);
  $("#art-q").addEventListener("input", renderPosts); $("#art-status").addEventListener("change", renderPosts);
  $("#art-rows").addEventListener("click", function (e) { var b = e.target.closest("[data-edit-post]"); if (!b) return; var id = b.closest("tr").getAttribute("data-id"); openPost(journal.posts.find(function (p) { return p.id === id; })); });
  $("#art-form").addEventListener("submit", function (e) { e.preventDefault(); submitPost("published"); });
  $("#art-draft").addEventListener("click", function () { submitPost("draft"); });
  $("#art-del").addEventListener("click", function () {
    if (!editingPost || !confirm("Supprimer l'article « " + editingPost.title + " » ? Cette action est définitive.")) return;
    journal.posts = journal.posts.filter(function (p) { return p !== editingPost; }); saveJournal("Article supprimé.").then(closePost);
  });
  $("#a-cover-file").addEventListener("change", function () { var f = this.files[0]; if (!f) return; uploadFile(f, "library", "cover").then(function (r) { setCover(r.path); }).catch(function (e) { toast(e.message, true); }); this.value = ""; });
  $("#a-cover-lib").addEventListener("click", function () { openLibrary(setCover); });
  $("#a-cover-rm").addEventListener("click", function () { setCover(""); });
  // Rich text toolbar
  $(".rt-bar").addEventListener("mousedown", function (e) { if (e.target.closest("button")) e.preventDefault(); });
  $(".rt-bar").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cmd]"); if (!b) return; var c = b.getAttribute("data-cmd"); $("#a-body").focus();
    if (c === "bold" || c === "italic") document.execCommand(c);
    else if (c === "h2" || c === "h3" || c === "p") document.execCommand("formatBlock", false, c.toUpperCase());
    else if (c === "quote") document.execCommand("formatBlock", false, "BLOCKQUOTE");
    else if (c === "ul") document.execCommand("insertUnorderedList");
    else if (c === "link") { var u = prompt("Adresse du lien (https://… ou page du site) :"); if (u) document.execCommand("createLink", false, u.trim()); }
    else if (c === "image") $("#a-body-img").click();
  });
  $("#a-body-img").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return; this.value = "";
    uploadFile(f, "library", "article").then(function (r) { $("#a-body").focus(); document.execCommand("insertHTML", false, '<img src="../' + r.path + '" alt="">'); }).catch(function (e) { toast(e.message, true); });
  });
  $("#a-body").addEventListener("paste", function (e) { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); });

  /* ================= Authors ================= */
  var editingAuthor = null, authorPhoto = "";
  function renderAuthors() {
    $("#au-list").innerHTML = journal.authors.length ? journal.authors.map(function (a) {
      return "<button type='button' class='person' data-id='" + esc(a.id) + "'><span class='ph round sm'>" + (a.photo ? "<img src='" + esc(src(a.photo)) + "' alt=''>" : "<span>" + esc(a.name.charAt(0)) + "</span>") + "</span><b>" + esc(a.name) + "</b><small>" + esc(a.role || "") + "</small><small class='muted'>" + journal.posts.filter(function (p) { return p.author === a.id; }).length + " article(s)</small></button>";
    }).join("") : "<p class='muted'>Aucun auteur. Ajoutez-en un pour signer vos articles.</p>";
  }
  function setAuthorPhoto(p) { authorPhoto = p || ""; $("#au-img").hidden = !p; $("#au-none").hidden = !!p; if (p) $("#au-img").src = src(p); }
  function openAuthor(a) {
    editingAuthor = a; $("#au-name").value = a ? a.name : ""; $("#au-role").value = a ? a.role : ""; $("#au-bio").value = a ? a.bio : "";
    setAuthorPhoto(a ? a.photo : ""); $("#au-del").hidden = !a; $("#au-name").closest(".field").classList.remove("invalid"); $("#au-dlg").showModal();
  }
  $("#au-add").addEventListener("click", function () { openAuthor(null); });
  $("#au-list").addEventListener("click", function (e) { var b = e.target.closest("[data-id]"); if (b) openAuthor(journal.authors.find(function (a) { return a.id === b.getAttribute("data-id"); })); });
  $$("[data-close-au]").forEach(function (b) { b.addEventListener("click", function () { $("#au-dlg").close(); }); });
  $("#au-file").addEventListener("change", function () { var f = this.files[0]; if (!f) return; uploadFile(f, "library", "author").then(function (r) { setAuthorPhoto(r.path); }).catch(function (e) { toast(e.message, true); }); this.value = ""; });
  $("#au-form").addEventListener("submit", function (e) {
    e.preventDefault(); var name = $("#au-name").value.trim();
    $("#au-name").closest(".field").classList.toggle("invalid", !name); if (!name) return;
    var d = { name: name, role: $("#au-role").value.trim(), bio: $("#au-bio").value.trim(), photo: authorPhoto };
    if (editingAuthor) Object.assign(editingAuthor, d); else journal.authors.push(d);
    saveJournal("Auteur enregistré.").then(function () { $("#au-dlg").close(); renderAuthors(); });
  });
  $("#au-del").addEventListener("click", function () {
    if (!editingAuthor || !confirm("Supprimer l'auteur « " + editingAuthor.name + " » ? Ses articles resteront, sans auteur.")) return;
    journal.authors = journal.authors.filter(function (a) { return a !== editingAuthor; }); saveJournal("Auteur supprimé.").then(function () { $("#au-dlg").close(); renderAuthors(); });
  });

  /* ================= Categories (journal + product families) ================= */
  function rowEdit(item, withText, ph) {
    return "<li><input class='r-name' value='" + esc(item.name || "") + "' placeholder='" + ph + "' maxlength='60' aria-label='Nom'>" +
      (withText ? "<input class='r-text' value='" + esc(item.blurb || item.description || "") + "' placeholder='Description courte' maxlength='300' aria-label='Description'>" : "") +
      "<input type='hidden' class='r-id' value='" + esc(item.id || "") + "'><button type='button' class='x' data-rm aria-label='Supprimer'>×</button></li>";
  }
  function renderCats() {
    $("#jc-list").innerHTML = journal.categories.map(function (c) { return rowEdit(c, true, "Nom de la catégorie"); }).join("") || "";
    var fams = A().families();
    $("#pf-list").innerHTML = fams.map(function (f) {
      var n = A().products().filter(function (p) { return p.family === f.id; }).length;
      return rowEdit(f, true, "Nom de la famille").replace("</li>", "<small class='muted cnt'>" + n + " produit(s)</small></li>");
    }).join("");
  }
  function readRows(ul, textKey) { return $$("li", ul).map(function (li) { var o = { id: $(".r-id", li).value, name: $(".r-name", li).value.trim() }; o[textKey] = ($(".r-text", li) || { value: "" }).value.trim(); return o; }).filter(function (o) { return o.name; }); }
  $("#jc-add").addEventListener("click", function () { $("#jc-list").insertAdjacentHTML("beforeend", rowEdit({}, true, "Nom de la catégorie")); $("#jc-list li:last-child .r-name").focus(); });
  $("#pf-add").addEventListener("click", function () { $("#pf-list").insertAdjacentHTML("beforeend", rowEdit({}, true, "Nom de la famille")); $("#pf-list li:last-child .r-name").focus(); });
  ["#jc-list", "#pf-list"].forEach(function (s) { $(s).addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) b.closest("li").remove(); }); });
  $("#jc-save").addEventListener("click", function () { journal.categories = readRows($("#jc-list"), "description"); saveJournal("Catégories enregistrées.").then(renderCats); });
  $("#pf-save").addEventListener("click", function () {
    api("PUT", "/api/families", { families: readRows($("#pf-list"), "blurb") }).then(function () { toast("Familles enregistrées."); A().reloadCatalog(); setTimeout(renderCats, 400); }).catch(function (e) { toast(e.message, true); });
  });

  /* ================= Templates ================= */
  var TPL = [
    { id: "light", name: "Galerie claire", desc: "Blanc cassé, gris doux, accent or. Le style actuel.", sw: ["#f8f7f5", "#ecebe8", "#1a1918", "#b08d4a"] },
    { id: "night", name: "Galerie nuit", desc: "Fond sombre chaud, la sélénite ressort comme éclairée.", sw: ["#1b1816", "#2a2622", "#f2ede6", "#c9a35c"] },
    { id: "sand", name: "Sable de l'Atlas", desc: "Tons sable et terre, plus chaleureux et marocain.", sw: ["#f4ebdf", "#e8dac7", "#3a2a22", "#b5532a"] },
    { id: "stone", name: "Pierre grise", desc: "Gris minéral neutre, très sobre et contemporain.", sw: ["#f2f3f3", "#e3e5e6", "#22272a", "#4f6f86"] }
  ];
  function renderTemplates() {
    var cur = site.theme || "light";
    $("#tpl-grid").innerHTML = TPL.map(function (t) {
      return "<div class='tpl" + (t.id === cur ? " on" : "") + "'><div class='tpl-prev' style='background:" + t.sw[0] + "'><span style='background:" + t.sw[1] + "'></span><b style='color:" + t.sw[2] + "'>Aa</b><i style='background:" + t.sw[3] + "'></i></div>" +
        "<div class='tpl-txt'><b>" + esc(t.name) + "</b><small>" + esc(t.desc) + "</small></div>" +
        (t.id === cur ? "<span class='status published'>Actif</span>" : "<button class='btn' type='button' data-tpl='" + t.id + "'>Appliquer</button>") + "</div>";
    }).join("");
  }
  $("#tpl-grid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tpl]"); if (!b) return; b.disabled = true;
    api("PUT", "/api/appearance", { theme: b.getAttribute("data-tpl") }).then(function (r) { site = r.site; renderTemplates(); toast("Modèle appliqué à tout le site."); }).catch(function (e2) { toast(e2.message, true); b.disabled = false; });
  });

  /* ================= Customization ================= */
  var DEFAULT_ACCENT = "#9f7c3b";
  var FONT_CSS = { manrope: "Manrope", figtree: "Figtree", instrument: "Instrument Sans", dmsans: "DM Sans", bricolage: "Bricolage Grotesque" };
  function paintPreview() {
    var p = $("#cust-prev"), acc = $("#c-accent").value, r = $("#c-radius").value;
    p.style.setProperty("--pa", acc); p.style.setProperty("--pr", r + "px"); p.style.fontFamily = '"' + FONT_CSS[$("#c-font").value] + '", system-ui, sans-serif';
    $(".cp-top", p).hidden = !$("#c-topbar").checked; $("#c-radius-v").textContent = r + " px"; $("#c-accent-hex").value = acc;
    var f = $("#c-font").value; if (f !== "manrope" && !document.getElementById("gf-" + f)) {
      var l = document.createElement("link"); l.id = "gf-" + f; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=" + FONT_CSS[f].replace(/ /g, "+") + ":wght@400;600;700&display=swap"; document.head.appendChild(l);
    }
  }
  function showCustomize() {
    $("#c-accent").value = site.accent || DEFAULT_ACCENT; $("#c-font").value = site.font || "manrope";
    $("#c-radius").value = site.radius != null && site.radius !== "" ? site.radius : 6; $("#c-topbar").checked = site.showTopbar !== false; paintPreview();
  }
  ["#c-accent", "#c-font", "#c-radius", "#c-topbar"].forEach(function (s) { $(s).addEventListener("input", paintPreview); $(s).addEventListener("change", paintPreview); });
  $("#c-accent-hex").addEventListener("change", function () { if (/^#[0-9a-f]{6}$/i.test(this.value)) { $("#c-accent").value = this.value; paintPreview(); } });
  $("#c-accent-reset").addEventListener("click", function () { $("#c-accent").value = DEFAULT_ACCENT; paintPreview(); });
  $("#cust-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var acc = $("#c-accent").value.toLowerCase();
    api("PUT", "/api/appearance", { accent: acc === DEFAULT_ACCENT ? "" : acc, font: $("#c-font").value, radius: $("#c-radius").value, showTopbar: $("#c-topbar").checked })
      .then(function (r) { site = r.site; toast("Personnalisation appliquée au site."); }).catch(function (e2) { toast(e2.message, true); });
  });

  /* ================= Media library ================= */
  var assets = [];
  function showAssets() { api("GET", "/api/assets").then(function (l) { assets = l; renderAssets(); }).catch(function (e) { toast(e.message, true); }); }
  function renderAssets() {
    var q = $("#as-q").value.trim().toLowerCase(), f = $("#as-folder").value, fl = $("#as-filter").value;
    var list = assets.filter(function (a) { return (!f || a.folder === f) && (!q || a.path.toLowerCase().indexOf(q) > -1) && (fl !== "unused" || !a.used) && (fl !== "heavy" || a.size > 400 * 1024); });
    var total = list.reduce(function (s, a) { return s + a.size; }, 0);
    $("#as-summary").textContent = list.length + " fichier(s) · " + kb(total);
    $("#as-grid").innerHTML = list.map(function (a) {
      return "<div class='as-card'><span class='as-th'><img src='" + esc(src(a.path)) + "' alt='' loading='lazy'></span>" +
        "<span class='as-nm' title='" + esc(a.path) + "'>" + esc(a.path.split("/").pop()) + "</span>" +
        "<span class='as-meta'><span class='" + (a.size > 400 * 1024 ? "heavy" : "") + "'>" + kb(a.size) + "</span><span class='badge " + (a.used ? "used" : "free") + "'>" + (a.used ? "Utilisé" : "Libre") + "</span></span>" +
        "<span class='as-acts'><button type='button' class='mini' data-copy='" + esc(a.path) + "'>Copier</button>" +
        (a.size > 150 * 1024 && !/\.svg$/i.test(a.path) ? "<button type='button' class='mini' data-opt='" + esc(a.path) + "'>Optimiser</button>" : "") +
        (!a.used ? "<button type='button' class='mini danger-t' data-del='" + esc(a.path) + "'>Supprimer</button>" : "") + "</span></div>";
    }).join("") || "<p class='muted'>Aucun fichier.</p>";
  }
  ["#as-q", "#as-folder", "#as-filter"].forEach(function (s) { $(s).addEventListener("input", renderAssets); });
  $("#as-grid").addEventListener("click", function (e) {
    var c = e.target.closest("[data-copy]"), o = e.target.closest("[data-opt]"), d = e.target.closest("[data-del]");
    if (c) { var p = c.getAttribute("data-copy"); (navigator.clipboard ? navigator.clipboard.writeText(p) : Promise.reject()).then(function () { toast("Lien copié : " + p); }, function () { prompt("Lien de l'image :", p); }); }
    if (o) { o.disabled = true; optimizeOne(o.getAttribute("data-opt")).then(function (r) { toast(r.skipped ? "Déjà optimisée." : "Optimisée : " + kb(r.before) + " → " + kb(r.after)); showAssets(); }).catch(function (e2) { toast(e2.message, true); o.disabled = false; }); }
    if (d) { var dp = d.getAttribute("data-del"); if (!confirm("Supprimer définitivement « " + dp.split("/").pop() + " » ?")) return; api("DELETE", "/api/asset", { path: dp }).then(function () { toast("Fichier supprimé."); showAssets(); }).catch(function (e3) { toast(e3.message, true); }); }
  });
  function optimizeOne(p) { return window.AAM_IMG.reencode(p).then(function (d) { return api("POST", "/api/asset/optimize", { path: p, dataUrl: d }); }); }

  /* ================= Upload ================= */
  function doUploads(files) {
    Array.prototype.slice.call(files).forEach(function (f) {
      var li = document.createElement("li"); li.innerHTML = "<span>" + esc(f.name) + "</span><small class='muted'>Optimisation…</small>"; $("#up-list").prepend(li);
      uploadFile(f, "library").then(function (r) {
        li.innerHTML = "<img src='" + esc(src(r.path)) + "' alt=''><span>" + esc(r.path) + "</span><small class='muted'>" + kb(f.size) + " → " + kb(r.size) + "</small><button type='button' class='mini' data-copy-up='" + esc(r.path) + "'>Copier le lien</button>";
      }).catch(function (e) { li.innerHTML = "<span>" + esc(f.name) + "</span><small class='err'>" + esc(e.message) + "</small>"; });
    });
  }
  $("#up-files").addEventListener("change", function () { doUploads(this.files); this.value = ""; });
  var drop = $("#up-drop");
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { doUploads(e.dataTransfer.files); });
  $("#up-list").addEventListener("click", function (e) { var b = e.target.closest("[data-copy-up]"); if (!b) return; var p = b.getAttribute("data-copy-up"); (navigator.clipboard ? navigator.clipboard.writeText(p) : Promise.reject()).then(function () { toast("Lien copié."); }, function () { prompt("Lien :", p); }); });

  /* ================= Image engine ================= */
  function showEngine() {
    $("#g-max").value = site.imgMax || 1800; $("#g-q").value = site.imgQuality || 82; $("#g-q-v").textContent = $("#g-q").value; $("#g-webp").checked = site.imgWebp !== false;
    api("GET", "/api/assets").then(function (l) {
      assets = l; var heavy = l.filter(function (a) { return a.size > 400 * 1024 && !/\.svg$/i.test(a.path); });
      $("#eng-info").textContent = heavy.length ? heavy.length + " image(s) de plus de 400 Ko (" + kb(heavy.reduce(function (s, a) { return s + a.size; }, 0)) + "). Elles seront redimensionnées et converties selon vos réglages ; les liens du site sont mis à jour automatiquement." : "Aucune image lourde. Votre médiathèque est déjà optimisée.";
      $("#eng-run").disabled = !heavy.length;
    });
  }
  $("#g-q").addEventListener("input", function () { $("#g-q-v").textContent = this.value; });
  $("#eng-form").addEventListener("submit", function (e) {
    e.preventDefault();
    api("PUT", "/api/site", { imgMax: $("#g-max").value, imgQuality: $("#g-q").value, imgWebp: $("#g-webp").checked }).then(function (r) { site = r.site; toast("Réglages du moteur d'images enregistrés."); }).catch(function (e2) { toast(e2.message, true); });
  });
  $("#eng-run").addEventListener("click", function () {
    var btn = this; btn.disabled = true; $("#eng-log").innerHTML = "";
    var heavy = assets.filter(function (a) { return a.size > 400 * 1024 && !/\.svg$/i.test(a.path); });
    var saved = 0;
    heavy.reduce(function (pr, a) {
      return pr.then(function () {
        var li = document.createElement("li"); li.innerHTML = "<span>" + esc(a.path) + "</span><small class='muted'>…</small>"; $("#eng-log").appendChild(li);
        return optimizeOne(a.path).then(function (r) { saved += r.before - r.after; li.querySelector("small").textContent = r.skipped ? "déjà optimale" : kb(r.before) + " → " + kb(r.after); })
          .catch(function (e) { li.querySelector("small").textContent = e.message; li.querySelector("small").className = "err"; });
      });
    }, Promise.resolve()).then(function () { toast("Terminé : " + kb(saved) + " économisés."); showEngine(); });
  });

  /* ================= Deployment ================= */
  function showDeployment() {
    api("GET", "/api/status").then(function (s) {
      var up = s.uptime > 86400 ? Math.floor(s.uptime / 86400) + " j" : s.uptime > 3600 ? Math.floor(s.uptime / 3600) + " h" : Math.max(1, Math.floor(s.uptime / 60)) + " min";
      $("#dp-cards").innerHTML = [["Statut", "En ligne", "depuis " + up], ["Serveur", "Node " + s.node, "port " + s.port], ["Contenu", kb(s.dataBytes), "données"], ["Médias", kb(s.assetsBytes), s.assets + " fichiers"]]
        .map(function (c) { return "<div class='ov-card'><span>" + c[0] + "</span><b>" + esc(c[1]) + "</b><small>" + esc(c[2]) + "</small></div>"; }).join("");
      $("#dp-versions").innerHTML = s.backups.map(function (b) {
        return "<tr><td>" + esc(PAGE_LABEL[b.page] || b.page) + "</td><td class='muted'>" + fmtDate(b.time) + "</td><td class='muted'>" + kb(b.size) + "</td><td><button class='ghost' type='button' data-restore='" + esc(b.file) + "'>Restaurer</button></td></tr>";
      }).join("");
      $("#dp-none").hidden = s.backups.length > 0;
    }).catch(function (e) { toast(e.message, true); });
  }
  $("#dp-versions").addEventListener("click", function (e) {
    var b = e.target.closest("[data-restore]"); if (!b) return;
    if (!confirm("Restaurer cette version ? La version actuelle sera elle-même sauvegardée.")) return;
    api("POST", "/api/page-restore", { backup: b.getAttribute("data-restore") }).then(function (r) { toast("Page « " + (PAGE_LABEL[r.page] || r.page) + " » restaurée."); showDeployment(); }).catch(function (e2) { toast(e2.message, true); });
  });
  $("#dp-restore").addEventListener("change", function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    if (!confirm("Restaurer la sauvegarde « " + f.name + " » ? Tout le contenu actuel (produits, articles, textes des pages, traductions, menus, demandes de devis, abonnés, réglages) sera remplacé par celui de la sauvegarde. Les comptes utilisateurs ne sont pas modifiés.")) return;
    var rd = new FileReader();
    rd.onload = function () {
      var data; try { data = JSON.parse(rd.result); } catch (e) { toast("Fichier de sauvegarde invalide.", true); return; }
      api("POST", "/api/import-data", data).then(function () { toast("Sauvegarde restaurée."); A().reloadCatalog(); loadSite(); loadJournal(); showDeployment(); }).catch(function (e2) { toast(e2.message, true); });
    };
    rd.readAsText(f);
  });

  /* ================= View switch ================= */
  window.AAM_CMS = {
    show: function (v) {
      if (v === "overview") showOverview();
      if (v === "articles") loadJournal().then(function () { if ($("#art-form").hidden) renderPosts(); });
      if (v === "authors") loadJournal().then(renderAuthors);
      if (v === "categories") loadJournal().then(renderCats);
      if (v === "templates") loadSite().then(renderTemplates);
      if (v === "customize") loadSite().then(showCustomize);
      if (v === "assets") showAssets();
      if (v === "engine") loadSite().then(showEngine);
      if (v === "deployment") showDeployment();
    }
  };
  loadSite().catch(function () { /* not logged in yet */ });
})();
