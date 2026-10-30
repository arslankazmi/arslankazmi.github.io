# Snow Globe — design

A cel-shaded 3D snow globe holding a tiny town. The town grows through the ages of the world, from a
few huts to a modern city. Then a blizzard whites out the glass, and when it clears a different
civilisation in a different part of the world starts over. It never ends, and no two runs are alike.

It is an **ambient desk toy first**: it plays by itself and is pleasant to leave open. It is also a
**toy you can poke**: spin it, shake it, speed up time, tap things.

**From the author:** a 3D cel-shaded snow globe; a tiny simulated town progressing through
civilisation ages (Age of Empires / Empire Earth style); cute, with a Professor Layton-like look;
weather cycles; continuously and randomly cycling through civilisations and regions of the world;
procedurally generated animation and progression; both ambient and interactive; the
blizzard-reset-to-a-new-region loop.

**Builder's calls**, which the author approved as a summary: the age list, the cycle length, the
interactions, and the tech. Everything else not listed under "from the author" is also the builder's
call.

Lives at `/fun/snowglobe/`, a sibling of Tritris, GD Golf and Ninja Ascent.

## Goals / non-goals / anti-goals

* **Goals:** charming at a glance; a full age arc you can watch in one sitting; regions that feel
  distinct; weather you notice; smooth on a laptop and acceptable on a phone.
* **Non-goals:** a playable strategy game (no resources to manage, no win state), historical
  accuracy beyond a recognisable flavour, sound design beyond a little ambience.
* **Anti-goals:** anything that looks like generic low-poly stock art, or a copy of Layton itself
  (no Layton characters, logos, fonts or screenshots; it should be in the spirit only). A town that
  looks the same every cycle. A page that cooks the laptop's fans.

## 1. Tech

* One static page, no build step: `index.html`, `main.js` (scene, render, weather, input, HUD),
  `models.js` (procedural geometry for buildings, landmarks, trees, people, boats), `sim.js` (pure,
  seeded town simulation with no three.js or DOM, so Node can test it) and `test.mjs` (Node tests,
  pruned from the build like the other games).
* **three.js** `0.160.0` from `cdn.jsdelivr.net/npm/` via an import map (`three` plus
  `three/addons/`). That is the only dependency.
* All geometry is made in code from primitives (boxes, cylinders, cones, spheres, lathes), merged per
  building to keep draw calls low. There are no model or texture files; the paper grain and gradients
  are small canvas textures generated at load.
* Seeded RNG (mulberry32). The seed for each cycle comes from a master seed in `#seed=`, so a link can
  reproduce a run.

## 2. The look

* **Cel shading:** `MeshToonMaterial` with a 3-step gradient map, plus inverted-hull outlines
  (back-face, slightly scaled, dark warm brown, not black) on buildings and people.
* **Palette:** a warm storybook palette of sepia, cream, mossy green, dusty blue, brick red and
  mustard. Each region adds two or three accent colours. Night shifts to indigo with warm window glow.
* **Shapes:** chunky and rounded, with buildings slightly tilted or leaning (a random ±4° lean and
  wobble in proportions). Roofs are oversized. Chimneys smoke.
* **Townsfolk:** big round heads, small bodies, stick legs, a hat or hairdo per age/region. They walk
  between buildings on a bobbing gait, and in later ages small carts, then cars, run along the roads.
