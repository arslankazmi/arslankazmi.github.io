---
title: Small tools, sharp edges
date: 2026-06-07
tags: [tools, philosophy]
blurb: In praise of software you outgrow on purpose.
read: 5 min
---

I keep a folder of tools I wrote in an afternoon and used for a year. None of them
are products. Most are one file. All of them have exactly one sharp edge — the thing
they do well — and no guard rails around it.

## The case against the platform

A platform wants to be everything, so it ends up being nothing in particular. A small
tool picks a fight with one problem and wins. When the problem changes, you throw the
tool away. That's not failure; that's the tool doing its job and then getting out of
the way.

```python
# the whole "app": resize every image in a folder, in place
from PIL import Image
import sys, pathlib
for p in pathlib.Path(sys.argv[1]).glob("*.png"):
    im = Image.open(p)
    im.thumbnail((1600, 1600))
    im.save(p)
```

That's it. No config, no flags, no plugin system. If I need it to do something else
next week, I'll write next week's version next week.

## Outgrowing on purpose

The trick is to build for the version of you that exists today, not the imagined power
user you might become. You almost never become them. And if you do, you'll know exactly
what to build, because you'll have a year of using the small thing to tell you.
