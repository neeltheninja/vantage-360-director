# VANTAGE by Dashverse

VANTAGE is a local-first browser tool for exploring panorama locations, directing individual camera angles, building shot sets, and exporting high-quality image or line-art deliverables.

Made by Soumya Deepta Sarkar.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
npm run preview
```

## What is implemented

- Natural drag controls, wheel zoom, keyboard navigation, and an immediate 360 view
- Deep 161-degree Natural Wide projection with substantially calmer edges
- Conventional Perspective projection with a safe interactive wide-angle limit
- Single images, multi-file batches, folders, ZIP archives, drag-and-drop, and clipboard loading
- Browser-native decoding with useful partial-import error reporting
- Non-2:1 panorama support without rejecting or cropping the source
- Shot capture, recall, per-source shot lists, thumbnails, and a top-down plan view
- Direct full-panorama, current-angle, and shot-set exports
- PNG, JPEG, WebP, and ZIP delivery at source-matched, HD, 4K, 6K, or 8K sizes
- Linear-light Lanczos 3 or bicubic backward reconstruction
- Optional seam exposure normalization and 4x edge supersampling
- Deterministic structural, detailed, and maximum line-art extraction
- Seam-safe, pole-correct, adaptively tiled 8K line-art rendering
- Immersive 4K Vantage Room entry experience with live 360 rendering behind it
- Build-time showcase discovery from `docs/showcase/`, with no gallery manifest to maintain
- The complete definitive panorama skill, available inside the app as one-click copy or Markdown download
- A focused Frameo Agent Chat workflow with exact model, canvas, quality, take, and handoff guidance
- Responsive desktop and mobile UI with Dashverse branding

Imported files stay in the browser. The app does not upload source panoramas to a server.

## Primary controls

| Input | Action |
| --- | --- |
| Drag / arrow keys | Look around |
| Scroll / double-click / `+` / `-` | Zoom |
| Cmd/Ctrl + `V` | Paste an image |
| `O` | Open images or a ZIP archive |
| `C` | Capture a shot |
| `P` | Toggle plan view |
| `G` | Cycle framing guides |
| `V` | Toggle 360 and flat views |
| `R` | Reset the view |
| Hold Space | Hide the interface |
| Cmd/Ctrl + `E` | Open export |

## Architecture

The interface uses React, TypeScript, Vite, Motion, and a compact custom WebGL 2 renderer. The viewer and export pipeline share one camera-rotation model and the same rectilinear/Panini projection math. Export sampling is backward-mapped into the original panorama instead of taking a screenshot.

Large line-art jobs use overlapped tiles so 8K output does not require a stack of full-resolution GPU framebuffers. Full-flat filters wrap horizontally and continue over each pole using reflection plus a half-turn in longitude.

The launch room and worked examples are Vite-discovered static assets. Adding a supported raster to `docs/showcase/` adds it to the in-app gallery on the next build. The definitive Frameo skill is imported verbatim from [`docs/SKILL-FinalPanorama(DEFINITE).md`](docs/SKILL-FinalPanorama(DEFINITE).md), so the copy and download actions cannot drift from the public source document.

Read [How VANTAGE works](docs/ARCHITECTURE.md) for the complete interaction model, panorama contract, projection equations, sampling pipeline, line-art stages, resource lifecycle, and deployment architecture.

Read [Showcase setup](docs/SHOWCASE.md) for the zero-manifest worked-example workflow.

## Publish to GitHub

After creating an empty GitHub repository, run:

```bash
git remote add origin git@github.com:YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

## Deploy to Vercel

The simplest route is to import the GitHub repository in the Vercel dashboard. Vercel detects Vite automatically and uses:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

You can also deploy from this directory after authenticating the CLI:

```bash
npx vercel@latest login
npx vercel@latest
npx vercel@latest --prod
```
