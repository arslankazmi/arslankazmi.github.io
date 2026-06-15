/** Dev hub root — home (3 layouts) + writing (posts.json) + article + plain view.
    Pinned repos come from the portfolio's curated projects.json; the stat tiles and the
    data panel (language split, repos/year) are computed live from the GitHub REST API. */
const { useState, useEffect } = React;

const LANG_VAR = {
  JavaScript: "--lang-js", TypeScript: "--lang-ts", Python: "--lang-py", Rust: "--lang-rust",
  Go: "--lang-go", CSS: "--lang-css", HTML: "--lang-css", Shell: "--lang-shell", "Jupyter Notebook": "--lang-py",
};
// Project category -> ak-design categorical palette token (--viz-1..8, same in both themes).
// Keep in sync with the portfolio's CATEGORY_VAR (portfolio/app.js). Unmapped -> --accent.
const CATEGORY_VAR = {
  "AI Agents & LLMs": "--viz-1", "ML & Modeling": "--viz-2", "Computer Vision / Document AI": "--viz-5",
  "MLOps & Templates": "--viz-4", "Developer Tools": "--viz-6", "Creative AI": "--viz-7",
};
const VIZ = ["--viz-1", "--viz-2", "--viz-3", "--viz-4", "--viz-5", "--viz-6", "--viz-7", "--viz-8"];
const USER = "arslankazmi";
const PROJECTS_URL = "https://arslankazmi.github.io/portfolio/data/projects.json";

function HomeLayouts({ layout, posts, repos, stats, langs, byYear, onMore }) {
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
          <div className="dh-sec"><h2>On GitHub</h2><span className="hint">live · @{USER}</span></div>
          <StatTiles stats={stats} />
          <div className="dh-sec"><h2>Pinned</h2><span className="hint">{repos.length} repos · <a href="../portfolio/">full catalog ↗</a></span></div>
          <RepoGrid repos={repos} />
          {writing}
          <div className="dh-sec"><h2>Reading &amp; playing</h2></div>
          <ReadingPlaying />
          <OtherSide />
        </>
      )}
      {layout === "dashboard" && (
        <>
          <HeroDashboard />
          <div className="dh-sec"><h2>Signal</h2><span className="hint">repos &amp; languages · live</span></div>
          <DataPanel byYear={byYear} langs={langs} />
          <div className="dh-sec"><h2>Pinned</h2><span className="hint">{repos.length} repos</span></div>
          <RepoGrid repos={repos} />
          <div className="dh-sec"><h2>Reading &amp; playing</h2></div>
          <ReadingPlaying />
        </>
      )}
    </>
  );
}

/** Plain/markdown blocks come from dev/blocks.mjs (window.devBlocks, set by globals.js) — one source
    of truth shared with the Node static build. */
function App() {
  const [route, setRoute] = useState("home");
  const [layout, setLayout] = useState("terminal");
  const [slug, setSlug] = useState(null);
  const [posts, setPosts] = useState([]);
  const [repos, setRepos] = useState([]);
  const [stats, setStats] = useState([]);
  const [langs, setLangs] = useState([]);
  const [byYear, setByYear] = useState([]);
  const [plain, setPlain] = useState(document.documentElement.getAttribute("data-view") === "plain");

  useEffect(() => {
    fetch("../posts.json").then(r => r.json()).then(d => setPosts(d.dev || [])).catch(() => {});
    fetch(PROJECTS_URL).then(r => r.json()).then(d => setRepos((d.projects || []).map(p => ({
      name: p.name, desc: p.description || "", tags: (p.keywords || []).slice(0, 3),
      lang: p.language || "", langVar: LANG_VAR[p.language] || "--lang-other",
      // private client work has no public repo — link the title to the write-up/docs instead
      url: p.repo || p.writeup || p.docs || "", repo: p.repo || "", docs: p.docs || "",
      writeup: p.writeup || "", priv: (p.source === "private"), client: p.client || "",
      category: p.category || "", catVar: CATEGORY_VAR[p.category] || "--accent",
    })))).catch(() => {});

    // Live GitHub metrics — repos/stars/followers/age + language split + repos-per-year.
    Promise.all([
      fetch(`https://api.github.com/users/${USER}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([user, repoList]) => {
      if (!user || !Array.isArray(repoList)) return;
      const owned = repoList.filter(r => !r.fork);
      const stars = owned.reduce((s, r) => s + (r.stargazers_count || 0), 0);
      const years = new Date().getFullYear() - new Date(user.created_at).getFullYear();
      setStats([
        { ico: "◆ repos",     color: "var(--cerulean-300)", num: String(user.public_repos), cap: "public" },
        { ico: "✦ stars",     color: "var(--seagreen-300)", num: String(stars),             cap: "across repos" },
        { ico: "❂ followers", color: "var(--lavender-300)", num: String(user.followers),    cap: "on github" },
        { ico: "⌁ since",     color: "var(--punk-lilac)",   num: `${years}y`,               cap: `est. ${new Date(user.created_at).getFullYear()}` },
      ]);
      const lc = {};
      owned.forEach(r => { if (r.language) lc[r.language] = (lc[r.language] || 0) + 1; });
      const total = Object.values(lc).reduce((a, b) => a + b, 0) || 1;
      const sorted = Object.entries(lc).sort((a, b) => b[1] - a[1]);
      const arr = sorted.slice(0, 6).map(([lbl, n], i) => ({ lbl, val: Math.round((n / total) * 100), color: `var(${VIZ[i % VIZ.length]})` }));
      const other = sorted.slice(6).reduce((a, [, n]) => a + n, 0);
      if (other) arr.push({ lbl: "Other", val: Math.round((other / total) * 100), color: "var(--viz-8)" });
      setLangs(arr);
      const yc = {};
      owned.forEach(r => { const y = new Date(r.created_at).getFullYear(); yc[y] = (yc[y] || 0) + 1; });
      setByYear(Object.keys(yc).map(Number).sort((a, b) => a - b).map(y => ({ year: y, count: yc[y] })));
    });

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
  const buildBlocks = () => window.devBlocks({ route, posts, repos, stats, current, dh: window.DH, rp: window.RP });

  if (plain) return (
    <>
      <div className="plain-root">
        <p className="pm-nav">
          <a onClick={togglePlain}>← rich view</a> · <a onClick={() => navigate("home")}>home</a>
          {posts.length ? <> · <a onClick={() => navigate("writing")}>writing</a></> : null}
          {" "}· <a href="../portfolio/">projects</a> · <a href="../personal/">arslan.land</a>
        </p>
        <PlainBlocks blocks={buildBlocks()} />
      </div>
      <CopyMarkdown getBlocks={buildBlocks} />
    </>
  );

  return (
    <div className="app">
      <DHNav route={route} onNavigate={navigate} layout={layout} onLayout={setLayout} plain={plain} onPlain={togglePlain} hasWriting={posts.length > 0} />
      <main className="dh-page">
        {route === "home" && <HomeLayouts layout={layout} posts={posts} repos={repos} stats={stats} langs={langs} byYear={byYear} onMore={() => navigate("writing")} />}
        {route === "writing" && (
          <>
            <div className="dh-sec"><h2>Writing</h2><span className="hint">{posts.length} post{posts.length === 1 ? "" : "s"}</span></div>
            <PostList posts={posts} onOpen={openPost} />
          </>
        )}
        {route === "article" && <Article post={current} onBack={() => navigate("writing")} />}
      </main>
      <DHFooter />
      <CopyMarkdown getBlocks={buildBlocks} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
