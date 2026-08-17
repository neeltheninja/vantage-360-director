import { horizontalFov, verticalFov } from "./camera";
import { cameraRotationMatrix } from "./rotation";
import type { LensProjection } from "../types";

export type ExportFormat = "png" | "jpeg" | "webp";
export type SamplingMode = "lanczos" | "bicubic";
export type ExtractProjection = LensProjection | "equirectangular";

const projectionCleanups = new WeakMap<HTMLCanvasElement, () => void>();

export function releaseProjectionCanvas(canvas: HTMLCanvasElement) {
  projectionCleanups.get(canvas)?.();
  projectionCleanups.delete(canvas);
  canvas.width = 1;
  canvas.height = 1;
}

export type ExtractOptions = {
  sourceUrl: string;
  yaw: number;
  pitch: number;
  roll: number;
  focal: number;
  width: number;
  height: number;
  format: ExportFormat;
  quality?: number;
  seamBlend?: number;
  supersample?: boolean;
  sampling?: SamplingMode;
  projection?: ExtractProjection;
};

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uPanorama;
uniform vec2 uTextureSize;
uniform vec2 uOutputSize;
uniform float uTanHalfHFov;
uniform float uTanHalfVFov;
uniform mat3 uRotation;
uniform vec3 uSeamDelta;
uniform float uSeamStrength;
uniform float uSupersample;
uniform float uSamplingMode;
uniform float uProjectionMode;
uniform float uProjectionHalfWidth;
in vec2 vUv;
out vec4 outColor;

vec3 srgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(high, low, lessThanEqual(color, vec3(0.04045)));
}

vec3 linearToSrgb(vec3 color) {
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(max(color, 0.0), vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, lessThanEqual(color, vec3(0.0031308)));
}

vec4 cubic(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1.0,
    -1.5 * t3 + 2.0 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2
  );
}

vec2 poleSafeUv(vec2 uv) {
  if (uv.y < 0.0) {
    uv.y = -uv.y;
    uv.x += 0.5;
  } else if (uv.y > 1.0) {
    uv.y = 2.0 - uv.y;
    uv.x += 0.5;
  }
  uv.x = fract(uv.x);
  return uv;
}

vec3 tapLinear(vec2 uv) {
  return srgbToLinear(texture(uPanorama, poleSafeUv(uv)).rgb);
}

vec3 bicubicLinear(vec2 uv) {
  vec2 texel = uv * uTextureSize - 0.5;
  vec2 fraction = fract(texel);
  vec2 base = (floor(texel) + 0.5) / uTextureSize;
  vec4 wx = cubic(fraction.x);
  vec4 wy = cubic(fraction.y);
  vec3 color = vec3(0.0);
  for (int row = 0; row < 4; row += 1) {
    for (int column = 0; column < 4; column += 1) {
      vec2 offset = vec2(float(column - 1), float(row - 1)) / uTextureSize;
      color += tapLinear(base + offset) * wx[column] * wy[row];
    }
  }
  return color;
}

float sinc(float value) {
  float magnitude = abs(value);
  if (magnitude < 0.00001) return 1.0;
  float radians = magnitude * 3.14159265359;
  return sin(radians) / radians;
}

float lanczosWeight(float value) {
  float magnitude = abs(value);
  if (magnitude >= 3.0) return 0.0;
  return sinc(magnitude) * sinc(magnitude / 3.0);
}

vec3 lanczos3Linear(vec2 uv) {
  vec2 texel = uv * uTextureSize - 0.5;
  vec2 base = floor(texel);
  vec3 color = vec3(0.0);
  float totalWeight = 0.0;
  for (int row = -2; row <= 3; row += 1) {
    for (int column = -2; column <= 3; column += 1) {
      vec2 sampleTexel = base + vec2(float(column), float(row));
      vec2 distance = texel - sampleTexel;
      float weight = lanczosWeight(distance.x) * lanczosWeight(distance.y);
      vec2 sampleUv = (sampleTexel + 0.5) / uTextureSize;
      color += tapLinear(sampleUv) * weight;
      totalWeight += weight;
    }
  }
  return color / max(totalWeight, 0.00001);
}

