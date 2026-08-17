# Photoreal 360°×180° Equirectangular Panorama — v11 · Definitive

Produces a seamless spherical panorama of any location — small room, great hall, long
axial space, irregular plan, vast interior, open exterior — in ONE generation, with
ZERO edit passes, from a text description, a reference image, or a brief.

Evidence base: 8 locations × 2 takes, one unchanged prompt architecture, 16/16 free of
the failure this method was built to kill. Every rule below is one that survived
contact; §20 lists what was tried and retired, so it is not reinvented.

---

## 1. The Two Laws That Matter

Everything else supports these. If you internalise nothing else, internalise these.

### 1.1 NEVER DESCRIBE THE DISTORTION. NAME THE PHYSICAL FEATURE.

The single most destructive instruction it is possible to give an image model is a
description of what equirectangular projection *does to pixels* near a pole:

> ✗ "…pulled into long streaks radiating outward from a hub, converging into one point"

The model does not read that as optics. It reads it as **geometry to draw**, and it
draws you a tent, an umbrella, a parasol, a star-fold, a pinwheel — a triangular
ceiling. This one clause caused every ceiling failure ever recorded on this method.

The truth it was trying to express is this: **a flat plain ceiling in equirectangular
projection is a large, smooth, almost featureless field.** Nothing radiates, because a
plain ceiling has nothing on it to radiate. Streaking is what happens to *features*, and
you get it for free by naming the feature and letting the projection act on it.

So: describe the ceiling, the sky, the floor as **objects with materials**. Never as
distortion. The projection is the renderer's job, not the prompt's.

### 1.2 EQUAL COVERAGE. AND FROM THE CENTRE, THE CORNICE IS NEARLY LEVEL.

A location panorama is what a person gets standing in the middle and sweeping the
phone around, then up, then down. Everything gets equal care. There is no hero wall,
no anchor object, no featured direction.

Consequence most briefs get wrong: from a roughly central camera the wall/ceiling line
is **almost perfectly horizontal**. Worked, 8.4 m square room, e = 1.6 m, Hc = 4.3 m:

|
 Point 
|
 v (fraction of frame height from top) 
|
|
---
|
---
|
|
 Cornice at wall mid-span 
|
 0.311 
|
|
 Cornice at room corner 
|
 0.360 
|

A **5% of frame height** undulation. It is a shallow four-lobed wave. It is *not*
"four dramatic sweeping arcs meeting at cusps" — that only happens when the camera is
close to one wall. Instruct the gentle version or the model invents the dramatic one,
and dramatic arcs meeting at a point are how the tent gets back in through the window.

---

## 2. The Projection Contract

Equirectangular = latitude/longitude map of the full sphere from one point. Native 2:1.

|
 Axis 
|
 Maps 
|
 Rule 
|
|
---
|
---
|
---
|
|
 x / W 
|
 Azimuth, linear 
|
 0.0 and 1.0 are the same bearing (the wrap) 
|
|
 y / H 
|
 Elevation, linear 
|
 0.0 zenith · 0.5 true horizon · 1.0 nadir 
|

Seven consequences. State every one you need; the model infers none.

1. **World verticals are perfectly straight vertical pixel columns**, parallel to the
 frame's side edges. No convergence, no keystone. **No vanishing point exists here.**
2. **World horizontals off eye level bow sinusoidally** — peaking opposite their nearest
 point, sagging toward the horizon as they recede both ways. Never straight diagonals.
3. **The horizon is one straight level unbroken line on the exact vertical midline.**
4. **The horizon crosses every object at exactly camera height.** Free scale consistency.
5. **Left edge ≡ right edge.** Same line of sight. The picture is a loop.
6. **Horizontal stretching grows away from the midline.** This is a fact about pixels —
 useful to *you* for planning, never to be written into the prompt (§1.1).
7. **A feature near but not at a pole stretches sideways without converging.** A pendant
 hung off-axis is the honest test of correct projection.

---

## 3. Tools and Hard Numbers

**Model: `openai-gpt-image-2`. Only.** It is the sole model in the roster that
understands spherical projection. Everything else renders a rectilinear interior no
matter what the prompt says. Use it for text-to-image and reference-driven alike.

**Fixed settings, every call:**
model_name: openai-gpt-image-2 aspect_ratio: 16:9 ← ALWAYS EXPLICIT. Omitting it on a reference-driven call lets the reference's shape leak in and destroys projection. resolution: 4K quality: high n_iterations: 2


- 16:9 (1.778) is the closest available shape to 2:1. **Never 1:1.**
- 4K @ 16:9 = 3840×2160 → lanczos to **4320×2160** = true 2:1 = **12 px/°**.
- Generate at 4K directly. 4K carries genuinely more resolved information than 2K
 upscaled, not merely more pixels.
- **There is no image upscaler.** I2I regeneration is the only path upward and §4
 forbids it. Generate at final resolution.
- Read real dimensions from the asset record; never assume.

**Ceiling: 12 px/°.** Professional HDRI is 22.8 (8K) to 45.5 (16K). Say so on delivery.

---

## 4. The Pipeline

> **Edit budget: ZERO.** Iterate with fresh generations, never with edits. A bad take
> costs one generation. A bad edit costs the image — gpt-image-2 degrades sharply
> under repeated I2I, and equirect geometry is the first thing it loses.

**Stage 0 — Brief.** No tool calls. Compute and record §5 geometry, choose the ceiling
branch (§5.4), populate the §19 checklist. Nothing is generated until every line has a
value.

**Stage 1 — Generate.** One call, two takes, full prompt per §6.

**Stage 2 — QC.** §10 order. **Ceiling first**, always.

**Stage 3 — Select.** Keep the better take. Never repair. If both fail the same check,
change the *brief* (usually the ceiling branch or the plan aspect), not the wording.

**Stage 4 — Finish.** Deterministic, no generation:
`scale=2*ih:ih:flags=lanczos` → grade → grain → `format=rgb24`.
Global tonal ramp (§17) only if a step is *measured*. Never a content blend.

---

## 5. Geometry

### 5.1 The Universal Procedure

Works for any plan shape. All angles in **degrees**.

