# CLAUDE.md — working notes for arslankazmi.github.io

Conventions for editing this repo, plus the live content calendars. This file is **not** shipped to
the site (`scripts/build.mjs` copies only `assets, shared, dev, personal, posts, acknowledgements`
into `_public/`). The repo is public, so treat everything here as visible on GitHub.

---

## What this is

One repo, **two sides**: `/dev` (arslan.dev — dark, monospace developer hub) and `/personal`
(arslan.land — warm paper, essays & notebook). Root `/` is a coin-flip splash. Each side is a React
SPA (React UMD + Babel-standalone via CDN) with a **gwern-style static build** that also renders a
no-JS baseline and a standalone HTML page per post.

## Build & publish

- `npm run index` — regenerate `posts.json` (the post index).
- `npm run build` — full build into `_public/` (also regenerates `posts.json`). `_public/` is gitignored.
- `npm run build:drafts` — include `draft: true` posts (local preview only).
- `npm run serve` — serve `_public/` at localhost:8080.
- **Deploy**: push to `main` → `.github/workflows/deploy.yml` runs `npm run build` and deploys to
  GitHub Pages. Publish a post via a branch → PR → merge to `main`.
- Repo-local git email is `akazmi.public@gmail.com` (don't touch global config).

## Authoring a post

- File: `posts/{dev,personal}/YYYY-MM-DD-slug.md`.
- Frontmatter: `title, date, tags, blurb, read, featured` (+ `draft: true` to keep it out of the build).
- Footnotes (`[^x]`) render as **margin sidenotes** on wide screens (`shared/sidenotes.js`),
  degrading to bottom footnotes when narrow or JS-off.

## Essay vs. notebook (personal side)

A personal post is a **notebook** entry if any tag is `notebook` or `music`
(`isNotebook` in `personal/blocks.mjs` + `personal/app.jsx`); otherwise it's an **essay**. Essays
appear under "Latest writing" / "Read the latest"; notebook entries show in the **Notebook** section
of the one Writing page. So: tag short notes `notebook`; leave essays untagged as such.

## Dropcaps (personal side)

Every **personal** post (essay **and** notebook) opens with an ornamental **Goudy Initialen**
dropcap. The full face (`assets/dropcaps/GoudyInitialen.ttf`) covers **every capital A–Z**, so any
opening letter gets one automatically — no restriction, nothing to do. The dropcap renders in both
the SPA article view (`personal/styles.css`) and the standalone static page
(`scripts/build.mjs postPage()`).

## Editorial policy

- **Light touch** — the author's exact words; fix spelling/grammar only; strip Obsidian syntax
  (`[[wikilinks]]`, `![[embeds]]`, ` ```toc `, `-->[…]<--`). Don't rewrite; flag any connective glue.
- **Privacy lens** — general philosophies / transferable ideas over detailed personal preferences
  (no gear rankings, favourites lists).
- **Provenance** — journal-derived posts carry a `[^when]` sidenote worded
  "First notes on this were written on <date>." and publish under a fresh date.

---

# Content calendar — dev (arslan.dev)

Readiness: **High** = light-fix · **Med** = needs finishing. Effort: 🟢 copyedit · 🟡 finish/tighten · 🔴 write/stitch.

| # | Date | Title | Ready | Effort | Note |
|---|---|---|---|---|---|
| 1 | Jul 14 | Semantic Scholar — a Google Scholar alternative | Med | 🟢 | Quick tool tip. |
| 2 | Jul 22 | A Structured Approach to Taking Notes on Scientific Papers | High | 🟢 | ✅ Drafted (`draft:true`). |
| 3 | Jul 25 | **AI & Craft (1):** AI Dependence and the Deskilling of Developers | High | 🟢 | ✅ Drafted. Flagship. |
| 4 | Aug 1 | **AI & Craft (2):** Losing the Hands-On Feeling | High | 🟢 | ✅ Drafted. |
| 5 | Aug 8 | **AI & Craft (3):** Three Modes I Want to Use AI In | High | 🟢 | ✅ Drafted. Manifesto. |
| 6 | Aug 15 | Four Levels of Using an LLM *(→2026)* | High | ✍️ | First pass assembled; with author to personalize. |
| 7 | Aug 22 | The rise of NLP in my lifetime | High | 🟡 | First-hand field memoir (02-19). |
| 8 | Aug 29 | Skilled people quietly use Claude to ship | High | 🟡 | Timely; names this blog (07-10). |

**AI & Craft arc** = #3 → #4 → #5 (deskilling → the felt cost → the way forward), capstoned by **#6 Four Levels**.

**Backlog (dev):**
- *DL/ML technical:* Attention explained (Q/K/V) · Building a bigram → transformer from scratch · GPUs: buy vs cloud · Structuring ML repos for production · Tracing/versioning prompts with Langfuse · Reacting to Anthropic's multi-agent essay.
- *Needs finishing:* Is it bad that AI writes all my tests? · From software engineer to AI skeptic · My evolving use of AI in development.
- *MemPalace (2026):* What to remember, and for whom · Document knowledge-graph over RAG · Keyless-safe LLM apps · Lean ML dependencies.
- *Misc:* Finetuning on a 1660 Ti · Designing the Ideal Blog (sidenotes).

**Four Levels outline (#6):** L1 raw API · L2 chaining · L3 tools/functions-as-tools · L4 agentic · *Interlude* finetuning on a 1660 Ti · *Level Four revisited (2026, written fresh)* eval-not-vibes · provider factory · free/local RAG · feedback loops · *Close.*

---

# Content calendar — personal (arslan.land)

**Type:** *essay* (default; under "Latest writing") · *notebook* (tagged `notebook`; Notebook section).
Every post gets an ornamental Goudy dropcap automatically (full A–Z face).

| # | Date | Title | Type | Ready | Effort | Note |
|---|---|---|---|---|---|---|
| 1 | Jul 13 | Stop Consuming, Start Making | essay | High | ✅ | **PUBLISHED & LIVE**. |
| 2 | Jul 15 | Theoretical Shopping | essay | High | 🟢 | ✅ Drafted (`draft:true`). |
| 3 | Jul 29 | What Typing Taught Me | essay | High | 🟢 | Skill-acquisition philosophy. |
| 4 | Aug 5 | My history with Nintendo Handhelds | essay | High | 🟡 | Trim excess model detail. |
| 5 | Aug 12 | Addicted to Learning | notebook | High | 🟢 | ✅ Drafted. |
| 6 | Aug 19 | VTIN Speaker: a repair saga | essay | High | 🟢 | Three-act narrative. |
| 7 | Aug 26 | The Seinfeld Machete Order | notebook | High | 🟢 | ✅ Drafted. |
| 8 | Sep 2 | Looking Back to Move Forward | essay | High | 🟡 | Memoir; trim personal detail. |

**Backlog (personal):**
- *Pulled from the launch burst:* Dining Table Lazy Susan · The Aiming Zone (CS2 flow state).
- *Quiet essays (local vault):* In defense of talking about the weather · Even introverts don't want to be truly alone · Following breadcrumbs: how memory retrieves.
- *Other:* Gunpei Yokoi & Withered Technology · The Last Trucker (short fiction, optional prose thread).
