/** Dark hub nav: brand, Home/Writing routes, layout switcher (home only),
    Portfolio link, cross-link to the personal side, and the plain toggle. */
function DHNav({ route, onNavigate, layout, onLayout, plain, onPlain }) {
  const layouts = [
    { id: "terminal",  label: "Terminal"  },
    { id: "dashboard", label: "Dashboard" },
    { id: "magazine",  label: "Magazine"  },
  ];
  return (
    <nav className="dh-nav">
      <div className="dh-brand">
        <img src="../assets/logo-ak-blue.png" alt="AK"/>
        <b>arslan.dev</b>
      </div>
      <div className="links">
        <a className={route === "home" ? "active" : ""} onClick={() => onNavigate("home")}>Home</a>
        <a className={route === "writing" || route === "article" ? "active" : ""} onClick={() => onNavigate("writing")}>Writing</a>
        <a href="../portfolio/">Projects ↗</a>
      </div>
      <div className="right">
        {route === "home" && (
          <div className="dh-switch">
            {layouts.map(l => (
              <button key={l.id} className={layout === l.id ? "on" : ""}
                      onClick={() => onLayout(l.id)}>{l.label}</button>
            ))}
          </div>
        )}
        <button className="dh-plain" onClick={onPlain} title="Plain text view" aria-pressed={plain}>▢ plain</button>
        <a className="dh-personal" href="../personal/">arslan.land ↗</a>
      </div>
    </nav>
  );
}

window.DHNav = DHNav;