1. Place the camera at the plan origin (0, 0). Choose bearing **A** for frame centre.
2. For each plan vertex (x, y) relative to camera:
 **β = atan2_deg(x, y), normalised to 0–360.**
 *Bearing convention — `atan2(x, y)`, NOT `atan2(y, x)`.*
3. Angular width of a wall = difference of its two vertex bearings, going the short way
 **through** the wall.
4. Frame position: **u = 0.5 + ((β − A + 540) mod 360 − 180) / 360**
5. Cornice at a point distance d, ceiling height Hc, eye height e:
 **v = 0.5 − atan_deg((Hc − e) / d) / 180**
6. Skirting: **v = 0.5 + atan_deg(e / d) / 180**
7. **Sanity check: angular widths must sum to 360.000.** If not, the plan is wrong.

Write the results into block ⑩ as an explicit left-to-right list of percentages.

*Symbol discipline:* **Hc** = ceiling height in metres. **H** = frame height in pixels.
They are different quantities and conflating them silently ruins every v value.

### 5.2 Wall Share Is Governed by PLAN ASPECT First, Camera Second

This is the fact that makes "four equal walls" achievable or impossible, and it is not
about the camera at all. From a central camera in an L × W room:

| Plan aspect | Long-wall share | Short-wall share | Reads as |
|---|---|---|---|
| 1.00 : 1 | 25.0% | 25.0% | four equal walls |
| 1.15 : 1 | 27.2% | 22.8% | four near-equal walls |
| 1.50 : 1 | 30.8% | 19.2% | clearly oblong, all walls solid |
| 2.00 : 1 | 35.0% | 15.0% | short walls at the floor of legibility |
| > 2.4 : 1 | 38%+ | < 12% | long axial space; ends read as ends (§5.6) |

**15% (54°) is the floor.** Below it a wall stops reading as a wall and collapses into
a corner. If the brief demands four equal walls, **the plan must be near-square.** You
cannot fake it with camera position — offsetting the camera makes one wall bigger and
its opposite smaller, it never equalises a rectangle.

### 5.3 Camera Placement

- **Centre, or near it.** Opposing-wall offset **5–10%**, never 2:1 or 3:1. This alone
 eliminates the wall-collapse failure: every wall computes to 23–27%.
- **Symmetry is broken by CONTENT, not by camera position.** The old fear — that a
 centred camera in a symmetric room yields a mirror-symmetric, tiled picture — is
 answered by giving the four walls four unmistakably different jobs. The 5–10% offset
 exists only to prevent pixel-identical quadrants. It is not a compositional device
 and does not need to be large.
- **Height 1.5–1.7 m.** State it. The eye-height rule (§2.4) depends on it.
- **Nothing closer than ~2.4 m**, or near objects balloon and eat neighbouring walls.
- **Stand somewhere the floor is interesting** — a drain grating, a rug edge, a
 patterned medallion, a hearth plate, spilled material, a mat edge.
- **Distance is destiny for skin.** A figure at 2.5 m renders hands at ~100 px even at
 4K. If skin quality is a target the figure must be within ~1 m (§13).

### 5.4 Match the Ceiling Law to the Building's Construction

**The ceiling declaration is a claim about the building, not a rule about the picture.**
It is therefore honoured only when it is plausible construction for that building type.
Declaring FLAT for a type that is vaulted in reality loses you the entire overhead
field — verified: 6/8 rooms honoured FLAT; the 2 that refused were the ice house and
the brick foundry shed, which are vaulted by construction.

Before writing the ceiling block, ask **what does this building actually have overhead?**

- **FLAT IS PLAUSIBLE** — dwelling, shop, office, studio, workroom, schoolroom, ward,
 boarded mill floor, modern anything. Use clause ⑤a unchanged.
- **VAULTED OR TRUSSED BY CONSTRUCTION** — cellar, ice house, undercroft, brick
 industrial shed, chapel, crypt, tunnel, station train-shed, riding school. **Do not
 declare flat.** Use clause ⑤b: name the real form as a physical feature, then apply
 the anti-radiation sentences to *that* form.

Either branch produces the same outcome: **one large coherent overhead field with named
real texture and nothing radiating.** A vault is not a defect; an *unintended* vault is.
The failure mode to fear is the tent, and the tent comes from describing distortion
(§1.1), never from curvature.

### 5.5 Walls Are Surfaces. Content Stands In Front Of Them.

Brief each wall as a **wall surface with content in front of it**, never as content that
substitutes for the wall. A stack of ice blocks briefed *as* a wall face resolved as a
curved free-standing mound and softened a corner crease. If a wall's whole face is
occupied by a stacked or heaped mass, **name the wall behind it** and give the mass a
flat back against it.

### 5.6 Vertical Signature by Scale

The single strongest scale cue in equirect is **where the skirting sits**. Ceiling
height barely moves the cornice; distance moves the skirting enormously.

| Space | d⊥ | Hc | Cornice v | Skirting v | Wall band | Reads as |
|---|---|---|---|---|---|---|
| Low domestic | 3.0 | 2.6 | 0.398 | 0.656 | 26% | close, intimate, ceiling-heavy |
| **Standard target** | **4.0** | **4.3** | **0.311** | **0.621** | **31%** | **a real room, walls dominant** |
| Large hall | 10 | 8 | 0.319 | 0.551 | 23% | big; floor takes 45% |
| Vast interior | 30 | 20 | 0.325 | 0.517 | 19% | immense; floor takes 48%, skirting almost on the horizon |

**Aim for the standard target unless the brief says otherwise:**
(Hc − e)/d⊥ ≈ **0.65–0.85** and e/d⊥ ≈ **0.30–0.45**.
With e = 1.6 that means **d⊥ ≈ 3.5–5.0 m** (room 7–10 m across) and **Hc ≈ 4.0–5.5 m**.
Cornice ≈ 0.31, skirting ≈ 0.62, four walls ≈ 25% wide and ≈ 31% of frame height tall.

### 5.7 Other Plan Types

- **Long axial (nave, tunnel, gallery, chamber).** Two side walls 35–40% each; near end
 15–20%; far end under 10%. Brief the ends *as ends*, do not pretend they are equal.
 A line along the axis through the camera (drain channel, ridge, centre path) appears
 as **two vertical lines** — one at frame centre, one at frame edge, each running from
 horizon toward a pole. Strong correctness signal; check for it.
