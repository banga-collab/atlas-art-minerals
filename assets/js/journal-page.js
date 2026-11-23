/* Journal: list page (journal.html) and single article (article.html), rendered from assets/js/journal.js. */
(function () {
  "use strict";
  var J = window.AAM_JOURNAL || { posts: [], authors: [], categories: [] };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var cat = function (id) { var c = J.categories.find(function (x) { return x.id === id; }); return c ? c.name : ""; };
  var auth = function (id) { return J.authors.find(function (x) { return x.id === id; }) || null; };
  var fmt = function (d) { try { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return d; } };

  var grid = $("#j-grid");
  if (grid) {
    var chips = $("#j-chips"), current = (location.hash || "").replace("#", "");
    var used = J.categories.filter(function (c) { return J.posts.some(function (p) { return p.category === c.id; }); });
    if (chips) {
      chips.innerHTML = '<button class="chip" type="button" data-c="" aria-pressed="' + (!current) + '">All <span class="n">' + J.posts.length + "</span></button>" +
        used.map(function (c) { return '<button class="chip" type="button" data-c="' + esc(c.id) + '" aria-pressed="' + (current === c.id) + '">' + esc(c.name) + ' <span class="n">' + J.posts.filter(function (p) { return p.category === c.id; }).length + "</span></button>"; }).join("");
      chips.hidden = used.length === 0;
      chips.addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; current = b.getAttribute("data-c"); history.replaceState(null, "", current ? "#" + current : location.pathname); render(); });
    }
    var render = function () {
      if (chips) Array.prototype.forEach.call(chips.querySelectorAll("[data-c]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-c") === current ? "true" : "false"); });
      var list = J.posts.filter(function (p) { return !current || p.category === current; });
      grid.innerHTML = list.map(function (p) {
        var a = auth(p.author);
        return '<a class="j-card" href="article.html?a=' + encodeURIComponent(p.id) + '"><div class="j-img">' + (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy">' : "") + "</div>" +
          '<div class="j-meta">' + (p.category ? '<span class="cat">' + esc(cat(p.category)) + "</span><span>·</span>" : "") + "<span>" + esc(fmt(p.date)) + "</span>" + (a ? "<span>·</span><span>" + esc(a.name) + "</span>" : "") + "</div>" +
          "<h2>" + esc(p.title) + "</h2>" + (p.excerpt ? "<p>" + esc(p.excerpt) + "</p>" : "") + "</a>";
      }).join("");
      var empty = $("#j-empty"); if (empty) empty.hidden = list.length > 0;
    };
    render();
  }

  var art = $("#article");
  if (art) {
    var id = new URLSearchParams(location.search).get("a");
    var p = J.posts.find(function (x) { return x.id === id; });
    if (!p) { art.innerHTML = '<p class="eyebrow">Journal</p><h1 class="display-l">Article not found.</h1><p class="lede">It may have been moved or unpublished.</p><p style="margin-top:24px"><a class="link-accent" href="journal.html">Back to the journal</a></p>'; return; }
    document.title = (p.seoTitle || p.title) + " — Atlas Art Minerals";
    var md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute("content", p.seoDescription || p.excerpt || "");
    var a = auth(p.author);
    art.innerHTML =
      '<a class="link-accent" href="journal.html">← Journal</a>' +
      '<div class="j-meta" style="margin-top:28px">' + (p.category ? '<span class="cat">' + esc(cat(p.category)) + "</span><span>·</span>" : "") + "<span>" + esc(fmt(p.date)) + "</span></div>" +
      '<h1 class="display-l">' + esc(p.title) + "</h1>" + (p.excerpt ? '<p class="lede">' + esc(p.excerpt) + "</p>" : "") +
      (p.cover ? '<div class="cover"><img src="' + esc(p.cover) + '" alt=""></div>' : "") +
      '<div class="prose">' + p.body + "</div>" +
      (a ? '<div class="byline">' + (a.photo ? '<img src="' + esc(a.photo) + '" alt="">' : "") + "<div><b>" + esc(a.name) + "</b><small>" + esc(a.role || "") + "</small>" + (a.bio ? '<p class="small muted" style="margin:6px 0 0">' + esc(a.bio) + "</p>" : "") + "</div></div>" : "");
  }
})();
