/** Layout A — Terminal hero. A faux shell session that introduces AK. */
function HeroTerminal() {
  return (
    <div className="term">
      <div className="bar">
        <i style={{ background: "#e07a4a" }}></i>
        <i style={{ background: "#d9a441" }}></i>
        <i style={{ background: "#58c89f" }}></i>
        <span>arslan@dev — zsh</span>
      </div>
      <div className="body">
        <div><span className="p">➜ ~</span> <span className="cmd">whoami</span></div>
        <div className="out">arslan kazmi — {window.DH.tagline.toLowerCase()}</div>
        <div style={{ height: 10 }}></div>
        <div><span className="p">➜ ~</span> <span className="cmd">cat now.txt</span></div>
        <div className="out">Shipping small tools, reading too many tabs,</div>
        <div className="out">and currently playing <span className="k">Metroid Prime 4</span>.</div>
        <div style={{ height: 10 }}></div>
        <div><span className="p">➜ ~</span> <span className="cmd">ls projects/</span> <span className="cursor"></span></div>
        <div className="scanlines"></div>
      </div>
    </div>
  );
}
window.HeroTerminal = HeroTerminal;
