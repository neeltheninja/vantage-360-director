import { useEffect, useRef, useState } from "react";
import { type MotionValue } from "motion/react";
import type { LensProjection, Projection } from "../types";
import { horizontalFov } from "../lib/camera";
import { cameraRotationMatrix } from "../lib/rotation";

type ViewerProps = {
  yaw: MotionValue<number>;
  pitch: MotionValue<number>;
  roll: MotionValue<number>;
  focal: number;
  projection: Projection;
  lensProjection: LensProjection;
  sourceUrl: string;
  sourceName: string;
  onZoom: (deltaY: number) => void;
  onFirstInteract: () => void;
  onReady: () => void;
};

const VERTEX_SHADER_WEBGL2 = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER_WEBGL2 = `#version 300 es
precision highp float;
uniform sampler2D uPanorama;
uniform mat3 uRotation;
uniform float uProjectionMode;
uniform float uTanHalfHFov;
uniform float uTanHalfVFov;
uniform float uProjectionHalfWidth;
in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 screen = vUv * 2.0 - 1.0;
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
  vec2 uv = vec2(fract(0.5 + longitude / 6.28318530718), 0.5 - latitude / 3.14159265359);
  outColor = texture(uPanorama, uv);
}`;

const VERTEX_SHADER_WEBGL1 = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER_WEBGL1 = `
precision mediump float;
uniform sampler2D uPanorama;
uniform mat3 uRotation;
uniform float uProjectionMode;
uniform float uTanHalfHFov;
uniform float uTanHalfVFov;
uniform float uProjectionHalfWidth;
varying vec2 vUv;

void main() {
  vec2 screen = vUv * 2.0 - 1.0;
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
  vec2 uv = vec2(fract(0.5 + longitude / 6.28318530718), 0.5 - latitude / 3.14159265359);
  gl_FragColor = texture2D(uPanorama, uv);
}`;

type PanoramaGl = WebGLRenderingContext | WebGL2RenderingContext;

type PreparedTextureSource = {
  source: TexImageSource;
  width: number;
  height: number;
};

function compileShader(gl: PanoramaGl, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create the panorama viewer shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Panorama viewer shader compilation failed.");
  }
  return shader;
}

function textureSourceWithinLimit(image: HTMLImageElement, maxTextureSize: number): PreparedTextureSource {
  const scale = Math.min(
    1,
    maxTextureSize / image.naturalWidth,
    maxTextureSize / image.naturalHeight,
  );
  if (scale >= 1) {
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  }

  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.floor(image.naturalWidth * scale));
  preview.height = Math.max(1, Math.floor(image.naturalHeight * scale));
  const context = preview.getContext("2d", { alpha: false });
  if (!context) throw new Error("The browser could not prepare a GPU-safe panorama preview.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, preview.width, preview.height);
  return { source: preview, width: preview.width, height: preview.height };
}

function isPowerOfTwo(value: number) {
  return value > 0 && (value & (value - 1)) === 0;
}

