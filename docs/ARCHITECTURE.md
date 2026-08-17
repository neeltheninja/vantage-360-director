# How VANTAGE works

VANTAGE is a browser-native panorama director. It turns an equirectangular location into a virtual camera, lets a user save multiple framings, and renders those framings back from the original panorama at a chosen delivery resolution. It is not a screenshot tool: every exported pixel is backward-mapped to the source image.

The entire image path runs locally in the browser. There is no upload API, media server, database, account system, or required environment variable.

## The product model

The app has three connected pipelines:

```text
INGEST
Files / folders / ZIP / paste / drop
        -> decode and inspect
        -> PanoramaSource objects

DIRECT
PanoramaSource + yaw/pitch/roll/focal length
        -> WebGL 360 viewer
        -> captured Shot records

DELIVER
Current camera / full panorama / shot set
        -> backward projection
        -> Lanczos or bicubic reconstruction
        -> optional line-art treatment
        -> PNG / JPEG / WebP / ZIP download
```

This separation is intentional. An import can succeed without making assumptions about its aspect ratio; camera interaction does not continuously rebuild React state; and export does not depend on the size or resolution of the on-screen preview.

## A normal session

1. Open, paste, or drop one image, several images, a directory, or a ZIP archive.
2. VANTAGE decodes every usable image, reports individual failures, and opens the first successful source directly in the 360 viewer.
3. Drag the panorama to aim, scroll to change coverage, and optionally choose Perspective or Natural Wide.
4. Capture a shot. A shot stores yaw, pitch, roll, focal length, and its projection—not pixels.
5. Repeat for other views or sources. Shot sets are kept separately for each source.
6. Open Export Studio and independently choose the scope and treatment:
   - Scope: current angle, entire panorama, or shot set.
   - Treatment: image or line art.
7. Inspect the live preview and source-detail budget, choose the output size and reconstruction options, then download one file or a ZIP.

## Import and source lifetime

Import is coordinated in `src/lib/sources.ts`.

### Drop and folder traversal

`filesFromDrop` first looks for browser file-system entries. When entries are available it recursively walks directories, including nested folders; otherwise it falls back to the normal `DataTransfer.files` list. The file picker uses `webkitdirectory` for folder selection, and the app also accepts files from the clipboard.

### ZIP expansion

`expandArchives` identifies ZIPs by MIME type or filename and expands them with `fflate`. A damaged or empty archive becomes a named import issue instead of aborting unrelated files. Images inside an archive enter the same decode path as ordinary files.

### Defensive decoding

`prepareImage` does not trust the filename or the browser-provided MIME type. It sniffs the file signature, normalizes the Blob type when necessary, and then tries `createImageBitmap` followed by an image-element fallback. A separate PNG recovery path uses `UPNG` for files that browsers reject even though their PNG data can still be decoded.

Each successful file becomes a `PanoramaSource` containing an ID, display name, object URL, and native dimensions. Imports are processed with `Promise.allSettled`, so one bad frame cannot discard a good batch. Object URLs are revoked when their source leaves the application and temporary decode/preview URLs are also cleaned up.

IDs come from `src/lib/id.ts`, which uses `crypto.randomUUID` when available and a timestamp/counter/random fallback when it is not. That keeps the tool working on browsers or non-secure contexts that do not expose `randomUUID`.

## The panorama contract

A conventional equirectangular panorama is 2:1, but VANTAGE does not reject an otherwise decodable image for missing that ratio. Every source is interpreted edge-to-edge as a complete sphere:

- horizontal coverage = 360 degrees across the full source width;
- vertical coverage = 180 degrees across the full source height;
- horizontal density = `source width / 360` pixels per degree;
- vertical density = `source height / 180` pixels per degree.

For a non-2:1 source those two densities differ. VANTAGE preserves the loaded raster rather than cropping or padding it, and its quality budget uses the lower density as the honest limiting detail. This is a pragmatic contract: it extracts the maximum available data, but it cannot infer missing spherical calibration from a single image.

## Camera state and controls

`src/App.tsx` owns the active source, per-source shots, panels, guides, focal length, and export state. Yaw, pitch, and roll are Motion values. That distinction matters: pointer motion can update the camera and redraw WebGL immediately without forcing a full React render for every mouse event.

The drag model follows a direct-manipulation panorama viewer:

- dragging right moves the image right and turns the camera left;
- dragging down moves the image down and pitches the camera up;
- pitch is clamped to `-89.5...89.5` degrees to avoid an unstable exact pole;
- horizontal sensitivity is the current horizontal field of view divided by the viewer width, so zooming in automatically makes aiming finer;
- the wheel changes focal length, while arrow keys provide a predictable keyboard path.

