export type LineArtProfile = "structural" | "detailed" | "maximum";
export type LineArtBackground = "white" | "transparent" | "dark";

export type LineArtOptions = {
  profile: LineArtProfile;
  detail: number;
  stroke: number;
  background: LineArtBackground;
  wrapX?: boolean;
};

const lineArtCleanups = new WeakMap<HTMLCanvasElement, () => void>();

export function releaseLineArtCanvas(canvas: HTMLCanvasElement) {
  lineArtCleanups.get(canvas)?.();
  lineArtCleanups.delete(canvas);
  canvas.width = 1;
  canvas.height = 1;
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const GRAYSCALE_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uImage;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 color = texture(uImage, vUv).rgb;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  outColor = vec4(luminance, 0.0, 0.0, 1.0);
}`;

const BLUR_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uRadius;
uniform float uWrapX;
in vec2 vUv;
out vec4 outColor;
vec2 safeUv(vec2 uv) {
  if (uWrapX > 0.5) {
    if (uv.y < 0.0) { uv.y = -uv.y; uv.x += 0.5; }
    else if (uv.y > 1.0) { uv.y = 2.0 - uv.y; uv.x += 0.5; }
    uv.x = fract(uv.x);
    return uv;
  }
  return clamp(uv, vec2(0.0), vec2(1.0));
}
float valueAt(vec2 uv) { return texture(uImage, safeUv(uv)).r; }
void main() {
  vec2 direction = uDirection * uTexel * uRadius;
  float value = valueAt(vUv) * 0.2270270270;
  value += valueAt(vUv + direction * 1.3846153846) * 0.3162162162;
  value += valueAt(vUv - direction * 1.3846153846) * 0.3162162162;
  value += valueAt(vUv + direction * 3.2307692308) * 0.0702702703;
  value += valueAt(vUv - direction * 3.2307692308) * 0.0702702703;
  outColor = vec4(value, 0.0, 0.0, 1.0);
}`;

const EDGE_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uSmall;
uniform sampler2D uLarge;
uniform vec2 uTexel;
uniform float uDetailGain;
uniform float uTextureGain;
uniform float uWrapX;
in vec2 vUv;
out vec4 outColor;
vec2 safeUv(vec2 uv) {
  if (uWrapX > 0.5) {
    if (uv.y < 0.0) { uv.y = -uv.y; uv.x += 0.5; }
    else if (uv.y > 1.0) { uv.y = 2.0 - uv.y; uv.x += 0.5; }
    uv.x = fract(uv.x);
    return uv;
  }
  return clamp(uv, vec2(0.0), vec2(1.0));
}
float sampleSmall(vec2 offset) { return texture(uSmall, safeUv(vUv + offset * uTexel)).r; }
void main() {
  float tl = sampleSmall(vec2(-1.0,  1.0));
  float tc = sampleSmall(vec2( 0.0,  1.0));
  float tr = sampleSmall(vec2( 1.0,  1.0));
  float ml = sampleSmall(vec2(-1.0,  0.0));
  float mc = sampleSmall(vec2( 0.0,  0.0));
  float mr = sampleSmall(vec2( 1.0,  0.0));
  float bl = sampleSmall(vec2(-1.0, -1.0));
  float bc = sampleSmall(vec2( 0.0, -1.0));
  float br = sampleSmall(vec2( 1.0, -1.0));

  float gx = (3.0 * (tr - tl) + 10.0 * (mr - ml) + 3.0 * (br - bl)) / 16.0;
  float gy = (3.0 * (bl - tl) + 10.0 * (bc - tc) + 3.0 * (br - tr)) / 16.0;
  float magnitude = length(vec2(gx, gy));
  float large = texture(uLarge, safeUv(vUv)).r;
  float darkDetail = max(0.0, large - mc);
  float bandDetail = abs(large - mc) * 0.45;
  float response = magnitude * uDetailGain;
  float textureResponse = max(darkDetail, bandDetail) * uTextureGain;
  vec2 direction = magnitude > 0.00001 ? normalize(vec2(gx, gy)) : vec2(1.0, 0.0);
  outColor = vec4(clamp(response, 0.0, 1.0), direction * 0.5 + 0.5, clamp(textureResponse, 0.0, 1.0));
}`;

const NON_MAX_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uEdges;
uniform vec2 uTexel;
uniform float uLow;
uniform float uHigh;
uniform float uWrapX;
in vec2 vUv;
out vec4 outColor;
vec2 safeUv(vec2 uv) {
  if (uWrapX > 0.5) {
    if (uv.y < 0.0) { uv.y = -uv.y; uv.x += 0.5; }
    else if (uv.y > 1.0) { uv.y = 2.0 - uv.y; uv.x += 0.5; }
    uv.x = fract(uv.x);
    return uv;
  }
  return clamp(uv, vec2(0.0), vec2(1.0));
}
void main() {
  vec4 edge = texture(uEdges, safeUv(vUv));
  vec2 direction = (edge.gb - 0.5) * 2.0;
  float forward = texture(uEdges, safeUv(vUv + direction * uTexel)).r;
  float backward = texture(uEdges, safeUv(vUv - direction * uTexel)).r;
  float peak = edge.r >= forward && edge.r >= backward ? edge.r : 0.0;
  float combined = max(peak, edge.a);
  float state = combined >= uHigh ? 1.0 : combined >= uLow ? 0.5 : 0.0;
  outColor = vec4(state, 0.0, 0.0, 1.0);
}`;

