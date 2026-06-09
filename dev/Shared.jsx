/** Shared hub sections: stat tiles, repo grid, data panel, reading + now-playing, footer. */
const { useState: useStateShared } = React;

function StatTiles() {
  return (
    <div className="dh-stats">
      {window.DH.stats.map((s, i) => (
        <div className="dh-tile" key={i} style={{ borderColor: "var(--ink-900)" }}>
          <span className="ico" style={{ color: s.color }}>{s.ico}</span>
          <span className="num">{s.num}</span>
          <span className="cap">{s.cap}</span>
        </div>
      ))}
    </div>
  );
}

function RepoCard({ repo }) {
  return (
    <div className="dh-repo">
      <a className="name" href={repo.url} target="_blank" rel="noopener">{repo.name}</a>
      <p className="desc">{repo.desc}</p>
      {repo.tags && repo.tags.length > 0 &&
        <div className="tags">{repo.tags.map(t => <span className="tag" key={t}>{t}</span>)}</div>}
      <div className="meta">
        {repo.lang && <span className="lang"><span className="dot" style={{ background: `var(${repo.langVar})` }}></span>{repo.lang}</span>}
        {repo.docs && <a className="docs" href={repo.docs} target="_blank" rel="noopener">docs ↗</a>}
        <a className="repo" href={repo.url} target="_blank" rel="noopener">code ↗</a>
      </div>
    </div>
  );
}

function RepoGrid({ repos, limit }) {
  const all = (repos && repos.length) ? repos : (window.DH.repos || []);
  if (!all.length) return <p className="dh-empty">Loading repos…</p>;
  const list = limit ? all.slice(0, limit) : all;
  return <div className="dh-repos">{list.map(r => <RepoCard key={r.name} repo={r} />)}</div>;
}

function DataPanel() {
  const { commits, months, languages } = window.DH;
  const max = Math.max(...commits);
  // sparkline points
  const w = 280, h = 54, pad = 4;
  const pts = commits.map((v, i) => {
    const x = pad + (i / (commits.length - 1)) * (w - pad * 2);
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="dh-data">
      <div className="dh-panel">
        <h3>commits / month · 2025</h3>
        <div className="dh-bars">
          {commits.map((v, i) => (
            <div className="b" key={i}
                 style={{ height: `${(v / max) * 100}%`, background: i === 9 ? "var(--viz-1)" : "var(--cerulean-700)" }}>
              <span>{months[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="dh-panel">
        <h3>language split</h3>
        <div className="dh-legend">
          {languages.map(l => (
            <div className="row" key={l.lbl}>
              <span className="sw" style={{ background: l.color }}></span>
              <span className="lbl">{l.lbl}</span>
              <span className="val">{l.val}%</span>
            </div>
          ))}
        </div>
        <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ marginTop: 14 }}>
          <polyline points={pts} fill="none" stroke="var(--seagreen-300)" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

function ReadingAndPlaying() {
  const { books, game } = window.DH;
  return (
    <div className="dh-two">
      <div className="dh-shelf">
        {books.map(b => (
          <div className="dh-book" key={b.ti}>
            <span className="spine" style={{ background: b.spine }}></span>
            <div>
              <p className="ti">{b.ti}</p>
              <span className="au">{b.au}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dh-now">
        <span className="label">Now playing</span>
        <div className="game">
          <span className="art"></span>
          <div>
            <div className="ti">{game.ti}</div>
            <div className="meta">{game.meta}</div>
          </div>
        </div>
        <img className="heart" src="../assets/heart-pin.svg" alt="loved" style={{ alignSelf: "flex-start" }} />
      </div>
    </div>
  );
}

function OtherSide() {
  return (
    <a className="dh-other" href="../personal/">
      <div>
        <div className="pips">
          <span style={{ background: "#1f7fb4" }}></span>
          <span style={{ background: "#6b558f" }}></span>
          <span style={{ background: "#199268" }}></span>
          <span style={{ background: "#d63d7a" }}></span>
        </div>
        <span className="k">// the other side</span>
        <h3>arslan.land</h3>
        <p>The quieter, paper side — essays, notebook, mixtapes. Same brand, light theme.</p>
      </div>
      <span className="go">Switch themes ↗</span>
    </a>
  );
}

function DHFooter() {
  return (
    <footer className="dh-foot">
      <div>
        Built with the Arslan Kazmi design system · <a href="../personal/">the personal side ↗</a>
      </div>
      <span className="sig">— A.K.</span>
    </footer>
  );
}

Object.assign(window, { StatTiles, RepoGrid, DataPanel, ReadingAndPlaying, OtherSide, DHFooter });
