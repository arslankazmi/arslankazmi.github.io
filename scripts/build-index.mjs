#!/usr/bin/env node
/* ============================================================
   build-index.mjs — scan posts/{dev,personal}/*.md and write posts.json.
   Folder = side. Front-matter (between --- lines): title, date (YYYY-MM-DD),
   tags [a, b], blurb, read, featured, type ("case-study" for client write-ups).
   Slug = filename minus date prefix + .md.
   No dependencies (Node 18+). Run: `node scripts/build-index.mjs`.
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseFront(raw) {
  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  const fm = {};
  if (!m) return fm;
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, "");
    }
    fm[k] = v;
  }
  return fm;
}
const short = (iso) => { const [y, mo] = iso.split("-"); return `${MONTHS[+mo - 1]} ${y}`; };
const long = (iso) => { const [y, mo, d] = iso.split("-"); return `${MONTHS[+mo - 1]} ${+d}, ${y}`; };

// Posts with `draft: true` front-matter are excluded from the build (no index entry, page, or
// listing) — unless DRAFTS=1 is set, which includes them for local preview (cf. Hugo --buildDrafts).
const INCLUDE_DRAFTS = !!process.env.DRAFTS;

// Scheduled publishing: a post with a `publish: YYYY-MM-DD` front-matter field is held out of the
// build until that date arrives — its effective date becomes `publish`. This lets a post go live on
// a date purely by being rebuilt that day (no commit flips it), which is how the daily deploy
// publishes on schedule without CI ever writing to the repo. `publish` is ignored when DRAFTS=1
// (local preview shows everything). Today is overridable for tests via PUBLISH_TODAY.
const TODAY = (process.env.PUBLISH_TODAY || new Date().toISOString().slice(0, 10)).trim();

function collect(repo, side) {
  const dir = join(repo, "posts", side);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const fm = parseFront(readFileSync(join(dir, f), "utf8"));
      // Effective date = `publish` (the real go-live day) when set, else `date`, else the filename.
      const iso = fm.publish || fm.date || (f.match(/^\d{4}-\d{2}-\d{2}/) || ["1970-01-01"])[0];
      return {
        slug: f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
        side,
        title: fm.title || f,
        date: short(iso),
        dateLong: long(iso),
        iso,
        tags: Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [],
        blurb: fm.blurb || "",
        read: fm.read || "",
        featured: fm.featured === "true",
        draft: fm.draft === "true",
        publish: fm.publish || "",          // scheduled go-live date; "" = publish immediately
        type: fm.type || "post",            // "case-study" for client write-ups; "post" otherwise
        path: `posts/${side}/${f}`,
      };
    })
    // Drop drafts, and scheduled posts whose publish date hasn't arrived yet (DRAFTS=1 shows all).
    .filter((p) => INCLUDE_DRAFTS || (!p.draft && (!p.publish || p.publish <= TODAY)))
    .sort((a, b) => (a.iso < b.iso ? 1 : -1));
}

/** Scan posts/{dev,personal}/*.md under `repo` and return { dev:[…], personal:[…] }. */
export function buildIndex(repo = REPO) {
  return { dev: collect(repo, "dev"), personal: collect(repo, "personal") };
}

// CLI: write posts.json to the repo root.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = buildIndex(REPO);
  writeFileSync(join(REPO, "posts.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`posts.json — ${out.dev.length} dev, ${out.personal.length} personal`);
}
