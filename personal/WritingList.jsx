/** Writing list — list of essays / notebook entries with a featured pair on top. */
function WritingEntry({ entry, onOpen }) {
  return (
    <div className="entry" onClick={() => onOpen(entry)}>
      <span className="date">{entry.date}</span>
      <div>
        <h4>{entry.title}</h4>
        <p>{entry.blurb}</p>
      </div>
      <div className="meta">
        <span className="tag">{entry.tag}</span>
      </div>
    </div>
  );
}

function WritingList({ entries, onOpen }) {
  return (
    <div className="writing-list">
      {entries.map(e => <WritingEntry key={e.id} entry={e} onOpen={onOpen}/>)}
    </div>
  );
}

function FeaturedPair({ entries, onOpen }) {
  const feature = entries.find(e => e.featured) || entries[0];
  const sides = entries.filter(e => e.id !== feature.id).slice(0, 3);
  return (
    <div className="featured-grid">
      <div className="featured" onClick={() => onOpen(feature)}>
        <span className="eyebrow" style={{color: "var(--cerulean-600)"}}>Featured · {feature.date}</span>
        <h3>{feature.title}</h3>
        <p>{feature.blurb}</p>
        <span className="meta">Pinned · {feature.read}</span>
      </div>
      <div className="side-list">
        {sides.map(s => (
          <div key={s.id} className="side-card" onClick={() => onOpen(s)}>
            <span className="eyebrow">{s.tag}</span>
            <h5>{s.title}</h5>
            <span className="meta">{s.date} · {s.read}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.WritingList = WritingList;
window.FeaturedPair = FeaturedPair;
