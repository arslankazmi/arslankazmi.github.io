/** Shared plain/markdown engine. A page is described as an ordered list of "blocks"; the same
    list renders two ways: a table-based HTML "plain" replica, and a Markdown string (with
    Markdown tables) for the copy-as-markdown button. Used by both /dev/ and /personal/. */
const { useState: useStatePM } = React;

// A cell is a string, or { text, href }.
function pmText(c) { return (c && typeof c === "object") ? (c.text ?? "") : (c == null ? "" : String(c)); }
function pmHref(c) { return (c && typeof c === "object") ? (c.href || null) : null; }
function mdEsc(s) { return String(s).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim(); }
function mdCell(c) { const t = mdEsc(pmText(c)); const h = pmHref(c); return h ? `[${t}](${h})` : t; }

/** blocks → Markdown (tables preserved as Markdown tables). */
function toMarkdown(blocks) {
  const out = [];
  for (const b of blocks) {
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
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** blocks → React (table-based plain HTML). */
function PlainBlocks({ blocks }) {
  return (blocks || []).map((b, i) => {
    if (b.t === "h1") return <h1 key={i}>{b.text}</h1>;
    if (b.t === "h2") return <h2 key={i}>{b.text}</h2>;
    if (b.t === "p") return <p key={i}>{b.text}</p>;
    if (b.t === "hr") return <hr key={i} />;
    if (b.t === "rawmd") return <div key={i} className="pm-body" dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(b.md || "") : (b.md || "") }} />;
    if (b.t === "links") return <p key={i} className="pm-links">{(b.items || []).map((it, j) => <React.Fragment key={j}>{j > 0 ? " · " : ""}<a href={it.href} onClick={it.onClick}>{it.label}</a></React.Fragment>)}</p>;
    if (b.t === "table") return (
      <table key={i}>
        {b.head && b.head.length > 0 && <thead><tr>{b.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>}
        <tbody>{(b.rows || []).map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{pmHref(c) ? <a href={pmHref(c)}>{pmText(c)}</a> : pmText(c)}</td>)}</tr>)}</tbody>
      </table>
    );
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
