#!/usr/bin/env node
/* ============================================================
   publish-scheduled.mjs — flip scheduled drafts live on their date.

   A post is eligible for auto-publish only if its front-matter has BOTH:
     draft: true
     publish: YYYY-MM-DD        (opt-in — the ONLY signal that dates it)
   The `date:` field is NOT trusted as the publish date (drafts carry stale
   or placeholder dates). When `publish` <= today (UTC), this script:
     - removes the `draft: true` line,
     - sets `date:` to the `publish` value (post dates to its real go-live day),
     - leaves `publish:` in place as an audit trail (the build ignores it).

   It writes the list of newly-published posts to `published.json` and prints
   the same JSON to stdout, so the CI workflow can open a reminder issue per
   post and decide whether to commit + deploy. Nothing due => empty list, no
   file changes (idempotent no-op).

   No dependencies (Node 18+). Run: `node scripts/publish-scheduled.mjs`
   Override "today" for testing: `PUBLISH_TODAY=2026-08-05 node scripts/publish-scheduled.mjs`
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFront } from "./build-index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const SIDES = ["dev", "personal"];

// Today as YYYY-MM-DD in UTC (overridable for tests). Date-only string compare
// is safe because all values are zero-padded ISO calendar dates.
const TODAY = (process.env.PUBLISH_TODAY || new Date().toISOString().slice(0, 10)).trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) {
  console.error(`publish-scheduled: bad today "${TODAY}" (want YYYY-MM-DD)`);
  process.exit(1);
}

const published = [];

for (const side of SIDES) {
  const dir = join(REPO, "posts", side);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const path = join(dir, file);
    const raw = readFileSync(path, "utf8");
    const fm = parseFront(raw);

    // Eligible only when opted in (publish:), still a draft, and due.
    if (fm.draft !== "true") continue;
    if (!fm.publish || !/^\d{4}-\d{2}-\d{2}$/.test(fm.publish)) continue;
    if (fm.publish > TODAY) continue;

    // Flip: drop the draft line, retarget date: to the publish date. Operate on
    // the front-matter block only so body content is never touched.
    const fmEnd = raw.indexOf("\n---", 3); // end of the opening `---\n...` block
    const head = raw.slice(0, fmEnd);
    const body = raw.slice(fmEnd);

    const newHead = head
      .split("\n")
      .filter((line) => !/^\s*draft\s*:\s*true\s*$/.test(line))
      .map((line) =>
        /^\s*date\s*:/.test(line) ? line.replace(/:.*$/, `: ${fm.publish}`) : line
      )
      .join("\n");

    writeFileSync(path, newHead + body);
    published.push({
      side,
      slug: file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
      title: fm.title || file,
      path: `posts/${side}/${file}`,
      date: fm.publish,
    });
    console.error(`published: ${side}/${file} (publish ${fm.publish} <= ${TODAY})`);
  }
}

writeFileSync(join(REPO, "published.json"), JSON.stringify(published, null, 2) + "\n");
process.stdout.write(JSON.stringify(published));
console.error(`\npublish-scheduled: ${published.length} post(s) published on ${TODAY}`);
