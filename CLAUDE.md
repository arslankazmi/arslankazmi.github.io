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

## Scheduled publishing

A post can be set to publish itself on a date instead of being merged live by hand. Add a
`publish: YYYY-MM-DD` line to its front-matter **alongside** `draft: true`. A daily cron
(`.github/workflows/schedule-publish.yml`, 14:00 UTC; also `workflow_dispatch` for a manual/first
run) invokes `scripts/publish-scheduled.mjs`, which — for every post whose `publish` date has arrived
— removes the `draft: true` line and sets `date:` to the `publish` value (the post dates to its real
go-live day). The workflow then pushes that flip to a temp branch, **opens and squash-merges a PR**,
opens a **cartoon-reminder issue** for each post, and dispatches `deploy.yml`.

- **Opt-in only**: a post is eligible **only** if it has both `draft: true` and a valid `publish:`
  date. Drafts without `publish:` (e.g. ones still being written) are never touched.
- `publish:` stays in the front-matter after flipping as an audit trail; the build ignores it.
- Don't rely on `date:` or the filename to schedule — they carry stale placeholder dates. `publish:`
  is the only signal.
- `main` is protected (the `protect-main` ruleset: changes must go through a PR). The workflow
  therefore publishes via a temp branch + auto-merged PR — **don't "simplify" it into a direct
  `git push` to `main`; that push is rejected** (`GH013`).
- A PR merged by GITHUB_TOKEN can't re-trigger `deploy.yml` (`on: push`), so the workflow dispatches
  the deploy itself.
- Repo setting required: Settings → Actions → General → Workflow permissions = **Read and write**
  (already enabled). Publishing also needs the ruleset's 0-approval PR rule to stay at 0 approvals.

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

## Images & cartoons

**Every new post ships with at least one xkcd-style stick-figure cartoon, drawn or ideated by the
author.** For a **manual** publish this is a hard rule — *do not merge a post without one*: at publish
time, remind the author to draw/add the cartoon before the merge, and offer to ideate: pitch the gag +
a panel-by-panel breakdown (and optionally a rough SVG storyboard) so they never start from a blank
page. The author photographs/scans the final drawing and it becomes the post's figure.

For a **scheduled auto-publish** (see § Scheduled publishing) the post goes live on its date even
without a cartoon, and the workflow opens a "🎨 Cartoon needed" issue so the art is added as a
follow-up — the reminder becomes that issue rather than a merge blocker.

**Paths (the one gotcha):** always reference images with a **root-absolute path** —
`/assets/img/<slug>/name.ext`. Never relative (`../`): static post pages sit 3 dirs deep
(`/personal/p/<slug>/`) while the hash-routed SPA resolves 1 dir deep (`/personal/`), so only
`/assets/...` resolves in both. Drop files under `assets/img/<slug>/` (the whole `assets/` tree ships
to `_public/` automatically). Inline `<svg>` diagrams may be embedded directly in the markdown — they
render in both contexts too.

**Figure markup** (marked passes raw HTML through; `.prose figure` / `figcaption` are styled in
`shared/sidenotes.css` + the inline block in `build.mjs postPage()`):

```html
<figure>
  <img src="/assets/img/<slug>/panel.png" alt="describe the cartoon">
  <figcaption>Optional caption. <cite>Credit</cite></figcaption>
</figure>
```

Or plain `![alt](/assets/img/<slug>/name.png)` when no caption is needed. Images get gwern-style
hover-zoom for free.

**Attribution:** the author's own cartoons/drawings need **no** credit line — they're original work.
Any *sourced* image (public-domain vintage art, openly-licensed photos) must get a `<cite>` credit in
the caption **and** a line in `ASSET_CREDITS.md` + the acknowledgements page (`acknowledgements/index.html`).

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

Schedule starts today (2026-07-13); **AI & Craft series leads**. Dev posts ~every 4 days.

| # | Date | Title | Ready | Effort | Note |
|---|---|---|---|---|---|
| 1 | Jul 13 | **AI & Craft (1):** AI Dependence and the Deskilling of Developers | High | ✅ | **PUBLISHED & LIVE**. Flagship. |
| 2 | Jul 17 | **AI & Craft (2):** Losing the Hands-On Feeling | High | 🟢 | ✅ Drafted (`draft:true`). |
| 3 | Jul 21 | **AI & Craft (3):** Three Modes I Want to Use AI In | High | 🟢 | ✅ Drafted. Manifesto. |
| 4 | Jul 25 | Four Levels of Using an LLM *(→2026)* — arc capstone | High | ✍️ | First pass assembled; with author to personalize. |
| 5 | Jul 29 | A Structured Approach to Taking Notes on Scientific Papers | High | 🟢 | ✅ Drafted. |
| 6 | Aug 2 | The rise of NLP in my lifetime | High | 🟡 | First-hand field memoir (02-19). |
| 7 | Aug 6 | Semantic Scholar — a Google Scholar alternative | Med | 🟢 | Quick tool tip (not yet drafted). |
| 8 | Aug 10 | Skilled people quietly use Claude to ship | High | 🟡 | Timely; names this blog (07-10). |
| 9 | Aug 14 | GPUs: buy vs cloud (and funding them) | High | 🟡 | Infra economics; keep general (02-11). |
| 10 | Aug 18 | Attention explained (Q/K/V) | Med | 🟡 | Learner's explainer (12-31). |
| 11 | Aug 22 | Building a bigram → transformer from scratch | Med | 🟡 | Build log; trim the text dumps (01-01). |
| 12 | Aug 26 | Structuring ML repos for production | Med | 🟡 | Principles from a real setup (02-12). |
| 13 | Aug 30 | Is it bad that AI writes all my tests? | Med | 🔴 | Stops mid-sentence — needs an ending. |
| 14 | Sep 3 | From software engineer to AI skeptic | Med | 🔴 | Merge two drafts; cut the tool list. |

**AI & Craft arc** = #1 → #2 → #3 (deskilling → the felt cost → the way forward), capstoned by **#4 Four Levels**.

**Backlog (dev, unscheduled):**
- *DL/ML & workflow:* Tracing/versioning prompts with Langfuse (02-10) · Reacting to Anthropic's multi-agent essay (06-23) · My evolving use of AI in development (two stubs).
- *MemPalace (2026):* What to remember, and for whom · Document knowledge-graph over RAG · Keyless-safe LLM apps · Lean ML dependencies.
- *Misc:* Finetuning on a 1660 Ti · Designing the Ideal Blog (sidenotes).

**Four Levels outline (#4):** L1 raw API · L2 chaining · L3 tools/functions-as-tools · L4 agentic · *Interlude* finetuning on a 1660 Ti · *Level Four revisited (2026, written fresh)* eval-not-vibes · provider factory · free/local RAG · feedback loops · *Close.*

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