vec3 samplePanorama(vec2 uv) {
  uv = poleSafeUv(uv);
  vec3 color = uSamplingMode > 0.5 ? lanczos3Linear(uv) : bicubicLinear(uv);
  vec3 gain = 1.0 - uSeamDelta * (uv.x - 0.5) * uSeamStrength;
  return color * gain;
}

vec3 sampleRay(vec2 fragmentPosition) {
  vec2 normalizedPosition = fragmentPosition / uOutputSize;
  if (uProjectionMode > 1.5) {
    return samplePanorama(vec2(fract(normalizedPosition.x), 1.0 - normalizedPosition.y));
  }

  vec2 screen = normalizedPosition * 2.0 - 1.0;
  vec3 localRay;
  if (uProjectionMode > 0.5) {
    float projectedX = screen.x * uProjectionHalfWidth;
    float longitude = 2.0 * atan(projectedX, 2.0);
    float tanLatitude = screen.y * uTanHalfVFov * (1.0 + cos(longitude)) * 0.5;
    localRay = normalize(vec3(sin(longitude), tanLatitude, -cos(longitude)));
  } else {
    localRay = normalize(vec3(screen.x * uTanHalfHFov, screen.y * uTanHalfVFov, -1.0));
  }
  vec3 ray = normalize(uRotation * localRay);
  float longitude = atan(ray.x, -ray.z);
  float latitude = asin(clamp(ray.y, -1.0, 1.0));
  float u = fract(0.5 + longitude / 6.28318530718);
  float v = 0.5 - latitude / 3.14159265359;
  return samplePanorama(vec2(u, v));
}

void main() {
  vec3 color;
  if (uSupersample > 0.5) {
    color = (
      sampleRay(gl_FragCoord.xy + vec2(-0.25, -0.25)) +
      sampleRay(gl_FragCoord.xy + vec2( 0.25, -0.25)) +
      sampleRay(gl_FragCoord.xy + vec2(-0.25,  0.25)) +
      sampleRay(gl_FragCoord.xy + vec2( 0.25,  0.25))
    ) * 0.25;
  } else {
    color = sampleRay(gl_FragCoord.xy);
  }
  outColor = vec4(linearToSrgb(clamp(color, 0.0, 1.0)), 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create export shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Export shader compilation failed.");
  }
  return shader;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the panorama for export."));
    image.src = url;
  });
}

export function encodeCanvas(canvas: HTMLCanvasElement, format: ExtractOptions["format"], quality = 0.94) {
  const mime = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode this export.")), mime, quality);
  });
}

function linearChannel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function trimmedMean(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.1);
  const kept = sorted.slice(trim, Math.max(trim + 1, sorted.length - trim));
  return kept.reduce((sum, value) => sum + value, 0) / Math.max(1, kept.length);
}

function measureSeamDelta(image: HTMLImageElement): [number, number, number] {
  try {
    const sampleHeight = Math.min(1024, image.naturalHeight);
    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = 16;
    edgeCanvas.height = sampleHeight;
    const edgeContext = edgeCanvas.getContext("2d", { willReadFrequently: true });
    if (!edgeContext) return [0, 0, 0];
    edgeContext.imageSmoothingEnabled = true;
    edgeContext.imageSmoothingQuality = "high";
    edgeContext.drawImage(image, 0, 0, 8, image.naturalHeight, 0, 0, 8, sampleHeight);
    edgeContext.drawImage(image, image.naturalWidth - 8, 0, 8, image.naturalHeight, 8, 0, 8, sampleHeight);
    const edgeData = edgeContext.getImageData(0, 0, 16, sampleHeight).data;

    const wholeCanvas = document.createElement("canvas");
    wholeCanvas.width = 256;
    wholeCanvas.height = 128;
    const wholeContext = wholeCanvas.getContext("2d", { willReadFrequently: true });
    if (!wholeContext) return [0, 0, 0];
    wholeContext.drawImage(image, 0, 0, 256, 128);
    const wholeData = wholeContext.getImageData(0, 0, 256, 128).data;
    const wholeMeans = [0, 1, 2].map((channel) => {
      let total = 0;
      for (let index = channel; index < wholeData.length; index += 4) total += linearChannel(wholeData[index]);
      return total / (wholeData.length / 4);
    });

    return [0, 1, 2].map((channel) => {
      const leftRows: number[] = [];
      const rightRows: number[] = [];
      for (let y = 0; y < sampleHeight; y += 1) {
        let left = 0;
        let right = 0;
        for (let x = 0; x < 8; x += 1) {
          left += linearChannel(edgeData[(y * 16 + x) * 4 + channel]);
          right += linearChannel(edgeData[(y * 16 + x + 8) * 4 + channel]);
        }
        leftRows.push(left / 8);
        rightRows.push(right / 8);
      }
      const delta = (trimmedMean(rightRows) - trimmedMean(leftRows)) / Math.max(wholeMeans[channel], 1e-6);
      return Math.abs(delta) < 0.01 ? 0 : Math.max(-0.25, Math.min(0.25, delta));
    }) as [number, number, number];
  } catch {
    return [0, 0, 0];
  }
}

