/** Dev hub root — home (3 layouts) + writing (posts.json) + article + plain view.
    Pinned repos are the real projects, pulled from the portfolio's curated projects.json
    (the same source of truth the catalog uses, auto-refreshed from the GitHub API). */
const { useState, useEffect } = React;

const LANG_VAR = {
  JavaScript: "--lang-js", TypeScript: "--lang-ts", Python: "--lang-py", Rust: "--lang-rust",
  Go: "--lang-go", CSS: "--lang-css", HTML: "--lang-css", Shell: "--lang-shell", "Jupyter Notebook": "--lang-py",
};
const PROJECTS_URL = "https://arslankazmi.github.io/portfolio/data/projects.json";

function HomeLayouts({ layout, posts, repos, onMore }) {
  const writing = posts.length > 0 && (
    <>
      <div className="dh-sec"><h2>Latest writing</h2><span className="hint"><a onClick={onMore}>all posts →</a></span></div>
      <PostList posts={posts.slice(0, 3)} onOpen={(p) => { location.hash = `#/p/${p.slug}`; }} />
    </>
  );
  return (
    <>
      {layout === "terminal" && (
        <>
          <HeroTerminal />
          <div className="dh-sec"><h2>This year</h2><span className="hint">auto-pulled</span></div>
          <StatTiles />
          <div className="dh-sec"><h2>Pinned</h2><span className="hint">{repos.length} repos · <a href="../portfolio/">full catalog ↗</a></span></div>
          <RepoGrid repos={repos} />
          {writing}
          <div className="dh-sec"><h2>Reading &amp; playing</h2></div>
          <ReadingAndPlaying />
          <OtherSide />
        </>
      )}
      {layout === "dashboard" && (
        <>
          <HeroDashboard />
          <div className="dh-sec"><h2>Signal</h2><span className="hint">commits &amp; languages</span></div>
          <DataPanel />
          <div className="dh-sec"><h2>Pinned</h2><span className="hint">{repos.length} repos</span></div>
          <RepoGrid repos={repos} />
          <div className="dh-sec"><h2>Reading &amp; playing</h2></div>
          <ReadingAndPlaying />
        </>
      )}
      {layout === "magazine" && (
        <>
          <HeroMagazine />
          <div className="dh-sec"><h2>Featured work</h2><span className="hint">top {Math.min(3, repos.length)}</span></div>
          <RepoGrid repos={repos} limit={3} />
          <div className="dh-sec"><h2>This year</h2></div>
          <StatTiles />
          <div className="dh-sec"><h2>Reading &amp; playing</h2></div>
          <ReadingAndPlaying />
        </>
      )}
    </>
  );
}

function App() {
  const [route, setRoute] = useState("home");
  const [layout, setLayout] = useState("terminal");
  const [slug, setSlug] = useState(null);
  const [posts, setPosts] = useState([]);
  const [repos, setRepos] = useState([]);
  const [plain, setPlain] = useState(document.documentElement.getAttribute("data-view") === "plain");

  useEffect(() => {
    fetch("../posts.json").then(r => r.json()).then(d => setPosts(d.dev || [])).catch(() => {});
    fetch(PROJECTS_URL).then(r => r.json()).then(d => setRepos((d.projects || []).map(p => ({
      name: p.name, desc: p.description || "", tags: (p.keywords || []).slice(0, 3),
      lang: p.language || "", langVar: LANG_VAR[p.language] || "--lang-other",
      url: p.repo, docs: p.docs || "",
    })))).catch(() => {});
    const onHash = () => {
      const m = location.hash.match(/^#\/p\/(.+)$/);
      if (m) { setSlug(decodeURIComponent(m[1])); setRoute("article"); window.scrollTo(0, 0); }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (r) => { if (r !== "article" && location.hash) location.hash = ""; setRoute(r); setSlug(null); window.scrollTo(0, 0); };
  const openPost = (p) => { location.hash = `#/p/${p.slug}`; setSlug(p.slug); setRoute("article"); window.scrollTo(0, 0); };
  const togglePlain = () => {
    const next = !plain; setPlain(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-view", "plain"); else root.removeAttribute("data-view");
    try { localStorage.setItem("ak-view", next ? "plain" : ""); } catch (_) {}
  };

  const current = slug ? posts.find(p => p.slug === slug) : null;

  if (plain) return <PlainView posts={posts} route={route} post={current} onNavigate={navigate} onOpen={openPost} onPlain={togglePlain} />;

  return (
    <div className="app">
      <DHNav route={route} onNavigate={navigate} layout={layout} onLayout={setLayout} plain={plain} onPlain={togglePlain} hasWriting={posts.length > 0} />
      <main className="dh-page">
        {route === "home" && <HomeLayouts layout={layout} posts={posts} repos={repos} onMore={() => navigate("writing")} />}
        {route === "writing" && (
          <>
            <div className="dh-sec"><h2>Writing</h2><span className="hint">{posts.length} post{posts.length === 1 ? "" : "s"}</span></div>
            <PostList posts={posts} onOpen={openPost} />
          </>
        )}
        {route === "article" && <Article post={current} onBack={() => navigate("writing")} />}
      </main>
      <DHFooter />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