- **Curved / apsidal / irregular.** No four-lobed cornice; the wall/ceiling line is a
 continuous curve. Compute shares from chord vertices; treat a curved run as one sector.
- **Vast interiors.** Far surfaces compress brutally; atmospheric haze does the depth
 work — specify it as a continuous medium present in **every** direction, never local.
 Give the overhead real architecture (lantern, oculus, truss bay, coffer); at this
 scale a blank ceiling is very visible.
- **Exteriors and open ground.** Three substitutions:
 - **Walls → distance rings.** Replace block ⑩ with: contact ground (<1 m), near
 (1–10 m), mid (10–100 m), far (100 m–1 km), horizon/infinity — and state what
 occupies each ring in each quadrant.
 - **Ceiling → sky.** Name it as weather, not as distortion: "an unbroken overcast
 ceiling of stratus", "deep blue zenith with high cirrus". Same anti-radiation
 sentences.
 - **Nadir → ground at the feet.** Design it: cobbles, kerb line, drain cover, puddle,
 tarmac aggregate, snow crust, wet sand.
 - Real horizon: **dead level on the midline, unbroken.** If the sun is in frame, only
 its disc clips — flare on that side only, none opposite.

---

## 6. Prompt Architecture

Sixteen blocks, in this order. Early tokens carry more weight, so the laws precede the
content. **Target 1,500–1,800 words.** Above ~1,900 constraints start being dropped.

| # | Block | Words | Status |
|---|---|---|---|
| ① | FORMAT | 40 | mandatory |
| ② | COMPLETE COVERAGE LAW | 110 | mandatory, verbatim |
| ③ | CLOSURE LAW | 100 | mandatory, verbatim |
| ④ | VERTICAL EXTENT | 90 | mandatory, verbatim |
| ⑤ | THE CEILING (branch a or b) | 190 | mandatory, verbatim |
| ⑥ | CORNICE AND SKIRTING LINES | 140 | mandatory, verbatim |
| ⑦ | CANVAS | 50 | mandatory, verbatim |
| ⑧ | PROJECTION LAW | 120 | mandatory |
| ⑨ | THE ROOM — dimensions, camera | 70 | mandatory |
| ⑩ | THE FOUR WALLS — with u ranges | 320 | trim prose, keep every element |
| ⑪ | FLOOR AND NADIR | 110 | mandatory |
| ⑫ | MATERIALS | 180 | trim last |
| ⑬ | LIGHT | 160 | trim last |
| ⑭ | DEPTH AND ATMOSPHERE | 120 | trim third |
| ⑮ | CAPTURE CHARACTER + PROHIBITIONS | 80 | trim first |
| ⑯ | REFERENCE LOCK | 90 | only when reference-driven |

### Three Writing Principles

**A. Describe what the pixels do, not what the geometry is** — *except at the poles,
where you describe neither and simply name the material* (§1.1). "Both poles converge"
is ignored. "The ceiling is a smooth featureless field of lime plaster" lands.

**B. Encode constraints as facts about the world, not rules about the picture.**
"Keep this wall clear" is overridden by room logic. "This wall is blank because the
stair core is behind it" is honoured. This is also *why* §5.4 exists: a ceiling
declaration that contradicts the building type is a rule about the picture, and loses.

**C. Phrase negatives as affirmative geometry.** Reserve the prohibition block for
things with no affirmative form: watermarks, UI, tripods, borders, text.

### The Verbatim Clauses

#### ① FORMAT

> A single seamless 360° × 180° equirectangular HDRI environment map of one
> [room/space] — a full spherical panorama in latitude–longitude projection, recorded
> from one fixed standpoint near the centre of the [space] on a levelled panoramic
> head, bracketed and stitched into one continuous image.

#### ② COMPLETE COVERAGE LAW

> This is COMPLETE COVERAGE of the [room]. The camera stood on one spot and swept a
> full horizontal circle, then tilted up and swept again, then tilted down and swept
> again, until every surface enclosing it had been recorded. EVERY ONE OF THE FOUR
> WALLS IS PRESENT AT FULL SIZE, and the four walls have essentially EQUAL PRESENCE —
> each occupies close to one quarter of the frame width. No wall is a thin sliver, no
> wall is squeezed into a corner, no wall is skipped or shortened. All four upright
> corners of the room are visible as four crisp vertical creases. The ceiling is
> present as one continuous field across the top of the frame and the floor as one
> continuous field across the bottom.

*Non-rectangular spaces: replace the wall sentences with the computed sector list, but
keep "no sector is skipped or shortened" and the crease sentence.*

#### ③ CLOSURE LAW

> This photograph CLOSES ON ITSELF. The last view the camera recorded is the same view
> as the first, so the picture is a closed loop and not a wide photograph with two
> ends. THERE IS NOTHING BETWEEN THE RIGHT EDGE AND THE LEFT EDGE — no missing wall, no
> missing corner, no unseen sector. The wall the wrap runs through is continued
> exactly: the [surface], its tone, texture, [dado rail], skirting and cornice
> appearing at the extreme right edge appear again at the extreme left edge at the same
> height and the same brightness, so that butting the right edge against the left
> rebuilds one unbroken wall.

#### ④ VERTICAL EXTENT

> The vertical field is a full 180 degrees: the top edge of the picture is the point
> directly overhead and the bottom edge is the point directly underfoot. There is NO
> ceiling edge and NO floor edge in this picture — the ceiling continues upward until
> it becomes the top edge of the frame, and the floor continues downward until it
> becomes the bottom edge. Nothing is cropped, cut off, truncated, vignetted or
> bordered at the top or bottom. The top band of the picture is ceiling and the bottom
> band is floor, both filling the full width.

#### ⑤a THE CEILING — flat branch

