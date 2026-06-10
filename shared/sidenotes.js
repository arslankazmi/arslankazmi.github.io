/* sidenotes.js — progressive-enhancement margin sidenotes for marked-footnote output.

   Pattern (Tufte / R. Nystrom, the same idea gwern's sidenotes.js is built on, minus gwern's
   GW/Pandoc coupling): footnotes render normally at the bottom of the article (works with JS off /
   on narrow screens). When the viewport is wide enough that there's real room in the right gutter,
   we float each footnote into the margin next to its reference and hide the bottom list. Reflows on
   resize; re-runs when the SPA swaps article content. Targets marked-footnote's DOM:
     ref:  <sup><a data-footnote-ref id="footnote-ref-N" href="#footnote-N">N</a></sup>
     body: <section data-footnotes><ol><li id="footnote-N"><p>… <a data-footnote-backref>↩</a></p></li></ol></section>
*/
(function () {
  var MIN_VIEWPORT = 1200;   // below this: leave footnotes inline at the bottom
  var GUTTER_MIN = 260;      // px of right-margin room required to float sidenotes
  var SIDENOTE_W = 240;      // px
  var GAP = 14;              // px min vertical gap between stacked sidenotes
  var raf, timer;

  function layout(prose) {
    var section = prose.querySelector("section[data-footnotes]");
    prose.querySelectorAll("aside.sidenote").forEach(function (n) { n.remove(); });
    prose.classList.remove("has-sidenotes");
    if (!section) return;

    var rect = prose.getBoundingClientRect();
    var rightRoom = window.innerWidth - rect.right;
    if (window.innerWidth < MIN_VIEWPORT || rightRoom < GUTTER_MIN) return; // keep bottom footnotes

    prose.classList.add("has-sidenotes");
    var items = section.querySelectorAll("ol > li");
    var prevBottom = 0;
    items.forEach(function (li) {
      var ref = prose.querySelector('a[data-footnote-ref][href="#' + li.id + '"]');
      if (!ref) return;
      var clone = li.cloneNode(true);
      clone.querySelectorAll("[data-footnote-backref]").forEach(function (b) { b.remove(); });
      var aside = document.createElement("aside");
      aside.className = "sidenote";
      aside.innerHTML = '<span class="sidenote-num">' + (ref.textContent || "") + "</span> " + clone.innerHTML.trim();
      prose.appendChild(aside);
      // align top with the reference (relative to the positioned .prose), avoiding overlap
      var refTop = ref.getBoundingClientRect().top - rect.top;
      var top = Math.max(refTop, prevBottom + GAP);
      aside.style.top = top + "px";
      prevBottom = top + aside.offsetHeight;
    });
  }

  function relayout() {
    if (observer) observer.disconnect();
    document.querySelectorAll(".prose").forEach(layout);
    if (observer) observe();
  }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout); }
  function scheduleDebounced() { clearTimeout(timer); timer = setTimeout(schedule, 150); }

  // SPA: the rich app mounts articles into #root after load — re-run when that subtree changes.
  var root = document.getElementById("root");
  var observer = root ? new MutationObserver(scheduleDebounced) : null;
  function observe() { if (observer) observer.observe(root, { childList: true, subtree: true }); }

  window.addEventListener("resize", schedule);
  window.addEventListener("load", schedule);
  if (document.readyState !== "loading") schedule();
  else document.addEventListener("DOMContentLoaded", schedule);
  observe();

  window.AKSidenotes = { refresh: schedule };
})();
