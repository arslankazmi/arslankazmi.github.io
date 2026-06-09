/** Single article view (renders markdown) + the plain (borderless-table) view. */
const { useState: useStateA, useEffect: useEffectA } = React;

function stripFront(md) { return md.replace(/^---[\s\S]*?\n---\s*/, ""); }
function useMd(path) {
  const [html, setHtml] = useStateA(null);
  useEffectA(() => {
    if (!path) return;
    let live = true;
    fetch("../" + path).then(r => r.text()).then(t => {
      if (live) setHtml(window.marked ? window.marked.parse(stripFront(t)) : stripFront(t).replace(/\n/g, "<br>"));
    }).catch(() => live && setHtml("<p>Could not load this piece.</p>"));
    return () => { live = false; };
  }, [path]);
  return html;
}

function Article({ entry, onBack }) {
  const html = useMd(entry && entry.path);
  if (!entry) return null;
  return (
    <article className="article">
      <div className="article-meta">
        <span>{entry.dateLong || entry.date}</span>
        {entry.read && <><span>·</span><span>{entry.read}</span></>}
        {entry.tag && <><span>·</span><span>{entry.tag}</span></>}
      </div>
      <h1>{entry.title}</h1>
      {entry.blurb && <p className="lede">{entry.blurb}</p>}
      <div className="asterism">✻ ✺ ✻</div>
      {html == null
        ? <p>Loading…</p>
        : <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />}
      <div style={{ marginTop: 56, display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn btn-stamp" onClick={onBack}>← Take me back</button>
        <button className="btn btn-stamp btn-stamp-pink">♥ Favorite</button>
      </div>
    </article>
  );
}

/** Plain view: bare HTML 1 elements + a borderless table. No design-system CSS. */
function PersonalPlainView({ entries, route, entry, onNavigate, onOpen, onPlain }) {
  const html = useMd(route === "article" && entry ? entry.path : null);
  return (
    <div className="plain-root">
      <h1>arslan.land</h1>
      <p>
        <a onClick={() => onNavigate("home")}>Home</a> |{" "}
        <a onClick={() => onNavigate("writing")}>Writing</a> |{" "}
        <a onClick={() => onNavigate("about")}>About</a> |{" "}
        <a href="../dev/">arslan.dev</a> |{" "}
        <a onClick={onPlain}>rich view</a>
      </p>
      <hr />
      {route === "article" && entry ? (
        <>
          <h2>{entry.title}</h2>
          <p><i>{entry.dateLong || entry.date}</i></p>
          {html == null ? <p>Loading…</p> : <div dangerouslySetInnerHTML={{ __html: html }} />}
          <p><a onClick={() => onNavigate("writing")}>&larr; back to writing</a></p>
        </>
      ) : (
        <>
          <h2>Writing</h2>
          <table border="0" cellSpacing="0" cellPadding="6">
            <tbody>
              {entries.map(e => (
                <tr key={e.slug}>
                  <td valign="top"><i>{e.date}</i></td>
                  <td><a onClick={() => onOpen(e)}>{e.title}</a><br />{e.blurb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

window.Article = Article;
window.PersonalPlainView = PersonalPlainView;