const HYSTERESIS_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uWrapX;
in vec2 vUv;
out vec4 outColor;
vec2 safeUv(vec2 uv) {
  if (uWrapX > 0.5) {
    if (uv.y < 0.0) { uv.y = -uv.y; uv.x += 0.5; }
    else if (uv.y > 1.0) { uv.y = 2.0 - uv.y; uv.x += 0.5; }
    uv.x = fract(uv.x);
    return uv;
  }
  return clamp(uv, vec2(0.0), vec2(1.0));
}
float stateAt(vec2 offset) { return texture(uMask, safeUv(vUv + offset * uTexel)).r; }
void main() {
  float state = stateAt(vec2(0.0));
  if (state > 0.75) {
    outColor = vec4(1.0, 0.0, 0.0, 1.0);
    return;
  }
  if (state < 0.25) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float connected = 0.0;
  for (int y = -1; y <= 1; y += 1) {
    for (int x = -1; x <= 1; x += 1) {
      connected = max(connected, stateAt(vec2(float(x), float(y))));
    }
  }
  outColor = vec4(connected > 0.75 ? 1.0 : 0.5, 0.0, 0.0, 1.0);
}`;

const FINAL_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform sampler2D uEdges;
uniform vec2 uTexel;
uniform float uStroke;
uniform float uLow;
uniform float uBackground;
uniform float uWrapX;
in vec2 vUv;
out vec4 outColor;
vec2 safeUv(vec2 uv) {
  if (uWrapX > 0.5) {
    if (uv.y < 0.0) { uv.y = -uv.y; uv.x += 0.5; }
    else if (uv.y > 1.0) { uv.y = 2.0 - uv.y; uv.x += 0.5; }
    uv.x = fract(uv.x);
    return uv;
  }
  return clamp(uv, vec2(0.0), vec2(1.0));
}
float maskAt(vec2 offset) { return texture(uMask, safeUv(vUv + offset * uTexel)).r; }
void main() {
  float core = step(0.75, maskAt(vec2(0.0)));
  float nearOne = 0.0;
  nearOne = max(nearOne, maskAt(vec2( 1.0, 0.0)));
  nearOne = max(nearOne, maskAt(vec2(-1.0, 0.0)));
  nearOne = max(nearOne, maskAt(vec2(0.0,  1.0)));
  nearOne = max(nearOne, maskAt(vec2(0.0, -1.0)));
  nearOne = max(nearOne, maskAt(vec2( 0.7,  0.7)));
  nearOne = max(nearOne, maskAt(vec2(-0.7,  0.7)));
  nearOne = max(nearOne, maskAt(vec2( 0.7, -0.7)));
  nearOne = max(nearOne, maskAt(vec2(-0.7, -0.7)));
  float nearTwo = 0.0;
  nearTwo = max(nearTwo, maskAt(vec2( 2.0, 0.0)));
  nearTwo = max(nearTwo, maskAt(vec2(-2.0, 0.0)));
  nearTwo = max(nearTwo, maskAt(vec2(0.0,  2.0)));
  nearTwo = max(nearTwo, maskAt(vec2(0.0, -2.0)));
  nearTwo = max(nearTwo, maskAt(vec2( 1.4,  1.4)));
  nearTwo = max(nearTwo, maskAt(vec2(-1.4,  1.4)));
  nearTwo = max(nearTwo, maskAt(vec2( 1.4, -1.4)));
  nearTwo = max(nearTwo, maskAt(vec2(-1.4, -1.4)));
  float firstExpansion = smoothstep(0.75, 1.4, uStroke) * step(0.75, nearOne);
  float secondExpansion = smoothstep(1.35, 2.3, uStroke) * step(0.75, nearTwo);
  float expansion = max(firstExpansion, secondExpansion);
  vec4 edge = texture(uEdges, safeUv(vUv));
  float response = max(edge.r, edge.a);
  float antialias = smoothstep(uLow * 0.72, uLow * 1.28, response);
  float ink = clamp(max(core * max(0.72, antialias), expansion * 0.82), 0.0, 1.0);

  if (uBackground < 0.5) {
    outColor = vec4(vec3(1.0 - ink), 1.0);
  } else if (uBackground < 1.5) {
    outColor = vec4(vec3(0.0), ink);
  } else {
    outColor = vec4(vec3(ink), 1.0);
  }
}`;

