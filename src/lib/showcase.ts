/**
 * Build-time discovery for the Vantage worked-example gallery.
 *
 * Add a browser-native raster image anywhere under `docs/showcase/` and Vite will
 * include it in the next development or production build. The launch frame
 * is deliberately sorted first; every other item gets a stable title and id
 * from its filename, so the UI does not need a hand-maintained manifest.
 */

export const SHOWCASE_FOLDER = "docs/showcase/";
export const PRIMARY_SHOWCASE_FILENAME = "vantage-prompt-room.webp";

export type ShowcaseExample = Readonly<{
  id: string;
  title: string;
  filename: string;
  src: string;
  sourcePath: string;
  alt: string;
  isDefault: boolean;
}>;

export type ShowcaseMode = "empty" | "single" | "gallery";

const discoveredImages = import.meta.glob<string>(
  "../../docs/showcase/**/*.{avif,AVIF,gif,GIF,jpeg,JPEG,jpg,JPG,png,PNG,webp,WEBP}",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const naturalSort = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function decodeFilename(path: string) {
  const filename = path.split("/").pop() ?? path;

  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

function withoutExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function titleCase(value: string) {
  return value
    .replace(/[_+.]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z\d]{2,}$/.test(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

/** Convert camera-style timestamp filenames into something made for people. */
export function formatShowcaseTitle(filename: string) {
  if (filename === PRIMARY_SHOWCASE_FILENAME) return "The Vantage Room";

  const stem = withoutExtension(filename).trim();
  const timestamp = stem.match(
    /^(.*?)[\s_-]*(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})(?:[._-]\d+)?$/,
  );

  if (timestamp) {
    const [, rawPrefix, year, rawMonth, day, hour, minute] = timestamp;
    const month = MONTHS[Number(rawMonth) - 1];
    const prefix = titleCase(rawPrefix);
    const date = `${Number(day)} ${month ?? rawMonth} ${year}, ${hour}:${minute}`;
    return prefix ? `${prefix}, ${date}` : date;
  }

  return titleCase(stem) || "Untitled panorama";
}

function stableHash(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36);
}

function slugify(value: string) {
  return (
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "example"
  );
}

const sortedExamples = Object.entries(discoveredImages)
  .map(([sourcePath, src]) => {
    const filename = decodeFilename(sourcePath);
    const title = formatShowcaseTitle(filename);
    const isPrimary = filename === PRIMARY_SHOWCASE_FILENAME;

    return {
      id: `${slugify(title)}-${stableHash(sourcePath)}`,
      title,
      filename,
      src,
      sourcePath,
      alt: isPrimary
        ? "A cinematic dark studio with a mountain projection, framed artwork, and panorama design boards"
        : `${title}, a Vantage panorama worked example`,
      isPrimary,
    };
  })
  .sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return naturalSort.compare(left.filename, right.filename);
  });

export const SHOWCASE_IMAGES: readonly ShowcaseExample[] = sortedExamples.map(
  (example, index) => ({
    id: example.id,
    title: example.title,
    filename: example.filename,
    src: example.src,
    sourcePath: example.sourcePath,
    alt: example.alt,
    isDefault: index === 0,
  }),
);

export const DEFAULT_SHOWCASE_IMAGE: ShowcaseExample | null =
  SHOWCASE_IMAGES[0] ?? null;

/** Lightweight 2:1 preview used for instant homepage handoff into the viewer. */
export function getShowcasePreviewSrc(example: ShowcaseExample) {
  return `${import.meta.env.BASE_URL}showcase-thumbs/${withoutExtension(example.filename)}.webp`;
}

export const SHOWCASE_MODE: ShowcaseMode =
  SHOWCASE_IMAGES.length === 0
    ? "empty"
    : SHOWCASE_IMAGES.length === 1
      ? "single"
      : "gallery";
