/* load-enhancements.js — runtime loader for the shared/enhancements.js manifest.
   Native ES module (no bundler): resolves each entry's .css/.js relative to this file's own URL
   (not the including page's), so it works from any page depth. Include once with
   `<script type="module" src=".../shared/load-enhancements.js"></script>`.
*/
import { ENHANCEMENTS } from "./enhancements.js";

const base = new URL(".", import.meta.url);
for (const name of ENHANCEMENTS) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL(`${name}.css`, base).href;
  document.head.appendChild(link);

  const script = document.createElement("script");
  script.src = new URL(`${name}.js`, base).href;
  script.defer = true;
  document.head.appendChild(script);
}
