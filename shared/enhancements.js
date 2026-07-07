/* enhancements.js — single source of truth for global, self-mounting post-enhancement scripts.
   Each entry `name` maps to shared/<name>.js (required) and shared/<name>.css (optional). These
   are plain vanilla-JS IIFEs, loaded deferred, that no-op unless their target markup is on the
   page — distinct from the .jsx component files, which are loaded via Babel in a fixed order and
   referenced by name from app.jsx.

   Consumed two ways: by scripts/build.mjs (Node, generates the static per-post page's tags at
   build time) and by shared/load-enhancements.js (browser, `<script type="module">`, injects the
   same tags at runtime into dev/index.html and personal/index.html). Add a name here once and
   both pick it up — no more hand-editing dev/index.html, personal/index.html, and build.mjs
   separately for each new one.

   Plain .js (not .mjs): scripts/build.mjs deletes every *.mjs file from the published _public/
   tree (that extension is this repo's convention for Node-only build logic), but this file must
   also be fetchable by the browser at runtime. package.json's "type": "module" means Node's ESM
   loader already treats .js as a module too, so one file serves both.
*/
export const ENHANCEMENTS = ["sidenotes", "previews", "ascii-asterisk"];
