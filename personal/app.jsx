/** Personal-site root — state router over posts.json (personal side) + plain view. */
const { useState, useEffect } = React;

/** Describe the current personal page as plain/markdown blocks. */
function personalBlocks({ route, entries, current }) {
  if (route === "article" && current) {
    return [
      { t: "h1", text: current.title },
      { t: "p", text: [current.dateLong || current.date, current.read, current.tag].filter(Boolean).join(" · ") },
      ...(current.blurb ? [{ t: "p", text: current.blurb }] : []),
      { t: "rawmd", md: "_Open this piece on the site for the full text._" },
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
    const list = route === "notebook" ? entries.filter(e => (e.tags || []).some(t => t === "notebook" || t === "music")) : entries;
    return [
      { t: "h1", text: `arslan.land — ${route}` },
      { t: "table", head: ["piece", "date", "tag"], rows: list.map(e => [{ text: e.title, href: `#/p/${e.slug}` }, e.date, e.tag || ""]) },
    ];
  }
  const RP = window.RP || {}, books = RP.books || [], games = RP.games || {}, now = games.now || {};
  const projects = window.AK.PROJECTS || [];
  const b = [
    { t: "h1", text: "arslan.land" },
    { t: "p", text: "I make things on the internet and write about why. A small site for essays, notes, and the occasional weeknote." },
  ];
  if (entries.length) b.push({ t: "h2", text: "Writing" }, { t: "table", head: ["piece", "date", "tag"], rows: entries.map(e => [{ text: e.title, href: `#/p/${e.slug}` }, e.date, e.tag || ""]) });
  if (projects.length) b.push({ t: "h2", text: "Projects" }, { t: "table", head: ["project", "what it is"], rows: projects.map(p => [p.title, p.blurb]) });
  b.push(
    { t: "h2", text: "Reading & playing" },
    { t: "table", head: ["reading", "author"], rows: books.map(bk => [bk.ti, bk.au]) },
    { t: "table", head: ["playing", ""], rows: [["now playing", now.ti || ""], ["up next", games.next || ""], ["replaying", games.again || ""]].filter(r => r[1]) },
    { t: "links", items: [{ label: "the dev side →", href: "../dev/" }] }
  );
  return b;
}

function App() {
  const [route, setRoute] = useState("home");
  const [slug, setSlug] = useState(null);
  const [entries, setEntries] = useState([]);
  const [plain, setPlain] = useState(document.documentElement.getAttribute("data-view") === "plain");

  useEffect(() => {
    fetch("../posts.json").then(r => r.json()).then(d => {
      setEntries((d.personal || []).map(p => ({ ...p, id: p.slug, tag: (p.tags || [])[0] || "" })));
    }).catch(() => {});
    const onHash = () => {
      const m = location.hash.match(/^#\/p\/(.+)$/);
      if (m) { setSlug(decodeURIComponent(m[1])); setRoute("article"); window.scrollTo(0, 0); }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (next) => { if (next !== "article" && location.hash) location.hash = ""; setRoute(next); setSlug(null); window.scrollTo({ top: 0, behavior: "instant" }); };
  const openEntry = (entry) => { location.hash = `#/p/${entry.slug}`; setSlug(entry.slug); setRoute("article"); window.scrollTo({ top: 0, behavior: "instant" }); };
  const togglePlain = () => {
    const next = !plain; setPlain(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-view", "plain"); else root.removeAttribute("data-view");
    try { localStorage.setItem("ak-view", next ? "plain" : ""); } catch (_) {}
  };

  const notebookEntries = entries.filter(e => (e.tags || []).some(t => t === "notebook" || t === "music"));
  const current = slug ? entries.find(e => e.slug === slug) : null;
  const buildBlocks = () => personalBlocks({ route, entries, current });

  if (plain) return (
    <>
      <div className="plain-root">
        <p className="pm-nav">
          <a onClick={togglePlain}>← rich view</a> · <a onClick={() => navigate("home")}>home</a>
          {entries.length ? <> · <a onClick={() => navigate("writing")}>writing</a></> : null}
          {" "}· <a onClick={() => navigate("about")}>about</a> · <a href="../dev/">arslan.dev</a>
        </p>
        <PlainBlocks blocks={buildBlocks()} />
      </div>
      <CopyMarkdown getBlocks={buildBlocks} />
    </>
  );

  return (
    <div className="app">
      <TopNav route={route} onNavigate={navigate} plain={plain} onPlain={togglePlain} hasWriting={entries.length > 0} hasProjects={(window.AK.PROJECTS || []).length > 0} />
      <NowPlaying track={window.AK.NOW_PLAYING} />
      <main className="page">
        {route === "home" && (
          <>
            <Hero onNavigate={navigate} />
            {entries.length > 0 && (
              <>
                <div className="section-h">
                  <h2>Latest writing</h2>
                  <a className="more" onClick={() => navigate("writing")}>See all {entries.length} →</a>
                </div>
                <FeaturedPair entries={entries} onOpen={openEntry} />
              </>
            )}
            {(window.AK.PROJECTS || []).length > 0 && (
              <>
                <div className="section-h">
                  <h2>Projects</h2>
                  <a className="more" onClick={() => navigate("projects")}>The full shelf →</a>
                </div>
                <ProjectGrid projects={window.AK.PROJECTS} />
              </>
            )}
            <div className="section-h"><h2>Reading &amp; playing</h2></div>
            <ReadingPlaying />
          </>
        )}
        {route === "writing" && (
          <>
            <div className="section-h"><h2>Writing</h2><span className="more">{entries.length} pieces</span></div>
            <WritingList entries={entries} onOpen={openEntry} />
          </>
        )}
        {route === "notebook" && (
          <>
            <div className="section-h"><h2>Notebook</h2><span className="more">Short notes, in public</span></div>
            <WritingList entries={notebookEntries} onOpen={openEntry} />
          </>
        )}
        {route === "projects" && (
          <>
            <div className="section-h"><h2>Projects</h2><span className="more">Some still alive, some lovingly archived</span></div>
            <ProjectGrid projects={window.AK.PROJECTS} />
          </>
        )}
        {route === "about" && <About />}
        {route === "article" && <Article entry={current} onBack={() => navigate("writing")} />}
      </main>
      <Footer />
      <CopyMarkdown getBlocks={buildBlocks} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
