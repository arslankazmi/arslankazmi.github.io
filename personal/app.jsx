/** Personal-site root — state router over posts.json (personal side) + plain view. */
const { useState, useEffect } = React;

/** Plain/markdown blocks come from personal/blocks.mjs (window.personalBlocks, set by globals.js) —
    one source of truth shared with the Node static build. */
function App() {
  const [route, setRoute] = useState("home");
  const [slug, setSlug] = useState(null);
  const [entries, setEntries] = useState([]);
  const [articleMd, setArticleMd] = useState(null); // raw markdown of the open piece, for plain view
  const [plain, setPlain] = useState(document.documentElement.getAttribute("data-view") === "plain");

  useEffect(() => {
    fetch("../posts.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
      setEntries((d.personal || []).map(p => ({ ...p, id: p.slug, tag: (p.tags || [])[0] || "" })));
    }).catch(() => {});
    const onHash = () => {
      const m = location.hash.match(/^#\/p\/(.+)$/);
      if (m) { setSlug(decodeURIComponent(m[1])); setRoute("article"); window.scrollTo(0, 0); return; }
      const r = location.hash.replace(/^#\/?/, "");
      if (r === "writing" || r === "about" || r === "projects") { setSlug(null); setRoute(r); window.scrollTo(0, 0); }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Plain view: load the open piece's raw markdown so its body renders (not a placeholder).
  useEffect(() => {
    if (!plain || route !== "article" || !slug) { setArticleMd(null); return; }
    const entry = entries.find(e => e.slug === slug);
    if (!entry || !entry.path) { setArticleMd(null); return; }
    let live = true;
    fetch("../" + entry.path).then(r => r.text())
      .then(t => { if (live) setArticleMd(t.replace(/^---[\s\S]*?\n---\s*/, "")); })
      .catch(() => { if (live) setArticleMd(null); });
    return () => { live = false; };
  }, [plain, route, slug, entries]);

  const navigate = (next) => { if (next !== "article" && location.hash) location.hash = ""; setRoute(next); setSlug(null); window.scrollTo({ top: 0, behavior: "instant" }); };
  const openEntry = (entry) => { location.hash = `#/p/${entry.slug}`; setSlug(entry.slug); setRoute("article"); window.scrollTo({ top: 0, behavior: "instant" }); };
  const togglePlain = () => {
    const next = !plain; setPlain(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-view", "plain"); else root.removeAttribute("data-view");
    try { localStorage.setItem("ak-view", next ? "plain" : ""); } catch (_) {}
  };

  const isNotebook = (e) => (e.tags || []).some(t => t === "notebook" || t === "music");
  const notebookEntries = entries.filter(isNotebook);
  const writingEntries = entries.filter(e => !isNotebook(e));
  const current = slug ? entries.find(e => e.slug === slug) : null;
  const buildBlocks = () => window.personalBlocks({ route, entries, current, currentMd: articleMd, rp: window.RP, projects: (window.AK || {}).PROJECTS || [] });

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
      <TopNav route={route} onNavigate={navigate} plain={plain} onPlain={togglePlain} hasWriting={writingEntries.length > 0} hasNotebook={notebookEntries.length > 0} hasProjects={(window.AK.PROJECTS || []).length > 0} />
      <NowPlaying track={window.AK.NOW_PLAYING} />
      <main className="page">
        {route === "home" && (
          <>
            <Hero onNavigate={navigate} />
            {writingEntries.length > 0 && (
              <>
                <div className="section-h">
                  <h2>Latest writing</h2>
                  <a className="more" onClick={() => navigate("writing")}>See all {writingEntries.length} →</a>
                </div>
                <FeaturedPair entries={writingEntries} onOpen={openEntry} />
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
            <div className="section-h"><h2>Essays</h2><span className="more">{writingEntries.length} piece{writingEntries.length === 1 ? "" : "s"}</span></div>
            <WritingList entries={writingEntries} onOpen={openEntry} />
            {notebookEntries.length > 0 && (
              <>
                <div className="section-h" style={{ marginTop: 64 }}><h2>Notebook</h2><span className="more">Short notes, in public</span></div>
                <WritingList entries={notebookEntries} onOpen={openEntry} />
              </>
            )}
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