New sources reset to the maximum Natural Wide zoom-out: 3 mm, approximately 161 degrees horizontally. Perspective is constrained to 10 mm at its widest, approximately 122 degrees, because rectilinear edge stretch becomes extreme as coverage approaches 180 degrees.

## Interactive rendering

`src/components/PanoramaViewer.tsx` is a small custom WebGL 2 renderer. It draws one full-screen triangle; the fragment shader calculates the panorama coordinate for every screen pixel.

The source texture repeats horizontally and clamps vertically. The interactive viewer generates mipmaps and uses trilinear minification, which keeps motion smooth and reduces shimmer when zoomed far out. A `ResizeObserver` keeps the drawing buffer synchronized with the visible canvas, capped to a sensible device-pixel ratio for interaction.

The same 3x3 camera rotation matrix from `src/lib/rotation.ts` is used by the viewer and exporter. Its composition supports pitch, yaw, and roll in one explicit convention, avoiding the classic failure where the preview and exported angle disagree.

The flat view is separate: it displays the original raster directly and does not pretend to be a perspective camera.

## Projection math

All angle exports are backward mappings. For each output pixel, the renderer constructs a local camera ray, rotates it into world space, converts it to longitude/latitude, and samples the equirectangular source.

### Perspective

For normalized screen coordinates `(x, y)` in `[-1, 1]`, a rectilinear ray is:

```text
localRay = normalize([
  x * tan(horizontalFov / 2),
  y * tan(verticalFov / 2),
  -1
])
```

This keeps straight world lines straight, as a conventional pinhole camera should, but scale grows rapidly near very wide frame edges.

### Natural Wide

Natural Wide uses a Panini-style cylindrical perspective with `d = 1`. The horizontal output coordinate is inverted to a ray longitude:

```text
projectedX = x * projectionHalfWidth
longitude  = 2 * atan(projectedX / 2)
tanLatitude = y * halfHeight * (1 + cos(longitude)) / 2

localRay = normalize([
  sin(longitude),
  tanLatitude,
  -cos(longitude)
])
```

The result accepts much deeper zoom-out coverage while keeping the sides calmer than a rectilinear image. It is still a projection of a sphere onto a rectangle, so some compromise is unavoidable.

### World ray to panorama pixel

After camera rotation:

```text
longitude = atan2(ray.x, -ray.z)
latitude  = asin(clamp(ray.y, -1, 1))

u = fract(0.5 + longitude / 2π)
v = 0.5 - latitude / π
```

Entire-panorama export bypasses the camera ray and maps the output canvas directly across equirectangular `u, v` space.

## The detail budget

`getBudget` in `src/lib/camera.ts` predicts whether an output is source-resolved before export. It combines:

- source pixels per degree on both axes;
- the selected horizontal and vertical coverage;
- the cosine effect of aiming toward a pole;
- output dimensions;
- the derivative of the chosen projection at the frame edge.

The result reports the approximate source footprint, edge stretch, effective pixels per degree, and a `NATIVE`, `OK`, `SOFT`, or `POOR` badge. It is a warning system, not an upscaler. Lanczos can reconstruct a cleaner enlarged raster, but no deterministic sampler can invent scene detail absent from the source.

## Shot sets

A `Shot` is lightweight camera metadata: ID, name, yaw, pitch, roll, focal length, and projection. Capturing does not duplicate the panorama. Selecting a shot restores its complete camera state, and the plan view visualizes headings around the source.

Shots are stored in a record keyed by source ID. This prevents views from one location leaking into another during a multi-panorama session.

## Export Studio

`src/components/ExportStudio.tsx` deliberately separates two decisions that are often conflated:

| Decision | Options | Effect |
| --- | --- | --- |
| Scope | Angle / Full flat / Shots | Selects which camera state or raster region is delivered |
| Treatment | Image / Line art | Selects how the projected pixels are rendered |

Angle and shot-set exports can use Perspective or Natural Wide. Full-flat export is equirectangular. The resolution choices are scope-aware: camera angles use delivery canvases, while full-flat mode offers the loaded raster, a canonical 2:1 canvas, and standard panorama sizes.

The preview calls the real export pipeline at a smaller output size. It uses the chosen projection, sampler, seam setting, and treatment; only final resolution and optional 4x supersampling differ. Preview object URLs are replaced and revoked as settings change.

Single outputs download immediately. Batch output renders shots sequentially, updates progress after every item, and packages the files into a store-only ZIP (`level: 0`) so already-compressed images are not wastefully recompressed.

## High-quality reconstruction

`src/lib/extract.ts` creates a dedicated WebGL 2 canvas for an export. A fragment invocation maps one output pixel back to the panorama. This backward mapping avoids holes and double-written pixels that forward projection would create.

Two samplers are available:

- **Lanczos 3**: a separable 6x6, 36-tap reconstruction kernel.
- **Bicubic**: a 4x4, 16-tap Catmull-Rom-style reconstruction kernel.

