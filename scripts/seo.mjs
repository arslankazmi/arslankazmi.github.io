/* ============================================================
   seo.mjs — reach/discovery outputs built from the post index:
     · per-side RSS 2.0 feeds        (rssFeed)
     · sitemap.xml                   (sitemapXml)
     · robots.txt                    (robotsTxt)
     · Open Graph + Twitter meta      (ogTags, ogImageFor)

   Pure + dependency-free (Node 18+). All URLs are absolute against SITE so
   feeds/cards resolve off-site (feed readers and social scrapers don't know the
   origin). Canonical/static post URL is /<side>/p/<slug>/.
   ============================================================ */
export const SITE = "https://arslankazmi.github.io";

// Escape for both XML text and double-quoted attributes.
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const postUrl = (side, slug) => `${SITE}/${side}/p/${slug}/`;

/** Plain-text excerpt for a fallback description (strips tags, trims to a word boundary). */
export function excerpt(text, n = 160) {
  const t = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const at = cut.lastIndexOf(" ");
  return (at > 40 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, "") + "…";
}

// YYYY-MM-DD -> RFC-822 (noon UTC avoids any TZ date roll).
const rfc822 = (iso) => new Date(`${iso}T12:00:00Z`).toUTCString();

const absolutize = (p) =>
  /^https?:\/\//i.test(p) ? p : `${SITE}${p.startsWith("/") ? "" : "/"}${p}`;

/**
 * Absolute og:image for a post. Every post gets a generated 1200×630 card
 * (see scripts/og-card.mjs), so the default is that card's URL; an explicit
 * `image:` front-matter value overrides it. Always "large" (1.91:1) →
 * summary_large_image. Returns { url, large }.
 */
export function ogImageFor(post, cardUrl) {
  return { url: post.image ? absolutize(post.image) : cardUrl, large: true };
}

/** Open Graph + Twitter Card + canonical <link>, as head markup. */
export function ogTags({ title, description, url, image, type = "website", publishedTime, siteName }) {
  const img = image?.url;
  const card = image?.large ? "summary_large_image" : "summary";
  return [
    `<meta property="og:type" content="${esc(type)}"/>`,
    `<meta property="og:title" content="${esc(title)}"/>`,
    description ? `<meta property="og:description" content="${esc(description)}"/>` : "",
    `<meta property="og:url" content="${esc(url)}"/>`,
    siteName ? `<meta property="og:site_name" content="${esc(siteName)}"/>` : "",
    img ? `<meta property="og:image" content="${esc(img)}"/>` : "",
    publishedTime ? `<meta property="article:published_time" content="${esc(publishedTime)}"/>` : "",
    `<meta name="twitter:card" content="${card}"/>`,
    `<meta name="twitter:title" content="${esc(title)}"/>`,
    description ? `<meta name="twitter:description" content="${esc(description)}"/>` : "",
    img ? `<meta name="twitter:image" content="${esc(img)}"/>` : "",
    `<link rel="canonical" href="${esc(url)}"/>`,
  ].filter(Boolean).join("\n  ");
}

/** RSS 2.0 feed for one side. `posts` are already newest-first from build-index. */
export function rssFeed(side, posts, { title, description }) {
  const selfUrl = `${SITE}/${side}/feed.xml`;
  const items = (posts || []).map((p) => {
    const url = postUrl(side, p.slug);
    const cats = (p.tags || []).map((t) => `<category>${esc(t)}</category>`).join("");
    return `  <item>
    <title>${esc(p.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${rfc822(p.iso)}</pubDate>${p.blurb ? `\n    <description>${esc(p.blurb)}</description>` : ""}${cats ? `\n    ${cats}` : ""}
  </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(title)}</title>
  <link>${SITE}/${side}/</link>
  <atom:link href="${selfUrl}" rel="self" type="application/rss+xml"/>
  <description>${esc(description)}</description>
  <language>en</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

/** sitemap.xml for the whole site: landing pages + every published post. */
export function sitemapXml(index) {
  const urls = [];
  const add = (loc, lastmod) => urls.push(`  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`);
  add(`${SITE}/`);
  for (const p of ["dev", "personal", "fun", "acknowledgements"]) add(`${SITE}/${p}/`);
  for (const side of ["dev", "personal"])
    for (const p of index[side] || []) add(postUrl(side, p.slug), p.iso);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}