type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer };

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create the line-art shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Line-art shader compilation failed.");
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, fragmentSource: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create the line-art program.");
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Line-art program link failed.");
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number, rgba = false, wrapX = false): Target {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) throw new Error("Could not allocate the line-art working image.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, rgba ? gl.RGBA8 : gl.R8, width, height, 0, rgba ? gl.RGBA : gl.RED, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("The browser could not allocate the line-art framebuffer.");
  }
  return { texture, framebuffer };
}

function bindTexture(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, texture: WebGLTexture, unit: number) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(gl.getUniformLocation(program, name), unit);
}

function draw(gl: WebGL2RenderingContext, program: WebGLProgram, target: Target | null, width: number, height: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export async function renderLineArt(source: HTMLCanvasElement, options: LineArtOptions) {
  const width = source.width;
  const height = source.height;
  const wrapX = Boolean(options.wrapX);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL 2 is required for detailed line-art export.");
  const maxRenderSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  if (width > maxRenderSize || height > maxRenderSize) {
    throw new Error(`This line-art output exceeds the browser's ${maxRenderSize}px render limit.`);
  }

  try {
  const programs = {
    grayscale: createProgram(gl, GRAYSCALE_SHADER),
    blur: createProgram(gl, BLUR_SHADER),
    edge: createProgram(gl, EDGE_SHADER),
    nonMax: createProgram(gl, NON_MAX_SHADER),
    hysteresis: createProgram(gl, HYSTERESIS_SHADER),
    final: createProgram(gl, FINAL_SHADER),
  };
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  Object.values(programs).forEach((program) => {
    const position = gl.getAttribLocation(program, "aPosition");
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  });

  const sourceTexture = gl.createTexture();
  if (!sourceTexture) throw new Error("Could not upload the projected image for tracing.");
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

  const gray = createTarget(gl, width, height, false, wrapX);
  const work = createTarget(gl, width, height, false, wrapX);
  const small = createTarget(gl, width, height, false, wrapX);
  const large = createTarget(gl, width, height, false, wrapX);
  const edges = createTarget(gl, width, height, true, wrapX);
  const maskA = createTarget(gl, width, height, false, wrapX);
  const maskB = createTarget(gl, width, height, false, wrapX);
  const texelX = 1 / width;
  const texelY = 1 / height;

  gl.useProgram(programs.grayscale);
  bindTexture(gl, programs.grayscale, "uImage", sourceTexture, 0);
  draw(gl, programs.grayscale, gray, width, height);

  const blurPass = (input: WebGLTexture, target: Target, directionX: number, directionY: number, radius: number) => {
    gl.useProgram(programs.blur);
    bindTexture(gl, programs.blur, "uImage", input, 0);
    gl.uniform2f(gl.getUniformLocation(programs.blur, "uTexel"), texelX, texelY);
    gl.uniform2f(gl.getUniformLocation(programs.blur, "uDirection"), directionX, directionY);
    gl.uniform1f(gl.getUniformLocation(programs.blur, "uRadius"), radius);
    gl.uniform1f(gl.getUniformLocation(programs.blur, "uWrapX"), wrapX ? 1 : 0);
    draw(gl, programs.blur, target, width, height);
  };
  const detail = Math.max(0, Math.min(1, options.detail));
  blurPass(gray.texture, work, 1, 0, 0.72 + (1 - detail) * 0.28);
  blurPass(work.texture, small, 0, 1, 0.72 + (1 - detail) * 0.28);
  let broadInput = gray.texture;
  const broadPasses = detail > 0.72 ? 2 : 3;
  for (let pass = 0; pass < broadPasses; pass += 1) {
    blurPass(broadInput, work, 1, 0, 1);
    blurPass(work.texture, large, 0, 1, 1);
    broadInput = large.texture;
  }

  const profile = options.profile;
  const profileLow = profile === "structural" ? 0.055 : profile === "detailed" ? 0.026 : 0.014;
  const profileHigh = profile === "structural" ? 0.13 : profile === "detailed" ? 0.078 : 0.052;
  const thresholdFactor = 1.35 - detail * 0.65;
  const low = profileLow * thresholdFactor;
  const high = profileHigh * thresholdFactor;
  const textureGain = profile === "structural" ? 1.1 : profile === "detailed" ? 2.4 : 3.8;

  gl.useProgram(programs.edge);
  bindTexture(gl, programs.edge, "uSmall", small.texture, 0);
  bindTexture(gl, programs.edge, "uLarge", large.texture, 1);
  gl.uniform2f(gl.getUniformLocation(programs.edge, "uTexel"), texelX, texelY);
  gl.uniform1f(gl.getUniformLocation(programs.edge, "uDetailGain"), 1.0 + detail * 0.65);
  gl.uniform1f(gl.getUniformLocation(programs.edge, "uTextureGain"), textureGain);
  gl.uniform1f(gl.getUniformLocation(programs.edge, "uWrapX"), wrapX ? 1 : 0);
  draw(gl, programs.edge, edges, width, height);

  gl.useProgram(programs.nonMax);
  bindTexture(gl, programs.nonMax, "uEdges", edges.texture, 0);
  gl.uniform2f(gl.getUniformLocation(programs.nonMax, "uTexel"), texelX, texelY);
  gl.uniform1f(gl.getUniformLocation(programs.nonMax, "uLow"), low);
  gl.uniform1f(gl.getUniformLocation(programs.nonMax, "uHigh"), high);
  gl.uniform1f(gl.getUniformLocation(programs.nonMax, "uWrapX"), wrapX ? 1 : 0);
  draw(gl, programs.nonMax, maskA, width, height);

  let inputMask = maskA;
  let outputMask = maskB;
  const connectivityPasses = profile === "structural" ? 10 : profile === "detailed" ? 14 : 18;
  for (let pass = 0; pass < connectivityPasses; pass += 1) {
    gl.useProgram(programs.hysteresis);
    bindTexture(gl, programs.hysteresis, "uMask", inputMask.texture, 0);
    gl.uniform2f(gl.getUniformLocation(programs.hysteresis, "uTexel"), texelX, texelY);
    gl.uniform1f(gl.getUniformLocation(programs.hysteresis, "uWrapX"), wrapX ? 1 : 0);
    draw(gl, programs.hysteresis, outputMask, width, height);
    [inputMask, outputMask] = [outputMask, inputMask];
  }

  gl.useProgram(programs.final);
  bindTexture(gl, programs.final, "uMask", inputMask.texture, 0);
  bindTexture(gl, programs.final, "uEdges", edges.texture, 1);
  gl.uniform2f(gl.getUniformLocation(programs.final, "uTexel"), texelX, texelY);
  gl.uniform1f(gl.getUniformLocation(programs.final, "uStroke"), 0.72 + Math.max(0, Math.min(1, options.stroke)) * 1.65);
  gl.uniform1f(gl.getUniformLocation(programs.final, "uLow"), low);
  gl.uniform1f(gl.getUniformLocation(programs.final, "uBackground"), options.background === "white" ? 0 : options.background === "transparent" ? 1 : 2);
  gl.uniform1f(gl.getUniformLocation(programs.final, "uWrapX"), wrapX ? 1 : 0);
  draw(gl, programs.final, null, width, height);
  gl.finish();
  lineArtCleanups.set(canvas, () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);
    [gray, work, small, large, edges, maskA, maskB].forEach((target) => {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    });
    gl.deleteTexture(sourceTexture);
    gl.deleteBuffer(positionBuffer);
    Object.values(programs).forEach((program) => gl.deleteProgram(program));
    gl.flush();
  });
  return canvas;
  } catch (cause) {
    canvas.addEventListener("webglcontextlost", (event) => event.preventDefault(), { once: true });
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    throw cause;
  }
}

