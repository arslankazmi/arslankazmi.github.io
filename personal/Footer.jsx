/** Footer — small, mono, signed. */
function Footer() {
  return (
    <footer className="footer">
      <div>
        Written by hand · <a href="/acknowledgements/">acknowledgements</a>.<br/>
        © {new Date().getFullYear()} Arslan Kazmi · No cookies, no analytics, no rush.<br/>
        <span className="ai-note">AI may have been used to fix the code.</span>
      </div>
      <div className="sig">— A.K.</div>
    </footer>
  );
}

window.Footer = Footer;
