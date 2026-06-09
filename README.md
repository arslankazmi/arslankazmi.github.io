# arslankazmi.github.io — personal blog (two coins)

One repo, two sides of the [Arslan Kazmi design system](https://arslankazmi.github.io/ak-design/):

- **`/dev/`** — `arslan.dev`, the developer hub: dark, cerulean, monospace. Terminal/Dashboard/
  Magazine layouts, stats, pinned repos, dev writing. Links to the [project catalog](https://arslankazmi.github.io/portfolio/).
- **`/personal/`** — `arslan.land`, the writing side: light/paper, warm. Essays, notebook, projects, about.
- **`/`** — a coin-flip splash to pick a side.

No build step: React + Babel-standalone via CDN, design tokens + fonts linked from the `ak-design`
Pages bundles (`dist/dev.css`, `dist/personal.css`).

## Posts

Markdown files, segregated by side:

```
posts/dev/<YYYY-MM-DD-slug>.md
posts/personal/<YYYY-MM-DD-slug>.md
```

Front-matter: `title`, `date`, `tags: [a, b]`, `blurb`, `read`, `featured`. After adding/editing posts:

```bash
node scripts/build-index.mjs   # regenerates posts.json (the index both sides read)
```

Articles render client-side with `marked`; deep links use hash routing (`/dev/#/p/<slug>`).

## Plain view

Every side has a **plain** toggle → re-renders as bare HTML in a borderless table (no visible
lines), maximally copy-pasteable. Persisted in `localStorage` (`ak-view`).

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
