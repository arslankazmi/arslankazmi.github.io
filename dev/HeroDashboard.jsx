/** Layout B — Dashboard hero. Stats + data front and center. */
function HeroDashboard() {
  return (
    <div>
      <div className="dh-eyebrow">{window.DH.tagline}</div>
      <div className="dh-sec" style={{ margin: "10px 0 18px" }}>
        <h2 style={{ fontSize: 40 }}>The year so far, in numbers.</h2>
      </div>
      <StatTiles />
      <div style={{ height: 18 }}></div>
      <DataPanel />
    </div>
  );
}
window.HeroDashboard = HeroDashboard;
