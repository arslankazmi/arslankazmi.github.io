/** Personal-site root — state router over posts.json (personal side) + plain view. */
const { useState, useEffect } = React;

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

  if (plain) return <PersonalPlainView entries={entries} route={route} entry={current} onNavigate={navigate} onOpen={openEntry} onPlain={togglePlain} />;

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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
