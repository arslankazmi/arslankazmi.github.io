/** Project tiles — six colored cards in a grid. */
function ProjectGrid({ projects, onOpen }) {
  return (
    <div className="projects">
      {projects.map(p => (
        <div key={p.id} className={`tile ${p.color}`} onClick={() => onOpen && onOpen(p)}>
          <span className="kicker">{p.kicker}</span>
          <div>
            <h4>{p.title}</h4>
            <p>{p.blurb}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

window.ProjectGrid = ProjectGrid;
