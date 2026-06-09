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
        <h1>The author, briefly.</h1>
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
          <dt>Now</dt>   <dd>nowhere</dd>
          <dt>Email</dt> <dd><a href="mailto:akazmi.public@gmail.com">akazmi.public@gmail.com</a></dd>
        </dl>
      </div>
    </section>
  );
}

window.About = About;
