#!/usr/bin/env node
/* ============================================================
   build.mjs — compile the site into _public/ (gwern-style static rendering).

   What it does, in order:
     1. Build posts.json (the post index).
     2. Snapshot build-time data: portfolio repos + live GitHub stats (with fallbacks).
     3. Copy the served tree into _public/ (assets, css, jsx, posts, html); drop build-only *.mjs.
     4. esbuild-bundle the pure block/render modules into per-page globals.js (IIFE) for the browser.
     5. Inject a self-contained, 1999-renderable PLAIN baseline into each shell's <noscript> so the
        site is fully readable with JavaScript disabled; React enhances to the rich view when JS runs.
     6. Render every post to a standalone static HTML page at /<side>/p/<slug>/ (real, crawlable URLs).

   Pure block logic is shared with the browser via shared/render.mjs + {dev,personal}/blocks.mjs —
   one source of truth, no drift. Node 18+ (global fetch). Run: `node scripts/build.mjs`.
   ============================================================ */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { marked } from "marked";
import markedFootnote from "marked-footnote";
import * as esbuild from "esbuild";
import { buildIndex } from "./build-index.mjs";
import { buildAnnotations } from "./annotations.mjs";
import { devBlocks } from "../dev/blocks.mjs";
import { personalBlocks } from "../personal/blocks.mjs";
import { toStaticHTML, he } from "../shared/render.mjs";

// Footnotes (sidenotes.js enhances these into margin notes; degrade to bottom-footnotes no-JS).
marked.use(markedFootnote());

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const OUT = join(REPO, "_public");
const USER = "arslankazmi";
const PROJECTS_URL = "https://arslankazmi.github.io/portfolio/data/projects.json";

const log = (...a) => console.log("[build]", ...a);

// Build-time data snapshot caching. Default builds reuse data/snapshot.cache.json (no network — fast,
// like Hugo); the rich view still fetches GitHub live client-side, so the cached snapshot only feeds the
// no-JS baseline. Refresh with `npm run build:refresh` (REFRESH=1); `--no-fetch`/NO_FETCH never hits the network.
const SNAPSHOT_CACHE = join(REPO, "data", "snapshot.cache.json");
const OFFLINE = !!process.env.NO_FETCH || process.argv.includes("--no-fetch");
const REFRESH = !!process.env.REFRESH || process.argv.includes("--refresh");
function readCache(file) { try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null; } catch { return null; } }
function writeCache(file, obj) { try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(obj, null, 2) + "\n"); } catch (e) { log("cache write failed:", e.message); } }

/** Evaluate a browser data file (which assigns window.X = …) and return the populated window. */
function loadWindowGlobals(file) {
  try {
    const code = readFileSync(file, "utf8");
    const fn = new Function("window", code + "\n;return window;");
    return fn({});
  } catch (e) {
    log(`warn: could not load globals from ${relative(REPO, file)}: ${e.message}`);
    return {};
  }
}

/** Recursively delete files matching a predicate under dir. */
function pruneFiles(dir, pred) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) pruneFiles(p, pred);
    else if (pred(p)) rmSync(p);
  }
}

/** Cache-aware dev snapshot: reuse data/snapshot.cache.json unless --refresh; --no-fetch stays offline. */
async function devSnapshot(dh) {
  const cached = readCache(SNAPSHOT_CACHE);
  if (OFFLINE) { log(`snapshot: offline → ${cached ? "cache" : "sample stats"}`); return cached || { repos: [], stats: dh.stats || [] }; }
  if (cached && !REFRESH) { log(`snapshot: from cache (${cached.repos.length} repos) — \`npm run build:refresh\` to update`); return cached; }
  const fresh = await fetchSnapshot(dh);
  writeCache(SNAPSHOT_CACHE, fresh);
  log(`snapshot: fetched live (${fresh.repos.length} repos, ${fresh.stats.length} tiles) → cached`);
  return fresh;
}

