/** Terminal hero — a faux shell session that introduces AK, skinned as a random OS each load
    (macOS · Windows 95/XP/7/10 · GNOME 2/3 · Ubuntu). Click the title bar for the hidden
    OS selector. */
const { useState: useStateHT } = React;

const HT_OSES = [
  { id: "macos",  label: "macOS",            title: "arslan@dev — zsh",    prompt: "➜  ~",      cat: "cat",  ls: "ls projects/" },
  { id: "win95",  label: "Windows 95",       title: "MS-DOS Prompt",       prompt: "C:\\>",          cat: "type", ls: "dir projects" },
  { id: "winxp",  label: "Windows XP",       title: "Command Prompt",      prompt: "C:\\>",          cat: "type", ls: "dir projects" },
  { id: "win7",   label: "Windows 7",        title: "Command Prompt",      prompt: "C:\\>",          cat: "type", ls: "dir projects" },
  { id: "win10",  label: "Windows 10",       title: "Windows PowerShell",  prompt: "PS C:\\>",       cat: "type", ls: "dir projects" },
  { id: "gnome2", label: "GNOME 2",          title: "arslan@dev: ~",       prompt: "arslan@dev:~$",  cat: "cat",  ls: "ls projects/" },
  { id: "gnome3", label: "GNOME 3",          title: "Terminal",            prompt: "arslan@dev:~$",  cat: "cat",  ls: "ls projects/" },
  { id: "ubuntu", label: "Ubuntu",           title: "arslan@dev: ~",       prompt: "arslan@dev:~$",  cat: "cat",  ls: "ls projects/" },
];

function HeroTerminal() {
  const [idx, setIdx] = useStateHT(() => Math.floor(Math.random() * HT_OSES.length));
  const [menu, setMenu] = useStateHT(false);
  const os = HT_OSES[idx];

  return (
    <div className="term" data-os={os.id}>
      <div className="bar" onClick={() => setMenu(m => !m)}>
        <span className="dots"><i></i><i></i><i></i></span>
        <span className="ttl">{os.title}</span>
        <span className="caption"><b className="min">{"–"}</b><b className="max">{"□"}</b><b className="close">{"×"}</b></span>
        {menu && (
          <div className="os-menu" onClick={(e) => e.stopPropagation()}>
            {HT_OSES.map((o, i) => (
              <button key={o.id} className={i === idx ? "on" : ""} onClick={() => { setIdx(i); setMenu(false); }}>{o.label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="body">
        <div className="line"><span className="p">{os.prompt}</span> <span className="cmd">whoami</span></div>
        <div className="out">arslan kazmi — {window.DH.tagline.toLowerCase()}</div>
        <div className="gap"></div>
        <div className="line"><span className="p">{os.prompt}</span> <span className="cmd">{os.cat} now.txt</span></div>
        <div className="out">Shipping small tools, reading too many tabs,</div>
        <div className="out">and currently playing <span className="k">Metroid Prime 4</span>.</div>
        <div className="gap"></div>
        <div className="line"><span className="p">{os.prompt}</span> <span className="cmd">{os.ls}</span> <span className="cursor"></span></div>
        <div className="scanlines"></div>
      </div>
    </div>
  );
}
window.HeroTerminal = HeroTerminal;
