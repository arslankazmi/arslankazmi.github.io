/** Now-playing strip — sits under the top nav. */
function NowPlaying({ track }) {
  return (
    <div className="now-strip">
      <span className="pulse"></span>
      <span className="lbl">Now playing</span>
      <span className="what">{track}</span>
    </div>
  );
}

window.NowPlaying = NowPlaying;
