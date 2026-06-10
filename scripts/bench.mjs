#!/usr/bin/env node
/* bench.mjs — build-performance microbenchmarks, to track speed over time and sanity-check against
   the Hugo/Jekyll mental model. Measures the compute that scales with content (index scan, markdown→
   HTML render throughput, esbuild bundling) separately from the one-off network snapshot. Run: `npm run bench`. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";
import markedFootnote from "marked-footnote";
import * as esbuild from "esbuild";
import { buildIndex } from "./build-index.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
marked.use(markedFootnote());

function ms(t) { return Number(process.hrtime.bigint() - t) / 1e6; }
const fmt = (n) => `${n.toFixed(n < 10 ? 2 : 0)} ms`;

// 1. Index scan + front-matter parse (pure, no network).
let t = process.hrtime.bigint();
const idx = buildIndex(REPO);
const idxMs = ms(t);
const realPosts = (idx.dev.length + idx.personal.length) || 1;

// 2. Markdown → HTML render throughput on a representative body.
const body = `# Heading\n\nSome **markdown** with a [link](https://example.com), \`code\`, and a footnote[^1].\n\n`.repeat(8)
  + "## Section\n\nMore prose, lists, and the occasional aside. ".repeat(30) + "\n\n[^1]: A footnote body.\n";
const N = 1000;
t = process.hrtime.bigint();
let outChars = 0;
for (let i = 0; i < N; i++) outChars += marked.parse(body).length;
const renderMs = ms(t);

// 3. esbuild bundling (the two browser globals IIFEs).
t = process.hrtime.bigint();
for (const side of ["dev", "personal"]) {
  await esbuild.build({ entryPoints: [join(REPO, side, "_globals.mjs")], bundle: true, format: "iife", minify: true, write: false });
}
const esbuildMs = ms(t);

const perPost = renderMs / N;
console.log(`\n  build benchmark (compute only — excludes the cached/network snapshot)\n`);
console.log(`  index scan (${realPosts} real posts)   ${fmt(idxMs)}`);
console.log(`  render throughput              ${fmt(renderMs)} for ${N} posts  →  ${perPost.toFixed(2)} ms/post`);
console.log(`  esbuild (2 bundles)            ${fmt(esbuildMs)}`);
console.log(`\n  projected render at scale:  100 posts ≈ ${fmt(perPost * 100)} · 1000 posts ≈ ${fmt(perPost * 1000)}`);
console.log(`  (ref: Hugo ≈ 1 ms/page, Jekyll ≈ 10–50 ms/page; our network snapshot is cached by default)\n`);
