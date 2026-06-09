---
title: The fifty-megabyte buffer
date: 2026-05-30
tags: [node, war-story]
blurb: A debugging story about why git-scrub's timeline came back empty on big repos.
read: 4 min
---

GitScrub shells out to the real `git` CLI for everything — `log`, `show`, `ls-tree`,
`cat-file`. On my own repos it was instant. On a big one, the timeline came back
**empty**, with no error.

## The quiet truncation

Node's `child_process.execFile` has a default `maxBuffer` of 1 MB. When `git log`
streamed more than that, Node killed the child and handed back a truncated buffer — and
because I was parsing line-delimited output, a truncated blob just parsed to *nothing*.
No throw, no warning. The worst kind of bug: silent and data-dependent.

```js
// before — works until a repo's history is larger than 1 MB of output
execFile("git", args, { cwd }, cb);

// after — give git room to breathe
execFile("git", args, { cwd, maxBuffer: 50 * 1024 * 1024 }, cb);
```

## The lesson

Any time you shell out, the output size is **adversarial** — it scales with someone
else's data, not yours. Either set a generous `maxBuffer`, or stream and parse
incrementally. "It works on my repo" is the unit test that lies to you.