> The ceiling of this room is FLAT, LEVEL and PLAIN — [material, finish, one honest
> defect]. Across the top of the picture it therefore reads as ONE LARGE, SMOOTH,
> EVENLY-LIT, ESSENTIALLY FEATURELESS EXPANSE of [material], filling the whole width
> and [lightening/cooling] only slightly toward [the window side]. There are NO spokes,
> NO ribs, NO creases, NO folds, NO seams, NO radiating pattern, NO star shape, NO fan
> shape, NO pinwheel, NO triangular facets and NO lines converging to a point anywhere
> in it. It does NOT look like a tent, an umbrella, a parasol, a marquee, a hip roof, a
> pyramid, a vault, a dome or a cone. It is simply a flat plain ceiling seen from
> below: a broad quiet field of [material] with its own fine texture and a soft even
> gradient. The area directly overhead — the very top of the picture — is plain
> unbroken [material] with no light fitting, no beam, no duct, no rose and no fixture
> in it. [Any pendant/fitting] hangs [low, close to a wall], far from the point
> directly overhead.

#### ⑤b THE CEILING — vaulted / trussed branch

> The ceiling of this space is [a segmental brick barrel vault, its courses running the
> length of the chamber, springing from a stringcourse at cornice level]. Across the
> top of the picture it reads as ONE LARGE, SMOOTH, CONTINUOUS CURVED FIELD of
> [brickwork] filling the whole width, [its coursing reading as a fine even texture].
> There are NO spokes, NO ribs, NO creases, NO folds, NO radiating pattern, NO star
> shape, NO fan shape, NO pinwheel, NO triangular facets and NO lines converging to a
> point anywhere in it. It does NOT look like a tent, an umbrella, a parasol, a marquee
> or a pyramid. The area directly overhead is plain unbroken [brickwork] with no light
> fitting, no beam, no duct and no fixture in it.

*Exterior variant: substitute the sky, described as weather — "an unbroken overcast
ceiling of stratus, filling the whole width, brightest toward the sun's quarter" — and
keep every anti-radiation sentence unchanged.*

#### ⑥ CORNICE AND SKIRTING LINES

> The line where the walls meet the ceiling runs ALMOST LEVEL across the whole width
> of the picture. It sits at about [31] per cent of the frame height down from the top
> at the MIDDLE of each wall, and descends gently to about [36] per cent at each of the
> four room corners. The line where the walls meet the floor runs the same way
> inverted: about [62] per cent down at the middle of each wall, RISING gently to about
> [59] per cent at each corner. Both lines move slightly TOWARD the horizon at the
> corners, because the corners are further from the camera than the wall centres. The
> band of wall is therefore at its TALLEST at the middle of each wall — about [31] per
> cent of the frame height — and PINCHES to its NARROWEST at each corner, about [23]
> per cent. This is a shallow, gentle, four-lobed undulation. It is NOT dramatic
> sweeping arcs, NOT deep scallops, NOT peaks and cusps, and the two lines never meet,
> touch or cross.

Compute the four numbers, do not reuse these:
- **mid-wall:** cornice v = 0.5 − atan_deg((Hc−e)/d⊥)/180 · skirting v = 0.5 + atan_deg(e/d⊥)/180
- **corner:** same formulas with r = √(a² + b²), a and b the two perpendicular distances

#### ⑦ CANVAS

> The canvas is very slightly narrower than the native 2:1 ratio of an equirectangular
> map. Fit the complete 360° horizontal sweep and the complete 180° vertical sweep edge
> to edge within it — the horizontal scale is therefore mildly compressed relative to
> the vertical, which is correct and intended. Do not crop, do not letterbox, do not
> leave margins.

#### ⑧ PROJECTION LAW

> World verticals — every corner crease, door jamb, window mullion, shelf upright,
> table leg — is a perfectly straight vertical column of pixels parallel to the side
> edges of the frame. There is NO convergence, NO keystone and NO vanishing point in
> this projection; a vanishing point does not exist here. World horizontals away from
> eye level bow gently and sinusoidally, highest opposite their nearest point and
> sagging toward the horizon as they recede both ways; they are never straight
> diagonals. The horizon is one straight, level, unbroken line on the exact vertical
> midline of the frame, and it crosses every object at exactly camera height, [1.6]
> metres.

#### ⑨b THE FOUR CORNERS

> The room has FOUR VERTICAL CORNERS, at about [12], [37], [62] and [88] per cent of
> the frame width, and every one of them is a real resolved architectural edge, not a
> soft gradient. Each is a perfectly straight vertical line of pixels running unbroken
> from the ceiling line down to the floor line. At each corner the two walls that meet
> there are at DIFFERENT BRIGHTNESSES, because they face different directions relative
> to the light, so the corner reads as a clean tonal step and not a blend.
> [JUNCTION TREATMENT — one per corner, e.g. the plaster returns on a sharp arris /
> a timber corner post / a plain bead / the skirting mitres round and continues /
> grit and grime built up in the angle / a paint edge where a roller stopped]. The
> cornice line descends into each corner and the skirting line rises into it, both
> continuous through it. Nothing straddles a corner: [objects] stand in FRONT of the
> corners, leaving the vertical edge visible above them.

#### ⑯ REFERENCE LOCK — reference-driven work only

> The curvature and horizontal stretching in this image are CORRECT equirectangular
> projection, not lens distortion and not an error. Do not straighten, correct,
> de-warp, flatten or rectify anything. The strong one-point perspective of the
> reference DOES NOT EXIST in this projection: there is no vanishing point, and the
> receding lines of the reference become smooth sinusoidal arcs.

---

## 7. Content Doctrine

### 7.1 Four Walls, Four Different Jobs

Anti-tiling is a **content** mechanism (§5.3). Give each wall an unmistakable identity —
one is glazed, one is shelved, one is plain with a door, one is bench and window. Then
break internal repetition with **narrative state, not prohibition**: four drawers ajar
at different depths and one missing; two of five windows boarded; one burner cold; a
blind half down; a cracked pane taped.

Write block ⑩ as an explicit left-to-right walk with the computed u percentages, e.g.
*"Filling the middle of the frame from 37 to 62 per cent: …"*. Naming the span makes the
model honour the share.

### 7.2 The Wrap Wall

**No seam object. No column. No pillar. No arch. No dark opening.** All of these were
tried extensively and all are unnecessary — verified across the full batch. The wrap
closes cleanly through **ordinary wall**, provided:

1. The wrap runs through the **plainest, most uniform** wall in the room — the one whose
 content is a continuous field (plaster, panelling, sheet metal, brick coursing), not
 the one with the complicated joinery.