* **The globe** (revised at the author's request): real glass, a refractive `MeshPhysicalMaterial`
  (transmission, IOR 1.46, clear coat) that reflects a small made-to-measure room (a tall window
  up-left, a strip light right) through its own environment map. Only the glass sees that map, so
  everything inside stays toon-shaded. A paper backdrop behind the scene gives the rim something
  warm to refract. The glass sits on a carved wooden base with a small brass plaque. The plaque shows the current place and
  age, in a serif display font, for example "Nile Valley · Bronze Age". A soft sepia vignette and a
  faint paper-grain overlay frame the page.

## 3. The cycle

* **Length:** about **5½ minutes** per full arc at 1× speed (eight ages of 42 s plus the blizzard),
  with each transition taking a few seconds.
* **Ages (8):** Stone → Bronze → Iron → Medieval → Renaissance → Industrial → Modern → **Space Age
  (c. 2200)**, added at the author's request. The Space Age builds pod homes, glass greenhouse domes,
  sky-garden towers and glowing spires, with landmarks per region: a rocket launch pad (rockets
  launch about three times an age and exit through the top of the glass), a space elevator whose
  cable rises to just under the glass, a terraced arcology and a spinning ring habitat. Hover cars
  circle the town, an orbital station and satellites cross the sky, roads get glowing lanes and
  townsfolk wear bubble helmets.
* **Regions (12), each a real place per age** (revised at the author's request so the buildings match
  the place and period). The plaque shows the place, with the region under it. Every landmark is
  that place's own, named on tap:

  | Region | Places by age (Stone → Space) | Signature landmarks |
  |---|---|---|
  | Nile Valley | Nabta Playa, Giza, Thebes, Cairo… | Nabta Playa stone circle, Great Pyramid, Karnak pylon and obelisk, al-Azhar, the Citadel, Cairo Tower |
  | Mesopotamia | Göbekli Tepe, Ur, Babylon, Baghdad… | T-pillar circle, Ziggurat of Ur, Ishtar Gate, spiral minaret, gold-domed shrine, Baghdad Tower |
  | Yellow River | Banpo, Erlitou, Luoyang, Lin'an, Beijing, Shanghai… | pottery kiln, palace hall, city gate, Six Harmonies Pagoda, Ming hall and Gate of Heavenly Peace, Custom House, Oriental Pearl Tower |
  | Japan | Jōmon village, Sannai-Maruyama, Yoshinogari, Kyoto, Osaka, Tokyo… | stone circle, six-pillar watchtower, raised storehouse, five-storey pagoda and shrine, Osaka Castle, brick station, Tokyo Skytree, the Metropolitan Government twin towers, Tokyo Tower |
  | Manhattan | Lenapehoking, New Amsterdam (c. 1650), New York… | Lenape longhouse and wigwams, Fort Amsterdam and the windmill, Statue of Liberty and Grand Central, Empire State and Chrysler buildings |
  | Norse Fjord | (the fjord), Bergen…, Andøya | dolmen, longhouses, stave church, Bergenhus and the cathedral, lighthouse and cannery, concert hall, Andøya launch pad |
  | Maya Lowlands | the Yucatán, El Mirador, Chichén Itzá, Mérida, Cancún… | La Danta, El Castillo, El Caracol and the Great Ballcourt, Mérida Cathedral, henequen mill, beach hotel |
  | Valley of Mexico (Aztec) | lakeshore, Cuicuilco, Tula (c. 1150), Tenochtitlan (c. 1500), Mexico City… | Cuicuilco's round pyramid, the Atlantes of Tula, the Templo Mayor and tlachtli court, Metropolitan Cathedral, Torre Latinoamericana, Estadio Azteca |
  | Mediterranean | Ġgantija, Knossos, Athens, Venice, Florence, Naples, Barcelona | megalithic temple, palace of Knossos, temple of Athena and theatre, St Mark's (five domes) and campanile, the Duomo and Giotto's campanile, Sagrada Família, Camp Nou |
  | Indus Valley | Mehrgarh, Mohenjo-daro, Taxila, Multan… | Great Bath and granary, Dharmarajika stupa, Shah Rukn-e-Alam, Multan Fort, Ghanta Ghar, the cricket stadium |
  | Punjab | Ravi plains, Harappa, Sakala, Lahore… | Harappan granary, stupa, Lahore Fort and Badshahi Mosque, Lahore Junction, GC clock tower, Minar-e-Pakistan |
  | Ganges Plain | Ganges plain, Pataliputra, Varanasi, Agra, Kolkata… | Ashoka pillar and stupa, Kashi Vishwanath, Agra Fort and the marble mausoleum, Howrah station, jute mill, Eden Gardens |

  Ages with nothing monumental to show (the Stone and Bronze Age Ganges plain, Mehrgarh, early
  Mesoamerica) build no landmark rather than borrow another culture's. House styles follow the
  period too: no domes in pharaonic Egypt or Gandhara, flat roofs in Cairo and Kolkata, low-rise
  painted gables in Bergen, Chinese hip roofs versus Japanese thatch and machiya. The Space Age is
  shared future architecture.
  A region may shift an age's date to when its place really flourished (`years`: New Amsterdam
  c. 1650, Tula c. 1150, Tenochtitlan c. 1500). Tenochtitlan is an island city in a lake joined by
  causeways (terrain `lake`), and keeps lots clear in its sacred precinct (`reserve`) so the Templo
  Mayor and the others have room. The Maya lowlands have no rivers but cenotes (terrain `cenote`).
  **Big-city centres** (`dense`: Tokyo, New York) build about a third more, mostly 6–14-floor
  towers on smaller lots from the Industrial age on. Tokyo's are themed: curtain glass with
  helipads and red aviation lights, Shinjuku-style stepped crowns, the Cocoon Tower and billboard
  buildings. New York's are Art Deco setbacks, with brownstones carrying rooftop water tanks.
  Their weather has monsoons in South Asia, winter fog in Punjab and the Ganges plain, and no snow
  in the Nile, South Asia or Mesoamerica.
* **Terrain** depends on the region and is generated from noise inside the globe's disc: a river
  (Nile, Mesopotamia), a coastline (Norse, Mediterranean), terraced hills (East Asia) or jungle
  (Mesoamerica).
* **Order:** the next region is picked at random but never repeats the last two, so it doesn't feel
  like the same thing back to back.
* **Reset:** at the end of the Space Age, snow thickens into a whiteout for about 4 s. Behind it the town is
  rebuilt, then the snow settles and a new region begins at the Stone Age.

