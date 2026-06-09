/** Footer — small, mono, signed. */
function Footer() {
  return (
    <footer className="footer">
      <div>
        Made by hand, in a browser, with too much coffee.<br/>
        © {new Date().getFullYear()} Arslan Kazmi · No cookies, no analytics, no rush.
      </div>
      <div className="sig">— A.K.</div>
    </footer>
  );
}

window.Footer = Footer;
