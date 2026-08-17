# Vantage worked examples

The `docs/showcase/` folder is Vantage's automatic showcase library.

Drop a browser-native raster image anywhere inside `docs/showcase/` (or a nested
folder) and it will appear in the in-app **See what Vantage can do with
prompts** gallery after the next development-server restart or production
build. No manifest or source-code edit is needed.

Supported showcase formats are AVIF, GIF, JPEG, PNG, and WebP. Use descriptive
filenames: Vantage turns them into human-readable titles automatically. For
example, `desert-observatory_final.webp` becomes “Desert Observatory Final”.

`vantage-prompt-room.webp` is the optimized launch panorama and is always sorted
first. It is derived from the supplied 4096×2304 PNG so the opening experience
keeps the full source dimensions without asking every visitor to download an
18 MB PNG. If it is absent, the first filename in natural alphabetical order
becomes the default. The interface also handles an empty folder or a single
example without special configuration.