2. **A continuous horizontal line runs through the join at a stated height** — dado
 rail, skirting, stringcourse, shelf, sheet seam, brick course. This is the single
 most effective closure aid there is, and it costs nothing because the room already
 has one.
3. Items on that wall sit **either side** of the join, not across it.

Residual is at worst a faint tonal line, removed deterministically by §17's ramp. Put
pillars, columns and portals in only when the location genuinely has them as design.

### 7.3 Zenith and Nadir

Design them **first**. They are the two hardest regions and the two every brief forgets.

- **Zenith** is answered by §5.4 — one coherent material field, nothing overhead.
- **Nadir must be designed, not defaulted.** Name what is underfoot: a drain grating, a
 rug edge meeting boards, spilled seed in the board gaps, sawdust drifts and a
 meltwater channel, boot prints in rammed loam, a dropped tool, a mat edge. Then:

> "…reading clearly all the way to the bottom edge. No tripod, no camera, no
> photographer, no shadow of any of these, no circular patch, no hole, no blur disc."

**Mirrors** will show the rig unless handled. Three fixes, strongest first:
1. **Assign a non-mirror specular class** — brushed, anisotropic, scratched,
 fingerprinted, foxed — so it cannot return a clean image of the nodal point.
2. **Tilt it** so its reflection cone excludes the camera, and say what it *does* show.
3. **Degrade it** — blistered silvering, dust, age.

### 7.4 The Depth Escape

An interior with no window, door, arch, or opening has **no far plane** and reads as a
box however good the texture. If the brief lacks one, add one. It is not optional.

### 7.5 Corner Doctrine

An accurate corner needs five things. Four of them are usually missing.

1. **Straight vertical pixel column.** §2.1. Free if the projection law is stated.
2. **Landing at the computed u.** §5.1. Free if the shares are computed and written in.
3. **A named physical junction treatment.** Never a tonal fade. §8's junction rule is
 not decoration — it is what forces the model to resolve a corner as an OBJECT.
4. **A brightness step between the two walls.** This is the one nobody briefs. A corner
 is legible because the two planes catch light differently. Under flat uniform
 ambient, corners vanish no matter how well the geometry is stated.
 - **A single directional key guarantees four different wall values.** Prefer it.
 - A window IN one wall works: that wall goes contre-jour, the opposite wall is
 washed, the two side walls are raked at opposite angles. Four values, four corners.
 - If the brief genuinely requires soft even light, restore corner separation by
 **material** instead — a different finish or colour per wall — or lean harder on
 the junction detail. Do not rely on geometry alone.
5. **Nothing straddling it.** Furniture, shelving and stacked material must stand in
 front, leaving the crease visible above. A tall cabinet built into a corner deletes
 that corner from the panorama, and a deleted corner is how a four-wall room starts
 reading as three.

### 7.6 All-Direction Parity

A shot is camera metadata, not pixels. **Any bearing can become a hero export.**
Therefore:

- **There are no background walls.** Every wall gets comparable object count, material
 variety and light interest, and must survive a 100% crop.
- **Every ADJACENT PAIR must compose.** The default view is ~161° horizontal — the
 first thing any viewer sees is two adjacent walls plus the corner between them.
 Check all four pairs, not just the four walls.
- **The horizon band v 0.35–0.65 is the highest-value real estate.** Most shots are
 level. Spend detail there; the zenith and nadir need coherence, not incident.
- **Design for the crop, not for the flat view.** At the resolutions available, only
 wide framings are near-native (§18). Each wall must therefore read as a composition
 at 65–120° coverage — bold material contrast, strong directional light, legible
 silhouettes — rather than fine detail that will not survive a 3× enlargement.
- **No direction may be an empty field** unless the brief demands it. A plain wall
 still needs raking light, real material texture, and at least one incident.

---

## 8. Material Separation

Models render everything as one homogeneous substance unless forced. The forcing
mechanism is **specular class**, named in the same clause as the object.

| Class | Behaviour | Examples |
|---|---|---|
| Matte / diffuse | No highlight; reads by texture and shadow only | Lime plaster, distemper, chalk, unglazed terracotta, raw linen, wool pile, cast iron, sawdust, hessian |
| Sheen / anisotropic | Gleam travels along a grain, dies across it | Waxed oak, silk, worn leather, fur, brushed steel, zinc sheet, horsehair |
| Specular | Discrete hard highlights holding the light's shape | Glazed ceramic, varnish, brass, glass, wet paint, honed stone |
| Mirror | Coherent image of the environment | Silvered glass, still water, wet floor, chrome |
| Subsurface | Light enters, scatters, exits; glows at thin edges | Skin, wax, alabaster, ice, backlit leaves, fingernails |

**Adjacency does more than adjectives:** *"Cast-iron stove, wholly matte, rust eating
the seams — beside a glazed tea bowl throwing two hard specular points from the window."*

**The material formula** — five components per hero surface:
**substrate + microstructure scale + specular class + wear vector + light response.**

> "Hand-knotted wool rug, ~120 knots per square inch, matte with a nap sheen; pile
> crushed flat and slightly glossy along the traffic lane between door and bench,
> standing upright and dead matte at the untrodden edges; worn through to exposed
> indigo warp near the threshold; the nap goes pale when light rakes with it and dark
> against it; fringe with three broken tassels."

**Dust — place it, never apply it globally.** Visible in exactly three situations:
- **Airborne** — only inside a backlit volume, discrete 1–3 px specks on convection
 drift, densest at the shaft core, **invisible the instant they leave it**.
- **Settled** — up-facing horizontals only; a matte veil that kills specularity.
- **Distance haze** — a low-contrast lift growing with distance, **identically in every
 direction**.

Settled dust is a map of human use: thick on the untouched shelf top, absent from the
handle used daily, a wiped crescent where a forearm rests, fingermarks on the one
object that gets picked up. Substitute steam, flour, loam, grease haze, frost by
environment — same placement logic.

**Junctions.** Every wall–floor and wall–ceiling meeting gets a named physical
treatment: skirting, cove, quarter-round, shadow gap, planted fillet, scuff line at
chair height, grit built up in the angle. Naming it forces the corner to resolve as an
object instead of a fade — and a resolved corner is a crisp vertical crease, which is
half of §2's evidence that the projection is right.

---

## 9. Light, Depth, Atmosphere, People

