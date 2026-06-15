/** Dark hub nav: brand, Home/Writing routes, Portfolio link, cross-link to the
    personal side, and the plain toggle. */
function DHNav({ route, onNavigate, plain, onPlain, hasWriting }) {
  return (
    <nav className="dh-nav">
      <div className="dh-brand">
        <img src="../assets/logo-ak-blue.png" alt="AK"/>
        <b>arslan.dev</b>
      </div>
      <div className="links">
        <a className={route === "home" ? "active" : ""} onClick={() => onNavigate("home")}>Home</a>
        {hasWriting && <a className={route === "writing" || route === "article" ? "active" : ""} onClick={() => onNavigate("writing")}>Writing</a>}
        <a href="../portfolio/">Projects ↗</a>
      </div>
      <div className="right">
        <button className="dh-plain" onClick={onPlain} title="Plain text view" aria-pressed={plain}>▢ plain</button>
        <a className="dh-personal" href="../personal/">arslan.land ↗</a>
      </div>
    </nav>
  );
}

window.DHNav = DHNav;
