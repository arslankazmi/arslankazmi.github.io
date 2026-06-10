---
title: Sidenotes, previews, and other quiet machinery
date: 2026-06-10
tags: [meta, web, typography]
blurb: A demo post wiring up margin sidenotes and hover previews — and a note on why both degrade to plain text.
read: 4 min
featured: true
---

This post exists to exercise the reading machinery: margin **sidenotes**, hover **previews**, and embedded images. None of it is required to read the words — that's the whole point.[^why]

Sidenotes are the good kind of footnote. On a wide screen the note floats into the margin next to its reference, so you can read it without losing your place.[^tufte] On a narrow screen, or with JavaScript off, the same note simply appears at the bottom as an ordinary footnote.[^degrade]

Hover previews are compiled at build time, not fetched live. A link to [the Wikipedia article on hypertext](https://en.wikipedia.org/wiki/Hypertext) carries a small card; so does a paper like [Attention Is All You Need](https://arxiv.org/abs/1706.03762). Internal links — say, [the quiet demo on the other side](/personal/p/a-quiet-demo/) — pull their card straight from the post index.

Images work too, and zoom on hover:

![The Metroid Prime logo](/assets/metroid-prime.png)

That's the whole demo. Delete this file whenever real posts arrive.

[^why]: Progressive enhancement: the page is readable first, and the niceties layer on top only where the browser and viewport allow.
[^tufte]: The pattern is Edward Tufte's, popularized in Tufte-CSS and adapted by gwern.net.
[^degrade]: This footnote is proof — resize the window narrow (or disable JS) and watch it slide back to the bottom of the article.
