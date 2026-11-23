/* Atlas Art Minerals — language switcher, cookie notice, anonymous statistics, newsletter. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var T = window.AAM_T || function (x) { return x; };
  var I = window.AAM_I18N || { langs: [] }, SITE = window.AAM_SITE || {};
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } } };
  if (location.search.indexOf("edit=") > -1 && window.top !== window) return;   // inside the admin page editor

  /* ---------- Language switcher ---------- */
  var host = $(".hd-right");
  if (host && I.langs.length > 1 && !$("#lang-switch")) {
    var sel = document.createElement("select");
    sel.id = "lang-switch"; sel.className = "lang-switch"; sel.setAttribute("aria-label", T("Language"));
    sel.innerHTML = I.langs.map(function (l) { return '<option value="' + l.code + '"' + (l.code === window.AAM_LANG ? " selected" : "") + ">" + l.code.toUpperCase() + "</option>"; }).join("");
    sel.addEventListener("change", function () { store.set("aam-lang", sel.value); var u = new URL(location.href); u.searchParams.delete("lang"); location.href = u.toString(); });
    host.insertBefore(sel, host.firstChild);
  }

  /* ---------- Cookie / statistics notice ---------- */
  var consent = store.get("aam-consent");
  function track(data) {
    if (window.AAM_STATIC || store.get("aam-consent") === "no") return;   // static hosting: no statistics server
    var body = JSON.stringify(data);
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
  }
  if (!window.AAM_STATIC && SITE.cookieBanner !== false && !consent) {
    var bar = document.createElement("div");
    bar.className = "cookie-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Cookies");
    bar.innerHTML = '<p>' + (SITE.cookieText || "We use anonymous, cookie-free statistics to improve this site. No advertising trackers.") +
      ' <a href="privacy.html">Privacy</a></p><div><button type="button" class="btn btn-sm" data-c="yes">' + T("Accept") + '</button><button type="button" class="btn-secondary btn-sm" data-c="no">' + T("Decline") + "</button></div>";
    // the page view is sent on "Accept", or when the visitor leaves without choosing; never after "Decline"
    var viewSent = false, sendView = function () { if (viewSent) return; viewSent = true; track({ t: "view", path: location.pathname, ref: document.referrer }); };
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-c]"); if (!b) return;
      store.set("aam-consent", b.getAttribute("data-c")); bar.remove();
      document.body.classList.remove("has-cookie-bar");
      if (b.getAttribute("data-c") === "yes") sendView(); else viewSent = true;
    });
    window.addEventListener("pagehide", sendView);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") sendView(); });
    document.body.appendChild(bar);
    // keep the floating "quote list" button visible above the notice
    var placeBar = function () { document.body.style.setProperty("--cookie-h", (bar.offsetHeight + 16) + "px"); };
    document.body.classList.add("has-cookie-bar"); placeBar(); window.addEventListener("resize", placeBar);
  } else {
    track({ t: "view", path: location.pathname, ref: document.referrer });
  }
  if (window.AAM_PRODUCT_ID && window.self === window.top) track({ t: "product", id: window.AAM_PRODUCT_ID });
  document.addEventListener("click", function (e) {
    var q = e.target.closest("[data-qv]"); if (q) track({ t: "product", id: q.getAttribute("data-qv") });
  }, true);

  /* ---------- Newsletter ---------- */
  // static hosting (no server to store sign-ups): the newsletter block is replaced by a contact invitation
  if (window.AAM_STATIC) Array.prototype.forEach.call(document.querySelectorAll("form[data-newsletter]"), function (f) {
    var em = (SITE.email || "info@atlasart.com"), b = f.querySelector("button[type=submit]");
    f.querySelector(".news-field").innerHTML = '<a class="btn" href="mailto:' + em + '?subject=' + encodeURIComponent("Trade news") + '">' + T("Ask for our news by email") + "</a>";
    f.setAttribute("data-newsletter", "static");
  });
  Array.prototype.forEach.call(document.querySelectorAll("form[data-newsletter]:not([data-newsletter=static])"), function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $(".news-msg", f), btn = $("button", f), email = f.elements.email.value.trim();
      btn.disabled = true; msg.textContent = "";
      fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, website: f.elements.website.value, lang: window.AAM_LANG, source: location.pathname }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error"); }); })
        .then(function () { msg.textContent = T("Thank you — you are subscribed."); f.elements.email.value = ""; })
        .catch(function (err) { msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    });
  });
})();
