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

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create the panorama viewer shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Panorama viewer shader compilation failed.");
  }
  return shader;
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
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      setError("This browser needs WebGL 2 for the 360 view.");
      return;
    }

    let disposed = false;
    let ready = false;
    let texture: WebGLTexture | null = null;
    const program = gl.createProgram();
    if (!program) {
      setError("The browser could not start the panorama viewer.");
      return;
    }

    try {
      gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
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
    image.onload = () => {
      if (disposed) return;
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      if (image.naturalWidth > maxTextureSize || image.naturalHeight > maxTextureSize) {
        setError(`This image exceeds the browser's ${maxTextureSize}px texture limit.`);
        return;
      }
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1i(gl.getUniformLocation(program, "uPanorama"), 0);
      ready = true;
      draw();
      onReadyRef.current();
    };
    image.onerror = () => { if (!disposed) setError("This browser could not load the panorama texture."); };
    image.src = sourceUrl;

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const unsubscribers = [yaw.on("change", draw), pitch.on("change", draw), roll.on("change", draw)];
    return () => {
      disposed = true;
      observer.disconnect();
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
      <canvas ref={canvasRef} className={`viewer-canvas lens-${lensProjection}`} aria-hidden="true" />
      {error && <div className="viewer-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
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
    </>
  );
}
