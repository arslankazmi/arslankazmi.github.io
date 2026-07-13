/* sidenotes.js — two-column margin sidenotes for marked-footnote output (progressive enhancement).

   The behaviour follows gwern.net's sidenotes (gwern.net/sidenote, after Tufte-CSS): each footnote is
   placed in the page margin *next to its reference*. Gwern's own sidenotes.js is a ~1300-line engine
   fused to its Notes model / transclude / page-toolbar / hash-routing, so this is a small self-contained
   implementation of the part that matters — the key trick we were missing is using BOTH margins, which
   lets clustered references each sit beside their mention instead of stacking in one column.

   Degrades fully: with JS off, on narrow screens, or when there isn't gutter room, the footnotes stay a
   normal <section data-footnotes> list at the bottom. Targets marked-footnote's DOM:
     ref:  <sup><a data-footnote-ref id="footnote-ref-N" href="#footnote-N">N</a></sup>
     body: <section data-footnotes><ol><li id="footnote-N"><p>… <a data-footnote-backref>↩</a></p></li></ol></section>
*/
(function () {
  var MIN_VIEWPORT = 1000;  // below this: leave footnotes inline at the bottom
  var GUTTER_MIN = 230;     // px of margin room required for a sidenote column
  var GAP = 16;             // px min vertical gap between stacked sidenotes in a column
  var raf, timer, observer;

  function buildAside(li, ref, side) {
    var clone = li.cloneNode(true);
    clone.querySelectorAll("[data-footnote-backref]").forEach(function (b) { b.remove(); });
    var aside = document.createElement("aside");
    aside.className = "sidenote" + (side === "left" ? " sidenote--left" : "");
    aside.innerHTML = '<span class="sidenote-num">' + (ref.textContent || "") + "</span> " + clone.innerHTML.trim();
    return aside;
  }

  function layout(prose) {
    var section = prose.querySelector("section[data-footnotes]");
    prose.querySelectorAll("aside.sidenote").forEach(function (n) { n.remove(); });
    prose.classList.remove("has-sidenotes");
    prose.style.minHeight = "";
    if (!section) return;

    var rect = prose.getBoundingClientRect();
    var rightRoom = window.innerWidth - rect.right;
    var leftRoom = rect.left;
    var canRight = rightRoom >= GUTTER_MIN;
    var canLeft = leftRoom >= GUTTER_MIN;
    if (window.innerWidth < MIN_VIEWPORT || (!canRight && !canLeft)) return; // keep bottom footnotes

    prose.classList.add("has-sidenotes");
    var twoCol = canLeft && canRight;
    var bottom = { left: 0, right: 0 };           // running bottom of each column (for collision)
    var items = section.querySelectorAll("ol > li");
    var i = 0;
    items.forEach(function (li) {
      var ref = prose.querySelector('a[data-footnote-ref][href="#' + li.id + '"]');
      if (!ref) return;
      // Alternate columns when both margins are available; otherwise use whichever has room.
      var side = !canLeft ? "right" : !canRight ? "left" : (i % 2 === 0 ? "right" : "left");
      var aside = buildAside(li, ref, side);
      prose.appendChild(aside);
      var refTop = ref.getBoundingClientRect().top - rect.top;     // align to the reference
      var top = Math.max(refTop, bottom[side] + GAP);              // …but never overlap the prior note
      aside.style.top = top + "px";
      bottom[side] = top + aside.offsetHeight;
      i++;
    });
    // Absolutely-positioned sidenotes don't stretch .prose; reserve space for the lowest note so a
    // tall note near the end of the article can't spill over the footer / following content.
    var maxBottom = Math.max(bottom.left, bottom.right);
    if (maxBottom > prose.offsetHeight) prose.style.minHeight = (maxBottom + 8) + "px";
  }

  function relayout() {
    if (observer) observer.disconnect();
    document.querySelectorAll(".prose").forEach(layout);
    observe();
  }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout); }
  function scheduleDebounced() { clearTimeout(timer); timer = setTimeout(schedule, 150); }

  // SPA: the rich app mounts articles into #root after load — re-run when that subtree changes.
  var root = document.getElementById("root");
  observer = root ? new MutationObserver(scheduleDebounced) : null;
  function observe() { if (observer) observer.observe(root, { childList: true, subtree: true }); }

  window.addEventListener("resize", schedule);
  window.addEventListener("load", schedule);
  if (document.readyState !== "loading") schedule();
  else document.addEventListener("DOMContentLoaded", schedule);
  observe();

  window.AKSidenotes = { refresh: schedule };
})();
