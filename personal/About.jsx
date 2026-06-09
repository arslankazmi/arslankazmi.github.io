/** About page. */
function About() {
  return (
    <section className="about-grid">
      <div className="about-mark">
        <img className="big" src="../assets/logo-ak.png" alt="AK TARDIS logo"/>
        <img src="../assets/stamp.svg" alt="" style={{width: 140, transform: "rotate(-8deg)"}}/>
      </div>
      <div>
        <span className="eyebrow">About</span>
        <h1>The author, in three short paragraphs.</h1>
        <p>
          I'm a designer who writes, or a writer who designs — depending on which
          half of the year you ask. I make personal software, the occasional
          mixtape, and one very long essay every season.
        </p>
        <p>
          I grew up on a quieter internet, made of forums and webrings and ugly,
          honest websites. This site is my attempt to keep a piece of that
          internet alive, even if only as a room of my own.
        </p>
        <p>
          I'm happiest in the half-hour after sunset, in a city I don't know yet,
          with a book I haven't started.
        </p>
        <dl className="facts">
          <dt>Now</dt>     <dd>Lisbon, mostly</dd>
          <dt>Reading</dt> <dd><em>The Information</em>, James Gleick</dd>
          <dt>Email</dt>   <dd><a>hi@arslan.land</a></dd>
          <dt>Elsewhere</dt><dd><a>are.na</a> · <a>rss</a> · <a>github</a></dd>
        </dl>
      </div>
    </section>
  );
}

window.About = About;
