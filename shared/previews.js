/**
 * shared/previews.js — build-time link/image preview cards (IIFE, no deps).
 * Add to pages:  <script src="/shared/previews.js" defer></script>
 */
(function () {
  "use strict";

  // ─── State ───────────────────────────────────────────────────────────────
  var annotations = null;   // url -> record  (null = not yet loaded)
  var card        = null;   // the floating card DOM node
  var hideTimer   = null;
  var showTimer   = null;
  var activeAnchor = null;

  var DEBOUNCE_MS  = 150;
  var HIDE_GRACE_MS = 200;

  // ─── Boot ─────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    fetch("/annotations.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        annotations = data;
        attachPreviews();
        // SPA: re-scan when the rich app swaps article content into #root.
        var root = document.getElementById("root");
        if (root) {
          var t;
          new MutationObserver(function () {
            clearTimeout(t);
            t = setTimeout(attachPreviews, 150);
          }).observe(root, { childList: true, subtree: true });
        }
      })
      .catch(function () { /* previews are pure enhancement */ });
  });

  // ─── Card creation ────────────────────────────────────────────────────────
  function createCard() {
    var el = document.createElement("div");
    el.className = "ak-preview-card";
    el.setAttribute("role", "tooltip");
    el.setAttribute("aria-live", "polite");
    el.addEventListener("mouseenter", function () { cancelHide(); });
    el.addEventListener("mouseleave", function () { scheduleHide(); });
    document.body.appendChild(el);
    return el;
  }

  function getCard() {
    if (!card) card = createCard();
    return card;
  }

  // ─── Card content builders ────────────────────────────────────────────────

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function thumbHtml(src) {
    if (!src) return "";
    return '<img class="ak-preview-card__thumb" src="' + esc(src) + '" alt="" loading="lazy"/>';
  }

  function sourceLineHtml(url) {
    try {
      var host = new URL(url).hostname.replace(/^www\./, "");
      return '<div class="ak-preview-card__source">' + esc(host) + '</div>';
    } catch (e) { return ""; }
  }

  function buildCardHtml(record) {
    var t = record.type;

    if (t === "image") {
      return (
        '<div class="ak-preview-card--image">' +
        '<img src="' + esc(record.src || record.url) + '" alt="' + esc(record.title || "") + '" loading="lazy"/>' +
        (record.title ? '<div class="ak-preview-card__caption">' + esc(record.title) + '</div>' : '') +
        '</div>'
      );
    }

    var html = "";

    if (t === "post") {
      html += '<div class="ak-preview-card__type ak-preview-card__type--post">post</div>';
    } else if (t === "wikipedia") {
      html += '<div class="ak-preview-card__type ak-preview-card__type--wiki">Wikipedia</div>';
    } else if (t === "arxiv") {
      html += '<div class="ak-preview-card__type ak-preview-card__type--arxiv">arXiv</div>';
    } else if (t === "file") {
      html += '<div class="ak-preview-card__type ak-preview-card__type--file">' + esc((record.ext || "file").toUpperCase()) + '</div>';
    }

    if (record.thumb) html += thumbHtml(record.thumb);

    if (record.title) {
      html += '<div class="ak-preview-card__title">' + esc(record.title) + '</div>';
    }

    if (t === "arxiv" && record.author) {
      html += '<div class="ak-preview-card__author">' + esc(record.author) + '</div>';
    }

    if (record.excerpt) {
      // truncate long excerpts
      var excerpt = record.excerpt.length > 200 ? record.excerpt.slice(0, 200).trimEnd() + "…" : record.excerpt;
      html += '<div class="ak-preview-card__excerpt">' + esc(excerpt) + '</div>';
    }

    if (t === "post") {
      var meta = [record.date, record.read].filter(Boolean).join(" · ");
      if (meta) html += '<div class="ak-preview-card__meta">' + esc(meta) + '</div>';
      if (record.tags && record.tags.length) {
        html += '<div class="ak-preview-card__tags">' + record.tags.map(function (tag) {
          return '<span class="ak-preview-card__tag">' + esc(tag) + '</span>';
        }).join(" ") + '</div>';
      }
    }

    if (t !== "post") {
      var source = record.source || record.url;
      if (source) html += sourceLineHtml(source);
    }

    if (!html) {
      html = '<div class="ak-preview-card__title">' + esc(record.url) + '</div>';
    }

    return html;
  }

  // ─── Positioning ──────────────────────────────────────────────────────────

  function positionCard(cardEl, anchorEl) {
    var rect   = anchorEl.getBoundingClientRect();
    var cw     = cardEl.offsetWidth  || 360;
    var ch     = cardEl.offsetHeight || 160;
    var vw     = window.innerWidth;
    var vh     = window.innerHeight;
    var GAP    = 8;
    var scrollX = window.scrollX || window.pageXOffset;
    var scrollY = window.scrollY || window.pageYOffset;

    // Horizontal: align to anchor left, clamp to viewport
    var left = rect.left + scrollX;
    if (left + cw > scrollX + vw - GAP) left = scrollX + vw - cw - GAP;
    if (left < scrollX + GAP) left = scrollX + GAP;

    // Vertical: prefer below anchor; flip above if not enough space
    var top;
    if (rect.bottom + GAP + ch <= vh) {
      top = rect.bottom + scrollY + GAP;
    } else {
      top = rect.top + scrollY - ch - GAP;
    }
    if (top < scrollY + GAP) top = scrollY + GAP;

    cardEl.style.left = left + "px";
    cardEl.style.top  = top  + "px";
  }

  // ─── Show / hide ──────────────────────────────────────────────────────────

  function showCard(anchorEl, record) {
    var c = getCard();
    c.innerHTML = buildCardHtml(record);
    c.className = "ak-preview-card" + (record.type === "image" ? " ak-preview-card--image-zoom" : "");
    c.style.display = "block";
    positionCard(c, anchorEl);
    activeAnchor = anchorEl;
  }

  function hideCard() {
    if (card) {
      card.style.display = "none";
      card.innerHTML = "";
    }
    activeAnchor = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideCard, HIDE_GRACE_MS);
  }

  function cancelHide() {
    clearTimeout(hideTimer);
  }

  // ─── Attach handlers ──────────────────────────────────────────────────────

  function getRecord(url) {
    if (!annotations) return null;
    if (annotations[url]) return annotations[url];
    // also try normalised form (strip trailing slash, fragment)
    try {
      var u = new URL(url, location.href);
      var norm = u.href;
      if (annotations[norm]) return annotations[norm];
      // strip fragment
      u.hash = "";
      if (annotations[u.href]) return annotations[u.href];
    } catch (e) {}
    return null;
  }

  function attachAnchor(a) {
    var href = a.getAttribute("href");
    if (!href) return;
    var record = getRecord(href);
    if (!record) return;
    if (a.dataset.akp) return;     // already attached (SPA re-scan guard)
    a.dataset.akp = "1";
    a.classList.add("has-preview");
    a.setAttribute("aria-describedby", "ak-preview-card");

    a.addEventListener("mouseenter", function () {
      clearTimeout(showTimer);
      showTimer = setTimeout(function () { showCard(a, record); }, DEBOUNCE_MS);
    });
    a.addEventListener("mouseleave", function () {
      clearTimeout(showTimer);
      scheduleHide();
    });
    a.addEventListener("focus", function () { showCard(a, record); });
    a.addEventListener("blur",  function () { scheduleHide(); });
  }

  function attachImage(img) {
    var src = img.getAttribute("src");
    if (!src) return;
    if (img.dataset.akp) return;   // already attached (SPA re-scan guard)
    img.dataset.akp = "1";
    // Build an image record on the fly (annotations.json may have one too)
    var record = getRecord(src) || {
      type: "image",
      title: img.getAttribute("alt") || "",
      src: src,
      url: src,
    };

    img.style.cursor = "zoom-in";

    var isMobile = false;

    img.addEventListener("mouseenter", function () {
      clearTimeout(showTimer);
      if (!isMobile) {
        showTimer = setTimeout(function () { showCard(img, record); }, DEBOUNCE_MS);
      }
    });
    img.addEventListener("mouseleave", function () {
      clearTimeout(showTimer);
      scheduleHide();
    });
    img.addEventListener("click", function (e) {
      // on touch-capable devices use click to toggle
      e.preventDefault();
      if (activeAnchor === img) {
        hideCard();
      } else {
        showCard(img, record);
      }
    });
  }

  function attachPreviews() {
    // Anchor links
    var anchors = document.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) attachAnchor(anchors[i]);

    // Images inside .prose
    var proseImages = document.querySelectorAll(".prose img");
    for (var j = 0; j < proseImages.length; j++) attachImage(proseImages[j]);
  }

  // ─── Global dismiss ───────────────────────────────────────────────────────

  document.addEventListener("scroll", function () { hideCard(); }, { passive: true });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideCard();
  });
  document.addEventListener("click", function (e) {
    if (card && card.style.display !== "none") {
      if (!card.contains(e.target) && e.target !== activeAnchor) {
        hideCard();
      }
    }
  });

  // ─── Debug handle ─────────────────────────────────────────────────────────
  window.AKPreviews = {
    getAnnotations: function () { return annotations; },
    showCard: showCard,
    hideCard: hideCard,
  };

}());