const TILED_LINE_ART_THRESHOLD = 12_000_000;
const TILE_SIZE = 2048;
const TILE_HALO = 32;

function modulo(value: number, size: number) {
  return ((value % size) + size) % size;
}

function reflectedRow(row: number, height: number) {
  let sourceRow = row;
  let halfTurns = 0;
  while (sourceRow < 0 || sourceRow >= height) {
    if (sourceRow < 0) sourceRow = -sourceRow - 1;
    else sourceRow = height * 2 - sourceRow - 1;
    halfTurns += 1;
  }
  return { row: sourceRow, halfTurn: halfTurns % 2 === 1 };
}

function drawWrappedRow(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  destinationY: number,
  width: number,
) {
  let remaining = width;
  let destinationX = 0;
  let cursor = sourceX;
  while (remaining > 0.001) {
    const wrappedX = modulo(cursor, source.width);
    const run = Math.min(remaining, source.width - wrappedX);
    context.drawImage(source, wrappedX, sourceY, run, 1, destinationX, destinationY, run, 1);
    cursor += run;
    destinationX += run;
    remaining -= run;
  }
}

function drawClampedRow(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  destinationY: number,
  width: number,
) {
  const left = Math.min(width, Math.max(0, -sourceX));
  if (left > 0) context.drawImage(source, 0, sourceY, 1, 1, 0, destinationY, left, 1);
  const centreStart = Math.max(0, sourceX);
  const centreWidth = Math.max(0, Math.min(width - left, source.width - centreStart));
  if (centreWidth > 0) context.drawImage(source, centreStart, sourceY, centreWidth, 1, left, destinationY, centreWidth, 1);
  const rightStart = left + centreWidth;
  if (rightStart < width) context.drawImage(source, source.width - 1, sourceY, 1, 1, rightStart, destinationY, width - rightStart, 1);
}

