#!/usr/bin/env node
/**
 * scripts/annotations.mjs
 * Build-time link/image preview annotations for the static site.
 *
 * Usage (from build.mjs or standalone):
 *   import { buildAnnotations } from "./scripts/annotations.mjs";
 *   const stats = await buildAnnotations({ repo, posts, outFile, cacheFile });
 *
 * @param {object} opts
 * @param {string} opts.repo     - absolute path to repo root
 * @param {object} opts.posts    - { dev: [...], personal: [...] } post index
 * @param {string} opts.outFile  - where to write merged annotations.json (e.g. _public/annotations.json)
 * @param {string} opts.cacheFile - committed cache path (e.g. <repo>/data/annotations.cache.json)
 * @returns {Promise<{count:number, resolved:number, fromCache:number, unresolved:number}>}
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 6000;

/**
 * fetch with AbortController timeout. Returns null on any error.
 */
async function fetchSafe(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "annotations-bot/1.0" } });
    clearTimeout(tid);
    return res;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

/**
 * Pull a single meta-tag value from raw HTML via regex.
 * Handles both property= and name= variants, single/double quotes.
 */
function metaContent(html, propName) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${propName}["'][^>]+content=["']([^"']*?)["']` +
    `|<meta[^>]+content=["']([^"']*?)["'][^>]+(?:property|name)=["']${propName}["']`,
    "i"
  );
  const m = html.match(re);
  return m ? (m[1] || m[2] || "").trim() : "";
}

/**
 * Extract <title>…</title> from HTML.
 */
function htmlTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "";
}

/**
 * Decode a percent-encoded URL path segment into a readable filename.
 */
function decodedFilename(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || u.hostname);
  } catch {
    return url;
  }
}

/**
 * Return the hostname of a URL, or "" on failure.
 */