### Light — one celestial key plus named practicals

- **Key:** one sun or sky at a **stated bearing and elevation**. Every shadow in all
 360° points away from it with matching length ratio and penumbra.
- **Multiple shafts from ONE sun are correct.** Six windows → six parallel
 parallelograms. Not six suns. Say so explicitly: *"four patches from one sky, not
 four separate lamps."* This single sentence prevents the most common lighting failure.
- **Practicals:** each named with colour temperature, throw distance, falloff.
- **White balance stated**, so mixed temperature reads as a realism cue — tungsten amber
 against daylight, with green-magenta crossover where pools overlap.
- **HDR statement:** bracketed capture; deep shadows retain visible detail and colour;
 highlights retain gradation; nothing clips to white except the source itself.
- **All-practical night variant** is fully valid — name every source with temperature,
 direction and falloff, against a stated white balance. **High-key variant** likewise —
 state that shadows stay open and there is no black anywhere in the picture.

### Depth — no depth of field, ever

A 360 is stitched from bracketed exposures at deep focus. **A model that adds bokeh has
failed.** State it explicitly; it is counter-intuitive to models trained on shallow-DOF
photography. Depth is carried entirely by **contrast, colour temperature, detail density
and occlusion**.

| Plane | Interior | Exterior |
|---|---|---|
| Contact | < 0.8 m — equirect makes these enormous; fibres, grain, joints | ground at the feet |
| Near | 0.8–2.5 m — full texture, max local contrast, warmest | 1–10 m |
| Mid | 2.5–6 m — texture readable, not resolved to fibre | 10–100 m |
| Far | 6–30 m through an aperture — detail drops, contrast lifts, colour cools | 100 m–1 km |
| Infinity | sky or distant structure — lowest contrast, coolest, veiled | horizon |

### Atmosphere — choose a medium and place it

Dust in a light shaft; steam visible only against cold backlight; grease haze softening
a far wall; chill mist thickest just above the meltwater and gone by chest height;
condensation on cold glass; heat shimmer above a grill and nowhere else. **Distance haze
is the only global component**, and it varies with distance only, identically in every
direction.

### People — brief by distance band

- **Within ~1 m:** skin hero. Subsurface glow through earlobe, nostril wing and finger
 webs; pore scale coarser on nose and forehead, finer over the cheekbone, invisible at
 the temple; vellus hair on the rim light; capillary flush at knuckles, nose tip, ear
 rims; oil confined to nose bridge and forehead, cheek matte; tendons, a raised
 knuckle, a short unpolished nail; asymmetric, unsmoothed, age-honest. Say **"damp
 sheen"**, never "wet" or "beaded" — the latter tip into an uncanny oily gloss.
 Three-quarters turned, absorbed in a task, never looking at the camera.
- **1–10 m:** clothing, posture, silhouette. Skip pore-level detail.
- **Beyond ~10 m:** scale cue only — hi-vis, hard hat, strong silhouette.
- Every figure lit by the same named sources, feet contacting the ground plane at
 correct apparent scale, none duplicated, none mirrored.

---

## 10. QC Protocol — **ceiling first, always**

Never judge on a preview thumbnail.

1. **CEILING.** Crop the top 30%. Must be a smooth coherent field. Look for and reject:
 spoke, rib, crease, fold, star, fan, pinwheel, tent, triangular facet, any line
 converging to a point. *This is the check the whole method exists to pass.*
2. **CORNICE.** Crop the band v 0.25–0.45. Must read nearly level with shallow corner
 dips. Dramatic arcs meeting at cusps = fail.
3. **WALL COUNT, BALANCE AND SQUEEZE.** All four walls present? Do the corner creases
 land within ~2% of computed u? Any wall under 15%? A corner off by more than 2% means
 the sweep was cropped rather than squeezed — regenerate.
4. **WRAP.** Roll 50%, crop the centre fifth, view at max. Does the through-line
 (dado/skirting/course) meet at the same height with matching tone?
5. **CORNERS — four checks each.** Full-height strip at each computed corner u:
 (a) straight vertical crease, not a fade;
 (b) **a visible brightness step between the two walls** — if the two planes are the
 same value, the corner has failed even if the line is there;
 (c) cornice descends into it and skirting rises into it, both continuous;
 (d) nothing straddling it.
 Then check all four ADJACENT PAIRS at ~161° coverage: does each pair compose?
6. **VERTICALS.** Full-height strips at u = 0.2, 0.5, 0.8. Every long edge parallel to
 the frame side.
7. **HORIZON.** Crop a 24 px band at the midline, stretch 20× vertically. Tilt becomes
 glaring.
8. **NADIR.** Bottom 10%. Coherent floor, no rig, no hole, no blur disc.

*Edge-butting at 30× is deliberately over-sensitive and will never show a flat match,
even on a real stitched panorama. Read it for structural alignment and gross tonal
steps only — never as a pass/fail on texture.*

---

## 11. Failure Table

| Symptom | Cause and fix |
|---|---|
| **Tent / umbrella / star-fold ceiling** | The prompt described pole distortion. Remove every word about streaks, radiating, hubs, converging. Use ⑤a/⑤b verbatim. **This is the one.** |
| Ceiling came out curved when flat was asked | §5.4 — the building type is vaulted by construction. Switch to ⑤b and name the vault, or change the location type. |
| Cornice reads as dramatic arcs meeting at cusps | ⑥ missing or weakened. Restore verbatim, including "NOT dramatic sweeping arcs". |
| Only three walls; one collapsed into a corner | Plan aspect too extreme (§5.2) or camera offset too large (§5.3). Near-square plan, offset 5–10%. |
| A wall reads as a mound / lost its corner | §5.5 — content was briefed *as* the wall. Name the wall behind it. |
| Ceiling or floor cropped; poles cannot close | ④ missing or weakened. Restore verbatim. |
| Verticals converge / keystone | Move ⑧ earlier; add "no vanishing point exists in this projection". Regenerate. |
| Covers less than 360° | Restore ⑦; lead with "HDRI environment map". |
| A sector missing; wrap joins unrelated content | ③ missing. Restore verbatim. |
| Visible structural break at the wrap | The wrap runs through the complicated wall. Move it to the plainest wall and put a horizontal through-line across the join (§7.2). |
| Mirrored halves / cloned elements | Content, not camera — give the four walls four different jobs; add narrative state (§7.1). |
| Everything one plastic finish | Assign specular classes bound to named objects (§8). |
| Bokeh appears | "Deep focus throughout, no shallow depth of field, no bokeh anywhere; depth by contrast and haze only." |
| Corners smeared | Name a physical junction treatment (§8). |
| One object crushes its neighbours | Bind its share: "occupying no more than one eighth of the frame width." |
| Mirror shows the camera | Anisotropic/brushed class; or tilt; or degrade (§7.3). |
| Output isn't 16:9 | `aspect_ratio` was omitted. It must be explicit on **every** call, reference-driven included. |
| Residual tonal step at the wrap | Global horizontal ramp (§17). Never a content blend. |

