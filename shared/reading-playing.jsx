/** Shared "Reading & playing" card — books shelf + now-playing game.
    Reads window.RP (shared/reading-data.js); token-driven, so it adapts to dark + paper. */
function ReadingPlaying() {
  const RP = window.RP || {};
  const books = RP.books || [];
  const games = RP.games || {};
  const now = games.now || { ti: "—", meta: "" };
  return (
    <div className="rp-two">
      <div className="rp-shelf">
        {books.map(b => (
          <div className="rp-book" key={b.ti}>
            <span className="spine" style={{ background: b.spine }}></span>
            <div>
              <p className="ti">{b.ti}</p>
              <span className="au">{b.au}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="rp-now">
        <span className="label">Now playing</span>
        <div className="game">
          {now.art ? <img className="art" src={now.art} alt="" /> : <span className="art"></span>}
          <div>
            <div className="ti">{now.ti}</div>
            <div className="meta">{now.meta}</div>
          </div>
        </div>
        {(games.next || games.again) && (
          <div className="rp-queue">
            {games.next && <span><b>up next</b> · {games.next}</span>}
            {games.again && <span><b>replaying</b> · {games.again}</span>}
          </div>
        )}
        <img className="heart" src="../assets/heart-pin.svg" alt="loved" style={{ alignSelf: "flex-start" }} />
      </div>
    </div>
  );
}
window.ReadingPlaying = ReadingPlaying;
