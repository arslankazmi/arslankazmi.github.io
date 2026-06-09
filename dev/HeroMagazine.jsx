/** Layout C — Magazine hero. Big editorial type beside the TARDIS mark. */
function HeroMagazine() {
  return (
    <div className="mag">
      <div>
        <div className="dh-eyebrow">{window.DH.handle}.dev</div>
        <h1>I build <span className="a">small, sharp</span> tools — and write about why.</h1>
        <p>{window.DH.tagline}. This is the workshop side; the quieter, paper side lives at arslan.land.</p>
        <div className="ctas">
          <a className="dh-btn primary">Browse projects →</a>
          <a className="dh-btn ghost" href="../personal/">Read the writing</a>
        </div>
      </div>
      <div className="logo">
        <img src="../assets/logo-ak-blue.png" alt="AK TARDIS mark" />
      </div>
    </div>
  );
}
window.HeroMagazine = HeroMagazine;