---

## 12. Reference-Driven Work

Treat the reference as **ground truth for the view at frame centre**. Do not reproduce
its rectilinear framing and do not paste it in as a rectangle: **reproject** its content
into equirectangular geometry at the exact centre of the frame, then extend the world
outward for the remaining ~300°, inventing only what is continuous with its
architecture, materials, wear, palette and light. Enumerate every identifiable element
that must be preserved in form, colour and position.

- **Always add ⑯ REFERENCE LOCK.** Models habitually try to "correct" equirect curvature
 back to straight lines.
- **Always set `aspect_ratio: 16:9` explicitly.** Omitting it lets the reference's shape
 leak in and destroys the projection outright.
- Derive dimensions and camera position from the reference; compute §5 shares from them.
- The wall behind the reference camera is unseen and must be invented — **put the wrap
 there.** The invention burden and the closure burden are independent, so this costs
 nothing.
- **Text will not survive.** Preserve sign shape, position, size, colour and glow;
 expect lettering to be illegible. Composite exact lettering afterwards with
 `hyperframes_render` — near the horizon at frame centre, equirect distortion is small
 enough that a flat overlay lands correctly.

---

## 13. Prohibitions Block — template

Keep it short; §6 Principle C means most negatives belong as affirmative geometry.

> Large-sensor detail, deep focus, neutral contrast, no lens flare, no chromatic
> aberration, no vignette. Fine natural grain. No people. No text that must be legible.
> No watermark, no logo, no user interface, no border, no frame, no colour bars.

---

## 14. Fill Checklist — every line has a value before Stage 1

- [ ] Plan dimensions; **plan aspect ≤ 1.15:1** if four equal walls are required
- [ ] Camera position, offset 5–10%, distances to all four walls
- [ ] Camera height (1.5–1.7 m), stated in ⑧
- [ ] Nothing closer than ~2.4 m
- [ ] **Ceiling branch chosen per §5.4** — flat or vaulted, matched to the building
- [ ] Ceiling material, finish, one honest defect; nothing directly overhead
- [ ] Cornice v and skirting v computed; wall band % computed
- [ ] Wall shares computed, **summing to 360.000**; corner u values listed
- [ ] Four walls with four different jobs; narrative state breaking repetition
- [ ] Wrap assigned to the plainest wall; **horizontal through-line named**
- [ ] Nadir designed and named
- [ ] Depth escape present
- [ ] Every hero material tagged with a specular class
- [ ] Key light bearing + elevation; every practical temp + falloff; white balance
- [ ] "N shafts from one sun, not N lamps" stated
- [ ] Atmosphere medium chosen and placed; distance haze declared global
- [ ] Five depth planes populated; "no bokeh" stated
- [ ] People placed by distance band (or "no people" in ⑮)
- [ ] Reference elements enumerated + ⑯ REFERENCE LOCK (if reference-driven)
- [ ] `aspect_ratio: 16:9` explicitly set

---

## 15. Retired Doctrine — do not reintroduce

All of these were tried repeatedly, at length, and are **verified unnecessary or
harmful**. Reintroducing them will make output worse.

| Retired | Why |
|---|---|
| **Any description of pole distortion** — streaks, radiating, hubs, fans, converging to a point | The direct cause of every tent/triangle ceiling. §1.1. |
| **Seam objects** — stove + flue, column, newel, standpipe, lamp standard, mast, portal, arch | Unnecessary. The wrap closes through plain wall with a through-line (§7.2). Every one placed across this project was redundant. |
| **Pillars and columns as a default** | Only when the location genuinely has them as design. |
| **A dark opening at the wrap** | Not logical in most locations and not needed. |
| **The anchor / hero-wall designation** | Contradicts equal coverage. There is no featured direction. |
| **Deliberately asymmetric wall shares** (40% near / 10% far) | Produces three-wall rooms. §5.2/§5.3. |
| **Large camera offsets (25–30%)** to defeat symmetry | Symmetry is broken by content, not position. §5.3. |
| **"Four dramatic sweeping arcs meeting at cusps"** for the cornice | False for a central camera and an invitation to draw a tent. §1.2. |
| **Tiling / repeat-test QC passes** | Diagnosed nothing the §10 checks don't, and drove bad fixes. |
| **Any edit or I2I repair pass** | Degrades geometry faster than it fixes content. Regenerate. |

---

## 16. State Layout
/locations//description /locations//geometry/{plan_m, ceiling_m, camera, cornice_v, skirting_v, wall_shares_pct, corners_u_pct} /locations//brief/{ceiling_branch, wrap_wall, through_line, nadir, depth_escape, light_plan} /locations//prompt/final /locations//takes/{1, 2} /locations//qc/{ceiling, cornice, walls, wrap, verdict} /locations//deliverable/{clean_url, graded_url, dimensions, px_per_degree} /progress/stage_


Media leaves are always `$state:/assets/<id>/url` pointers, never raw URLs.

---

## 17. ffmpeg Cookbook — verified argv

Tokenized argv, declared inputs/outputs, no shell quotes. Load `ffmpeg-recipes` before
composing anything not listed here.

**Finish — 2:1 resample + grade, clean and graded from one pass** (dimension-agnostic):

