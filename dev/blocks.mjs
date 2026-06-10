/** Dev-side page -> block IR. Pure: takes all data as params (no window globals), so it runs in
    Node (the static build) and the browser (bundled into globals.js). Consumed by the React plain
    view (via window.devBlocks) and by scripts/build.mjs (imported directly). */
export function devBlocks({ route, posts = [], repos = [], stats = [], current, dh = {}, rp = {} } = {}) {
  if (route === "article" && current) {
    return [
      { t: "h1", text: current.title },
      { t: "p", text: [current.dateLong || current.date, (current.tags || []).join(", ")].filter(Boolean).join(" · ") },
      { t: "rawmd", md: "_Open this post on the site for the full text._" },
    ];
  }
  if (route === "writing") {
    return [
      { t: "h1", text: "arslan.dev — writing" },
      { t: "table", head: ["post", "date", "tags"], rows: posts.map(p => [{ text: p.title, href: `#/p/${p.slug}` }, p.date, (p.tags || []).join(", ")]) },
    ];
  }
  const books = rp.books || [], games = rp.games || {}, now = games.now || {};
  const b = [
    { t: "h1", text: "arslan.dev" },
    { t: "p", text: dh.tagline || "" },
    { t: "h2", text: "On GitHub" },
    // 4 stat tiles across, like the rich row.
    { t: "grid", cols: 4, cells: (stats || []).map(s => ({ title: s.num, lines: [s.ico, s.cap] })) },
    { t: "h2", text: "Pinned repos" },
    // 3-up grid of repo tiles, like the rich grid.
    { t: "grid", cols: 3, cells: (repos || []).map(r => ({ title: r.name, href: r.url, lines: [r.desc, r.lang, ...(r.docs ? [{ text: "docs ↗", href: r.docs }] : [])] })) },
  ];
  if (posts.length) b.push({ t: "h2", text: "Writing" }, { t: "table", head: ["post", "date"], rows: posts.map(p => [{ text: p.title, href: `#/p/${p.slug}` }, p.date]) });
  const playLines = [now.ti, games.next ? `up next · ${games.next}` : null, games.again ? `replaying · ${games.again}` : null].filter(Boolean);
  b.push(
    { t: "h2", text: "Reading & playing" },
    // reading | playing, two columns side-by-side like the rich view.
    { t: "grid", cols: 2, cells: [
      { title: "Reading", lines: books.map(bk => `${bk.ti} — ${bk.au}`) },
      { title: "Now playing", lines: playLines },
    ] },
    { t: "links", items: [{ label: "project catalog ↗", href: "../portfolio/" }, { label: "the personal side →", href: "../personal/" }] }
  );
  return b;
}
