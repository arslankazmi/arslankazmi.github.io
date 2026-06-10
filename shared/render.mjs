/** Shared, pure block renderers — single source of truth for the plain/markdown/static backends.
    A page is an ordered list of "blocks"; this module turns that list into either a Markdown string
    or a self-contained, 1999-renderable HTML string. NO React, NO DOM, NO npm deps — so it runs
    identically in Node (the build) and in the browser (bundled into globals.js by esbuild).

    Block types: h1 h2 p hr links rawmd · table {head, rows} · grid {cols, cells}.
    A grid cell is { title?, href?, lines:[ string | {text, href} ] }.
    The React plain view (shared/plain.jsx) and the Node static build both consume these. */

export function pmText(c) { return (c && typeof c === "object") ? (c.text ?? "") : (c == null ? "" : String(c)); }
export function pmHref(c) { return (c && typeof c === "object") ? (c.href || null) : null; }

export function mdEsc(s) { return String(s).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim(); }
export function mdCell(c) { const t = mdEsc(pmText(c)); const h = pmHref(c); return h ? `[${t}](${h})` : t; }
function lineMd(ln) { return (ln && typeof ln === "object") ? `[${mdEsc(ln.text)}](${ln.href || ""})` : mdEsc(ln); }
function gridCellMd(c) {
  const parts = [];
  if (c.title) parts.push(c.href ? `**[${mdEsc(c.title)}](${c.href})**` : `**${mdEsc(c.title)}**`);
  for (const ln of (c.lines || [])) { const m = lineMd(ln); if (m) parts.push(m); }
  return parts.join("<br>");
}

/** blocks -> Markdown (tables/grids preserved as Markdown tables). */
export function toMarkdown(blocks) {
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

/** HTML-escape text node/attribute content (toMarkdown/React escape for us elsewhere; here we emit raw strings). */
export function he(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function anchor(text, href) { return `<a href="${he(href)}">${he(text)}</a>`; }
function lineHtml(ln) {
  if (ln && typeof ln === "object") return ln.href ? anchor(ln.text, ln.href) : he(ln.text);
  return he(ln);
}
function gridCellHtml(c) {
  let s = "";
  if (c.title) s += `<div><b>${c.href ? anchor(c.title, c.href) : he(c.title)}</b></div>`;
  for (const ln of (c.lines || [])) s += `<div>${lineHtml(ln)}</div>`;
  return `<td valign="top">${s}</td>`;
}

/** blocks -> self-contained presentational HTML string (borders via table ATTRIBUTES; renders in a
    1999 browser with no modern CSS). Mirrors the React PlainBlocks component exactly.
    `renderMd` (optional) converts a rawmd block's markdown to HTML; defaults to escaping it. */
export function toStaticHTML(blocks, renderMd) {
  const md = typeof renderMd === "function" ? renderMd : (s) => he(s);
  const out = [];
  for (const b of (blocks || [])) {
    if (b.t === "h1") out.push(`<h1>${he(b.text)}</h1>`);
    else if (b.t === "h2") out.push(`<h2>${he(b.text)}</h2>`);
    else if (b.t === "p") out.push(`<p>${he(b.text)}</p>`);
    else if (b.t === "hr") out.push(`<hr>`);
    else if (b.t === "rawmd") out.push(`<div class="pm-body">${md(b.md || "")}</div>`);
    else if (b.t === "links") out.push(`<p class="pm-links">${(b.items || []).map(it => anchor(it.label, it.href)).join(" · ")}</p>`);
    else if (b.t === "table") {
      let s = `<table border="1" cellpadding="6" cellspacing="0" width="100%">`;
      if (b.head && b.head.length) s += `<thead><tr>${b.head.map(h => `<th align="left" bgcolor="#f0f0f0">${he(h)}</th>`).join("")}</tr></thead>`;
      s += `<tbody>${(b.rows || []).map(r => `<tr>${r.map(c => `<td valign="top">${pmHref(c) ? anchor(pmText(c), pmHref(c)) : he(pmText(c))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      out.push(s);
    } else if (b.t === "grid") {
      const cols = b.cols || 2;
      const cells = b.cells || [];
      const rows = [];
      for (let j = 0; j < cells.length; j += cols) rows.push(cells.slice(j, j + cols));
      let s = `<table border="1" cellpadding="6" cellspacing="0" width="100%"><tbody>`;
      for (const row of rows) {
        s += `<tr>${row.map(gridCellHtml).join("")}`;
        for (let k = row.length; k < cols; k++) s += `<td></td>`;
        s += `</tr>`;
      }
      s += `</tbody></table>`;
      out.push(s);
    }
  }
  return out.join("\n");
}
