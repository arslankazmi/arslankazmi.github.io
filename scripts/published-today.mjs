#!/usr/bin/env node
/* ============================================================
   published-today.mjs — report posts whose `publish:` date is TODAY.

   Scheduled publishing is build-time (see build-index.mjs): a post with a
   `publish: YYYY-MM-DD` field simply appears once a build runs on/after that
   date — nothing edits the file. This script doesn't publish anything; it just
   answers "which posts go live *today*?" so the schedule-publish workflow can
   (a) open a cartoon-reminder issue for each and (b) decide to dispatch a
   deploy. It intentionally matches `publish == today` (not `<= today`) so each
   post triggers its reminder exactly once, on its day.

   Prints a JSON array of { side, slug, title, path, date } to stdout and writes
   the same to `published.json`. Empty array => nothing due today (no-op).

   No dependencies (Node 18+). Run: `node scripts/published-today.mjs`
   Override today for tests: `PUBLISH_TODAY=2026-08-05 node scripts/published-today.mjs`
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFront } from "./build-index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const SIDES = ["dev", "personal"];

const TODAY = (process.env.PUBLISH_TODAY || new Date().toISOString().slice(0, 10)).trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) {
  console.error(`published-today: bad today "${TODAY}" (want YYYY-MM-DD)`);
  process.exit(1);
}

const dueToday = [];
for (const side of SIDES) {
  const dir = join(REPO, "posts", side);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const fm = parseFront(readFileSync(join(dir, file), "utf8"));
    if (fm.draft === "true") continue; // still being written — not scheduled
    if (fm.publish !== TODAY) continue; // only posts whose day is today
    dueToday.push({
      side,
      slug: file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
      title: fm.title || file,
      path: `posts/${side}/${file}`,
      date: fm.publish,
    });
    console.error(`due today: ${side}/${file} (publish ${fm.publish})`);
  }
}

writeFileSync(join(REPO, "published.json"), JSON.stringify(dueToday, null, 2) + "\n");
process.stdout.write(JSON.stringify(dueToday));
console.error(`\npublished-today: ${dueToday.length} post(s) go live on ${TODAY}`);
