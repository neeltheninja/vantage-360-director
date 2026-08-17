type SourceDimensions = { width: number; height: number };

const NATIVE_ASPECT = 2;
const NATIVE_ASPECT_TOLERANCE = 0.04;

/**
 * Projection contract for every decoded source.
 *
 * Aspect ratio describes sampling density, not whether an image is allowed to
 * be a panorama. The complete raster always maps edge-to-edge onto 360° × 180°
 * so viewing and backward-mapped export preserve every available source pixel.
 */
export function getPanoramaContract(source: SourceDimensions) {
  const sourceAspect = source.width / source.height;
  const horizontalPxPerDegree = source.width / 360;
  const verticalPxPerDegree = source.height / 180;

  return {
    horizontalCoverage: 360 as const,
    verticalCoverage: 180 as const,
    sourceAspect,
    nativeAspect: Math.abs(sourceAspect - NATIVE_ASPECT) < NATIVE_ASPECT_TOLERANCE,
    horizontalPxPerDegree,
    verticalPxPerDegree,
    limitingPxPerDegree: Math.min(horizontalPxPerDegree, verticalPxPerDegree),
    fit: "edge-to-edge" as const,
  };
}
