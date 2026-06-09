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

  // Pinned repos are fetched at runtime from the portfolio's curated projects.json (see app.jsx).
  repos: [
  ],

  commits: [12, 31, 22, 48, 39, 55, 41, 63, 50, 72, 44, 58],
  months:  ["J","F","M","A","M","J","J","A","S","O","N","D"],

  languages: [
    { lbl: "Python",     val: 38, color: "var(--viz-2)" },
    { lbl: "TypeScript", val: 27, color: "var(--viz-1)" },
    { lbl: "Rust",       val: 18, color: "var(--viz-7)" },
    { lbl: "Other",      val: 17, color: "var(--viz-8)" },
  ],

  // Manually maintained — what's on the nightstand right now.
  books: [
    { ti: "The Wee Free Men", au: "Terry Pratchett · re-reading", spine: "var(--seagreen-500)" },
  ],

  // Manually maintained — edit as your rotation changes.
  games: {
    now:   { ti: "Metroid Prime 4", meta: "now playing", art: "../assets/metroid-prime.png" },
    next:  "Subnautica 2",
    again: "Slay the Spire 2",
  },
};

window.DH = DH;
