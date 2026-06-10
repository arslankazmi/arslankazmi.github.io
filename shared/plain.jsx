/** Shared plain-view React components. The pure block→HTML/Markdown logic lives in shared/render.mjs
    (single source of truth, also used by the Node static build); esbuild exposes it on window via the
    per-page globals.js (window.toMarkdown / pmText / pmHref). This file is only the React rendering of
    the live in-app plain toggle + the copy-as-markdown button. Block types are documented in render.mjs. */
const { useState: useStatePM } = React;

function GridCell({ c }) {
  return (
    <td valign="top">
      {c.title && <div><b>{c.href ? <a href={c.href}>{c.title}</a> : c.title}</b></div>}
      {(c.lines || []).map((ln, li) => <div key={li}>{(ln && typeof ln === "object") ? (ln.href ? <a href={ln.href}>{ln.text}</a> : ln.text) : ln}</div>)}
    </td>
  );
}

/** blocks → React, as self-contained presentational HTML (table borders via attributes). Mirrors
    shared/render.mjs `toStaticHTML` exactly — keep the two in sync. */
function PlainBlocks({ blocks }) {
  return (blocks || []).map((b, i) => {
    if (b.t === "h1") return <h1 key={i}>{b.text}</h1>;
    if (b.t === "h2") return <h2 key={i}>{b.text}</h2>;
    if (b.t === "p") return <p key={i}>{b.text}</p>;
    if (b.t === "hr") return <hr key={i} />;
    if (b.t === "rawmd") return <div key={i} className="pm-body" dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(b.md || "") : (b.md || "") }} />;
    if (b.t === "links") return <p key={i} className="pm-links">{(b.items || []).map((it, j) => <React.Fragment key={j}>{j > 0 ? " · " : ""}<a href={it.href} onClick={it.onClick}>{it.label}</a></React.Fragment>)}</p>;
    if (b.t === "table") return (
      <table key={i} border="1" cellPadding="6" cellSpacing="0" width="100%">
        {b.head && b.head.length > 0 && <thead><tr>{b.head.map((h, j) => <th key={j} align="left" bgcolor="#f0f0f0">{h}</th>)}</tr></thead>}
        <tbody>{(b.rows || []).map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} valign="top">{window.pmHref(c) ? <a href={window.pmHref(c)}>{window.pmText(c)}</a> : window.pmText(c)}</td>)}</tr>)}</tbody>
      </table>
    );
    if (b.t === "grid") {
      const cols = b.cols || 2;
      const cells = b.cells || [];
      const rows = [];
      for (let j = 0; j < cells.length; j += cols) rows.push(cells.slice(j, j + cols));
      return (
        <table key={i} border="1" cellPadding="6" cellSpacing="0" width="100%">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => <GridCell key={ci} c={c} />)}
                {row.length < cols && Array.from({ length: cols - row.length }, (_, k) => <td key={"e" + k}></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return null;
  });
}

/** Fixed bottom-right "copy this page as Markdown" button. */
function CopyMarkdown({ getBlocks }) {
  const [done, setDone] = useStatePM(false);
  const copy = async () => {
    const md = window.toMarkdown(getBlocks() || []);
    let ok = false;
    try { await navigator.clipboard.writeText(md); ok = true; } catch (_) {
      try {
        const ta = document.createElement("textarea");
        ta.value = md; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove();
      } catch (_) {}
    }
    setDone(ok); setTimeout(() => setDone(false), 1600);
  };
  return <button className="md-copy" onClick={copy} title="Copy this page as Markdown">{done ? "✓ copied markdown" : "⧉ copy as markdown"}</button>;
}

Object.assign(window, { PlainBlocks, CopyMarkdown });