## 4. The town simulation (`sim.js`)

* **Growth is procedural:** a settlement starts as a few huts around a central point (a well, a fire
  or a shrine). Roads grow outward as a branching network. Building plots are chosen along the roads,
  away from water and steep terrain, with denser cores and sparser edges.
* **Each age** sets a target population and a building mix. The sim adds buildings over the age,
  upgrades some old ones in place (a hut becomes a house), and adds one or two **landmarks** per age
  (a temple, a castle, a cathedral, a factory chimney, a tower).
* **Construction is animated:** new buildings rise out of the ground with scaffolding and a
  squash-and-stretch pop. Replaced buildings shrink away. Fields, walls and trees appear and vanish as
  the town grows.
* **Townsfolk** are a crowd sized to the population. Each walks between random plots along the road
  graph, and their look switches with the age.
* **Small random events,** a few per age: a festival with bunting and fireworks at night, a harvest,
  a small fire put out by a bucket line, a market day, or a ship arriving in coastal regions. They are
  only decoration, but they make it feel alive.
* The sim is **deterministic** for a seed, and stepped on a fixed clock separate from rendering, so
  speeding up time does not change what happens, only how fast.

## 5. Weather and time

* **Day and night:** about 60 s per day at 1×. The sun and moon arc, the sky gradient inside the globe
  changes, and windows light up at dusk.
* **Seasons:** about four per age. They tint the grass and trees, and change the trees' leaves
  (blossom in spring, bare in winter).
* **Weather states:** clear, cloudy, rain, snow, fog, and in some regions a storm or sandstorm. They
  change on a random timer weighted by season and region (the Nile rarely snows). Precipitation is a
  particle system clipped to the globe interior. Snow builds a white layer on roofs and ground in
  winter and melts in spring.
* Weather and time never pause the growth; they're the backdrop.

## 6. Interaction

* **Drag** (mouse or touch) to spin the globe around its vertical axis, with inertia. It slowly
  auto-rotates when left alone. The wooden base and its plaque stay facing you; the glass and
  everything inside turn.
* **Shake:** a quick back-and-forth drag, a button, or `S` shakes the globe. The base wobbles and a
  big snow flurry swirls and settles, no matter the region or season.
* **Time:** pause, 1×, 4× and 16× buttons (keys `Space`, `1`–`3`). A "next age" button skips ahead.
* **Tap** a building or a person to show a small speech-bubble label (e.g. "Granary", "Blacksmith",
  "a farmer on her way home").
* **Scroll / pinch** zooms the camera in and out within limits.
* **Full screen** (`F` or the ⛶ button) uses the Fullscreen API on the globe and its controls, and
  falls back to a fixed full-window overlay where the API is missing (iPhone Safari). `Esc` exits.
* `#seed=N` reproduces a run; `#region=indus` (any region id) picks the first town's region.
* **Mute** (`M`) toggles a soft ambient layer: wind, rain or crowd murmur, synthesised with WebAudio
  like the other games. It starts muted.

## 7. Performance

* Target 60 fps on a laptop and 30+ on a recent phone.
* Merge geometry per building, instance the townsfolk and trees, cap the pixel ratio at 2, and
  keep total buildings under 150. In practice a Modern town settles at about 45–60 houses plus up
  to four landmarks (house targets per age: 7, 14, 24, 34, 44, 54, 62); later ages build taller
  rather than wider.
* Pause rendering when the tab is hidden.
* Respect `prefers-reduced-motion` by slowing the auto-rotation and toning down the shake.

## 8. Page and credits

* The page chrome uses the personal/paper theme, like the other games (title, `← Fun` link, a short
  "what you're looking at" card and controls).
* Add a tile on `fun/index.html` (replacing the "soon" placeholder) with a thumbnail SVG.
* Credit three.js (MIT) in the footer, `ASSET_CREDITS.md` and the acknowledgements page. No other
  assets are borrowed.

## 9. Testing

`node fun/snowglobe/test.mjs` checks the pure sim:

* same seed → same town;
* ages advance in order and a cycle ends with a region change, never repeating the last two;
* buildings never overlap, never sit on water, and stay inside the globe disc;
* population and building counts grow across ages and stay under the cap;
* weather picks respect region weights (no snow on the Nile over many cycles, or very rarely);
* time scale doesn't change the outcome.

Visual quality is checked by eye in the browser at each age and region, including at phone width.

## 10. Smaller calls (builder's)

* Every region gets all seven ages, even where history didn't follow that path (a Mesoamerican
  or Norse Industrial/Modern age is an invented regional flavour, like a stone-and-jade factory
  district or turf-roofed apartment blocks). Recognisable, not accurate.
* "Next age" during the Space Age triggers the blizzard reset.
* The plaque uses the paper theme's display serif.

## 11. Out of scope (for now)

Saving a town, choosing a region, a timeline scrubber, more than ~6 regions, sound beyond ambience,
anything multiplayer.
