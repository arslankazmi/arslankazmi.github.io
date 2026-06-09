// Sample content for the developer hub kit.

const DH = {
  handle: "arslan",
  tagline: "Programmer · data scientist · reader · player · maker",

  stats: [
    { ico: "◆ commits",  color: "var(--cerulean-300)", num: "2,481", cap: "this year" },
    { ico: "▤ books",    color: "var(--seagreen-300)", num: "37",    cap: "read in 2025" },
    { ico: "✦ projects", color: "var(--lavender-300)", num: "12",    cap: "shipped" },
    { ico: "♥ hours",    color: "var(--punk-lilac)", num: "309",   cap: "in-game" },
  ],

  repos: [
    { name: "arslan/paperdesk",    desc: "A writing app that hides its chrome when you stop typing.", tags: ["editor","tauri"],  lang: "TypeScript", langVar: "--lang-ts",   stars: "1.2k", forks: "84" },
    { name: "arslan/field-notes",  desc: "Geo-tagged voice memos from a year of walking, mapped.",    tags: ["data-viz","maps"], lang: "Python",     langVar: "--lang-py",   stars: "612",  forks: "37" },
    { name: "arslan/thrift-fonts", desc: "Specimens of free typefaces I found and actually used.",     tags: ["type","tools"],    lang: "CSS",        langVar: "--lang-css",  stars: "489",  forks: "21" },
    { name: "arslan/noise-floor",  desc: "A tiny ambient-sound mixer for focus sessions.",             tags: ["audio","web"],     lang: "JavaScript", langVar: "--lang-js",   stars: "204",  forks: "12" },
    { name: "arslan/save-state",   desc: "Backs up retro emulator saves to a git repo, nightly.",      tags: ["games","cli"],     lang: "Rust",       langVar: "--lang-rust", stars: "156",  forks: "9"  },
    { name: "arslan/weeknotes",    desc: "Three years of Friday reflection, statically generated.",    tags: ["writing","ssg"],   lang: "Go",         langVar: "--lang-go",   stars: "98",   forks: "5"  },
  ],

  commits: [12, 31, 22, 48, 39, 55, 41, 63, 50, 72, 44, 58],
  months:  ["J","F","M","A","M","J","J","A","S","O","N","D"],

  languages: [
    { lbl: "Python",     val: 38, color: "var(--viz-2)" },
    { lbl: "TypeScript", val: 27, color: "var(--viz-1)" },
    { lbl: "Rust",       val: 18, color: "var(--viz-7)" },
    { lbl: "Other",      val: 17, color: "var(--viz-8)" },
  ],

  books: [
    { ti: "The Information",      au: "James Gleick",      spine: "var(--cerulean-500)" },
    { ti: "Pattern Recognition", au: "William Gibson",    spine: "var(--purple-500)"   },
    { ti: "Thinking in Systems", au: "Donella Meadows",   spine: "var(--seagreen-500)" },
  ],

  game: { ti: "Tunic", meta: "Switch · 41 hrs · 100%" },
};

window.DH = DH;