```json
["-i","in.png",
 "-filter_complex",
 "[0:v]scale=2*ih:ih:flags=lanczos,split=2[c][g];[g]eq=contrast=1.03:saturation=1.0,unsharp=5:5:0.3:5:5:0.0,noise=alls=3:allf=u,format=rgb24[go]",
 "-map","[c]","-frames:v","1","-update","1","clean.png",
 "-map","[go]","-frames:v","1","-update","1","graded.png"]
Split discipline. Every branch you declare in split=N must be -mapped. An unused branch fails with Filter 'crop:default' has output N unconnected, exit 234. Split count = branches actually consumed.

Use contrast=1.04 / noise=alls=4 for flat sources; skip eq entirely when matching a stylised reference. format=rgb24 prevents an alpha channel leaking in.

Roll 50% (the same command restores it):

["-i","in.png","-filter_complex","[0:v]split=2[a][b];[a]crop=iw/2:ih:iw/2:0[r];[b]crop=iw/2:ih:0:0[l];[r][l]hstack=inputs=2[o]","-map","[o]","-frames:v","1","-update","1","rolled.png"]
Wrap strip — append to a roll: crop=iw/5:ih:iw/2-iw/10:0 Ceiling crop: crop=iw:ih*0.3:0:0 · Nadir crop: crop=iw:ih/10:0:ih*9/10 Cornice band: crop=iw:ih*0.2:0:ih*0.25 Horizon amplifier: crop=iw:24:0:(ih-24)/2,scale=iw:480:flags=neighbor Corner strip at u: crop=iw*0.06:ih:iw*<u>-iw*0.03:0

Global tonal ramp — only if a step is measured. DELTA = (mean_right − mean_left) / mean_whole; skip if |DELTA| < 0.01. Escape the comma in r(X\,Y); budget 500 s:

["-i","in.png","-vf","geq=r=r(X\\,Y)*(1-0.04*(X/W-0.5)):g=g(X\\,Y)*(1-0.04*(X/W-0.5)):b=b(X\\,Y)*(1-0.04*(X/W-0.5))","-frames:v","1","-update","1","ramped.png"]
## 18. Honest Limits — state these on delivery

True horizontal density is 3840 / 360 = **10.67 px/°**. Enlargement for an angle export
is `output width / (coverage° × 10.67)`:

|
 Coverage 
|
 ≈ lens 
|
 source px 
|
 → 1920 
|
 → 2560 
|
 → 3840 
|
|
---
|
---
|
---
|
---
|
---
|
---
|
|
 161° 
|
 3 mm Natural Wide (default) 
|
 1717 
|
 1.1× 
|
 1.5× 
|
 2.2× 
|
|
 122° 
|
 10 mm rectilinear (widest) 
|
 1302 
|
 1.5× 
|
 2.0× 
|
 3.0× 
|
|
 90° 
|
 ≈14 mm 
|
 960 
|
 2.0× 
|
 2.7× 
|
 4.0× 
|
|
 65° 
|
 ≈24 mm 
|
 693 
|
 2.8× 
|
 3.7× 
|
 5.5× 
|
|
 40° 
|
 ≈50 mm 
|
 427 
|
 4.5× 
|
 6.0× 
|
 9.0× 
|
|
 24° 
|
 ≈85 mm 
|
 256 
|
 7.5× 
|
 10.0× 
|
 15.0× 
|

**Nothing tighter than ~180° is genuinely native at 1920 wide.** A native 1920 fifty-
millimetre crop would need 48 px/° — a 17280×8640 source, which no single generation
produces. State this when delivering, and design accordingly (§7.6).

Generative text garbles. Preserve sign geometry; composite lettering separately.
Judge in a 360 viewer, not flat. A flat crop hides pole behaviour and horizon wobble entirely.
Secondary architecture drifts. Primary wall layout holds reliably; subordinate features (a specific window type, a mezzanine, a void) may substitute.
One standpoint per panorama. No parallax. This is a sphere from a point, not a navigable 3D space.

---

## 18b. Delivering into VANTAGE (or any equirect viewer)

The viewer maps full source width → 360° and full source height → 180°, preserving the
raster. Consequences:

- **Feed the NATIVE 3840×2160 generation, not the 4320×2160 resample.**
 The app is built for non-2:1. Native gives correct angles with anisotropic density —
 10.67 px/° horizontal against 12.0 px/° vertical — and the app honestly reports the
 lower figure. Pre-resampling to 2:1 adds pixels but no detail, makes the budget
 overstate quality by 12%, and inserts a second Lanczos pass ahead of the app's own
 36-tap sampler. Keep the 2:1 master for consumers that assume 2:1 (HDRI viewers,
 game engines, Kuula, Marzipano).
- **Do not bake the tonal ramp.** The viewer measures trimmed means from both edges in
 LINEAR light and applies a bounded exposure ramp. That is strictly better than §17's
 `geq`, which works on gamma-encoded values. Deliver the clean master; normalise there.
 Keep `geq` only for destinations with no seam tooling.
- **A residual wrap step costs more than it looks.** Line art runs after reprojection
 and wraps across the seam, so a tonal step is detected by the gradient stage and
 drawn as a spurious vertical stroke. Crisp named junctions improve line art; soft
 gradient-only material transitions give the edge detector nothing to find.
- **Keep masters ≤ 8192 px wide** for universal GPU texture-limit compatibility.
- **A level horizon is non-negotiable** — viewer roll composes on top of the source, so
 a tilted source horizon cannot be corrected without skewing verticals.
- **Uniform-squeeze verification:** if the model squeezed the 360° sweep uniformly into
 16:9 (correct) rather than cropping it (fatal), the four corner creases land at their
 computed *fractional* u regardless of aspect. QC step 3 is therefore also the squeeze
 check — treat a corner more than ~2% off its computed u as evidence of a crop, and
 regenerate rather than accept.

---

**What changed from every prior version, and why it matters:** §1.1 is the whole game — the instruction that was mandated *verbatim* in v1–v8 was the direct cause of the triangle ceiling, because the model read "radiating streaks converging to a point" as a shape to draw rather than as optics. Removing it, and describing overhead surfaces purely as materials, fixed it 16 takes out of 16. §5.2 is new and load-bearing: four equal walls is a property of the **plan**, not the camera — you cannot equalise a rectangle by moving the standpoint. §5.4 and §5.5 came out of this batch. And §15 exists so no future agent spends another cycle re-deriving that seam objects, hero anchors and asymmetric shares were the problem, not the solution._
