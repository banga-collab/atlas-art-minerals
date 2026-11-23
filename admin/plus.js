/* Atlas Art Minerals — admin PLUS: quote requests, statistics, menus, translations, newsletter, SEO,
   users, my account (2FA), activity log, cookies, maintenance, automatic backups. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var A = function () { return window.AAM_ADMIN; };
  var api = function (m, u, b) { return A().api(m, u, b); };
  var toast = function (m, b) { A().toast(m, b); };
  var fmt = function (t) { var d = new Date(t); return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  var role = function () { return (window.AAM_USER || {}).role; };

  /* ================= Quote requests (leads) ================= */
  var ST = { new: ["Nouvelle", "new"], progress: ["En cours", "progress"], quoted: ["Devis envoyé", "quoted"], won: ["Gagnée", "won"], lost: ["Perdue", "lost"] };
  var leads = [], current = null;
  function loadLeads() { return api("GET", "/api/leads").then(function (l) { leads = l; updatePill(); return l; }); }
  function updatePill() { var n = leads.filter(function (l) { return l.status === "new"; }).length, p = $("#ld-pill"); if (p) { p.textContent = n; p.hidden = !n; } }
  function renderLeads() {
    var q = $("#ld-q").value.trim().toLowerCase(), st = $("#ld-status").value;
    var list = leads.filter(function (l) { return (!st || l.status === st) && (!q || (l.name + " " + l.company + " " + l.country + " " + l.email).toLowerCase().indexOf(q) > -1); });
    $("#ld-counts").innerHTML = Object.keys(ST).map(function (k) { var n = leads.filter(function (l) { return l.status === k; }).length; return "<button type='button' class='chip-s " + k + "' data-st='" + k + "'>" + ST[k][0] + " <b>" + n + "</b></button>"; }).join("");
    $("#ld-rows").innerHTML = list.map(function (l) {
      return "<tr data-id='" + esc(l.id) + "' class='" + (current && current.id === l.id ? "sel" : "") + "'><td class='muted'>" + fmt(l.date) + "</td><td class='nm'>" + esc(l.name) + "<small>" + esc(l.company) + "</small></td><td>" + esc(l.country) + "</td><td>" + l.items.length + "</td><td><span class='st " + l.status + "'>" + ST[l.status][0] + "</span></td></tr>";
    }).join("");
    $("#ld-empty").hidden = list.length > 0;
  }
  function renderLead(l) {
    current = l;
    if (!l) { $("#ld-detail").innerHTML = "<p class='muted'>Sélectionnez une demande pour voir le détail.</p>"; return; }
    var total = l.items.reduce(function (s, i) { return s + i.qty; }, 0);
    var wa = l.phone ? "https://wa.me/" + l.phone.replace(/\D/g, "") : "";
    $("#ld-detail").innerHTML =
      "<div class='ld-head'><div><h2>" + esc(l.name) + "</h2><p class='muted'>" + esc(l.company) + " · " + esc(l.country) + (l.type ? " · " + esc(l.type) : "") + "</p></div>" +
      "<select id='ld-set' aria-label='Statut'>" + Object.keys(ST).map(function (k) { return "<option value='" + k + "'" + (k === l.status ? " selected" : "") + ">" + ST[k][0] + "</option>"; }).join("") + "</select></div>" +
      "<p class='ld-contact'><a href='mailto:" + esc(l.email) + "?subject=" + encodeURIComponent("Your Atlas Art Minerals quote") + "'>✉ " + esc(l.email) + "</a>" + (l.phone ? " · <a href='" + esc(wa) + "' target='_blank' rel='noopener'>WhatsApp " + esc(l.phone) + "</a>" : "") + "</p>" +
      "<p class='muted small'>Reçue le " + fmt(l.date) + " · envoyée par " + (l.via === "whatsapp" ? "WhatsApp" : "email") + (l.lang ? " · langue " + esc(l.lang.toUpperCase()) : "") + "</p>" +
      (l.items.length ? "<table class='list small'><thead><tr><th>Pièce</th><th>Qté</th><th>Note</th></tr></thead><tbody>" + l.items.map(function (i) { return "<tr><td>" + esc(i.name) + (i.size || i.ref ? " <b>" + esc([i.size ? "Taille " + i.size : "", i.ref ? "réf. " + i.ref : ""].filter(Boolean).join(" · ")) + "</b>" : "") + "<small class='muted'> · " + esc(i.finish) + "</small></td><td>" + i.qty + "</td><td class='muted'>" + esc(i.note || "") + "</td></tr>"; }).join("") + "</tbody></table><p class='muted small'>" + l.items.length + " pièce(s) · " + total + " unités</p>" : "<p class='muted'>Demande générale, sans liste de pièces.</p>") +
      (l.message ? "<blockquote class='ld-msg'>" + esc(l.message) + "</blockquote>" : "") +
      "<h3>Notes internes</h3><div class='ld-note'><textarea id='ld-note' rows='2' placeholder='Ex. appelé le 12/12, attend échantillons…' aria-label='Ajouter une note'></textarea><button class='btn' type='button' id='ld-note-add'>Ajouter</button></div>" +
      "<ul class='ld-notes'>" + l.notes.map(function (n) { return "<li><small class='muted'>" + fmt(n.t) + " · " + esc(n.by) + "</small>" + esc(n.text) + "</li>"; }).join("") + "</ul>" +
      "<div class='row-end'><button class='danger' type='button' id='ld-del'>Supprimer la demande</button></div>";
    $("#ld-set").addEventListener("change", function () { updateLead({ status: this.value }, "Statut mis à jour."); });
    $("#ld-note-add").addEventListener("click", function () { var t = $("#ld-note").value.trim(); if (t) updateLead({ note: t }, "Note ajoutée."); });
    $("#ld-del").addEventListener("click", function () {
      if (!confirm("Supprimer définitivement la demande de " + l.name + " ?")) return;
      api("DELETE", "/api/lead", { id: l.id }).then(function () { toast("Demande supprimée."); current = null; renderLead(null); loadLeads().then(renderLeads); });
    });
    renderLeads();
  }
  function updateLead(change, msg) {
    api("PUT", "/api/lead", Object.assign({ id: current.id }, change)).then(function (r) {
      var i = leads.findIndex(function (x) { return x.id === r.lead.id; }); leads[i] = r.lead; updatePill(); renderLead(r.lead); toast(msg);
    }).catch(function (e) { toast(e.message, true); });
  }
  $("#ld-rows").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-id]"); if (tr) renderLead(leads.find(function (l) { return l.id === tr.getAttribute("data-id"); })); });
  $("#ld-q").addEventListener("input", renderLeads); $("#ld-status").addEventListener("change", renderLeads);
  $("#ld-counts").addEventListener("click", function (e) { var b = e.target.closest("[data-st]"); if (b) { $("#ld-status").value = b.getAttribute("data-st"); renderLeads(); } });

  /* ================= Statistics ================= */
  function bars(el, rows, label) {
    var max = rows.reduce(function (m, r) { return Math.max(m, r[1]); }, 0) || 1;
    $(el).innerHTML = rows.length ? rows.map(function (r) { return "<li><span class='bl'>" + esc(label ? label(r[0]) : r[0]) + "</span><span class='bb'><i style='width:" + Math.max(2, r[1] / max * 100) + "%'></i></span><b>" + r[1] + "</b></li>"; }).join("") : "<li class='muted'>Pas encore de données.</li>";
  }
  function showStats() {
    api("GET", "/api/stats?days=" + $("#st-days").value).then(function (s) {
      var t = s.totals, conv = t.u ? (t.q / t.u * 100).toFixed(1) : "0";
      $("#st-kpis").innerHTML = [["Visites", t.v, "pages vues"], ["Visiteurs", t.u, "uniques par jour"], ["Demandes de devis", t.q, conv + " % des visiteurs"], ["Inscriptions newsletter", t.nl, "sur la période"]]
        .map(function (c) { return "<div class='ov-card'><span>" + c[0] + "</span><b>" + c[1] + "</b><small>" + c[2] + "</small></div>"; }).join("");
      var max = s.series.reduce(function (m, d) { return Math.max(m, d.v); }, 0) || 1;
      $("#st-chart").innerHTML = s.series.map(function (d) {
        return "<div class='col' title='" + d.d + " : " + d.v + " vues, " + d.u + " visiteurs, " + d.q + " devis'><i style='height:" + (d.v / max * 100) + "%'></i><em style='height:" + (d.u / max * 100) + "%'></em>" + (d.q ? "<b class='dot'></b>" : "") + "</div>";
      }).join("") + "<p class='legend'><span class='lv'></span>Vues <span class='lu'></span>Visiteurs <span class='lq'></span>Jour avec demande de devis</p>";
      var pageName = { "/": "Accueil", "/index.html": "Accueil", "/collection.html": "Collection", "/workshop.html": "Atelier", "/trade.html": "Trade", "/quote.html": "Devis", "/journal.html": "Journal", "/article.html": "Article", "/legal.html": "Mentions légales", "/privacy.html": "Confidentialité" };
      bars("#st-pages", s.pages, function (p) { return pageName[p] || p; }); bars("#st-products", s.products); bars("#st-refs", s.refs, function (r) { return r === "direct" ? "Accès direct / favoris" : r; });
      bars("#st-langs", s.langs); bars("#st-devices", s.devices);
    }).catch(function (e) { toast(e.message, true); });
  }
  $("#st-days").addEventListener("change", showStats);

  /* ================= Menus ================= */
  var LG = ["en", "fr", "ar", "es"];
  function mnRow(it) {
    return "<li>" + LG.map(function (l) { return "<input class='mn-l' data-l='" + l + "' value='" + esc((it.label || {})[l] || "") + "' aria-label='Libellé " + l + "'" + (l === "ar" ? " dir='rtl'" : "") + ">"; }).join("") +
      "<input class='mn-href' list='mn-pages' value='" + esc(it.href || "") + "' aria-label='Lien'><span class='mn-acts'><button type='button' class='mini' data-mv='-1' aria-label='Monter'>↑</button><button type='button' class='mini' data-mv='1' aria-label='Descendre'>↓</button><button type='button' class='mini danger-t' data-rm aria-label='Supprimer'>×</button></span></li>";
  }
  function showMenus() { api("GET", "/api/menu").then(function (m) { $("#mn-header").innerHTML = m.header.map(mnRow).join(""); $("#mn-footer").innerHTML = m.footer.map(mnRow).join(""); }); }
  ["#mn-header", "#mn-footer"].forEach(function (id) {
    $(id).addEventListener("click", function (e) {
      var li = e.target.closest("li"); if (!li) return;
      if (e.target.closest("[data-rm]")) li.remove();
      var mv = e.target.closest("[data-mv]"); if (mv) { if (mv.getAttribute("data-mv") === "-1" && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); else if (mv.getAttribute("data-mv") === "1" && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); }
    });
  });
  $$("[data-mn-add]").forEach(function (b) { b.addEventListener("click", function () { var ul = $("#mn-" + b.getAttribute("data-mn-add")); ul.insertAdjacentHTML("beforeend", mnRow({})); $("li:last-child .mn-l", ul).focus(); }); });
  function readMenu(id) { return $$("li", $(id)).map(function (li) { var label = {}; $$(".mn-l", li).forEach(function (i) { if (i.value.trim()) label[i.getAttribute("data-l")] = i.value.trim(); }); return { href: $(".mn-href", li).value.trim(), label: label }; }); }
  $("#mn-save").addEventListener("click", function () {
    api("PUT", "/api/menu", { header: readMenu("#mn-header"), footer: readMenu("#mn-footer") }).then(function () { toast("Menus enregistrés sur toutes les pages."); showMenus(); }).catch(function (e) { toast(e.message, true); });
  });

  /* ================= Translations ================= */
  var i18n = null, trRows = [], trDirty = {};
  function srcHash(t) { var h = 0x811c9dc5; t = String(t).replace(/\s+/g, " ").trim(); for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ("0000000" + h.toString(16)).slice(-8); }
  function stale(lang, r) { var s = ((i18n.srcs || {})[lang] || {})[r.k]; return !!((i18n.texts[lang] || {})[r.k] && s && s !== srcHash(r.txt)); }
  function showTranslations() {
    Promise.all([api("GET", "/api/i18n"), api("GET", "/api/pages")]).then(function (r) {
      i18n = r[0];
      $("#tr-langs").innerHTML = ["fr", "ar", "es"].map(function (l) { return "<label class='check'><input type='checkbox' data-lang-on='" + l + "'" + (i18n.on[l] ? " checked" : "") + "> " + esc(i18n.available[l].name) + "</label>"; }).join("") +
        "<label class='check'>Langue par défaut <select id='tr-def'>" + Object.keys(i18n.available).map(function (l) { return "<option value='" + l + "'" + (l === i18n.def ? " selected" : "") + ">" + esc(i18n.available[l].name) + "</option>"; }).join("") + "</select></label>";
      var sel = $("#tr-page"), cur = sel.value;
      sel.innerHTML = r[1].map(function (p) { return "<option value='" + esc(p.file) + "'>" + esc(p.label) + "</option>"; }).join(""); if (cur) sel.value = cur;
      loadTrPage();
    }).catch(function (e) { toast(e.message, true); });
  }
  $("#tr-langs").addEventListener("change", function () {
    var on = {}; $$("[data-lang-on]").forEach(function (c) { on[c.getAttribute("data-lang-on")] = c.checked; });
    api("PUT", "/api/i18n-settings", { on: on, def: $("#tr-def").value }).then(function (r) { i18n.on = r.i18n.on; i18n.def = r.i18n.def; toast("Langues du site mises à jour."); });
  });
  function loadTrPage() {
    if (Object.keys(trDirty).length && !confirm("Des traductions ne sont pas enregistrées. Continuer sans enregistrer ?")) return;
    trDirty = {}; $("#tr-save").disabled = true;
    fetch("../" + $("#tr-page").value + "?tr=" + Date.now(), { credentials: "same-origin" }).then(function (r) { return r.text(); }).then(function (html) {
      var d = new DOMParser().parseFromString(html, "text/html");
      var seen = {}; trRows = [];
      $$("[data-edit]", d).forEach(function (el) {
        if (el.tagName === "IMG") return; var k = el.getAttribute("data-edit"); if (seen[k]) return; seen[k] = 1;
        var src = el.innerHTML.trim(); if (!el.textContent.trim()) return;
        trRows.push({ k: k, src: src, txt: el.textContent.trim().replace(/\s+/g, " ") });
      });
      renderTr();
    });
  }
  function renderTr() {
    var lang = $("#tr-lang").value, t = (i18n.texts[lang] || {}), q = $("#tr-q").value.trim().toLowerCase();
    var rows = trRows.filter(function (r) { return !q || r.txt.toLowerCase().indexOf(q) > -1 || (t[r.k] || "").toLowerCase().indexOf(q) > -1; });
    $("#tr-rows").innerHTML = rows.map(function (r) {
      var v = r.k in trDirty ? trDirty[r.k] : (t[r.k] || "");
      return "<tr" + (stale(lang, r) && !(r.k in trDirty) ? " class='stale'" : "") + "><td>" + (stale(lang, r) && !(r.k in trDirty) ? "<small class='warn-t'>À revoir : le texte anglais a changé depuis la traduction</small>" : "") + "<span class='tr-src'>" + esc(r.txt) + "</span>" + (r.k.indexOf("g-") === 0 ? "<small class='muted'>en-tête / pied de page — toutes les pages</small>" : "") + "</td><td><textarea data-k='" + esc(r.k) + "' rows='" + Math.min(6, Math.max(1, Math.ceil(r.txt.length / 60))) + "'" + (lang === "ar" ? " dir='rtl'" : "") + " placeholder='" + esc(r.txt.slice(0, 60)) + "'>" + esc(v.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")) + "</textarea></td></tr>";
    }).join("");
    var done = trRows.filter(function (r) { return t[r.k]; }).length;
    var nStale = trRows.filter(function (r) { return stale(lang, r); }).length;
    $("#tr-progress").textContent = done + " / " + trRows.length + " textes traduits sur cette page" + (nStale ? " · " + nStale + " à revoir" : "");
  }
  $("#tr-rows").addEventListener("input", function (e) { var ta = e.target.closest("[data-k]"); if (!ta) return; trDirty[ta.getAttribute("data-k")] = esc(ta.value.trim()).replace(/\n/g, "<br>"); $("#tr-save").disabled = false; });
  $("#tr-page").addEventListener("change", loadTrPage);
  $("#tr-lang").addEventListener("change", function () { if (Object.keys(trDirty).length && !confirm("Des traductions ne sont pas enregistrées. Continuer ?")) return; trDirty = {}; $("#tr-save").disabled = true; renderTr(); });
  $("#tr-q").addEventListener("input", renderTr);
  $("#tr-save").addEventListener("click", function () {
    var lang = $("#tr-lang").value;
    var srcs = {}; trRows.forEach(function (r) { if (r.k in trDirty) srcs[r.k] = srcHash(r.txt); });
    api("PUT", "/api/i18n", { lang: lang, texts: trDirty, srcs: srcs }).then(function () { return api("GET", "/api/i18n"); }).then(function (j) { i18n.texts = j.texts; i18n.srcs = j.srcs || {}; trDirty = {}; $("#tr-save").disabled = true; renderTr(); toast("Traductions enregistrées."); }).catch(function (e) { toast(e.message, true); });
  });
  function csvCell(v) { v = String(v == null ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  $("#tr-export").addEventListener("click", function (e) {
    e.preventDefault(); var lang = $("#tr-lang").value, t = i18n.texts[lang] || {};
    var rows = [["cle", "anglais", lang]].concat(trRows.map(function (r) { return [r.k, r.txt, (t[r.k] || "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")]; }));
    var blob = new Blob(["﻿" + rows.map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "traduction-" + $("#tr-page").value.replace(".html", "") + "-" + lang + ".csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false, sep = text.split("\n")[0].indexOf(";") > -1 ? ";" : ",";
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  $("#tr-import").addEventListener("change", function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    var rd = new FileReader(); rd.onload = function () {
      var rows = parseCsv(String(rd.result).replace(/^﻿/, "")), n = 0, keys = {}; trRows.forEach(function (r) { keys[r.k] = 1; });
      rows.slice(1).forEach(function (r) { if (keys[r[0]] && (r[2] || "").trim()) { trDirty[r[0]] = esc(r[2].trim()).replace(/\n/g, "<br>"); n++; } });
      renderTr(); $("#tr-save").disabled = !n; toast(n + " traduction(s) importée(s). Vérifiez puis cliquez « Enregistrer ».");
    }; rd.readAsText(f);
  });

  /* ================= Subscribers ================= */
  function showSubs() {
    api("GET", "/api/subscribers").then(function (l) {
      $("#sb-count").textContent = l.length + " abonné(s)";
      $("#sb-rows").innerHTML = l.map(function (s) { return "<tr><td class='nm'>" + esc(s.email) + "</td><td class='muted'>" + fmt(s.date) + "</td><td>" + esc((s.lang || "").toUpperCase()) + "</td><td class='muted'>" + esc(s.source || "") + "</td><td><button class='mini danger-t' type='button' data-del='" + esc(s.email) + "'>Supprimer</button></td></tr>"; }).join("");
      $("#sb-empty").hidden = l.length > 0;
    });
  }
  $("#sb-rows").addEventListener("click", function (e) { var b = e.target.closest("[data-del]"); if (!b) return; var em = b.getAttribute("data-del"); if (!confirm("Désinscrire " + em + " ?")) return; api("DELETE", "/api/subscriber", { email: em }).then(function () { toast("Abonné supprimé."); showSubs(); }); });

  /* ================= SEO ================= */
  var ogPath = "";
  function setOg(p) { ogPath = p || ""; $("#seo-og-img").hidden = !p; if (p) $("#seo-og-img").src = "../" + p; }
  function rdRow(r) { return "<li><input class='rd-from' value='" + esc(r.from || "") + "' placeholder='/ancienne-page' aria-label='Ancienne adresse'><span>→</span><input class='rd-to' value='" + esc(r.to || "") + "' list='mn-pages' placeholder='collection.html' aria-label='Nouvelle adresse'><select class='rd-code' aria-label='Type'><option value='301'" + (r.code !== 302 ? " selected" : "") + ">Permanente</option><option value='302'" + (r.code === 302 ? " selected" : "") + ">Temporaire</option></select><button type='button' class='mini danger-t' data-rm aria-label='Supprimer'>×</button></li>"; }
  function showSeo() {
    api("GET", "/api/seo").then(function (s) {
      $("#seo-url").value = s.siteUrl; $("#seo-gv").value = s.googleVerification; setOg(s.ogImage);
      $("#rd-list").innerHTML = s.redirects.map(rdRow).join("");
    });
    api("GET", "/api/pages").then(function (pages) {
      Promise.all(pages.map(function (p) { return fetch("../" + p.file + "?seo=" + Date.now()).then(function (r) { return r.text(); }).then(function (h) { var d = new DOMParser().parseFromString(h, "text/html"); var m = d.querySelector('meta[name="description"]'); return [p.label, d.title, m ? m.getAttribute("content") : ""]; }); }))
        .then(function (rows) { $("#seo-pages").innerHTML = rows.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + (r[1].length > 60 ? " <small class='warn-t'>(" + r[1].length + " car., idéal ≤ 60)</small>" : "") + "</td><td class='muted'>" + esc(r[2]) + (r[2].length > 160 ? " <small class='warn-t'>(" + r[2].length + " car., idéal ≤ 160)</small>" : (!r[2] ? " <small class='warn-t'>manquante</small>" : "")) + "</td></tr>"; }).join(""); });
    });
  }
  $("#seo-og-lib").addEventListener("click", function () { if (window.AAM_PICK) window.AAM_PICK(setOg); });
  $("#seo-og-rm").addEventListener("click", function () { setOg(""); });
  $("#seo-form").addEventListener("submit", function (e) { e.preventDefault(); api("PUT", "/api/seo", { siteUrl: $("#seo-url").value.trim(), ogImage: ogPath, googleVerification: $("#seo-gv").value.trim() }).then(function () { toast("SEO enregistré."); showSeo(); }).catch(function (er) { toast(er.message, true); }); });
  $("#rd-add").addEventListener("click", function () { $("#rd-list").insertAdjacentHTML("beforeend", rdRow({})); });
  $("#rd-list").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) b.closest("li").remove(); });
  $("#rd-save").addEventListener("click", function () {
    var list = $$("li", $("#rd-list")).map(function (li) { return { from: $(".rd-from", li).value.trim(), to: $(".rd-to", li).value.trim(), code: +$(".rd-code", li).value }; }).filter(function (r) { return r.from && r.to; });
    api("PUT", "/api/seo", { redirects: list }).then(function () { toast("Redirections enregistrées."); showSeo(); }).catch(function (er) { toast(er.message, true); });
  });

  /* ================= Users ================= */
  var users = [], editingUser = null;
  function showUsers() {
    api("GET", "/api/users").then(function (l) {
      users = l; var me = (window.AAM_USER || {}).id;
      $("#us-rows").innerHTML = l.map(function (u) { return "<tr><td class='nm'>" + esc(u.name) + (u.id === me ? " <small class='muted'>(vous)</small>" : "") + "</td><td class='muted'>" + esc(u.username) + "</td><td><span class='st " + (u.role === "admin" ? "won" : u.role === "sales" ? "quoted" : "progress") + "'>" + esc(u.roleLabel) + "</span></td><td>" + (u.totp ? "✓ Activée" : "<span class='muted'>—</span>") + "</td><td class='muted'>" + (u.lastLogin ? fmt(u.lastLogin) : "jamais") + "</td><td><button class='ghost' type='button' data-u='" + esc(u.id) + "'>Modifier</button></td></tr>"; }).join("");
    });
  }
  function openUser(u) {
    editingUser = u; $("#us-err").textContent = "";
    $("#us-title").textContent = u ? "Modifier " + u.name : "Nouvel utilisateur";
    $("#us-name").value = u ? u.name : ""; $("#us-username").value = u ? u.username : ""; $("#us-username").disabled = !!u;
    $("#us-role").value = u ? u.role : "editor"; $("#us-pw").value = "";
    $("#us-pw-hint").textContent = u ? "(laisser vide pour ne pas changer)" : "(10 caractères minimum)";
    $("#us-2fa-row").hidden = !(u && u.totp); $("#us-reset2fa").checked = false;
    $("#us-del").hidden = !u || u.id === (window.AAM_USER || {}).id;
    $("#us-dlg").showModal(); (u ? $("#us-name") : $("#us-username")).focus();
  }
  $("#us-add").addEventListener("click", function () { openUser(null); });
  $("#us-rows").addEventListener("click", function (e) { var b = e.target.closest("[data-u]"); if (b) openUser(users.find(function (u) { return u.id === b.getAttribute("data-u"); })); });
  $$("[data-close-us]").forEach(function (b) { b.addEventListener("click", function () { $("#us-dlg").close(); }); });
  $("#us-form").addEventListener("submit", function (e) {
    e.preventDefault(); $("#us-err").textContent = "";
    var p = editingUser ? api("PUT", "/api/user", { id: editingUser.id, name: $("#us-name").value.trim(), role: $("#us-role").value, password: $("#us-pw").value || undefined, reset2fa: $("#us-reset2fa").checked })
      : api("POST", "/api/users", { name: $("#us-name").value.trim(), username: $("#us-username").value.trim(), role: $("#us-role").value, password: $("#us-pw").value });
    p.then(function () { $("#us-dlg").close(); toast("Utilisateur enregistré."); showUsers(); }).catch(function (er) { $("#us-err").textContent = er.message; });
  });
  $("#us-del").addEventListener("click", function () {
    if (!editingUser || !confirm("Supprimer le compte de " + editingUser.name + " ? Il ne pourra plus se connecter.")) return;
    api("DELETE", "/api/user", { id: editingUser.id }).then(function () { $("#us-dlg").close(); toast("Utilisateur supprimé."); showUsers(); }).catch(function (er) { $("#us-err").textContent = er.message; });
  });

  /* ================= My account: 2FA ================= */
  function showAccount() {
    api("GET", "/api/me").then(function (me) {
      $("#tfa-err").textContent = ""; $("#tfa-setup").hidden = true;
      $("#tfa-state").textContent = me.totp ? "✓ Activée : un code est demandé à chaque connexion." : "Désactivée.";
      $("#tfa-off").hidden = !!me.totp; $("#tfa-on").hidden = !me.totp;
    });
  }
  $("#tfa-start").addEventListener("click", function () {
    api("POST", "/api/2fa/setup").then(function (r) { $("#tfa-secret").textContent = r.secret.replace(/(.{4})/g, "$1 ").trim(); $("#tfa-setup").hidden = false; $("#tfa-off").hidden = true; $("#tfa-code").focus(); });
  });
  $("#tfa-confirm").addEventListener("click", function () {
    api("POST", "/api/2fa/enable", { code: $("#tfa-code").value }).then(function () { toast("Double authentification activée."); $("#tfa-code").value = ""; showAccount(); }).catch(function (e) { $("#tfa-err").textContent = e.message; });
  });
  $("#tfa-disable").addEventListener("click", function () {
    api("POST", "/api/2fa/disable", { password: $("#tfa-pw").value }).then(function () { toast("Double authentification désactivée."); $("#tfa-pw").value = ""; showAccount(); }).catch(function (e) { $("#tfa-err").textContent = e.message; });
  });

  /* ================= Activity ================= */
  var activity = [];
  function showActivity() {
    api("GET", "/api/activity").then(function (l) {
      activity = l; var names = {}; l.forEach(function (a) { names[a.user] = 1; });
      var sel = $("#ac-user"), cur = sel.value; sel.innerHTML = "<option value=''>Tous les utilisateurs</option>" + Object.keys(names).map(function (n) { return "<option>" + esc(n) + "</option>"; }).join(""); sel.value = cur;
      renderActivity();
    });
  }
  function renderActivity() {
    var u = $("#ac-user").value, q = $("#ac-q").value.trim().toLowerCase();
    $("#ac-rows").innerHTML = activity.filter(function (a) { return (!u || a.user === u) && (!q || (a.action + " " + a.detail).toLowerCase().indexOf(q) > -1); }).slice(0, 300)
      .map(function (a) { return "<tr><td class='muted'>" + fmt(a.t) + "</td><td>" + esc(a.user) + "</td><td>" + esc(a.action) + "</td><td class='muted'>" + esc(a.detail) + "</td></tr>"; }).join("") || "<tr><td colspan='4' class='muted'>Aucune activité.</td></tr>";
  }
  $("#ac-user").addEventListener("change", renderActivity); $("#ac-q").addEventListener("input", renderActivity);

  /* ================= Settings: cookies · Deployment: maintenance, auto backups ================= */
  function showMail() {
    api("GET", "/api/mail").then(function (m) {
      $("#ml-host").value = m.host; $("#ml-port").value = m.port; $("#ml-user").value = m.user; $("#ml-pass").value = "";
      $("#ml-pass-hint").textContent = m.hasPass ? "(enregistré — laisser vide pour le garder)" : "";
      $("#ml-from").value = m.from; $("#ml-to").value = m.to; $("#ml-leads").checked = m.notifyLeads; $("#ml-welcome").checked = m.welcome; $("#ml-err").textContent = "";
      $("#ml-state").innerHTML = !m.ready ? "<span class='warn-t'>Non configuré : aucune alerte n'est envoyée. Les demandes restent visibles dans « Demandes de devis ».</span>"
        : m.last && m.last.ok === false ? "<span class='warn-t'>Dernier envoi en erreur (" + esc(fmt(m.last.t)) + ") : " + esc(m.last.error) + "</span>"
        : "✓ Configuré" + (m.last && m.last.ok ? " · dernier envoi réussi le " + esc(fmt(m.last.t)) : "");
    }).catch(function () {});
  }
  function mailBody() { var b = { host: $("#ml-host").value.trim(), port: $("#ml-port").value.trim(), user: $("#ml-user").value.trim(), from: $("#ml-from").value.trim(), to: $("#ml-to").value.trim(), notifyLeads: $("#ml-leads").checked, welcome: $("#ml-welcome").checked }; if ($("#ml-pass").value) b.pass = $("#ml-pass").value; return b; }
  $("#ml-form").addEventListener("submit", function (e) { e.preventDefault(); $("#ml-err").textContent = ""; api("PUT", "/api/mail", mailBody()).then(function () { toast("Réglages email enregistrés."); showMail(); }).catch(function (er) { $("#ml-err").textContent = er.message; }); });
  $("#ml-test").addEventListener("click", function () {
    var b = this; b.disabled = true; $("#ml-err").textContent = "";
    api("PUT", "/api/mail", mailBody()).then(function () { return api("POST", "/api/mail/test"); }).then(function () { toast("Email de test envoyé : vérifiez votre boîte de réception."); showMail(); })
      .catch(function (er) { $("#ml-err").textContent = er.message; showMail(); }).then(function () { b.disabled = false; });
  });
  function showCookies() { api("GET", "/api/site").then(function (s) { $("#ck-on").checked = s.cookieBanner !== false; $("#ck-text").value = s.cookieText || "We use anonymous, cookie-free statistics to improve this site. No advertising trackers."; }); }
  $("#ck-form").addEventListener("submit", function (e) { e.preventDefault(); api("PUT", "/api/settings-plus", { cookieBanner: $("#ck-on").checked, cookieText: $("#ck-text").value.trim() }).then(function () { toast("Bandeau cookies enregistré."); }); });
  function showPublish() {
    api("GET", "/api/publish").then(function (r) {
      $("#pub-go").disabled = !r.ready;
      $("#pub-state").innerHTML = !r.ready ? "Pas encore relié à GitHub." : "Relié à <b>" + esc(r.remote.replace(/^https:\/\/github.com\//, "").replace(/\.git$/, "")) + "</b>" + (r.last ? " · dernière publication le " + esc(fmt(r.last)) : "");
      $("#pub-open").hidden = !r.siteUrl; if (r.siteUrl) $("#pub-open").href = r.siteUrl;
    }).catch(function () {});
  }
  $("#pub-go").addEventListener("click", function () {
    var b = this; b.disabled = true; b.textContent = "Publication…"; $("#pub-err").textContent = "";
    api("POST", "/api/publish").then(function (r) { toast(r.nothing ? "Le site en ligne est déjà à jour." : "Publié : le site en ligne sera à jour dans environ 1 minute."); showPublish(); })
      .catch(function (e) { $("#pub-err").textContent = e.message; }).then(function () { b.disabled = false; b.textContent = "Publier maintenant"; });
  });
  function showDeployPlus() {
    showPublish();
    api("GET", "/api/site").then(function (s) { $("#mt-on").checked = !!s.maintenance; $("#mt-msg").value = s.maintenanceMsg || ""; $("#ab-on").checked = s.autoBackup !== false; });
    api("GET", "/api/auto-backups").then(function (l) {
      $("#ab-list").innerHTML = l.length ? l.map(function (b) { return "<li><span>" + esc(b.file.replace("auto-", "Sauvegarde du ").replace(".json", "")) + "</span><small class='muted'>" + Math.max(1, Math.round(b.size / 1024)) + " Ko</small><a class='mini' href='/api/auto-backup?f=" + encodeURIComponent(b.file) + "' download>Télécharger</a></li>"; }).join("") : "<li class='muted'>Aucune sauvegarde automatique pour l'instant.</li>";
    });
  }
  $("#mt-save").addEventListener("click", function () {
    var on = $("#mt-on").checked;
    if (on && !confirm("Activer le mode maintenance ? Les visiteurs verront une page « Nous revenons bientôt ».")) return;
    api("PUT", "/api/settings-plus", { maintenance: on, maintenanceMsg: $("#mt-msg").value.trim() }).then(function () { toast(on ? "Mode maintenance activé." : "Site public en ligne."); });
  });
  $("#ab-save").addEventListener("click", function () { api("PUT", "/api/settings-plus", { autoBackup: $("#ab-on").checked }).then(function () { toast("Réglage enregistré."); }); });
  $("#ab-now").addEventListener("click", function () { api("POST", "/api/auto-backup").then(function () { toast("Sauvegarde créée."); showDeployPlus(); }); });

  /* ================= Overview add-on: new quote requests ================= */
  function overviewPlus() {
    if (role() === "editor") return;
    loadLeads().then(function (l) {
      var n = l.filter(function (x) { return x.status === "new"; }).length, cards = $("#ov-cards");
      if (!cards || $("#ov-leads")) return;
      cards.insertAdjacentHTML("afterbegin", "<a class='ov-card hl' id='ov-leads' href='#/leads'><span>Demandes de devis</span><b>" + l.length + "</b><small>" + n + " nouvelle(s)</small></a>");
    });
  }

  window.AAM_PLUS = {
    show: function (v) {
      if (v === "leads") loadLeads().then(function () { renderLeads(); renderLead(current ? leads.find(function (l) { return l.id === current.id; }) : null); });
      if (v === "stats") showStats();
      if (v === "menus") showMenus();
      if (v === "translations") showTranslations();
      if (v === "subscribers") showSubs();
      if (v === "seo") showSeo();
      if (v === "users") showUsers();
      if (v === "account") showAccount();
      if (v === "activity") showActivity();
      if (v === "settings") { showCookies(); showMail(); }
      if (v === "deployment") showDeployPlus();
      if (v === "overview") setTimeout(overviewPlus, 300);
      if (role() !== "editor" && v !== "leads") loadLeads().catch(function () {});
    }
  };
})();