function copyTileWithHalo(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  sphericalWrap: boolean,
) {
  const tile = document.createElement("canvas");
  tile.width = width + TILE_HALO * 2;
  tile.height = height + TILE_HALO * 2;
  const context = tile.getContext("2d", { alpha: true });
  if (!context) throw new Error("The browser could not allocate a line-art tile.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (let tileY = 0; tileY < tile.height; tileY += 1) {
    const logicalY = y + tileY - TILE_HALO;
    if (sphericalWrap) {
      const reflected = reflectedRow(logicalY, source.height);
      const halfTurn = reflected.halfTurn ? source.width / 2 : 0;
      drawWrappedRow(context, source, x - TILE_HALO + halfTurn, reflected.row, tileY, tile.width);
    } else {
      const sourceY = Math.max(0, Math.min(source.height - 1, logicalY));
      drawClampedRow(context, source, x - TILE_HALO, sourceY, tileY, tile.width);
    }
  }
  return tile;
}

export async function renderLineArtAdaptive(source: HTMLCanvasElement, options: LineArtOptions) {
  if (source.width * source.height <= TILED_LINE_ART_THRESHOLD) return renderLineArt(source, options);

  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const outputContext = output.getContext("2d", { alpha: true });
  if (!outputContext) throw new Error("The browser could not allocate the tiled line-art output.");

  for (let y = 0; y < source.height; y += TILE_SIZE) {
    for (let x = 0; x < source.width; x += TILE_SIZE) {
      const width = Math.min(TILE_SIZE, source.width - x);
      const height = Math.min(TILE_SIZE, source.height - y);
      const tileSource = copyTileWithHalo(source, x, y, width, height, Boolean(options.wrapX));
      const tileResult = await renderLineArt(tileSource, { ...options, wrapX: false });
      outputContext.drawImage(
        tileResult,
        TILE_HALO,
        TILE_HALO,
        width,
        height,
        x,
        y,
        width,
        height,
      );
      releaseLineArtCanvas(tileResult);
      tileSource.width = 1;
      tileSource.height = 1;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
  return output;
}
