/** Top navigation bar — sticky, paper-blur. */
function TopNav({ route, onNavigate, plain, onPlain, hasWriting, hasProjects }) {
  const items = [
    ...(hasWriting ? [{ id: "writing", label: "Writing" }, { id: "notebook", label: "Notebook" }] : []),
    ...(hasProjects ? [{ id: "projects", label: "Projects" }] : []),
    { id: "about",    label: "About"    },
  ];
  return (
    <nav className="nav">
      <a className="brand" onClick={() => onNavigate("home")}>
        <img className="mark" src="../assets/logo-ak.png" alt="AK"/>
        <span>arslan.land</span>
      </a>
      <div className="items">
        {items.map(it => (
          <a key={it.id}
             className={route === it.id ? "active" : ""}
             onClick={() => onNavigate(it.id)}>{it.label}</a>
        ))}
      </div>
      <div className="right">
        <button className="plain-toggle" onClick={onPlain} aria-pressed={plain} title="Plain text view">▢ plain</button>
        <a className="dev-link" href="../dev/">arslan.dev ↗</a>
      </div>
    </nav>
  );
}

window.TopNav = TopNav;
