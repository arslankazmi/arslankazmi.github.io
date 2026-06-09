/** Now-playing strip — click to play a live lofi stream.
    Prefers Henriko Magnifico → Nestalgia → Lofi Girl (a reliable 24/7 stream); falls back to a
    Lofi Girl archived video. Click-to-play (browsers block autoplay audio); live detection is
    best-effort via the IFrame player (error/timeout → next source). */
const { useState: useStateNP, useRef: useRefNP } = React;

const NP_SOURCES = [
  { id: "UCL5FK77d1MCeTtqEQMmmAnw", label: "Henriko Magnifico" },
  { id: "UCRZcKUM92AoailvwZVJa56g", label: "Nestalgia" },
  { id: "UCc5afI6TobiZjRke2sYBDPA", label: "Lofi Girl" },
];
const NP_ARCHIVE = "jfKfPfyJRdk"; // Lofi Girl — archived 24/7 stream (ultimate fallback)

function npLoadYT() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    if (!document.getElementById("yt-api")) {
      const s = document.createElement("script");
      s.id = "yt-api"; s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

function NowPlaying() {
  const [status, setStatus] = useStateNP("idle"); // idle | loading | playing
  const [label, setLabel] = useStateNP("press play");
  const player = useRefNP(null);
  const timer = useRefNP(null);

  function play(YT, i) {
    clearTimeout(timer.current);
    if (player.current) { try { player.current.destroy(); } catch (e) {} player.current = null; }
    const host = document.getElementById("np-host");
    const archive = i >= NP_SOURCES.length;
    setLabel(archive ? "Lofi Girl" : NP_SOURCES[i].label);

    const events = {
      onReady: (e) => { try { e.target.unMute(); e.target.setVolume(55); e.target.playVideo(); } catch (x) {} },
      onStateChange: (e) => { if (e.data === YT.PlayerState.PLAYING) { clearTimeout(timer.current); setStatus("playing"); } },
      onError: () => { if (!archive) play(YT, i + 1); },
    };

    if (archive) {
      host.innerHTML = '<div id="np-frame"></div>';
      player.current = new YT.Player("np-frame", { height: "1", width: "1", videoId: NP_ARCHIVE, playerVars: { autoplay: 1 }, events });
    } else {
      host.innerHTML = '<iframe id="np-frame" width="1" height="1" allow="autoplay" '
        + 'src="https://www.youtube.com/embed/live_stream?channel=' + NP_SOURCES[i].id + '&autoplay=1&enablejsapi=1"></iframe>';
      player.current = new YT.Player("np-frame", { events });
      // Not live (or events didn't bind) → move to the next source after a beat.
      timer.current = setTimeout(() => play(YT, i + 1), 6000);
    }
  }

  async function toggle() {
    if (status === "playing") { try { player.current && player.current.pauseVideo(); } catch (e) {} setStatus("idle"); return; }
    setStatus("loading");
    const YT = await npLoadYT();
    play(YT, 0);
  }

  return (
    <div className="now-strip">
      <span className={"pulse" + (status === "playing" ? "" : " off")}></span>
      <span className="lbl">Now playing</span>
      <button className="what np-btn" onClick={toggle}>
        {status === "playing" ? "❚❚ " : "▶ "}
        {status === "loading" ? "tuning in…" : label}
      </button>
      <span className="np-hint">lofi radio · live</span>
      <div id="np-host" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}></div>
    </div>
  );
}

window.NowPlaying = NowPlaying;