/** Fetch the live dev-hub data (portfolio repos + GitHub stats), with graceful fallbacks. */
async function fetchSnapshot(dh) {
  let repos = [];
  try {
    const d = await (await fetch(PROJECTS_URL)).json();
    repos = (d.projects || []).map(p => ({
      name: p.name, desc: p.description || "", lang: p.language || "",
      // private client work has no public repo — fall back to write-up/docs for the no-JS baseline
      url: p.repo || p.writeup || p.docs || "", repo: p.repo || "", docs: p.docs || "",
      writeup: p.writeup || "", priv: (p.source === "private"), client: p.client || "",
      category: p.category || "",
    }));
  } catch (e) { log("repos fetch failed, baseline omits pinned repos:", e.message); }

  let stats = dh.stats || [];
  try {
    const [user, repoList] = await Promise.all([
      fetch(`https://api.github.com/users/${USER}`).then(r => r.ok ? r.json() : null),
      fetch(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`).then(r => r.ok ? r.json() : null),
    ]);
    if (user && Array.isArray(repoList)) {
      const owned = repoList.filter(r => !r.fork);
      const stars = owned.reduce((s, r) => s + (r.stargazers_count || 0), 0);
      const est = new Date(user.created_at).getFullYear();
      const years = new Date().getFullYear() - est;
      stats = [
        { ico: "◆ repos", num: String(user.public_repos), cap: "public" },
        { ico: "✦ stars", num: String(stars), cap: "across repos" },
        { ico: "❂ followers", num: String(user.followers), cap: "on github" },
        { ico: "⌁ since", num: `${years}y`, cap: `est. ${est}` },
      ];
    }
  } catch (e) { log("github stats fetch failed, baseline uses sample stats:", e.message); }
  return { repos, stats };
}

/** Wrap a block-IR render into a no-JS <noscript> plain baseline, with self-contained styling and
    post links rewritten from SPA hash routes (#/p/slug) to the real static page URLs (p/slug/). */
function noscriptBaseline(blocks, nav) {
  const body = toStaticHTML(blocks, (md) => marked.parse(md)).replace(/href="#\/p\/([^"]+)"/g, (_, slug) => `href="p/${slug}/"`);
  return `<noscript>
  <style>
    html[data-theme], html[data-view], body { background:#fff !important; background-image:none !important; color:#111 !important; }
    .ssg-plain { max-width:860px; margin:0 auto; padding:30px 20px 90px; font-family:Georgia,"Times New Roman",Times,serif; line-height:1.55; }
    .ssg-plain a { color:#0645ad; }
    .ssg-plain h1 { font-size:2rem; line-height:1.15; margin:0 0 .25rem; }
    .ssg-plain h2 { font-size:1.3rem; margin:1.7rem 0 .5rem; border-bottom:1px solid #e2e2e2; padding-bottom:3px; }
    .ssg-plain p { margin:.5rem 0; }
    .ssg-plain .pm-nav { font-family:monospace; font-size:.82rem; color:#555; margin-bottom:1.2rem; }
    .ssg-plain table { border-collapse:collapse; width:100%; margin:.5rem 0 1.1rem; font-size:.92rem; }
    .ssg-plain th, .ssg-plain td { border:1px solid #dcdcdc; padding:5px 10px; text-align:left; vertical-align:top; }
    .ssg-plain th { background:#f3f3f1; }
  </style>
  <div class="ssg-plain">
    <p class="pm-nav">${nav}</p>
    ${body}
  </div>
</noscript>`;
}

/** Read a shell index.html, add the no-JS baseline right after <div id="root"></div>, write to OUT. */
function emitShell(srcRel, blocks, nav) {
  const html = readFileSync(join(REPO, srcRel), "utf8");
  const injected = html.replace(/<div id="root"><\/div>/, `<div id="root"></div>\n  ${noscriptBaseline(blocks, nav)}`);
  if (injected === html) throw new Error(`could not inject baseline into ${srcRel} (no <div id="root"></div>)`);
  writeFileSync(join(OUT, srcRel), injected);
  log("shell +baseline:", srcRel);
}

/** Standalone static page for a single post. */
function postPage(side, post, bodyHtml) {
  const theme = side === "dev" ? ` data-theme="dark"` : "";
  const css = side === "dev"
    ? "https://arslankazmi.github.io/ak-design/dist/dev.css"
    : "https://arslankazmi.github.io/ak-design/dist/personal.css";
  const site = side === "dev" ? "arslan.dev" : "arslan.land";
  const meta = he([post.dateLong || post.date, (post.tags || []).join(", ")].filter(Boolean).join(" · "));
  return `<!doctype html>
<html lang="en"${theme}>
<head>
  <meta charset="utf-8"/>
  <title>${he(post.title)} · ${site}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  ${post.blurb ? `<meta name="description" content="${he(post.blurb)}"/>` : ""}
  <link rel="icon" type="image/svg+xml" href="../../../assets/favicon.svg"/>
  <link rel="stylesheet" href="${css}"/>
  <link rel="stylesheet" href="/shared/sidenotes.css"/>
  <link rel="stylesheet" href="/shared/previews.css"/>
  <link rel="stylesheet" href="/shared/ascii-asterisk.css"/>
  <style>
    .post { max-width: 42rem; margin: 0 auto; padding: 56px 20px 96px; }
    .post .meta { font-family: var(--font-mono, monospace); font-size: 13px; opacity: .7; margin-bottom: 10px; }
    .post h1 { font-family: var(--font-display, Georgia, serif); line-height: 1.12; margin: 0 0 28px; }
    .post .prose { line-height: 1.7; font-size: 1.05rem; }
    .post .prose h2, .post .prose h3 { font-family: var(--font-display, Georgia, serif); margin-top: 1.6em; }
    .post .prose pre { overflow:auto; padding:14px; border-radius:8px; background:rgba(127,127,127,.12); }
    .post img { max-width: 100%; height: auto; }
    .post .back { font-family: var(--font-mono, monospace); font-size: 13px; display:inline-block; margin-top:40px; }
  </style>
</head>
<body>
  <main class="post">
    <div class="meta">${meta}</div>
    <h1>${he(post.title)}</h1>
    <div class="prose">${bodyHtml}</div>
    <a class="back" href="../../">← all writing</a>
  </main>
  <script src="/shared/sidenotes.js" defer></script>
  <script src="/shared/previews.js" defer></script>
  <script src="/shared/ascii-asterisk.js" defer></script>
</body>
</html>
`;
}

async function main() {
  // 1. index
  const index = buildIndex(REPO);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "posts.json"), JSON.stringify(index, null, 2) + "\n");
  log(`index: ${index.dev.length} dev, ${index.personal.length} personal posts`);

  // 2. data + snapshot
  const DH = loadWindowGlobals(join(REPO, "dev/data.js")).DH || {};
  const RP = loadWindowGlobals(join(REPO, "shared/reading-data.js")).RP || {};
  const AK = loadWindowGlobals(join(REPO, "personal/data.js")).AK || {};
  const { repos, stats } = await devSnapshot(DH);
  log(`snapshot: ${repos.length} repos, ${stats.length} stat tiles`);

  // 3. copy served tree
  for (const item of ["assets", "shared", "dev", "personal", "posts", "acknowledgements"]) {
    if (existsSync(join(REPO, item))) cpSync(join(REPO, item), join(OUT, item), { recursive: true });
  }
  for (const f of ["index.html", ".nojekyll"]) {
    if (existsSync(join(REPO, f))) cpSync(join(REPO, f), join(OUT, f));
  }
  if (!existsSync(join(OUT, ".nojekyll"))) writeFileSync(join(OUT, ".nojekyll"), "");
  // drop build-only modules from the published tree
  pruneFiles(OUT, (p) => p.endsWith(".mjs"));

  // 4. esbuild the browser glue (pure block/render fns -> window globals)
  for (const side of ["dev", "personal"]) {
    await esbuild.build({
      entryPoints: [join(REPO, side, "_globals.mjs")],
      bundle: true, format: "iife", minify: true,
      outfile: join(OUT, side, "globals.js"),
    });
    log(`globals.js: ${side}`);
  }

  // 5. no-JS plain baselines injected into the shells
  const devNav = `<a href="./">home</a> · <a href="../portfolio/">projects</a> · <a href="../personal/">arslan.land</a>`;
  emitShell("dev/index.html",
    devBlocks({ route: "home", posts: index.dev, repos, stats, dh: DH, rp: RP }), devNav);

  const personalEntries = (index.personal || []).map(p => ({ ...p, tag: (p.tags || [])[0] || p.tag || "" }));
  // No-JS nav: home lists the writing entries already (as real p/<slug>/ links), so no dead hash link.
  const personalNav = `<a href="./">home</a> · <a href="../dev/">arslan.dev</a>`;
  emitShell("personal/index.html",
    personalBlocks({ route: "home", entries: personalEntries, rp: RP, projects: AK.PROJECTS || [] }), personalNav);

  // 6. per-post static pages (+ per-side image dir for absolute /<side>/img/... refs)
  let postCount = 0;
  for (const side of ["dev", "personal"]) {
    const imgSrc = join(REPO, "posts", side, "img");
    if (existsSync(imgSrc)) cpSync(imgSrc, join(OUT, side, "img"), { recursive: true });
    for (const post of index[side] || []) {
      const raw = readFileSync(join(REPO, post.path), "utf8").replace(/^---[\s\S]*?\r?\n---\r?\n?\s*/, "");
      const dir = join(OUT, side, "p", post.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.html"), postPage(side, post, marked.parse(raw)));
      postCount++;
    }
  }
  log(`per-post pages: ${postCount}`);

  // 7. build-time link/doc/image preview annotations (internal · wikipedia · arxiv · file · image · OG)
  await buildAnnotations({
    repo: REPO,
    posts: index,
    outFile: join(OUT, "annotations.json"),
    cacheFile: join(REPO, "data", "annotations.cache.json"),
  });

  log(`done -> ${relative(REPO, OUT)}/`);
}

main().catch((e) => { console.error("[build] FAILED:", e); process.exit(1); });
