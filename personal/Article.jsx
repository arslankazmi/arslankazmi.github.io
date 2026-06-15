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
  const proseRef = React.useRef(null);
  React.useEffect(() => {
    if (html == null || !proseRef.current) return;
    const p = proseRef.current.querySelector("p");
    if (!p) return;
    p.classList.add("article-opening");
    const ch = (p.textContent.trim()[0] || "").toUpperCase();
    if (/[A-Z]/.test(ch)) proseRef.current.setAttribute("data-dropcap", ch);
  }, [html]);
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
        : <div className="prose" ref={proseRef} dangerouslySetInnerHTML={{ __html: html }} />}
      <div style={{ marginTop: 56, display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn btn-stamp" onClick={onBack}>← Take me back</button>
        <button className="btn btn-stamp btn-stamp-pink">♥ Favorite</button>
      </div>
    </article>
  );
}

window.Article = Article;
