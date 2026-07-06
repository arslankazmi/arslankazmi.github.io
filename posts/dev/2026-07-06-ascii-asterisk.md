---
title: A spinning ASCII asterisk, no dependencies
date: 2026-07-06
tags: [javascript, ascii-art, animation, graphics]
blurb: A from-scratch 3D renderer — rotation matrices, perspective, a z-buffer, luminance shading — pointed at a six-point starburst and drawn entirely in text characters.
read: 5 min
featured: true
---

Claude's mark is a six-point asterisk. It seemed like a good excuse to revisit a very old trick — [Andy Sloane's spinning ASCII donut](https://www.a1k0n.net/2011/07/20/donut-math.html)[^donut] — and point the same machinery at a different shape: no torus, no canvas, no WebGL, no Three.js. Just a `<pre>` tag and a loop that rewrites its text sixty-ish times a second.

<div class="ascii-asterisk" data-ascii-asterisk aria-hidden="true">
<pre>
                                          :...
                                        :....
                     ...              ::.....
                     .....           ::.@ ...
                     ...+...        :..@.. .
                     ....+...      :%.@ .+..
                      ..+..+..    :%.@..+.
                       ..+..+..   :.@....
                         ....... :.@...        **.** *
                           ..... .....  ...*... .%%..%..%.. .
                ...*.....** ............... ... .. +++..+....
            ..........%................... ... ... ......
         .......+++.+........:......  .............
          ...............  ::... ......
                          :..... ...+...
                        ::...+.   .+.++...
                      ::..@.. .    .+..+....
                     ::..@.. .     ..+..++...
                     : .  . .       ..+ .++.:.
                    :.. ....         ...+..+..
                    :. ....            ....++..
                   :.@...                ......
                   :...                    . ..
                   ..                         .
</pre>
</div>

The shape is a point cloud, not a bitmap: six tapered lens-shaped "spikes" built parametrically around the origin, thick at mid-shaft and pointed at both ends, arranged sixty degrees apart so they read as an asterisk face-on. Each point carries an analytic surface normal along with its position — that's what makes the shading possible.[^why-normals]

Every frame, the whole cloud gets rotated with a couple of composed rotation matrices (one turn around Y, a slower wobble around X), perspective-projected down to two dimensions, and rasterized onto a fixed character grid. A z-buffer tracks the closest point claiming each cell, so the near spikes correctly occlude the far ones as it tumbles. Whatever survives gets shaded by the dot product of its normal against a fixed light direction, mapped onto a density ramp — `" .:-=+*#%@"`, sparse to dense — the same idea behind the donut's luminance-to-character mapping, just walked across a different surface.

The one wrinkle worth a footnote: this page has two different rendering paths — a rich single-page view and a plain static one — and only one of them executes `<script>` tags embedded in post content.[^spa] So the renderer doesn't live inline in this post at all. It's a small global script, loaded once site-wide, that watches the page for a `<div data-ascii-asterisk>` and mounts into whatever one shows up, however it got there.

It also gets out of the way when asked to: `prefers-reduced-motion` gets a single static frame instead of a loop, and with JavaScript off entirely, the frame above — baked into this very page as plain text — is all you get. No blank box, no missing demo. Just an asterisk that happens not to be spinning.

[^donut]: The original — a 15-line C program that spins a torus using sines, cosines, and a fixed light source — is one of the great pieces of terminal ephemera. This is the same core idea (project, z-buffer, shade by normal), rebuilt in JS for a different mesh.
[^why-normals]: Depth alone isn't enough to shade a rotating solid convincingly — two points at the same distance from the camera can face wildly different directions. The normal is what lets the light direction actually mean something as the shape turns.
[^spa]: The single-page view injects article HTML via `dangerouslySetInnerHTML`; browsers never execute `<script>` elements set that way, by design. The static per-post page parses the same markup as a real document, where scripts run normally. Keeping the renderer external and DOM-driven — watch for the container, mount into it — sidesteps the discrepancy instead of fighting it.
