/** Shared hub sections: stat tiles, repo grid, data panel, reading + now-playing, footer. */
const { useState: useStateShared } = React;

function StatTiles({ stats }) {
  const tiles = (stats && stats.length) ? stats : window.DH.stats;
  return (
    <div className="dh-stats">
      {tiles.map((s, i) => (
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

function DataPanel({ byYear, langs }) {
  const years = byYear || [];
  const ls = (langs && langs.length) ? langs : (window.DH.languages || []);
  const max = Math.max(1, ...years.map(y => y.count));
  return (
    <div className="dh-data">
      <div className="dh-panel">
        <h3>repos created / year</h3>
        <div className="dh-bars">
          {years.map((y, i) => (
            <div className="b" key={y.year} title={`${y.year}: ${y.count}`}
                 style={{ height: `${(y.count / max) * 100}%`, background: i === years.length - 1 ? "var(--viz-1)" : "var(--cerulean-700)" }}>
              <span>{String(y.year).slice(2)}</span>
            </div>
          ))}
          {!years.length && <span className="dh-empty" style={{ alignSelf: "center" }}>loading…</span>}
        </div>
      </div>
      <div className="dh-panel">
        <h3>language split</h3>
        <div className="dh-legend">
          {ls.map(l => (
            <div className="row" key={l.lbl}>
              <span className="sw" style={{ background: l.color }}></span>
              <span className="lbl">{l.lbl}</span>
              <span className="val">{l.val}%</span>
            </div>
          ))}
          {!ls.length && <span className="dh-empty">loading…</span>}
        </div>
      </div>
    </div>
  );
}

function ReadingAndPlaying() {
  const { books, games } = window.DH;
  const now = (games && games.now) || { ti: "—", meta: "" };
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
            <div className="ti">{now.ti}</div>
            <div className="meta">{now.meta}</div>
          </div>
        </div>
        {games && (games.next || games.again) && (
          <div className="dh-queue">
            {games.next && <span><b>up next</b> · {games.next}</span>}
            {games.again && <span><b>replaying</b> · {games.again}</span>}
          </div>
        )}
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
