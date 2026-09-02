/* ============================================================
   og-card.mjs — render a 1200×630 social card (PNG) per post/page.

   Fixes the OG validator findings: correct 1.91:1 ratio, a headline baked
   into the image, and (because a real landscape image now exists) a
   summary_large_image Twitter card. Text is drawn with resvg's system fonts
   (DejaVu is present on the GitHub Actions ubuntu runner that builds the
   canonical output), so nothing extra is vendored.

   Future: composite a post's cartoon (assets/img/<slug>/) into the card.
   ============================================================ */
import { Resvg } from "@resvg/resvg-js";

const W = 1200, H = 630;
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Greedy word-wrap into <= maxLines lines of ~maxChars, ellipsising overflow.
function wrap(title, maxChars, maxLines) {
  const lines = [];
  let cur = "";
  for (const w of String(title).split(/\s+/)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, maxChars - 1).replace(/[\s]+$/, "") + "…";
    return kept;
  }
  return lines;
}

const THEME = {
  dev:      { bg: "#0b0d10", fg: "#eef2f6", accent: "#7cc7ff", titleFont: "DejaVu Sans" },
  personal: { bg: "#edece4", fg: "#20242a", accent: "#b5462f", titleFont: "DejaVu Serif" },
};
const LABEL_FONT = "DejaVu Sans Mono";

/** Render a card. `title` is the headline, `site` the small label. Returns a PNG Buffer. */
export function renderCard({ title, site, side = "dev" }) {
  const t = THEME[side] || THEME.dev;
  const len = String(title).length;
  const fontSize = len <= 28 ? 74 : len <= 52 ? 60 : 50;
  const maxChars = Math.max(10, Math.floor((W - 160) / (fontSize * 0.56)));
  const lineHeight = Math.round(fontSize * 1.18);
  const lines = wrap(title, maxChars, 4);
  const startY = 340 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.32;
  const tspans = lines
    .map((ln, i) => `<tspan x="80" y="${Math.round(startY + i * lineHeight)}">${esc(ln)}</tspan>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <rect x="0" y="0" width="${W}" height="12" fill="${t.accent}"/>
  <text x="80" y="118" font-family="${LABEL_FONT}" font-size="30" fill="${t.accent}">${esc(site)}</text>
  <text font-family="${t.titleFont}" font-size="${fontSize}" font-weight="700" fill="${t.fg}">${tspans}</text>
  <text x="80" y="566" font-family="${LABEL_FONT}" font-size="26" fill="${t.fg}" opacity="0.55">Arslan Kazmi</text>
</svg>`;

  return new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { loadSystemFonts: true, defaultFontFamily: t.titleFont },
  }).render().asPng();
}
