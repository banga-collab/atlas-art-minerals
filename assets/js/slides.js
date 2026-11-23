/* Hero slideshow: crossfading plates, auto-advance (off for reduced motion), pause on hover/focus, keyboard + swipe. */
(function () {
  "use strict";
  var root = document.querySelector("[data-slides]"); if (!root) return;
  var slides = Array.prototype.slice.call(root.querySelectorAll(".slide"));
  var cap = root.querySelector("[data-cap]"), num = root.querySelector("[data-num]"), bar = root.querySelector("[data-bar]");
  var prev = root.querySelector("[data-prev]"), next = root.querySelector("[data-next]"), toggle = root.querySelector("[data-toggle]");
  var n = slides.length, i = 0, timer = null, DELAY = 5000;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var playing = !reduce, hovered = false;
  var pad = function (k) { return (k < 10 ? "0" : "") + k; };

  function show(k) {
    i = (k + n) % n;
    slides.forEach(function (s, j) {
      var on = j === i; s.classList.toggle("is-on", on); s.setAttribute("aria-hidden", on ? "false" : "true");
      if (on) { var im = s.querySelector("img"); if (im && im.loading === "lazy") im.loading = "eager"; }
    });
    var nx = slides[(i + 1) % n].querySelector("img"); if (nx && nx.loading === "lazy") nx.loading = "eager";
    cap.textContent = "fig. " + pad(i + 1) + " — " + slides[i].getAttribute("data-caption");
    num.textContent = pad(i + 1) + " / " + pad(n);
    if (bar) { bar.style.transition = "none"; bar.style.width = "0%"; void bar.offsetWidth; if (playing && !hovered) { bar.style.transition = "width " + DELAY + "ms linear"; bar.style.width = "100%"; } }
  }
  function schedule() { clearTimeout(timer); if (playing && !hovered) timer = setTimeout(function () { show(i + 1); schedule(); }, DELAY); }
  function go(k) { show(k); schedule(); }
  function setPlaying(p) {
    playing = p; toggle.setAttribute("aria-pressed", p ? "false" : "true");
    toggle.setAttribute("aria-label", p ? "Pause slideshow" : "Play slideshow");
    toggle.textContent = p ? "❚❚" : "▶"; show(i); schedule();
  }

  prev.addEventListener("click", function () { go(i - 1); });
  next.addEventListener("click", function () { go(i + 1); });
  toggle.addEventListener("click", function () { setPlaying(!playing); });
  root.addEventListener("mouseenter", function () { hovered = true; show(i); schedule(); });
  root.addEventListener("mouseleave", function () { hovered = false; show(i); schedule(); });
  root.addEventListener("focusin", function () { hovered = true; schedule(); });
  root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) { hovered = false; show(i); schedule(); } });
  root.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); } if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); } });
  var x0 = null;
  root.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener("touchend", function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1); x0 = null; });
  document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); else schedule(); });

  setPlaying(playing);
})();