function hostname(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

// ─── Per-type resolvers ──────────────────────────────────────────────────────

const FILE_EXTS = new Set([".pdf", ".doc", ".docx", ".epub", ".zip", ".tar", ".gz", ".xls", ".xlsx", ".ppt", ".pptx"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

/**
 * Given all posts flattened, build a slug → post lookup.
 */
function buildPostLookup(posts) {
  const map = new Map();
  for (const side of ["dev", "personal"]) {
    for (const p of (posts[side] || [])) {
      map.set(p.slug, p);
    }
  }
  return map;
}

/**
 * Detect if url is an internal post link and return the slug, else null.
 * Matches: #/p/<slug>  |  /dev/p/<slug>/  |  /personal/p/<slug>/
 */
function internalPostSlug(url) {
  let m;
  m = url.match(/^#\/p\/([^/?#]+)/);
  if (m) return m[1];
  m = url.match(/\/(?:dev|personal)\/p\/([^/?#/]+)\/?$/);
  if (m) return m[1];
  return null;
}

/**
 * Detect Wikipedia URL and return { lang, title } or null.
 */
function parseWikipedia(url) {
  const m = url.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/i);
  if (!m) return null;
  return { lang: m[1], title: m[2].split("#")[0] };
}

/**
 * Detect arXiv URL and return paper ID or null.
 * Handles abs/<id> and pdf/<id>(.pdf)
 */
function parseArxiv(url) {
  const m = url.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
  return m ? m[1] : null;
}

/**
 * Get file extension (lowercase, with dot) or "" if none.
 */
function getExt(url) {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop() || "";
    const dot = last.lastIndexOf(".");
    return dot >= 0 ? last.slice(dot).toLowerCase() : "";
  } catch {
    return "";
  }
}

/**
 * Resolve a record for a single URL. Never throws.
 */
async function resolveUrl(url, postLookup, altText) {
  try {
    // ── Internal post link ────────────────────────────────────────────────
    const slug = internalPostSlug(url);
    if (slug) {
      const p = postLookup.get(slug);
      if (p) {
        return {
          type: "post",
          title: p.title,
          excerpt: p.blurb || "",
          date: p.dateLong || p.date || "",
          tags: p.tags || [],
          read: p.read || "",
          url,
        };
      }
      // slug not found in posts.json — fall through to generic
    }

    // ── IMAGE (from alt-text context OR image extension) ──────────────────
    if (altText !== undefined) {
      // Called from an image scan — always treat as image type
      return {
        type: "image",
        title: altText || decodedFilename(url),
        src: url,
        url,
      };
    }

    const ext = getExt(url);

    if (IMAGE_EXTS.has(ext)) {
      return { type: "image", title: decodedFilename(url), src: url, url };
    }

    // ── File download ────────────────────────────────────────────────────
    if (FILE_EXTS.has(ext)) {
      return { type: "file", title: decodedFilename(url), ext: ext.replace(".", ""), url };
    }

    // ── Wikipedia ────────────────────────────────────────────────────────
    const wiki = parseWikipedia(url);
    if (wiki) {
      const apiUrl = `https://${wiki.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki.title)}`;
      const res = await fetchSafe(apiUrl);
      if (res && res.ok) {
        const data = await res.json();
        return {
          type: "wikipedia",
          title: data.title || wiki.title,
          excerpt: data.extract || "",
          thumb: data.thumbnail?.source || null,
          url,
        };
      }
      // 404 or error — minimal record
      return { type: "wikipedia", title: decodeURIComponent(wiki.title.replace(/_/g, " ")), url };
    }

    // ── arXiv ────────────────────────────────────────────────────────────
    const arxivId = parseArxiv(url);
    if (arxivId) {
      const apiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
      const res = await fetchSafe(apiUrl);
      if (res && res.ok) {
        const xml = await res.text();
        // Scope to the <entry> block — the feed-level <title> is just the query echo.
        const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1] || xml;
        const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, " ").trim() || arxivId;
        const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.replace(/\s+/g, " ").trim() || "";
        const authorMatches = [...entry.matchAll(/<name>([^<]+)<\/name>/g)];
        const authors = authorMatches.map(m => m[1].trim());
        return {
          type: "arxiv",
          title,
          author: authors.join(", "),
          excerpt: summary,
          url,
        };
      }
      return { type: "arxiv", title: arxivId, url };
    }

    // ── Generic HTTP(S) — OpenGraph scrape ───────────────────────────────
    if (/^https?:\/\//.test(url)) {
      try {
        const res = await fetchSafe(url);
        if (res && res.ok) {
          // Only read up to 64 KB to avoid memory issues with large pages
          const reader = res.body?.getReader();
          let raw = "";
          if (reader) {
            const decoder = new TextDecoder();
            let total = 0;
            while (total < 65536) {
              const { done, value } = await reader.read();
              if (done) break;
              raw += decoder.decode(value, { stream: true });
              total += value.byteLength;
            }
            reader.cancel();
          } else {
            raw = await res.text();
          }

          const ogTitle = metaContent(raw, "og:title");
          const ogDesc  = metaContent(raw, "og:description");
          const ogImage = metaContent(raw, "og:image");
          const twitterTitle = metaContent(raw, "twitter:title");
          const twitterDesc  = metaContent(raw, "twitter:description");
          const twitterImage = metaContent(raw, "twitter:image");
          const fallbackTitle = htmlTitle(raw);

          const title   = ogTitle || twitterTitle || fallbackTitle || hostname(url);
          const excerpt = ogDesc  || twitterDesc  || "";
          const thumb   = ogImage || twitterImage || null;

          return { type: "link", title, excerpt, thumb, source: hostname(url), url };
        }
      } catch (fetchErr) {
        // fall through to minimal record below
      }
      return { type: "link", title: hostname(url), source: hostname(url), url };
    }

    // ── Unrecognised scheme (mailto:, ftp:, etc.) ─────────────────────────
    return { type: "link", title: url, url };

  } catch (err) {
    console.log("[annotations] unresolved:", url, err.message);
    return { type: "link", title: hostname(url) || url, url };
  }
}

// ─── Markdown scanning ───────────────────────────────────────────────────────

/**
 * Scan markdown text and return:
 *   links: Array<{ url: string }>
 *   images: Array<{ url: string, alt: string }>
 *
 * Skips code spans/blocks to avoid false positives.
 */
function scanMarkdown(md) {
  // Strip fenced code blocks
  const stripped = md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");

  const links  = [];
  const images = [];
  const seenUrls = new Set();

  // Images: ![alt](src)  — must come before link scan to avoid overlap
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = imgRe.exec(stripped)) !== null) {
    const url = m[2].trim().split(/\s+/)[0]; // drop optional title
    const alt = m[1].trim();
    if (url && !seenUrls.has("img:" + url)) {
      seenUrls.add("img:" + url);
      images.push({ url, alt });
    }
  }

  // Links: [text](url)  — skip if preceded by ! (already captured as image)
  const linkRe = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
  while ((m = linkRe.exec(stripped)) !== null) {
    const url = m[2].trim().split(/\s+/)[0];
    if (url && !seenUrls.has("link:" + url)) {
      seenUrls.add("link:" + url);
      links.push({ url });
    }
  }

  return { links, images };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Build link/image preview annotations for the static site.
 *
 * @param {object} opts
 * @param {string} opts.repo        Absolute path to repo root.
 * @param {object} opts.posts       { dev: [...], personal: [...] } post index.
 * @param {string} opts.outFile     Destination path for the merged annotations JSON (written to _public/).
 * @param {string} opts.cacheFile   Committed cache path (e.g. <repo>/data/annotations.cache.json).
 * @returns {Promise<{count:number, resolved:number, fromCache:number, unresolved:number}>}
 */
export async function buildAnnotations({ repo, posts, outFile, cacheFile }) {
  // ── Load existing cache ────────────────────────────────────────────────
  let cache = {};
  if (cacheFile && existsSync(cacheFile)) {
    try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch {}
  }

  // ── Load hand-written overrides (WIN over everything) ─────────────────
  let overrides = {};
  const overridesFile = join(repo, "data", "annotations.json");
  if (existsSync(overridesFile)) {
    try { overrides = JSON.parse(readFileSync(overridesFile, "utf8")); } catch {}
  }

  // ── Scan all post markdown files for unique targets ───────────────────
  const postLookup = buildPostLookup(posts);
  const allLinks  = new Map(); // url -> null (links)
  const allImages = new Map(); // url -> alt   (images — first alt seen)

  for (const side of ["dev", "personal"]) {
    for (const post of (posts[side] || [])) {
      const mdPath = join(repo, post.path);
      if (!existsSync(mdPath)) continue;
      let md;
      try { md = readFileSync(mdPath, "utf8"); } catch { continue; }
      const { links, images } = scanMarkdown(md);
      for (const { url } of links) {
        if (!allLinks.has(url)) allLinks.set(url, null);
      }
      for (const { url, alt } of images) {
        if (!allImages.has(url)) allImages.set(url, alt);
      }
    }
  }

  // ── Resolve records for anything not already cached/overridden ─────────
  let resolvedCount = 0;
  let fromCacheCount = 0;
  let unresolvedCount = 0;

  const merged = { ...cache }; // start from cache

  // Process links
  const linkUrls = [...allLinks.keys()];
  for (const url of linkUrls) {
    if (overrides[url]) continue; // will be applied at merge step
    if (merged[url]) { fromCacheCount++; continue; }
    try {
      merged[url] = await resolveUrl(url, postLookup, undefined);
      resolvedCount++;
    } catch (err) {
      console.log("[annotations] unresolved:", url, err.message);
      merged[url] = { type: "link", title: hostname(url) || url, url };
      unresolvedCount++;
    }
  }

  // Process images
  const imageUrls = [...allImages.keys()];
  for (const url of imageUrls) {
    if (overrides[url]) continue;
    if (merged[url]) { fromCacheCount++; continue; }
    try {
      const alt = allImages.get(url) || "";
      merged[url] = await resolveUrl(url, postLookup, alt);
      resolvedCount++;
    } catch (err) {
      console.log("[annotations] unresolved (img):", url, err.message);
      merged[url] = { type: "image", title: allImages.get(url) || decodedFilename(url), src: url, url };
      unresolvedCount++;
    }
  }

  // Apply overrides (highest precedence)
  for (const [url, record] of Object.entries(overrides)) {
    merged[url] = record;
  }

  // ── Persist cache (committed) ──────────────────────────────────────────
  if (cacheFile) {
    const cacheDir = dirname(cacheFile);
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(merged, null, 2), "utf8");
  }

  // ── Write output for the browser ──────────────────────────────────────
  if (outFile) {
    const outDir = dirname(outFile);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, JSON.stringify(merged), "utf8");
  }

  const count = Object.keys(merged).length;
  console.log(
    `[annotations] done — total:${count} resolved:${resolvedCount} fromCache:${fromCacheCount} unresolved:${unresolvedCount} overrides:${Object.keys(overrides).length}`
  );

  return { count, resolved: resolvedCount, fromCache: fromCacheCount, unresolved: unresolvedCount };
}
