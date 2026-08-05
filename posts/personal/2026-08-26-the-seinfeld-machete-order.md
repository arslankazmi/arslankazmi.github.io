---
title: The Seinfeld Machete Order
date: 2026-08-26
tags: [tv, math, notebook]
blurb: A viewing order for a long sitcom — start from both ends and work toward the middle.
read: 2 min
featured: false
publish: 2026-08-26
---

I've been re-watching Seinfeld in a certain order. If the episode number is *i*, and there are *n* episodes, I watch in this order:

1, n, 2, n−1, 3, n−2, …

Or in other words, I watch from both ends and go towards the middle: first episode first, then the finale, then the second episode, then the second-last episode, and so on.

You can also think of this sequence like so: 1st, last, 2nd, 2nd-last, 3rd, 3rd-last, and so on and so forth.

Mathematically, this sequence can be written as follows. For the k-th episode I watch (with positions k = 1, 2, 3, …):

- when k is odd:  ⌈k / 2⌉  — giving 1, 2, 3, …
- when k is even:  n + 1 − k / 2  — giving n, n−1, n−2, …

So the two halves of the run interleave, and meet in the middle.

[^when]: First notes on this were written on 10 July 2025.
