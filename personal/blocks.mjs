/** Personal-side page -> block IR. Pure: takes all data as params (no window globals), so it runs in
    Node (the static build) and the browser (bundled into globals.js). Consumed by the React plain
    view (via window.personalBlocks) and by scripts/build.mjs (imported directly). */
const isNotebook = (e) => (e.tags || []).some(t => t === "notebook" || t === "music");

export function personalBlocks({ route, entries = [], current, currentMd, rp = {}, projects = [] } = {}) {
  if (route === "article" && current) {
    return [
      { t: "h1", text: current.title },
      { t: "p", text: [current.dateLong || current.date, current.read, current.tag].filter(Boolean).join(" · ") },
      ...(current.blurb && !currentMd ? [{ t: "p", text: current.blurb }] : []),
      { t: "rawmd", md: currentMd || "_Open this piece on the site for the full text._" },
    ];
  }
  if (route === "about") {
    return [
      { t: "h1", text: "About" },
      { t: "p", text: "I grew up on a quieter internet, made of forums and webrings and ugly, honest websites. This site is my attempt to keep a piece of that internet alive, even if only as a room of my own." },
      { t: "p", text: "I'm happiest in the half-hour after sunset, in a city I don't know yet, with a book I haven't started." },
      { t: "table", head: ["", ""], rows: [["Now", "nowhere"], ["Email", { text: "akazmi.public@gmail.com", href: "mailto:akazmi.public@gmail.com" }]] },
    ];
  }
  if (route === "writing" || route === "notebook") {
    const essays = entries.filter(e => !isNotebook(e));
    const notes = entries.filter(isNotebook);
    const rowsOf = (list) => list.map(e => [{ text: e.title, href: `#/p/${e.slug}` }, e.date, e.tag || ""]);
    const b = [{ t: "h1", text: "arslan.land — writing" }];
    if (essays.length) b.push({ t: "h2", text: "Essays" }, { t: "table", head: ["piece", "date", "tag"], rows: rowsOf(essays) });
    if (notes.length) b.push({ t: "h2", text: "Notebook" }, { t: "table", head: ["piece", "date", "tag"], rows: rowsOf(notes) });
    return b;
  }
  const books = rp.books || [], games = rp.games || {}, now = games.now || {};
  const b = [
    { t: "h1", text: "arslan.land" },
    { t: "p", text: "I make things on the internet and write about why. A small site for essays, notes, and the occasional weeknote." },
  ];
  const writing = entries.filter(e => !isNotebook(e));
  if (writing.length) b.push({ t: "h2", text: "Writing" }, { t: "table", head: ["piece", "date", "tag"], rows: writing.map(e => [{ text: e.title, href: `#/p/${e.slug}` }, e.date, e.tag || ""]) });
  if (projects.length) b.push({ t: "h2", text: "Projects" }, { t: "grid", cols: 3, cells: projects.map(p => ({ title: p.title, lines: [p.blurb] })) });
  const playLines = [now.ti, games.next ? `up next · ${games.next}` : null, games.again ? `replaying · ${games.again}` : null].filter(Boolean);
  b.push(
    { t: "h2", text: "Reading & playing" },
    { t: "grid", cols: 2, cells: [
      { title: "Reading", lines: books.map(bk => `${bk.ti} — ${bk.au}`) },
      { title: "Now playing", lines: playLines },
    ] },
    { t: "links", items: [{ label: "the dev side →", href: "../dev/" }] }
  );
  return b;
}
