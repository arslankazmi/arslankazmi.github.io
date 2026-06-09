// Sample data for the personal-site UI kit.

const ENTRIES = [
  {
    id: "reading-slowly",
    date: "Nov 2024",
    dateLong: "Nov 14, 2024",
    title: "On reading slowly, on purpose",
    blurb: "Why I stopped using a highlighter, and what I do instead.",
    tag: "notebook",
    read: "4 min",
    featured: false,
  },
  {
    id: "case-for-personal-site",
    date: "Oct 2024",
    dateLong: "Oct 02, 2024",
    title: "The case for a personal site",
    blurb: "One person, one URL, no platform. Still the best deal on the internet.",
    tag: "essay",
    read: "8 min",
    featured: true,
    lede: "I keep getting asked why I bother with a personal site in 2024. Here's the long answer, which is mostly an argument with myself.",
    body: [
      "The internet I grew up on was made of people. Not creators, not accounts — just people, with names, in rooms they made themselves. Most of those rooms are gone now. The platforms ate them. I keep wanting one back.",
      "So I made this. It's a single URL. It's mine. It will probably outlive any platform I currently use, because there's nothing to outlive: it's a folder of HTML files on a server I pay $5 a month for.",
      "There's no algorithm here. No engagement loop. No metrics on the page (though I peek at the logs, sometimes, the way you peek into a room you used to live in).",
      "A website should feel like a room someone lives in, not a storefront. That's the whole thesis. Everything else — the typography, the slightly off-kilter shadows, the magenta heart pin in the corner — is just consequence.",
    ],
    pull: "Make it weirder, and slightly slower.",
  },
  {
    id: "type-on-the-internet",
    date: "Sep 2024",
    dateLong: "Sep 18, 2024",
    title: "Type on the internet is mostly fine",
    blurb: "An overdue defense of variable fonts, system stacks, and not chasing the latest typeface.",
    tag: "design",
    read: "6 min",
    featured: false,
  },
  {
    id: "noise-floor",
    date: "Sep 2024",
    dateLong: "Sep 04, 2024",
    title: "Notes on the noise floor",
    blurb: "What I listen to when I want my room to feel a little smaller.",
    tag: "music",
    read: "3 min",
    featured: false,
  },
  {
    id: "small-tools",
    date: "Aug 2024",
    dateLong: "Aug 21, 2024",
    title: "Small tools, sharp edges",
    blurb: "In praise of software you outgrow on purpose.",
    tag: "code",
    read: "5 min",
    featured: false,
  },
  {
    id: "a-room-of-tabs",
    date: "Aug 2024",
    dateLong: "Aug 03, 2024",
    title: "A room of one's tabs",
    blurb: "On the tabs I keep open for months, and what they say about me.",
    tag: "notebook",
    read: "4 min",
    featured: false,
  },
];

const PROJECTS = [
  { id: "mixtape", kicker: "2024 — ongoing", title: "Mixtape Letters", blurb: "A monthly mixtape mailed (yes, mailed) to fourteen friends.", color: "t-blue" },
  { id: "paperdesk", kicker: "2023", title: "Paperdesk", blurb: "A writing app that hides itself when you stop typing.", color: "t-purple" },
  { id: "field-notes", kicker: "2024", title: "Field Notes Atlas", blurb: "Geo-tagged voice memos from a year of walking.", color: "t-green" },
  { id: "thrift-fonts", kicker: "2022", title: "Thrift Fonts", blurb: "Specimens of free typefaces I found and actually used.", color: "t-cream" },
  { id: "weeknotes", kicker: "2020 — 2023", title: "Weeknotes", blurb: "Three years of Friday-evening reflection, archived.", color: "t-lilac" },
  { id: "404-club", kicker: "evergreen", title: "404 Club", blurb: "A directory of beautifully broken websites.", color: "t-ink" },
];

const NOW_PLAYING = "Slowdive — Souvlaki Space Station";

window.AK = window.AK || {};
window.AK.ENTRIES = ENTRIES;
window.AK.PROJECTS = PROJECTS;
window.AK.NOW_PLAYING = NOW_PLAYING;