Sampling is performed in linear light: source sRGB is decoded before the taps are accumulated and converted back to sRGB at the end. This avoids dark halos caused by averaging gamma-encoded values.

Optional 4x supersampling evaluates four sub-pixel rays at `±0.25` in each axis and averages them. It improves projected edges and diagonals, at a proportional render cost.

The sampler is sphere-aware:

- longitude wraps with `fract(u)`, so crossing the left/right seam is continuous;
- a sample beyond a pole is reflected vertically and shifted half a turn in longitude, matching spherical topology instead of smearing the top or bottom row.

Optional seam normalization measures robust trimmed means from both source edges in linear light. It applies a bounded exposure ramp across the panorama only when requested. This can reduce a tonal join; it cannot repair parallax, object discontinuities, or a badly stitched source.

## Line-art extraction

Line art is deterministic and runs after reprojection. This ordering is critical: edge detection sees the final angle geometry, so it does not create an equirectangular line map and then warp already-rasterized strokes.

The GPU pipeline in `src/lib/lineart.ts` performs:

1. Rec. 709 luminance conversion.
2. Small and broad Gaussian blur scales.
3. Scharr gradient response plus a difference-of-scales texture response.
4. Directional non-maximum suppression to keep edges thin.
5. Low/high threshold classification controlled by the Structural, Detailed, or Maximum profile and the Detail setting.
6. Iterative hysteresis connectivity, retaining weak edges attached to strong ones.
7. Monotonic one- and two-pixel stroke expansion, antialiasing, and white, transparent, or dark compositing.

For a full-flat line drawing, every filtering stage uses horizontal wrap and pole reflection with a half-turn. Lines can therefore continue across the equirectangular seam instead of being outlined as two unrelated image borders.

Jobs above 12 megapixels switch to 2048-pixel tiles with a 32-pixel halo. The halo supplies neighboring pixels to every filter pass and is discarded when the processed tile is assembled, preventing visible tile boundaries while avoiding many simultaneous full-resolution GPU targets. The event loop yields between tiles to keep the browser responsive.

Line art is exported as lossless PNG. It is deliberately not an AI stylizer: it preserves evidence from the selected source and projection rather than hallucinating new shapes.

## Resource and failure boundaries

The browser advertises hardware-specific `MAX_TEXTURE_SIZE` and `MAX_RENDERBUFFER_SIZE` limits. VANTAGE checks both and returns a concrete error instead of silently downscaling. A very large source can therefore decode successfully but still exceed a particular GPU's texture limit.

Projection and line-art canvases register explicit cleanup functions. After encoding, framebuffers, textures, buffers, shaders, and programs are deleted and backing canvases are collapsed. Batch exports run sequentially so each completed image can release GPU resources before the next begins.

Important boundaries remain honest:

- arbitrary non-2:1 input can be interpreted consistently, but not magically recalibrated;
- resampling can reduce jaggies and reconstruction blur, but cannot create missing photographic detail;
- seam exposure normalization can address a brightness mismatch, not stitching geometry;
- all processing shares the browser's available RAM and GPU limits.

## Privacy and deployment

Imported media is represented by local Blob URLs and processed by browser APIs. No source file is sent by the application. The production artifact is a static Vite bundle in `dist/`, so deployment needs only a static host.

For Vercel:

```text
Framework preset: Vite
Install command:  npm install
Build command:    npm run build
Output directory: dist
```

No serverless function or secret is required for the current architecture.

## Code map

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Session state, camera commands, import orchestration, shots, batch packaging, and application shell |
| `src/components/PanoramaViewer.tsx` | Interactive WebGL viewer and pointer/wheel input |
| `src/components/ExportStudio.tsx` | Export scope/treatment UX, live preview, resolution and quality controls |
| `src/components/PlanView.tsx` | Top-down heading and shot visualization |
| `src/lib/sources.ts` | Files, folders, ZIPs, MIME detection, decode fallback, and source creation |
| `src/lib/panorama.ts` | 360x180 source interpretation and pixels-per-degree contract |
| `src/lib/camera.ts` | FOV conversion, projection stretch, wrapping, and detail budget |
| `src/lib/rotation.ts` | Shared pitch/yaw/roll rotation matrix |
| `src/lib/extract.ts` | Backward projection, sphere-safe sampling, seam normalization, and encoding |
| `src/lib/exportPipeline.ts` | Projection/treatment composition and resource release |
| `src/lib/lineart.ts` | Multi-stage GPU line extraction and adaptive tiling |
| `src/lib/id.ts` | Browser-compatible unique IDs |
| `src/types.ts` | Panorama, shot, projection, guide, and quality types |

That architecture keeps the key promise simple: what the user directs is what the exporter re-renders from the original panorama, at the selected geometry and delivery size.
