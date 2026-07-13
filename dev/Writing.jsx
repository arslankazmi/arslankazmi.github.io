/** Dev-side writing: post list, markdown article, and the plain (borderless-table) view. */
const { useState: useStateW, useEffect: useEffectW } = React;

function stripFrontMatter(md) {
  return md.replace(/^---[\s\S]*?\n---\s*/, "");
}
function useMarkdown(path) {
  const [html, setHtml] = useStateW(null);
  useEffectW(() => {
    if (!path) return;
    let live = true;
    fetch("../" + path).then(r => r.text()).then(t => {
      if (!live) return;
      const body = stripFrontMatter(t);
      setHtml(window.marked ? window.marked.parse(body) : body.replace(/\n/g, "<br>"));
    }).catch(() => live && setHtml("<p>Could not load this post.</p>"));
    return () => { live = false; };
  }, [path]);
  return html;
}

/** List of dev posts — reuses the repo-card look. */
function PostList({ posts, onOpen }) {
  if (!posts.length) return <p className="dh-empty">No posts yet — check back soon.</p>;
  return (
    <div className="dh-posts">
      {posts.map(p => (
        <a className="dh-post" key={p.slug} onClick={() => onOpen(p)}>
          <span className="date">{p.date}</span>
          <span className="title">{p.title}</span>
          <p className="blurb">{p.blurb}</p>
          <div className="tags">{(p.tags || []).map(t => <span className="tag" key={t}>{t}</span>)}</div>
        </a>
      ))}
    </div>
  );
}

/** Full markdown article. */
function Article({ post, onBack }) {
  const html = useMarkdown(post && post.path);
  if (!post) return <p className="dh-empty">Post not found. <a onClick={onBack}>← back</a></p>;
  return (
    <article className="dh-article">
      <div className="meta">
        <span>{post.dateLong || post.date}</span>
        {(post.tags || []).map(t => <span className="tag" key={t}>{t}</span>)}
      </div>
      <h1>{post.title}</h1>
      {html == null
        ? <p className="dh-empty">Loading…</p>
        : <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />}
      <p style={{ marginTop: 40 }}><a className="dh-back" onClick={onBack}>← all posts</a></p>
    </article>
  );
}

Object.assign(window, { PostList, Article });
