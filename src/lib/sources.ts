import { unzip } from "fflate";
import type { PanoramaSource } from "../types";
import { createId } from "./id";

export type ImportIssue = {
  name: string;
  reason: string;
};

type LegacyFileEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
  createReader: () => {
    readEntries: (success: (entries: LegacyFileEntry[]) => void, failure?: (error: DOMException) => void) => void;
  };
};

function mimeForName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    jfif: "image/jpeg",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    jxl: "image/jxl",
    png: "image/png",
    svg: "image/svg+xml",
    tif: "image/tiff",
    tiff: "image/tiff",
    webp: "image/webp",
  };
  return extension ? types[extension] ?? "application/octet-stream" : "application/octet-stream";
}

function readEntries(entry: LegacyFileEntry): Promise<LegacyFileEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = entry.createReader();
    const all: LegacyFileEntry[] = [];
    const next = () => reader.readEntries((entries) => {
      if (entries.length === 0) resolve(all);
      else {
        all.push(...entries);
        next();
      }
    }, reject);
    next();
  });
}

async function filesFromEntry(entry: LegacyFileEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => entry.file((file) => resolve([file]), reject));
  }
  if (!entry.isDirectory) return [];
  const children = await readEntries(entry);
  const nested = await Promise.all(children.map(filesFromEntry));
  return nested.flat();
}

export async function filesFromDrop(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .map((item) => {
      const legacyItem = item as unknown as { webkitGetAsEntry?: () => LegacyFileEntry | null };
      return legacyItem.webkitGetAsEntry?.() ?? null;
    })
    .filter((entry): entry is LegacyFileEntry => Boolean(entry));

  if (entries.length > 0) {
    const nested = await Promise.all(entries.map(filesFromEntry));
    return nested.flat();
  }
  return Array.from(dataTransfer.files);
}

async function unzipFile(file: File): Promise<File[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
      unzip(bytes, (error, entries) => {
        if (error) {
          reject(error);
          return;
        }
        const files = Object.entries(entries)
          .filter(([name, data]) => !name.endsWith("/") && data.byteLength > 0 && !name.includes("__MACOSX/") && !name.endsWith(".DS_Store"))
          .map(([name, data]) => {
            const copy = new Uint8Array(data.byteLength);
            copy.set(data);
            return new File([copy.buffer], name, { type: mimeForName(name) });
          });
        resolve(files);
      });
  });
}

export async function expandArchives(files: File[]) {
  const expanded: File[] = [];
  const issues: ImportIssue[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
      try {
        const unzipped = await unzipFile(file);
        if (unzipped.length === 0) issues.push({ name: file.name, reason: "The ZIP archive is empty." });
        else expanded.push(...unzipped);
      } catch {
        issues.push({ name: file.name, reason: "The ZIP archive is damaged or uses an unsupported compression method." });
      }
    } else {
      expanded.push(file);
    }
  }
  return { files: expanded, issues };
}

function imageElementDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Native image decoding failed."));
    image.src = url;
  });
}

function bytesMatch(bytes: Uint8Array, expected: number[], offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

async function detectImageMime(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytesMatch(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytesMatch(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (bytesMatch(bytes, [0x42, 0x4d])) return "image/bmp";
  if (bytesMatch(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (bytesMatch(bytes, [0x49, 0x49, 0x2a, 0x00]) || bytesMatch(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  if (bytesMatch(bytes, [0x00, 0x00, 0x00]) && new TextDecoder().decode(bytes.slice(4, 12)).includes("ftyp")) {
    const brand = new TextDecoder().decode(bytes.slice(8, 16));
    if (/avi[fs]/.test(brand)) return "image/avif";
    if (/hei[cf]|mif1/.test(brand)) return "image/heic";
  }
  const text = new TextDecoder().decode(bytes).trimStart();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return "image/svg+xml";
  return file.type.startsWith("image/") ? file.type : "";
}

async function nativeImageDimensions(blob: Blob) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch {
      // The image element supports a few formats that createImageBitmap does not.
    }
  }
  const temporaryUrl = URL.createObjectURL(blob);
  try {
    return await imageElementDimensions(temporaryUrl);
  } finally {
    URL.revokeObjectURL(temporaryUrl);
  }
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The recovered PNG could not be encoded.")), "image/png");
  });
}

async function recoverPng(file: File) {
  const UPNG = await import("upng-js");
  const decoded = UPNG.decode(await file.arrayBuffer());
  if (!decoded.width || !decoded.height) throw new Error("The PNG has invalid dimensions.");
  const pixels = UPNG.toRGBA8(decoded)[0];
  if (!pixels) throw new Error("The PNG does not contain a readable frame.");
  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A recovery canvas could not be created.");
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), decoded.width, decoded.height), 0, 0);
  return {
    blob: await canvasBlob(canvas),
    width: decoded.width,
    height: decoded.height,
  };
}

async function prepareImage(file: File) {
  if (file.size === 0) throw new Error("The file is empty or has not finished saving.");
  const detectedMime = await detectImageMime(file);
  const normalized = detectedMime && detectedMime !== file.type ? new Blob([file], { type: detectedMime }) : file;
  try {
    const dimensions = await nativeImageDimensions(normalized);
    return { blob: normalized, ...dimensions };
  } catch (nativeError) {
    if (detectedMime === "image/png") {
      try {
        return await recoverPng(file);
      } catch {
        throw new Error("The PNG data is incomplete or damaged.");
      }
    }
    if (!detectedMime) throw new Error("The file contents are not a recognized image format.");
    throw nativeError;
  }
}

export async function sourcesFromFiles(files: File[]) {
  const expanded = await expandArchives(files);
  const settled = await Promise.allSettled(expanded.files.map(async (file): Promise<PanoramaSource> => {
    const prepared = await prepareImage(file);
    const url = URL.createObjectURL(prepared.blob);
    try {
      const sourceName = file.webkitRelativePath || file.name;
      return {
        id: createId("source"),
        name: sourceName.replace(/\.[^./]+$/, ""),
        url,
        width: prepared.width,
        height: prepared.height,
        objectUrl: true,
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }));

  const decodeIssues = settled.flatMap((result, index): ImportIssue[] => result.status === "rejected" ? [{
    name: expanded.files[index].webkitRelativePath || expanded.files[index].name,
    reason: result.reason instanceof Error ? result.reason.message : "The image could not be decoded.",
  }] : []);
  const issues = [...expanded.issues, ...decodeIssues];

  return {
    sources: settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    rejected: issues.length,
    issues,
  };
}
