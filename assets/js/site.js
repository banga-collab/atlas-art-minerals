/* Atlas Art Minerals — shared behaviour: header, reveal, quote list, collection, quote page. */
(function () {
  "use strict";
  var P = window.AAM_PRODUCTS || [];
  var F = window.AAM_FAMILIES || [];
  var C = window.AAM_CONTACT || {};
  var byId = {};
  P.forEach(function (p) { byId[p.id] = p; });
  var famName = {};
  F.forEach(function (f) { famName[f.id] = f.name; });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var T = window.AAM_T || function (x) { return x; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var img = function (id) { var p = byId[id]; return (p && p.img) || "assets/products/" + id + ".webp"; };

  /* ---------- Site settings from /admin (contact, numbers, top bar) ---------- */
  var SITE = window.AAM_SITE || {};
  $$("[data-site]").forEach(function (el) { var v = SITE[el.getAttribute("data-site")]; if (v) el.textContent = v; });
  if (SITE.whatsapp) $$("[data-wa]").forEach(function (a) { a.href = "https://wa.me/" + String(SITE.whatsapp).replace(/\D/g, ""); });
  if (SITE.phone) $$("[data-tel]").forEach(function (a) { a.href = "tel:" + String(SITE.phone).replace(/[^\d+]/g, ""); });
  if (SITE.email) $$("[data-mail]").forEach(function (a) { a.href = "mailto:" + SITE.email; });
  if (SITE.logo) $$(".logo img.logo-light").forEach(function (im) { im.src = SITE.logo; });
  $$("[data-total]").forEach(function (el) { el.textContent = P.length; });
  $$("[data-family-n]").forEach(function (el) { var f = el.getAttribute("data-family-n"); el.textContent = P.filter(function (p) { return p.family === f; }).length; });

  /* ---------- Quote list store (per-browser convenience; the request itself is sent by WhatsApp or email) ---------- */
  var KEY = "aam-quote-v1";
  var memory = [];
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(function (i) { return byId[i.id]; }) : []; }
    catch (e) { return memory; }
  }
  function save(list) {
    memory = list;
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage blocked: keep in memory */ }
    sync();
  }
  /* each line of the quote list: { k: key, id: product id, v: size key (ref or size), qty, note } */
  function keyOf(it) { return it.k || it.id; }
  function find(list, key) { for (var i = 0; i < list.length; i++) if (keyOf(list[i]) === key) return i; return -1; }
  function linesOf(list, id) { return list.filter(function (it) { return it.id === id; }); }
  function variantOf(it) { var p = byId[it.id]; if (!it.v || !p || !p.variants) return null; for (var i = 0; i < p.variants.length; i++) { var x = p.variants[i]; if ((x.ref || x.size) === it.v) return x; } return null; }
  function sizeText(it) { var x = variantOf(it); return x ? [x.size ? T("Size") + " " + x.size : "", x.ref ? "ref. " + x.ref : ""].filter(Boolean).join(" · ") : ""; }
  function idOfKey(key) { return String(key).split("~")[0]; }
  function add(id, qty, v) { var l = load(), k = v ? id + "~" + v : id; var i = find(l, k); if (i < 0) l.push({ k: k, id: id, v: v || "", qty: qty || 1, note: "" }); save(l); return k; }
  function setQty(id, qty) { var l = load(); var i = find(l, id); if (i < 0) return; if (qty < 1) l.splice(i, 1); else l[i].qty = Math.min(qty, 99999); save(l); }
  function setNote(id, note) { var l = load(); var i = find(l, id); if (i < 0) return; l[i].note = note; try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { memory = l; } }
  function remove(id) { var l = load(); var i = find(l, id); if (i >= 0) l.splice(i, 1); save(l); }

  function sync() {
    var l = load(); var n = l.length;
    $$("[data-quote-count]").forEach(function (el) { el.textContent = n; if (n) el.removeAttribute("data-zero"); else el.setAttribute("data-zero", ""); });
    var fl = $(".quote-float"); if (fl) fl.classList.toggle("is-on", n > 0 && !document.body.hasAttribute("data-page-quote"));
    $$("[data-card]").forEach(function (card) { renderControls(card, l); });
    if ($("#qlist")) renderQuote();
  }

  /* ---------- Toast ---------- */
  var toastT;
  function toast(msg) {
    var t = $(".toast"); if (!t) return;
    t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("is-on"); }, 2200);
  }

  /* ---------- Product card ---------- */
  function cardHTML(p, opts) {
    opts = opts || {};
    return '<article class="card reveal" data-card="' + esc(p.id) + '">' +
      '<a class="media ' + p.bg + '" href="' + productUrl(p.id) + '" tabindex="-1" aria-hidden="true">' +
        (opts.tag ? '<span class="tag">' + esc(opts.tag) + '</span>' : '') +
        '<img src="' + img(p.id) + '" alt="' + esc(p.name + ", " + p.finish.toLowerCase()) + '" width="600" height="600" loading="lazy" decoding="async">' +
      '</a>' +
      '<div><h3><a href="' + productUrl(p.id) + '">' + esc(p.name) + '</a></h3><p class="meta util" style="margin:4px 0 0">' + esc(p.finish) + '</p></div>' +
      '<div class="actions" data-controls></div>' +
    '</article>';
  }
  function renderControls(card, list) {
    var id = card.getAttribute("data-card"); var box = $("[data-controls]", card); if (!box) return;
    var all = list || load(), i = find(all, id), lines = linesOf(all, id);
    if (i < 0 && lines.length) {   // only sizes of this product are in the list: show them, quantities are set on the quote page
      var many = '<a class="in-list" href="quote.html">✓ ' + lines.length + " " + (lines.length > 1 ? T("sizes in your list") : T("size in your list")) + "</a>";
      if (box.getAttribute("data-state") !== "sizes" || box.innerHTML !== many) { box.innerHTML = many; box.setAttribute("data-state", "sizes"); }
      return;
    }
    var state = i < 0 ? "out" : "in";
    if (box.getAttribute("data-state") === state && state === "out") return;
    var p = byId[id];
    if (state === "out") {
      box.innerHTML = '<button class="add-btn" type="button" data-add="' + esc(id) + '" aria-label="Add ' + esc(p.name) + ' to quote list">' + T("Add to list") + '</button>';
    } else {
      var q = (list || load())[i].qty;
      if (box.getAttribute("data-state") === "in") { var inp = $("input", box); if (inp && document.activeElement !== inp) inp.value = q; return; }
      box.innerHTML =
        '<div class="qty" role="group" aria-label="Quantity for ' + esc(p.name) + '">' +
          '<button type="button" data-step="-1" data-id="' + esc(id) + '" aria-label="Decrease quantity"' + (q <= 1 ? ' disabled' : '') + '>−</button>' +
          '<input type="number" inputmode="numeric" min="1" value="' + q + '" data-qty="' + esc(id) + '" aria-label="Quantity">' +
          '<button type="button" data-step="1" data-id="' + esc(id) + '" aria-label="Increase quantity">+</button>' +
        '</div><span class="in-list">' + T("In list") + '</span>';
    }
    box.setAttribute("data-state", state);
  }

  /* ---------- Global events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-add],[data-step],[data-qv],[data-remove]"); if (!t) return;
    if (t.hasAttribute("data-add")) {
      var id = t.getAttribute("data-add"); add(id, 1);
      toast(T("Added: ") + byId[id].name);
      var card = t.closest("[data-card]"); if (card) { var inp = $("[data-qty]", card); if (inp) inp.focus(); }
      if (t.closest("dialog")) renderQV(id);
    } else if (t.hasAttribute("data-step")) {
      var sid = t.getAttribute("data-id"); var l = load(); var i = find(l, sid); if (i < 0) return; var spid = l[i].id;
      var stepBy = Number(t.getAttribute("data-step")), nq = l[i].qty + stepBy;
      if (stepBy > -999 && nq < 1) nq = 1;
      setQty(sid, nq);
      if (nq < 1) { toast(T("Removed: ") + byId[spid].name); var c2 = $('[data-card="' + spid + '"] [data-add]'); if (c2) c2.focus(); }
      if (t.closest("dialog")) renderQV(sid);
    } else if (t.hasAttribute("data-qv")) {
      openQV(t.getAttribute("data-qv"));
    } else if (t.hasAttribute("data-remove")) {
      var rid = t.getAttribute("data-remove"); remove(rid); toast(T("Removed: ") + byId[idOfKey(rid)].name);
      var first = $("#qlist .note") || $("#quote-form input"); if (first) first.focus();
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-qty")) {
      var v = parseInt(t.value, 10); v = isNaN(v) || v < 1 ? 1 : v; t.value = v; setQty(t.getAttribute("data-qty"), v);
    }
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (t.hasAttribute && t.hasAttribute("data-note")) setNote(t.getAttribute("data-note"), t.value);
  });

  /* ---------- Header ---------- */
  var header = $(".site-header");
  function onScroll() { if (header) header.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  var mb = $(".menu-btn"), nav = $("#site-nav");
  if (mb && nav) {
    mb.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open"); mb.setAttribute("aria-expanded", open); mb.textContent = open ? "Close" : "Menu";
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("is-open")) { nav.classList.remove("is-open"); mb.setAttribute("aria-expanded", "false"); mb.textContent = "Menu"; mb.focus(); } });
  }

  /* ---------- Reveal on scroll ---------- */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var io = (!reduce && "IntersectionObserver" in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" }) : null;
  function watch(root) { $$(".reveal:not(.is-in)", root).forEach(function (el) { if (io) io.observe(el); else el.classList.add("is-in"); }); }

  /* ---------- Family counts ---------- */
  $$("[data-family-count]").forEach(function (el) {
    var f = el.getAttribute("data-family-count");
    el.textContent = P.filter(function (p) { return p.family === f; }).length + " pieces";
  });

  /* ---------- Featured (home) ---------- */
  var feat = $("#featured");
  if (feat) {
    feat.innerHTML = P.filter(function (p) { return p.featured; }).sort(function (a, b) { return a.featured - b.featured; })
      .map(function (p) { return cardHTML(p); }).join("");
  }

  /* ---------- Collection ---------- */
  var cat = $("#catalog");
  var state = { family: "all", finish: "all", q: "" };
  function readHash() {
    var h = (location.hash || "").replace("#", "");
    state.family = F.some(function (f) { return f.id === h; }) ? h : "all";
  }
  function renderCatalog() {
    var q = state.q.trim().toLowerCase();
    var list = P.filter(function (p) {
      return (state.family === "all" || p.family === state.family) &&
        (state.finish === "all" || p.finish === state.finish) &&
        (!q || (p.name + " " + p.finish + " " + (famName[p.family] || "")).toLowerCase().indexOf(q) > -1);
    });
    var order = { white: 0, cloth: 1, scene: 2 };
    list = list.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return (order[a[0].bg] - order[b[0].bg]) || (a[1] - b[1]); }).map(function (x) { return x[0]; });
    cat.innerHTML = list.map(function (p) { return cardHTML(p); }).join("");
    var empty = $("#empty"); if (empty) empty.hidden = list.length > 0;
    var rc = $("#result-count"); if (rc) rc.textContent = list.length + (list.length === 1 ? " piece" : " pieces") + (state.family !== "all" ? " in " + famName[state.family] : "");
    var fh = $("#family-blurb"); if (fh) { var fam = F.filter(function (f) { return f.id === state.family; })[0]; fh.textContent = fam ? fam.blurb : "Every piece is carved by hand in our Agadir workshop. Add what you need to your quote list, and we'll reply with trade prices, minimums and lead times."; }
    $$(".chip[data-family]").forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-family") === state.family ? "true" : "false"); });
    sync(); watch(cat);
  }
  if (cat) {
    var chips = $("#chips");
    chips.innerHTML = '<button class="chip" type="button" data-family="all">All <span class="n">' + P.length + '</span></button>' +
      F.map(function (f) { return '<button class="chip" type="button" data-family="' + f.id + '">' + esc(f.name) + ' <span class="n">' + P.filter(function (p) { return p.family === f.id; }).length + '</span></button>'; }).join("");
    chips.addEventListener("click", function (e) {
      var c = e.target.closest(".chip"); if (!c) return;
      state.family = c.getAttribute("data-family");
      history.replaceState(null, "", state.family === "all" ? location.pathname : "#" + state.family);
      renderCatalog();
    });
    var fin = $("#finish");
    var finishes = []; P.forEach(function (p) { if (finishes.indexOf(p.finish) < 0) finishes.push(p.finish); });
    fin.innerHTML = '<option value="all">All materials</option>' + finishes.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join("");
    fin.addEventListener("change", function () { state.finish = fin.value; renderCatalog(); });
    var qs = $("#search"); var deb;
    qs.addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(function () { state.q = qs.value; renderCatalog(); }, 120); });
    var reset = $("#reset"); if (reset) reset.addEventListener("click", function () { state = { family: "all", finish: "all", q: "" }; qs.value = ""; fin.value = "all"; history.replaceState(null, "", location.pathname); renderCatalog(); });
    window.addEventListener("hashchange", function () { readHash(); renderCatalog(); });
    readHash(); renderCatalog();
    if (location.hash === "#search") { qs.focus(); }
  }

  /* ---------- Quick view ---------- */
  var qv = $("#qv"), lastFocus;
  function variantsHTML(p) {
    var vs = p.variants || [], out = "";
    var d = function (a) { a = a.filter(function (x) { return x !== undefined && x !== ""; }); return a.length ? a.join(" × ") + " cm" : "—"; };
    if (vs.length) {
      out += '<div class="sizes"><table><thead><tr><th>' + T("Size") + "</th><th>" + T("Ref.") + "</th><th>" + T("Dimensions") + "</th><th>" + T("Weight") + "</th></tr></thead><tbody>" +
        vs.map(function (v) { return "<tr><td>" + esc(v.size || "—") + "</td><td>" + esc(v.ref || "—") + "</td><td>" + d([v.l, v.w, v.h]) + "</td><td>" + (v.weight ? esc(v.weight) + " g" : "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
      if (vs.some(function (v) { return v.pl || v.packWeight; })) out += '<details class="more"><summary>' + T("Packaging") + "</summary><table><thead><tr><th>" + T("Size") + "</th><th>" + T("Box") + "</th><th>" + T("Packed weight") + "</th><th>" + T("Volume") + "</th></tr></thead><tbody>" +
        vs.map(function (v) { return "<tr><td>" + esc(v.size || "—") + "</td><td>" + d([v.pl, v.pw, v.ph]) + "</td><td>" + (v.packWeight ? esc(v.packWeight) + " g" : "—") + "</td><td>" + (v.volume !== undefined ? esc(v.volume) : "—") + "</td></tr>"; }).join("") + "</tbody></table></details>";
    }
    if (p.longDescription) out += '<details class="more"><summary>' + T("More about this piece") + "</summary><p>" + esc(p.longDescription).replace(/\n/g, "<br>") + "</p></details>";
    return out;
  }
  function renderQV(id) {
    var p = byId[id]; if (!qv || !p) return;
    var inList = find(load(), id) > -1;
    $(".qv-body", qv).innerHTML =
      '<div class="qv-inner"><div class="media ' + p.bg + '"><img src="' + img(p.id) + '" alt="' + esc(p.name + ", " + p.finish.toLowerCase()) + '" width="600" height="600"></div>' +
      '<div class="info"><p class="eyebrow" style="margin:0">' + esc(famName[p.family]) + '</p>' +
      '<h2 class="h2" id="qv-title">' + esc(p.name) + '</h2>' + '<a class="link-accent small" href="' + productUrl(p.id) + '">' + T("View the full product page") + ' →</a>' +
      (p.description ? '<p style="margin:0">' + esc(p.description) + '</p>' : '') +
      '<dl class="spec">' + (p.ref && !(p.variants && p.variants.length) ? '<dt>Ref.</dt><dd>' + esc(p.ref) + '</dd>' : '') + '<dt>' + T("Material") + '</dt><dd>' + esc(p.finish) + '</dd><dt>' + T("Made") + '</dt><dd>' + T("By hand, Agadir workshop") + '</dd>' + (p.variants && p.variants.length ? '' : '<dt>' + T("Sizes") + '</dt><dd>' + esc(p.sizes || T("Several sizes for most pieces — ask")) + '</dd>') + '<dt>' + T("Minimum") + '</dt><dd>' + T("Varies by piece — confirmed in your quote") + '</dd><dt>' + T("Private label") + '</dt><dd>' + T("Available") + '</dd></dl>' +
      variantsHTML(p) +
      '<p class="small muted" style="margin:0">' + T("Each piece is cut from natural stone, so grain and tone vary slightly from the photo. Keep selenite dry and dust it with a soft cloth.") + '</p>' +
      '<div class="cta-row">' + (inList
        ? '<a class="btn btn-primary" href="quote.html">' + T("Review quote list") + '</a><button class="btn btn-quiet" type="button" data-step="-999999" data-id="' + esc(p.id) + '">' + T("Remove") + '</button>'
        : '<button class="btn btn-primary" type="button" data-add="' + esc(p.id) + '">' + T("Add to quote list") + '</button>') +
      '</div></div></div>';
  }
  function openQV(id) {
    if (!qv || typeof qv.showModal !== "function") return;
    lastFocus = document.activeElement; renderQV(id); qv.showModal();
    var b = $("[data-add], .btn-primary", qv); if (b) b.focus();
  }
  if (qv) {
    qv.addEventListener("click", function (e) { if (e.target === qv || e.target.closest(".close")) qv.close(); });
    qv.addEventListener("close", function () { if (lastFocus) lastFocus.focus(); });
  }

  /* ---------- Quote page ---------- */
  function renderQuote() {
    var ul = $("#qlist"); var l = load();
    var a = document.activeElement, hasFocus = null;
    if (a && ul.contains(a)) {
      if (a.hasAttribute("data-note")) hasFocus = '[data-note="' + a.getAttribute("data-note") + '"]';
      else if (a.hasAttribute("data-qty")) hasFocus = '[data-qty="' + a.getAttribute("data-qty") + '"]';
      else if (a.hasAttribute("data-step")) hasFocus = '[data-id="' + a.getAttribute("data-id") + '"][data-step="' + a.getAttribute("data-step") + '"]';
    }
    $("#qempty").hidden = l.length > 0; ul.hidden = l.length === 0;
    var sum = $("#qsum"); if (sum) sum.textContent = l.length ? l.length + (l.length === 1 ? " piece" : " pieces") + " · " + (function (n) { return n + (n === 1 ? " unit" : " units"); })(l.reduce(function (a, i) { return a + i.qty; }, 0)) : "";
    var sig = l.map(function (i) { return keyOf(i) + ":" + i.qty; }).join(",");
    if (ul.getAttribute("data-sig") === sig) return;
    ul.innerHTML = l.map(function (it, n) {
      var p = byId[it.id], k = keyOf(it), x = variantOf(it), st = sizeText(it), nid = "n-" + n;
      return '<li class="qitem"><a class="thumb ' + p.bg + '" href="' + productUrl(p.id) + '" tabindex="-1" aria-hidden="true"><img src="' + esc((x && x.img) || img(p.id)) + '" alt="" width="84" height="84" loading="lazy"></a>' +
        '<div><h3 style="font:500 17px/1.3 var(--f-body);margin:0"><a href="' + productUrl(p.id) + '" style="color:inherit;text-decoration:none">' + esc(p.name) + '</a></h3><p class="util muted" style="margin:4px 0 0">' + esc(p.finish) + (st ? ' · <b class="q-size">' + esc(st) + "</b>" : "") + '</p>' +
        '<div class="row"><div class="qty" role="group" aria-label="Quantity for ' + esc(p.name + (st ? " " + st : "")) + '">' +
          '<button type="button" data-step="-1" data-id="' + esc(k) + '" aria-label="Decrease quantity"' + (it.qty <= 1 ? ' disabled' : '') + '>−</button>' +
          '<input type="number" inputmode="numeric" min="1" value="' + it.qty + '" data-qty="' + esc(k) + '" aria-label="Quantity">' +
          '<button type="button" data-step="1" data-id="' + esc(k) + '" aria-label="Increase quantity">+</button></div>' +
          '<label class="sr-only" for="' + nid + '">Note for ' + esc(p.name) + '</label>' +
          '<input class="note" id="' + nid + '" data-note="' + esc(k) + '" value="' + esc(it.note || "") + '" placeholder="' + (x ? T("Colour, packing, label…") : T("Size, colour, packing…")) + '" maxlength="140">' +
          '<button class="remove" type="button" data-remove="' + esc(k) + '">' + T("Remove") + '</button></div></div></li>';
    }).join("");
    ul.setAttribute("data-sig", sig);
    if (hasFocus) { var back = $(hasFocus, ul); if (back) back.focus(); }
  }

  var form = $("#quote-form");
  if (form) {
    document.body.setAttribute("data-page-quote", "");
    var mbq = $(".mobile-bar .btn-primary"); if (mbq) { mbq.setAttribute("href", "#contact"); mbq.textContent = "Add your details"; }
    var need = ["name", "company", "country", "email"];
    function check() {
      var ok = true, firstBad = null;
      need.forEach(function (n) {
        var inp = form.elements[n]; var f = inp.closest(".field"); var v = inp.value.trim();
        var bad = !v || (n === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
        f.classList.toggle("invalid", bad); inp.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad && !firstBad) firstBad = inp; if (bad) ok = false;
      });
      if (firstBad) firstBad.focus();
      return ok;
    }
    function message() {
      var l = load(); var v = function (n) { return form.elements[n].value.trim(); };
      var lines = ["Hello Atlas Art Minerals,", "", l.length ? "I'd like trade prices, minimums and lead times for:" : "I'd like to talk about a trade order.", ""];
      l.forEach(function (it, i) { var p = byId[it.id], st = sizeText(it); lines.push((i + 1) + ". " + p.name + " (" + p.finish + ")" + (st ? " — " + st : "") + " × " + it.qty + (it.note ? " — " + it.note : "")); });
      if (l.length) lines.push("");
      if (v("message")) { lines.push(v("message"), ""); }
      lines.push("Name: " + v("name"), "Company: " + v("company"), "Country: " + v("country"), "Email: " + v("email"));
      if (v("phone")) lines.push("Phone / WhatsApp: " + v("phone"));
      if (v("type")) lines.push("Buying as: " + v("type"));
      return lines.join("\n");
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!check()) return;
      var via = (e.submitter && e.submitter.value) || "email";
      var text = message();
      try {
        var fv = function (n) { return form.elements[n] ? form.elements[n].value.trim() : ""; };
        if (!window.AAM_STATIC) fetch("/api/leads", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: fv("name"), company: fv("company"), country: fv("country"), email: fv("email"), phone: fv("phone"), type: fv("type"), message: fv("message"), website: fv("website"), via: via, lang: window.AAM_LANG || "en", items: load().map(function (i) { return { id: i.id, v: i.v || "", qty: i.qty, note: i.note }; }) }) }).catch(function () {});
      } catch (err) { /* offline: WhatsApp / email still opens */ }
      if (via === "whatsapp") {
        window.open("https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(text), "_blank", "noopener");
      } else {
        location.href = "mailto:" + C.email + "?subject=" + encodeURIComponent("Trade price request — " + form.elements.company.value.trim()) + "&body=" + encodeURIComponent(text);
      }
      Array.prototype.forEach.call(form.querySelectorAll("button[type=submit], button:not([type])"), function (b) { b.disabled = true; setTimeout(function () { b.disabled = false; }, 4000); });
      var done = $("#sent");
      if (done) {
        done.hidden = false; done.focus();
        if (!$("[data-clear-list]", done) && load().length) {
          var cb = document.createElement("button"); cb.type = "button"; cb.className = "btn btn-quiet btn-sm"; cb.setAttribute("data-clear-list", ""); cb.style.marginTop = "10px";
          cb.textContent = T("Message sent? Clear my list");
          cb.addEventListener("click", function () { save([]); cb.remove(); toast(T("Your quote list is empty.")); });
          done.appendChild(document.createElement("br")); done.appendChild(cb);
        }
      }
    });
    form.addEventListener("input", function (e) { var f = e.target.closest(".field.invalid"); if (f && e.target.value.trim()) f.classList.remove("invalid"); });
  }


  /* ---------- Product page (product.html?p=<id>) ---------- */
  function productUrl(id) { return "product.html?p=" + encodeURIComponent(id); }
  var pd = $("#pd");
  if (pd) (function () {
    var params = new URLSearchParams(location.search), pid = params.get("p");
    var p = byId[pid];
    // in the admin visual editor the page opens without ?p= : show a real product as preview
    if (!p && window.self !== window.top) p = P.filter(function (x) { return x.featured; })[0] || P[0];
    if (!p) { pd.hidden = true; var miss = $("#pd-missing"); if (miss) miss.hidden = false; return; }
    var vs = p.variants || [];
    var fam = famName[p.family] || "";
    document.title = p.name + " — Atlas Art Minerals";
    var md = $('meta[name="description"]'); if (md) md.setAttribute("content", p.description || (p.name + ", " + p.finish + ". Hand-carved in Agadir. Trade prices on request."));
    var famA = $("#pd-fam"); famA.textContent = fam; famA.href = "collection.html#" + p.family;
    $("#pd-eyebrow").textContent = fam;
    $("#pd-name").textContent = p.name;
    $("#pd-finish").textContent = p.finish;
    var desc = $("#pd-desc"); if (p.description) desc.textContent = p.description; else desc.remove();

    /* gallery */
    var pics = []; [p.img].concat(p.images || []).concat(p.images && p.images.length ? [] : vs.map(function (v) { return v.img; })).forEach(function (u) { if (u && pics.indexOf(u) < 0) pics.push(u); });
    if (!pics.length) pics.push(img(p.id));
    var main = $("#pd-main"); main.className = "pd-main media " + p.bg;
    function show(i) {
      main.innerHTML = '<img src="' + esc(pics[i]) + '" alt="' + esc(p.name + ", " + p.finish.toLowerCase()) + '" width="900" height="900">';
      $$("#pd-thumbs button").forEach(function (b, k) { b.setAttribute("aria-pressed", k === i ? "true" : "false"); });
    }
    $("#pd-thumbs").innerHTML = pics.length > 1 ? pics.map(function (u, i) { return '<button type="button" class="media ' + p.bg + '" data-pic="' + i + '" aria-label="' + T("Photo") + " " + (i + 1) + '"><img src="' + esc(u) + '" alt="" loading="lazy"></button>'; }).join("") : "";
    $("#pd-thumbs").addEventListener("click", function (e) { var b = e.target.closest("[data-pic]"); if (b) show(+b.getAttribute("data-pic")); });
    show(0);

    /* buy box: size, quantity, add to the quote list */
    var buy = $("#pd-buy");
    function sizeLabel(v) { return (v.size || "—") + (v.ref ? " · " + v.ref : "") + (v.l ? " · " + [v.l, v.w, v.h].filter(function (x) { return x !== undefined && x !== ""; }).join("×") + " cm" : ""); }
    function vKey(v) { return v ? (v.ref || v.size || "") : ""; }
    function curVariant() { return vs.length > 1 ? vs[+($("#pd-size") || { value: 0 }).value] : vs[0]; }
    function curKey() { var v = curVariant(), vk = vKey(v); return vk ? p.id + "~" + vk : p.id; }
    var keepSize = 0;
    function renderBuy() {
      var l = load(), i = find(l, curKey()), item = i > -1 ? l[i] : null, lines = linesOf(l, p.id);
      var wa = String(C.whatsapp || SITE.whatsapp || "").replace(/\D/g, "");
      var waText = encodeURIComponent("Hello Atlas Art Minerals, I'm interested in: " + p.name + " (" + p.finish + ")" + (p.ref ? " — ref. " + p.ref : "") + ". " + location.href.split("#")[0]);
      buy.innerHTML =
        (vs.length > 1 ? '<label class="pd-field"><span>' + T("Size") + '</span><select id="pd-size">' + vs.map(function (v, k) { return '<option value="' + k + '">' + esc(sizeLabel(v)) + "</option>"; }).join("") + "</select></label>" : "") +
        '<div class="pd-row">' +
          '<label class="pd-field pd-qty"><span>' + T("Quantity") + '</span><input id="pd-q" type="number" inputmode="numeric" min="1" value="' + (item ? item.qty : 1) + '"></label>' +
          '<button class="btn btn-primary" type="button" id="pd-add">' + (item ? T("Update quote list") : T("Add to quote list")) + "</button>" +
        "</div>" +
        (lines.length ? '<div class="pd-in small"><b>✓ ' + T("In your quote list") + '</b><ul>' + lines.map(function (it) { return "<li>" + esc(sizeText(it) || p.name) + " × " + it.qty + "</li>"; }).join("") + '</ul><a href="quote.html">' + T("Review quote list") + "</a></div>" : "") +
        (wa ? '<a class="pd-wa link-accent" href="https://wa.me/' + wa + "?text=" + waText + '" target="_blank" rel="noopener">' + T("Ask about this piece on WhatsApp") + "</a>" : "");
      if ($("#pd-size")) {
        $("#pd-size").value = keepSize;
        var it2 = find(load(), curKey()); $("#pd-q").value = it2 > -1 ? load()[it2].qty : 1;
        $("#pd-add").textContent = it2 > -1 ? T("Update quote list") : T("Add to quote list");
      }
    }
    buy.addEventListener("change", function (e) { if (e.target.id === "pd-size") { keepSize = +e.target.value; renderBuy(); } });
    buy.addEventListener("click", function (e) {
      if (!e.target.closest("#pd-add")) return;
      var q = parseInt($("#pd-q").value, 10); q = isNaN(q) || q < 1 ? 1 : Math.min(q, 99999);
      var v = curVariant(), vk = vKey(v), key = curKey();
      var had = find(load(), key) > -1;
      add(p.id, q, vk); setQty(key, q);
      toast((had ? T("Updated: ") : T("Added: ")) + p.name + (v && v.size ? " · " + v.size : ""));
      renderBuy();
    });
    renderBuy();

    /* short spec list */
    $("#pd-spec").innerHTML = (p.ref && vs.length < 2 ? "<dt>" + T("Ref.") + "</dt><dd>" + esc(p.ref) + "</dd>" : "") +
      "<dt>" + T("Material") + "</dt><dd>" + esc(p.finish) + "</dd><dt>" + T("Made") + "</dt><dd>" + T("By hand, Agadir workshop") + "</dd>" +
      (vs.length ? "" : "<dt>" + T("Sizes") + "</dt><dd>" + esc(p.sizes || T("Several sizes for most pieces — ask")) + "</dd>") +
      "<dt>" + T("Minimum") + "</dt><dd>" + T("Varies by piece — confirmed in your quote") + "</dd><dt>" + T("Private label") + "</dt><dd>" + T("Available") + "</dd>";

    /* full sizes table */
    if (vs.length) {
      var has = function (k) { return vs.some(function (v) { return v[k] !== undefined && v[k] !== ""; }); };
      var dim = function (a) { a = a.filter(function (x) { return x !== undefined && x !== ""; }); return a.length ? a.join(" × ") + " cm" : "—"; };
      var cols = [[T("Size"), function (v) { return esc(v.size || "—"); }, true], [T("Ref."), function (v) { return esc(v.ref || "—"); }, has("ref")],
        [T("Dimensions") + " (L×W×H)", function (v) { return dim([v.l, v.w, v.h]); }, has("l")], [T("Weight"), function (v) { return v.weight ? esc(v.weight) + " g" : "—"; }, has("weight")],
        [T("Box") + " (L×W×H)", function (v) { return dim([v.pl, v.pw, v.ph]); }, has("pl")], [T("Packed weight"), function (v) { return v.packWeight ? esc(v.packWeight) + " g" : "—"; }, has("packWeight")],
        [T("Volume"), function (v) { return v.volume !== undefined ? esc(v.volume) : "—"; }, has("volume")]].filter(function (c) { return c[2]; });
      $("#pd-sizes").innerHTML = "<table><thead><tr>" + cols.map(function (c) { return "<th>" + c[0] + "</th>"; }).join("") + "</tr></thead><tbody>" +
        vs.map(function (v) { return "<tr>" + cols.map(function (c) { return "<td>" + c[1](v) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
      $("#pd-sizes-sec").hidden = false;
    }
    if (p.longDescription) { $("#pd-long").innerHTML = esc(p.longDescription).split(/\n{2,}/).map(function (para) { return "<p>" + para.replace(/\n/g, "<br>") + "</p>"; }).join(""); $("#pd-long-sec").hidden = false; }

    /* related pieces: same family first */
    var rel = P.filter(function (x) { return x.id !== p.id && x.family === p.family; }).sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); }).slice(0, 5);
    if (rel.length < 5) rel = rel.concat(P.filter(function (x) { return x.id !== p.id && x.family !== p.family && x.featured; }).slice(0, 5 - rel.length));
    if (rel.length) { $("#pd-related").innerHTML = rel.map(function (x) { return cardHTML(x); }).join(""); $("#pd-rel-sec").hidden = false; }
    window.AAM_PRODUCT_ID = p.id;
  })();

  sync(); watch(document);
})();