export function PanoramaViewer({
  yaw,
  pitch,
  roll,
  focal,
  projection,
  lensProjection,
  sourceUrl,
  sourceName,
  onZoom,
  onFirstInteract,
  onReady,
}: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitArea = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, x: 0, y: 0 });
  const drawRef = useRef<() => void>(() => undefined);
  const focalRef = useRef(focal);
  const lensProjectionRef = useRef(lensProjection);
  const onReadyRef = useRef(onReady);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => {
    focalRef.current = focal;
    lensProjectionRef.current = lensProjection;
    drawRef.current();
  }, [focal, lensProjection]);

  useEffect(() => {
    if (projection === "flat") {
      onReadyRef.current();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError("");
    const contextOptions: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    };
    const webgl2 = canvas.getContext("webgl2", contextOptions);
    const gl: PanoramaGl | null = webgl2 ?? canvas.getContext("webgl", contextOptions);
    const isWebGl2 = webgl2 !== null;
    if (!gl) {
      setError("360 controls are unavailable in this browser. Showing the source image instead.");
      onReadyRef.current();
      return;
    }

    let disposed = false;
    let ready = false;
    let texture: WebGLTexture | null = null;
    const program = gl.createProgram();
    if (!program) {
      setError("The browser could not start the panorama viewer.");
      onReadyRef.current();
      return;
    }

    try {
      gl.attachShader(
        program,
        compileShader(gl, gl.VERTEX_SHADER, isWebGl2 ? VERTEX_SHADER_WEBGL2 : VERTEX_SHADER_WEBGL1),
      );
      gl.attachShader(
        program,
        compileShader(gl, gl.FRAGMENT_SHADER, isWebGl2 ? FRAGMENT_SHADER_WEBGL2 : FRAGMENT_SHADER_WEBGL1),
      );
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "Panorama viewer program link failed.");
      }
      gl.useProgram(program);
      const vertices = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The panorama viewer could not start.");
      onReadyRef.current();
      return;
    }

    const draw = () => {
      if (disposed || !ready) return;
      const pixelRatio = Math.min(1.6, window.devicePixelRatio || 1);
      const width = Math.max(2, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(2, Math.round(canvas.clientHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const hFov = horizontalFov(focalRef.current);
      const halfHFov = hFov * Math.PI / 360;
      const aspect = width / height;
      const panini = lensProjectionRef.current === "panini";
      const projectionHalfWidth = panini ? 2 * Math.tan(halfHFov / 2) : Math.tan(halfHFov);
      const halfHeight = panini ? projectionHalfWidth / aspect : Math.tan(halfHFov) / aspect;
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.uniform1f(gl.getUniformLocation(program, "uProjectionMode"), panini ? 1 : 0);
      gl.uniform1f(gl.getUniformLocation(program, "uTanHalfHFov"), Math.tan(halfHFov));
      gl.uniform1f(gl.getUniformLocation(program, "uTanHalfVFov"), halfHeight);
      gl.uniform1f(gl.getUniformLocation(program, "uProjectionHalfWidth"), projectionHalfWidth);
      gl.uniformMatrix3fv(
        gl.getUniformLocation(program, "uRotation"),
        false,
        cameraRotationMatrix(pitch.get(), yaw.get(), roll.get()),
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    drawRef.current = draw;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      try {
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        const prepared = textureSourceWithinLimit(image, maxTextureSize);
        const supportsMipmappedRepeat = isWebGl2
          || (isPowerOfTwo(prepared.width) && isPowerOfTwo(prepared.height));
        texture = gl.createTexture();
        if (!texture) throw new Error("The browser could not allocate the panorama texture.");
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_WRAP_S,
          supportsMipmappedRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          supportsMipmappedRepeat ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
        );
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prepared.source);
        if (supportsMipmappedRepeat) gl.generateMipmap(gl.TEXTURE_2D);
        const textureError = gl.getError();
        if (textureError !== gl.NO_ERROR) {
          throw new Error(`The browser rejected the panorama texture (WebGL ${textureError}).`);
        }
        gl.uniform1i(gl.getUniformLocation(program, "uPanorama"), 0);
        ready = true;
        draw();
        onReadyRef.current();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The panorama texture could not be prepared.");
        onReadyRef.current();
      }
    };
    image.onerror = () => {
      if (disposed) return;
      setError("This browser could not load the panorama image.");
      onReadyRef.current();
    };
    image.src = sourceUrl;

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    window.addEventListener("resize", draw);
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      ready = false;
      setError("The 360 renderer paused. Showing the source image while it recovers.");
      onReadyRef.current();
    };
    const handleContextRestored = () => setRetry((value) => value + 1);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    const unsubscribers = [yaw.on("change", draw), pitch.on("change", draw), roll.on("change", draw)];
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", draw);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      drawRef.current = () => undefined;
      if (texture) gl.deleteTexture(texture);
      gl.deleteProgram(program);
    };
  }, [pitch, projection, retry, roll, sourceUrl, yaw]);

  useEffect(() => {
    const element = hitArea.current;
    if (!element || projection === "flat") return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? element.clientHeight : 1;
      onZoom(event.deltaY * multiplier);
      onFirstInteract();
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [onFirstInteract, onZoom, projection]);

  if (projection === "flat") {
    return <div className="flat-panorama" style={{ backgroundImage: `url(${sourceUrl})` }} role="img" aria-label={`Flat image view of ${sourceName}`} />;
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { active: true, x: event.clientX, y: event.clientY };
    onFirstInteract();
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    const degreesPerPixel = horizontalFov(focalRef.current) / Math.max(320, event.currentTarget.clientWidth);
    drag.current = { active: true, x: event.clientX, y: event.clientY };
    yaw.set(yaw.get() - dx * degreesPerPixel);
    pitch.set(Math.max(-89.5, Math.min(89.5, pitch.get() + dy * degreesPerPixel)));
  };
  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      <div
        className="flat-panorama"
        style={{ backgroundImage: `url(${sourceUrl})` }}
        role="img"
        aria-hidden={!error}
        aria-label={`Panorama preview of ${sourceName}`}
      />
      <canvas ref={canvasRef} className={`viewer-canvas lens-${lensProjection}`} aria-hidden="true" />
      <div
        ref={hitArea}
        className="viewer-hit-area"
        aria-label="Interactive panorama. Drag the image to look around."
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onDoubleClick={() => { onZoom(-80); onFirstInteract(); }}
      />
      {error && (
        <div
          className="viewer-error"
          role="alert"
          style={{ background: "linear-gradient(180deg, rgba(8, 9, 13, 0.42), rgba(8, 9, 13, 0.78))" }}
        >
          <span>{error}</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry 360 view</button>
        </div>
      )}
    </>
  );
}
