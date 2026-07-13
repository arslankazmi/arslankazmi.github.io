/** Dev hub root — home (terminal) + writing (posts.json) + article + plain view.
    Projects come from the portfolio's curated projects.json; the stat tiles are computed
    live from the GitHub REST API. */
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
const USER = "arslankazmi";
const PROJECTS_URL = "https://arslankazmi.github.io/portfolio/data/projects.json";

function HomeLayouts({ posts, repos, stats, onMore }) {
  const writing = posts.length > 0 && (
    <>
      <div className="dh-sec"><h2>Latest posts</h2><span className="hint"><a onClick={onMore}>all posts →</a></span></div>
      <PostList posts={posts.slice(0, 3)} onOpen={(p) => { location.hash = `#/p/${p.slug}`; }} />
    </>
  );
  return (
    <>
      <HeroTerminal />
      {writing}
      <div className="dh-sec"><h2>Projects</h2><span className="hint">{repos.length} repos · <a href="../portfolio/">full catalog ↗</a></span></div>
      <RepoGrid repos={repos} />
      {/* GitHub stats hidden for now — re-enable by uncommenting:
      <div className="dh-sec"><h2>On GitHub</h2><span className="hint">live · @{USER}</span></div>
      <StatTiles stats={stats} /> */}
      <div className="dh-sec"><h2>Reading &amp; playing</h2></div>
      <ReadingPlaying />
      <OtherSide />
    </>
  );
}

/** Plain/markdown blocks come from dev/blocks.mjs (window.devBlocks, set by globals.js) — one source
    of truth shared with the Node static build. */
function App() {
  const [route, setRoute] = useState("home");
  const [slug, setSlug] = useState(null);
  const [posts, setPosts] = useState([]);
  const [repos, setRepos] = useState([]);
  const [stats, setStats] = useState([]);
  const [articleMd, setArticleMd] = useState(null); // raw markdown of the open post, for plain view
  const [plain, setPlain] = useState(document.documentElement.getAttribute("data-view") === "plain");

  useEffect(() => {
    fetch("../posts.json", { cache: "no-cache" }).then(r => r.json()).then(d => setPosts(d.dev || [])).catch(() => {});
    fetch(PROJECTS_URL).then(r => r.json()).then(d => setRepos((d.projects || []).map(p => ({
      name: p.name, desc: p.description || "", tags: (p.keywords || []).slice(0, 3),
      lang: p.language || "", langVar: LANG_VAR[p.language] || "--lang-other",
      // private client work has no public repo — link the title to the write-up/docs instead
      url: p.repo || p.writeup || p.docs || "", repo: p.repo || "", docs: p.docs || "",
      writeup: p.writeup || "", priv: (p.source === "private"), client: p.client || "",
      category: p.category || "", catVar: CATEGORY_VAR[p.category] || "--accent",
    })))).catch(() => {});

    // Live GitHub metrics — repos / stars / followers / account age.
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
    });

    const onHash = () => {
      const m = location.hash.match(/^#\/p\/(.+)$/);
      if (m) { setSlug(decodeURIComponent(m[1])); setRoute("article"); window.scrollTo(0, 0); return; }
      if (location.hash.replace(/^#\/?/, "") === "writing") { setSlug(null); setRoute("writing"); window.scrollTo(0, 0); }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Plain view: load the open post's raw markdown so its body renders (not a placeholder).
  useEffect(() => {
    if (!plain || route !== "article" || !slug) { setArticleMd(null); return; }
    const post = posts.find(p => p.slug === slug);
    if (!post || !post.path) { setArticleMd(null); return; }
    let live = true;
    fetch("../" + post.path).then(r => r.text())
      .then(t => { if (live) setArticleMd(t.replace(/^---[\s\S]*?\n---\s*/, "")); })
      .catch(() => { if (live) setArticleMd(null); });
    return () => { live = false; };
  }, [plain, route, slug, posts]);

  const navigate = (r) => { if (r !== "article" && location.hash) location.hash = ""; setRoute(r); setSlug(null); window.scrollTo(0, 0); };
  const openPost = (p) => { location.hash = `#/p/${p.slug}`; setSlug(p.slug); setRoute("article"); window.scrollTo(0, 0); };
  const togglePlain = () => {
    const next = !plain; setPlain(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-view", "plain"); else root.removeAttribute("data-view");
    try { localStorage.setItem("ak-view", next ? "plain" : ""); } catch (_) {}
  };

  const current = slug ? posts.find(p => p.slug === slug) : null;
  const buildBlocks = () => window.devBlocks({ route, posts, repos, stats, current, currentMd: articleMd, dh: window.DH, rp: window.RP });

  if (plain) return (
    <>
      <div className="plain-root">
        <p className="pm-nav">
          <a onClick={togglePlain}>← rich view</a> · <a onClick={() => navigate("home")}>home</a>
          {posts.length ? <> · <a onClick={() => navigate("writing")}>posts</a></> : null}
          {" "}· <a href="../portfolio/">projects</a> · <a href="../personal/">arslan.land</a>
        </p>
        <PlainBlocks blocks={buildBlocks()} />
      </div>
      <CopyMarkdown getBlocks={buildBlocks} />
    </>
  );

  return (
    <div className="app">
      <DHNav route={route} onNavigate={navigate} plain={plain} onPlain={togglePlain} hasWriting={posts.length > 0} />
      <main className="dh-page">
        {route === "home" && <HomeLayouts posts={posts} repos={repos} stats={stats} onMore={() => navigate("writing")} />}
        {route === "writing" && (
          <>
            <div className="dh-sec"><h2>Posts</h2><span className="hint">{posts.length} post{posts.length === 1 ? "" : "s"}</span></div>
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
