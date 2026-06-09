/** Shared plain/markdown engine. A page is an ordered list of "blocks"; the same list renders two
    ways: a self-contained, presentational HTML "plain" replica (renders in a 1999 browser — borders
    via table ATTRIBUTES, no modern CSS needed), and a Markdown string. Block types:
      h1 h2 p hr links rawmd · table {head, rows} (vertical list) · grid {cols, cells} (mirrors the
      rich view's columnar/tiled layout — stat tiles, repo/project tiles, reading|playing side-by-side).
    A grid cell is { title?, href?, lines:[ string | {text, href} ] }. */
const { useState: useStatePM } = React;

function pmText(c) { return (c && typeof c === "object") ? (c.text ?? "") : (c == null ? "" : String(c)); }
function pmHref(c) { return (c && typeof c === "object") ? (c.href || null) : null; }
function mdEsc(s) { return String(s).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim(); }
function mdCell(c) { const t = mdEsc(pmText(c)); const h = pmHref(c); return h ? `[${t}](${h})` : t; }
function lineMd(ln) { return (ln && typeof ln === "object") ? `[${mdEsc(ln.text)}](${ln.href || ""})` : mdEsc(ln); }
function gridCellMd(c) {
  const parts = [];
  if (c.title) parts.push(c.href ? `**[${mdEsc(c.title)}](${c.href})**` : `**${mdEsc(c.title)}**`);
  for (const ln of (c.lines || [])) { const m = lineMd(ln); if (m) parts.push(m); }
  return parts.join("<br>");
}

/** blocks → Markdown (tables/grids preserved as Markdown tables). */
function toMarkdown(blocks) {
  const out = [];
  for (const b of (blocks || [])) {
    if (b.t === "h1") out.push(`# ${b.text}`);
    else if (b.t === "h2") out.push(`## ${b.text}`);
    else if (b.t === "p") out.push(b.text);
    else if (b.t === "hr") out.push("---");
    else if (b.t === "rawmd") out.push((b.md || "").trim());
    else if (b.t === "links") out.push((b.items || []).map(i => `[${mdEsc(i.label)}](${i.href})`).join(" · "));
    else if (b.t === "table") {
      const head = b.head || [];
      if (head.length) {
        out.push(`| ${head.map(mdEsc).join(" | ")} |`);
        out.push(`| ${head.map(() => "---").join(" | ")} |`);
      }
      for (const r of (b.rows || [])) out.push(`| ${r.map(mdCell).join(" | ")} |`);
    } else if (b.t === "grid") {
      const cols = b.cols || 2;
      const cells = (b.cells || []).map(gridCellMd);
      out.push(`| ${Array.from({ length: cols }, () => " ").join(" | ")} |`);
      out.push(`| ${Array.from({ length: cols }, () => "---").join(" | ")} |`);
      for (let i = 0; i < cells.length; i += cols) {
        const row = cells.slice(i, i + cols);
        while (row.length < cols) row.push(" ");
        out.push(`| ${row.join(" | ")} |`);
      }
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function GridCell({ c }) {
  return (
    <td valign="top">
      {c.title && <div><b>{c.href ? <a href={c.href}>{c.title}</a> : c.title}</b></div>}
      {(c.lines || []).map((ln, li) => <div key={li}>{(ln && typeof ln === "object") ? (ln.href ? <a href={ln.href}>{ln.text}</a> : ln.text) : ln}</div>)}
    </td>
  );
}

/** blocks → React, as self-contained presentational HTML (table borders via attributes). */
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
        <tbody>{(b.rows || []).map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} valign="top">{pmHref(c) ? <a href={pmHref(c)}>{pmText(c)}</a> : pmText(c)}</td>)}</tr>)}</tbody>
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
    const md = toMarkdown(getBlocks() || []);
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

Object.assign(window, { PlainBlocks, CopyMarkdown, toMarkdown });
