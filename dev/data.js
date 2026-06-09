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
  // Reading & playing data now lives in shared/reading-data.js (window.RP), shared with the personal side.
};

window.DH = DH;
