// Shared "Reading & playing" data — books + games. Loaded by both /dev/ and /personal/.
// Manually maintained. `../assets/…` resolves from either side.
window.RP = {
  books: [
    { ti: "The Wee Free Men", au: "Terry Pratchett · re-reading", spine: "var(--seagreen-500)" },
  ],
  games: {
    now:   { ti: "Metroid Prime 4", meta: "now playing", art: "../assets/metroid-prime.png" },
    next:  "Subnautica 2",
    again: "Slay the Spire 2",
  },
};
