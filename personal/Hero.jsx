/** Hero — name, blurb, and a stamped sticker collage. */
function Hero({ onNavigate }) {
  return (
    <section className="hero">
      <div>
        <h1>
          Hi, I'm <span className="accent" style={{fontFamily: "var(--font-accent)", fontStyle: "italic"}}>Arslan</span>.<br/>
          Turning incoherent thoughts into<br/>
          <span className="marker">slightly less incoherent</span> words.
        </h1>
        <p>
          A small site for essays, notes, and the occasional weeknote.
          Lately I've been thinking about reading slowly, the rooms inside
          websites, and why every good idea sounds embarrassing out loud.
        </p>
        <div className="ctas">
          <button className="btn btn-stamp btn-stamp-accent" onClick={() => onNavigate("writing")}>
            Read the latest →
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate("about")}>
            Or just say hi
          </button>
        </div>
      </div>
      <div className="badge-stack" aria-hidden="true">
        <img className="stamp" src="../assets/stamp.svg" alt=""/>
        <img className="heart" src="../assets/heart-pin.svg" alt=""/>
      </div>
    </section>
  );
}

window.Hero = Hero;