export async function renderProjection(options: ExtractOptions) {
  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = options.width;
  renderCanvas.height = options.height;
  const gl = renderCanvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL 2 is required for high-quality export.");
  const maxRenderSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  if (options.width > maxRenderSize || options.height > maxRenderSize) {
    throw new Error(`This output exceeds the browser's ${maxRenderSize}px render limit.`);
  }

  const program = gl.createProgram();
  if (!program) throw new Error("Could not create the export pipeline.");
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Export shader link failed.");
  gl.useProgram(program);

  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const image = await loadImage(options.sourceUrl);
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (image.naturalWidth > maxTextureSize || image.naturalHeight > maxTextureSize) {
    throw new Error(`This panorama exceeds the browser's ${maxTextureSize}px WebGL texture limit.`);
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  const hFov = horizontalFov(options.focal);
  const halfHFov = hFov * Math.PI / 360;
  const projection = options.projection ?? "rectilinear";
  const projectionHalfWidth = projection === "panini" ? 2 * Math.tan(halfHFov / 2) : Math.tan(halfHFov);
  gl.uniform1f(gl.getUniformLocation(program, "uTanHalfHFov"), Math.tan(halfHFov));
  gl.uniform1f(
    gl.getUniformLocation(program, "uTanHalfVFov"),
    projection === "panini"
      ? projectionHalfWidth / (options.width / options.height)
      : Math.tan(verticalFov(options.focal, options.width / options.height) * Math.PI / 360),
  );
  gl.uniform1f(gl.getUniformLocation(program, "uProjectionMode"), projection === "equirectangular" ? 2 : projection === "panini" ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(program, "uProjectionHalfWidth"), projectionHalfWidth);
  gl.uniform2f(gl.getUniformLocation(program, "uTextureSize"), image.naturalWidth, image.naturalHeight);
  gl.uniform2f(gl.getUniformLocation(program, "uOutputSize"), options.width, options.height);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, "uRotation"), false, cameraRotationMatrix(options.pitch, options.yaw, options.roll));
  const seamDelta = options.seamBlend ? measureSeamDelta(image) : [0, 0, 0];
  gl.uniform3f(gl.getUniformLocation(program, "uSeamDelta"), seamDelta[0], seamDelta[1], seamDelta[2]);
  gl.uniform1f(gl.getUniformLocation(program, "uSeamStrength"), options.seamBlend ?? 0);
  gl.uniform1f(gl.getUniformLocation(program, "uSupersample"), options.supersample ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(program, "uSamplingMode"), options.sampling === "bicubic" ? 0 : 1);
  gl.viewport(0, 0, options.width, options.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();
  projectionCleanups.set(renderCanvas, () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);
    gl.deleteTexture(texture);
    gl.deleteBuffer(vertices);
    gl.detachShader(program, vertexShader);
    gl.detachShader(program, fragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteProgram(program);
    gl.flush();
  });
  return renderCanvas;
}

export async function extractPerspective(options: ExtractOptions) {
  return encodeCanvas(await renderProjection(options), options.format, options.quality ?? 0.94);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
