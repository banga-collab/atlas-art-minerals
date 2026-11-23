/* Atlas Art Minerals — visual page editor. Runs in the admin page and drives the site page loaded in an iframe:
   click any text to edit it, click any image to replace it, hide/show sections, edit button links, slideshow and SEO. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var frame = $("#pe-frame"), sel = $("#pe-page"), saveBtn = $("#pe-save"), undoBtn = $("#pe-undo"), dirtyEl = $("#pe-dirty");
  var doc = null, edits = null, currentFile = "index.html", inited = false;
  var MULTILINE = { P: 1, LI: 1, FIGCAPTION: 1, DD: 1 };

  function toast(msg, bad) { var t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 2600); }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Erreur " + r.status); return j; }); });
  }
  function reset() { edits = { texts: {}, links: {}, images: {}, sections: {} }; updateDirty(); }
  function count() { return Object.keys(edits.texts).length + Object.keys(edits.links).length + Object.keys(edits.images).length + Object.keys(edits.sections).length + (edits.title != null ? 1 : 0) + (edits.description != null ? 1 : 0); }
  function updateDirty() {
    var n = edits ? count() : 0;
    dirtyEl.textContent = n ? n + " modification" + (n > 1 ? "s" : "") + " non enregistrée" + (n > 1 ? "s" : "") : "Aucune modification";
    dirtyEl.classList.toggle("on", n > 0); saveBtn.disabled = !n; undoBtn.disabled = !n;
  }
  window.addEventListener("beforeunload", function (e) { if (edits && count()) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- Open a page ---------- */
  function load(file) {
    currentFile = file; reset(); doc = null;
    frame.src = "../" + file + "?edit=" + Date.now();
  }
  sel.addEventListener("change", function () {
    if (count() && !confirm("Vous avez des modifications non enregistrées. Les abandonner ?")) { sel.value = currentFile; return; }
    load(sel.value);
  });
  undoBtn.addEventListener("click", function () { if (confirm("Annuler toutes les modifications non enregistrées de cette page ?")) load(currentFile); });

  frame.addEventListener("load", function () {
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    setup();
  });

  /* ---------- Make the page editable ---------- */
  function setup() {
    var st = doc.createElement("style");
    st.textContent =
      "[data-edit]:not(img){outline:1px dashed transparent;outline-offset:3px;transition:outline-color .15s;cursor:text;border-radius:2px}" +
      "[data-edit]:not(img):hover{outline-color:oklch(0.60 0.15 50)}" +
      "[data-edit][contenteditable]:focus{outline:2px solid oklch(0.60 0.15 50);background:oklch(0.60 0.15 50 / .06)}" +
      "[data-edit^='g-']:not(img):hover{outline-color:oklch(0.5 0.12 260)}" +
      "img[data-edit]{cursor:pointer}img[data-edit]:hover{outline:3px solid oklch(0.60 0.15 50);outline-offset:-3px}" +
      ".aam-changed{box-shadow:0 0 0 2px oklch(0.70 0.15 140 / .55)!important}" +
      "[data-section]{position:relative}[data-section][hidden]{display:block!important;opacity:.35}" +
      ".aam-ui{font:600 12px/1 Manrope,system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important}" +
      ".aam-sec{position:absolute;top:6px;right:6px;z-index:60;background:oklch(0.22 0.01 60);color:#fff;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;opacity:.85}" +
      ".aam-sec:hover{opacity:1}.aam-slides{position:absolute;left:12px;top:12px;z-index:60;background:oklch(0.60 0.15 50);color:#fff;border:0;border-radius:6px;padding:9px 12px;cursor:pointer}" +
      ".aam-link{position:fixed;z-index:999;display:flex;gap:6px;align-items:center;background:oklch(0.22 0.01 60);color:#fff;padding:6px;border-radius:8px;box-shadow:0 10px 30px -10px #0008}" +
      ".aam-link input{width:260px;border:0;border-radius:5px;padding:6px 8px;font:500 12px Manrope,system-ui,sans-serif;color:#222}" +
      ".aam-link span{padding:0 4px}.reveal{opacity:1!important;transform:none!important}" +
      ".quote-float,.mobile-bar,.toast{display:none!important}";
    doc.head.appendChild(st);

    // Pause the slideshow while editing
    var slides = $("[data-slides]", doc); if (slides) slides.dispatchEvent(new Event("mouseenter"));

    // Texts
    $$("[data-edit]:not(img)", doc).forEach(function (el) {
      el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "true");
      el.title = el.getAttribute("data-edit").indexOf("g-") === 0 ? "En-tête / pied de page : modifié sur toutes les pages" : "Cliquer pour modifier";
    });
    // Block navigation and site behaviours while editing
    doc.addEventListener("click", function (e) {
      if (e.target.closest(".aam-ui")) return;
      var img = e.target.closest("img[data-edit]");
      if (img) { e.preventDefault(); e.stopPropagation(); openImage(img); return; }
      var a = e.target.closest("a, button, [data-qv], [data-add]");
      if (a) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    doc.addEventListener("submit", function (e) { e.preventDefault(); e.stopPropagation(); }, true);
    doc.addEventListener("keydown", function (e) {
      var el = e.target.closest && e.target.closest("[data-edit][contenteditable]"); if (!el) return;
      if (e.key === "Enter") { e.preventDefault(); if (MULTILINE[el.tagName] || e.shiftKey) doc.execCommand("insertLineBreak"); else el.blur(); }
      if (e.key === " " && (el.tagName === "BUTTON" || el.tagName === "A")) { e.preventDefault(); doc.execCommand("insertText", false, " "); }
    }, true);
    doc.addEventListener("paste", function (e) {
      var el = e.target.closest && e.target.closest("[data-edit][contenteditable]"); if (!el) return;
      e.preventDefault(); doc.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\s*\n\s*/g, " "));
    }, true);
    doc.addEventListener("input", function (e) {
      var el = e.target.closest && e.target.closest("[data-edit][contenteditable]"); if (!el) return;
      edits.texts[el.getAttribute("data-edit")] = el.innerHTML; el.classList.add("aam-changed"); updateDirty();
    }, true);
    doc.addEventListener("focusin", function (e) {
      var a = e.target.closest && e.target.closest("a[data-edit]"); showLink(a);
    });

    // Sections
    $$("[data-section]", doc).forEach(function (s) {
      var b = doc.createElement("button"); b.type = "button"; b.className = "aam-ui aam-sec";
      var paint = function () { b.textContent = s.hasAttribute("hidden") ? "👁 Afficher cette section" : "Masquer cette section"; };
      paint();
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (s.hasAttribute("hidden")) s.removeAttribute("hidden"); else s.setAttribute("hidden", "");
        edits.sections[s.getAttribute("data-section")] = s.hasAttribute("hidden"); paint(); updateDirty();
      });
      s.appendChild(b);
    });
    // Slideshow manager
    if (slides) {
      var sb = doc.createElement("button"); sb.type = "button"; sb.className = "aam-ui aam-slides";
      sb.textContent = "🖼 Modifier le diaporama (" + $$(".slide img", slides).length + " photos)";
      sb.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openSlides(slides); });
      slides.appendChild(sb);
    }
    // SEO fields
    $("#pe-title").value = doc.title || "";
    var md = doc.querySelector('meta[name="description"]'); $("#pe-desc").value = md ? md.getAttribute("content") : "";
    updateDirty();
  }
  $("#pe-title").addEventListener("input", function () { edits.title = this.value; updateDirty(); });
  $("#pe-desc").addEventListener("input", function () { edits.description = this.value; updateDirty(); });

  /* ---------- Link editor (floating, inside the page) ---------- */
  var linkBox = null;
  function showLink(a) {
    if (linkBox) { linkBox.remove(); linkBox = null; }
    if (!a) return;
    var r = a.getBoundingClientRect();
    linkBox = doc.createElement("div"); linkBox.className = "aam-ui aam-link";
    linkBox.innerHTML = "<span>Lien</span><input type='text' aria-label='Adresse du lien'><button type='button' class='aam-ui' style='border:0;border-radius:5px;padding:6px 10px;cursor:pointer'>OK</button>";
    var inp = $("input", linkBox); inp.value = a.getAttribute("href") || "";
    linkBox.style.left = Math.max(8, Math.min(r.left, doc.documentElement.clientWidth - 360)) + "px";
    linkBox.style.top = (r.bottom + 8 > doc.documentElement.clientHeight - 50 ? r.top - 46 : r.bottom + 8) + "px";
    var apply = function () {
      var v = inp.value.trim(); if (!v || v === a.getAttribute("href")) return;
      a.setAttribute("href", v); edits.links[a.getAttribute("data-edit")] = v; a.classList.add("aam-changed"); updateDirty(); toast("Lien modifié.");
    };
    $("button", linkBox).addEventListener("click", function (e) { e.preventDefault(); apply(); showLink(null); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); apply(); showLink(null); } });
    linkBox.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    doc.body.appendChild(linkBox);
  }

  /* ---------- Image dialog ---------- */
  var imgDlg = $("#pe-img"), imgTarget = null, pending = null;
  function openImage(img) {
    imgTarget = img; pending = null;
    $("#pi-prev").src = img.getAttribute("src");
    $("#pi-alt").value = img.getAttribute("alt") || "";
    var fig = img.closest("figure[data-caption]");
    $("#pi-cap-row").hidden = !fig; $("#pi-cap").value = fig ? fig.getAttribute("data-caption") : "";
    $("#pi-file").value = "";
    imgDlg.showModal();
  }
  $("#pi-file").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    if (!/^image\/(webp|jpeg|png)$/.test(f.type)) { toast("Photo WEBP, JPG ou PNG uniquement.", true); return; }
    if (f.size > 5 * 1024 * 1024) { toast("Photo trop lourde (max 5 Mo).", true); return; }
    window.AAM_IMG.prepare(f).then(function (d) { pending = d; $("#pi-prev").src = d; }).catch(function (e) { toast(e.message, true); });
  });
  $$("[data-close-img]").forEach(function (b) { b.addEventListener("click", function () { imgDlg.close(); }); });
  $("#pi-ok").addEventListener("click", function () {
    var btn = this; btn.disabled = true;
    var key = imgTarget.getAttribute("data-edit");
    var up = pending ? api("POST", "/api/upload", { dataUrl: pending, name: "page-" + key }).then(function (r) { return r.path; }) : Promise.resolve(null);
    up.then(function (p) {
      var e = edits.images[key] || {};
      if (p) { e.src = p; imgTarget.src = p; imgTarget.removeAttribute("srcset"); }
      e.alt = $("#pi-alt").value.trim(); imgTarget.setAttribute("alt", e.alt);
      var fig = imgTarget.closest("figure[data-caption]");
      if (fig) { e.caption = $("#pi-cap").value.trim(); fig.setAttribute("data-caption", e.caption); }
      edits.images[key] = e; imgTarget.classList.add("aam-changed"); updateDirty(); imgDlg.close();
      if (slidesDlg.open) renderSlides();
    }).catch(function (err) { toast(err.message, true); }).then(function () { btn.disabled = false; });
  });

  /* ---------- Slideshow dialog ---------- */
  var slidesDlg = $("#pe-slides"), slidesRoot = null;
  function renderSlides() {
    $("#ps-list").innerHTML = $$(".slide img[data-edit]", slidesRoot).map(function (img, i) {
      var fig = img.closest("figure");
      return "<li><img src='" + esc(img.getAttribute("src")) + "' alt=''><div><b>Photo " + (i + 1) + "</b><span class='muted'>" + esc(fig ? fig.getAttribute("data-caption") : "") + "</span></div><button class='ghost' type='button' data-k='" + esc(img.getAttribute("data-edit")) + "'>Modifier</button></li>";
    }).join("");
  }
  function openSlides(root) { slidesRoot = root; renderSlides(); slidesDlg.showModal(); }
  $("#ps-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-k]"); if (!b) return;
    var img = slidesRoot.querySelector('img[data-edit="' + b.getAttribute("data-k") + '"]'); if (img) openImage(img);
  });
  $$("[data-close-slides]").forEach(function (b) { b.addEventListener("click", function () { slidesDlg.close(); }); });

  /* ---------- Save ---------- */
  saveBtn.addEventListener("click", function () {
    if (!count()) return;
    saveBtn.disabled = true;
    var body = Object.assign({ file: currentFile }, edits);
    api("PUT", "/api/page", body).then(function (r) {
      toast(r.files.length > 1 ? "Enregistré (en-tête / pied de page mis à jour sur toutes les pages)." : "Page enregistrée. Le site est à jour.");
      load(currentFile);
    }).catch(function (err) { toast(err.message, true); saveBtn.disabled = false; });
  });

  /* ---------- Init when the tab opens ---------- */
  window.AAM_EDITOR = {
    open: function () {
      if (inited) return; inited = true;
      api("GET", "/api/pages").then(function (pages) {
        sel.innerHTML = pages.map(function (p) { return "<option value='" + esc(p.file) + "'>" + esc(p.label) + "</option>"; }).join("");
        load(pages[0].file);
      }).catch(function (err) { toast(err.message, true); });
    }
  };
})();
