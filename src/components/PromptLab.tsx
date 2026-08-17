import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ChatCircleDots,
  CheckCircle,
  CircleNotch,
  CopySimple,
  CubeFocus,
  DownloadSimple,
  FileMd,
  ImageSquare,
  PaperPlaneTilt,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import panoramaSkill from "../../docs/SKILL-FinalPanorama(DEFINITE).md?raw";
import { SHOWCASE_IMAGES, SHOWCASE_MODE, type ShowcaseExample } from "../lib/showcase";
import "./PromptLab.css";

const SKILL_FILENAME = "SKILL-FinalPanorama(DEFINITE).md";

const FRAMEO_CHAT_OPENER = `Use the complete panorama skill above as binding operating instructions.

Start at Stage 0. Ask me for the location brief and an optional reference image, then return the completed §14 Fill Checklist and computed geometry before generating.

For generation, use only openai-gpt-image-2 at 16:9, 4K, high quality, with 2 iterations. Generate fresh takes. Never repair a failed panorama with image-to-image edits.

Deliver the native 3840 × 2160 image for VANTAGE and judge it in a 360 viewer.`;

type ActionState = "idle" | "working" | "success" | "error";

export type PromptLabProps = {
  className?: string;
  onClose?: () => void;
  onOpenExample?: (example: ShowcaseExample) => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function copyPlainText(text: string) {
  let clipboardFailure: unknown;

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (cause) {
      clipboardFailure = cause;
    }
  }

  const target = document.createElement("textarea");
  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  target.value = text;
  target.readOnly = true;
  target.setAttribute("aria-hidden", "true");
  target.style.position = "fixed";
  target.style.inset = "0 auto auto -9999px";
  document.body.appendChild(target);

  try {
    target.focus();
    target.select();
    if (!document.execCommand("copy")) {
      throw clipboardFailure instanceof Error
        ? clipboardFailure
        : new Error("Clipboard access was denied.");
    }
  } finally {
    target.remove();
    previouslyFocused?.focus();
  }
}

function actionLabel(
  state: ActionState,
  idle: string,
  working: string,
  success: string,
) {
  if (state === "working") return working;
  if (state === "success") return success;
  if (state === "error") return "Try again";
  return idle;
}

function ActionIcon({ state, kind }: { state: ActionState; kind: "copy" | "download" }) {
  if (state === "working") return <CircleNotch className="prompt-lab__spin" size={18} />;
  if (state === "success") return <CheckCircle size={18} weight="fill" />;
  if (state === "error") return <WarningCircle size={18} weight="fill" />;
  return kind === "copy"
    ? <CopySimple size={18} weight="bold" />
    : <DownloadSimple size={18} weight="bold" />;
}

export function PromptLab({ className = "", onClose, onOpenExample }: PromptLabProps) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const frameoTitleId = useId();
  const openerTitleId = useId();
  const showcaseTitleId = useId();
  const [copyState, setCopyState] = useState<ActionState>("idle");
  const [downloadState, setDownloadState] = useState<ActionState>("idle");
  const [openerState, setOpenerState] = useState<ActionState>("idle");
  const copyReset = useRef<number | null>(null);
  const downloadReset = useRef<number | null>(null);
  const openerReset = useRef<number | null>(null);

  const skillStats = useMemo(() => {
    const source = panoramaSkill.trimEnd();
    return {
      lines: source.split(/\r?\n/).length,
      sections: source.match(/^##\s/gm)?.length ?? 0,
      size: formatBytes(new Blob([panoramaSkill]).size),
    };
  }, []);

  useEffect(() => () => {
    if (copyReset.current !== null) window.clearTimeout(copyReset.current);
    if (downloadReset.current !== null) window.clearTimeout(downloadReset.current);
    if (openerReset.current !== null) window.clearTimeout(openerReset.current);
  }, []);

  const resetLater = (
    timer: typeof copyReset,
    setter: (state: ActionState) => void,
  ) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setter("idle"), 3200);
  };

  const copySkill = async () => {
    setCopyState("working");
    try {
      await copyPlainText(panoramaSkill);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
    resetLater(copyReset, setCopyState);
  };

  const copyOpener = async () => {
    setOpenerState("working");
    try {
      await copyPlainText(FRAMEO_CHAT_OPENER);
      setOpenerState("success");
    } catch {
      setOpenerState("error");
    }
    resetLater(openerReset, setOpenerState);
  };

  const downloadSkill = async () => {
    setDownloadState("working");
    let objectUrl = "";
    let anchor: HTMLAnchorElement | null = null;

    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const blob = new Blob([panoramaSkill], { type: "text/markdown;charset=utf-8" });
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = SKILL_FILENAME;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      setDownloadState("success");
    } catch {
      setDownloadState("error");
    } finally {
      anchor?.remove();
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      resetLater(downloadReset, setDownloadState);
    }
  };

  const statusMessage = copyState === "success"
    ? `All ${skillStats.lines} lines are on your clipboard.`
    : copyState === "error"
      ? "Clipboard access failed. Download the Markdown file instead."
      : downloadState === "success"
        ? `${SKILL_FILENAME} is ready in your downloads.`
        : downloadState === "error"
          ? "The browser blocked the download. Try copying the complete skill instead."
          : "Both actions use the complete source without edits.";

  const entrance = reduceMotion
    ? { initial: false as const, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } };

  return (
    <section
      className={["prompt-lab", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <header className="prompt-lab__masthead">
        <div className="prompt-lab__brand" aria-label="Vantage by Dashverse">
          <span className="prompt-lab__brand-mark" aria-hidden="true"><CubeFocus size={21} weight="duotone" /></span>
          <span><strong>VANTAGE</strong><small>by DASHVERSE</small></span>
        </div>
        <div className="prompt-lab__masthead-copy">
          <Sparkle size={15} weight="fill" aria-hidden="true" />
          <span>Panorama generation field manual</span>
        </div>
        {onClose && (
          <button className="prompt-lab__close" type="button" onClick={onClose} aria-label="Close panorama skill" autoFocus>
            <X size={19} />
          </button>
        )}
      </header>

      <div className="prompt-lab__content">
        <div className="prompt-lab__hero">
          <motion.div
            className="prompt-lab__hero-copy"
            {...entrance}
            transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="prompt-lab__eyebrow">FRAMEO PANORAMA SYSTEM</span>
            <h2 id={titleId}>Build worlds worth directing.</h2>
            <p>Take the definitive 360 method into Frameo, generate a coherent sphere, then direct every angle here.</p>

            <div className="prompt-lab__actions">
              <button
                className="prompt-lab__button prompt-lab__button--primary"
                type="button"
                onClick={() => void copySkill()}
                disabled={copyState === "working"}
                data-state={copyState}
              >
                <ActionIcon state={copyState} kind="copy" />
                {actionLabel(copyState, "Copy full skill", "Copying skill", "Copied in full")}
              </button>
              <button
                className="prompt-lab__button prompt-lab__button--secondary"
                type="button"
                onClick={() => void downloadSkill()}
                disabled={downloadState === "working"}
                data-state={downloadState}
              >
                <ActionIcon state={downloadState} kind="download" />
                {actionLabel(downloadState, "Download .md", "Preparing file", "Downloaded")}
              </button>
            </div>
            <p
              className="prompt-lab__action-status"
              role={copyState === "error" || downloadState === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {statusMessage}
            </p>
          </motion.div>

          <motion.aside
            className="prompt-lab__document-card"
            aria-label="Panorama skill document details"
            {...entrance}
            transition={{ duration: 0.62, delay: reduceMotion ? 0 : 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="prompt-lab__document-icon"><FileMd size={30} weight="duotone" /></div>
            <div className="prompt-lab__document-heading">
              <span>Complete source</span>
              <strong>{SKILL_FILENAME}</strong>
              <p>Imported verbatim at build time. No shortened prompt, hidden request, or server fetch.</p>
            </div>
            <dl className="prompt-lab__document-stats">
              <div><dt>Lines</dt><dd>{skillStats.lines}</dd></div>
              <div><dt>Sections</dt><dd>{skillStats.sections}</dd></div>
              <div><dt>Size</dt><dd>{skillStats.size}</dd></div>
            </dl>
            <div className="prompt-lab__integrity"><CheckCircle size={17} weight="fill" /><span>Exact Markdown included in this app</span></div>
          </motion.aside>
        </div>

        <motion.section
          className={`prompt-lab__showcase prompt-lab__showcase--${SHOWCASE_MODE}`}
          aria-labelledby={showcaseTitleId}
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.16 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="prompt-lab__showcase-heading">
            <h3 id={showcaseTitleId}>See what Vantage can do with prompts.</h3>
            <p>Every example is a full spherical location. Open one, aim anywhere, and turn it into a shot.</p>
          </header>

          {SHOWCASE_IMAGES.length > 0 ? (
            <div className="prompt-lab__showcase-track" aria-label="Prompt-built panorama examples">
              {SHOWCASE_IMAGES.map((example) => (
                <figure className="prompt-lab__showcase-item" key={example.id}>
                  <button
                    className="prompt-lab__showcase-image"
                    type="button"
                    onClick={() => onOpenExample?.(example)}
                    aria-label={`Open ${example.title} in Vantage`}
                  >
                    <img src={example.src} alt={example.alt} loading={example.isDefault ? "eager" : "lazy"} />
                  </button>
                  <figcaption>
                    <span><strong>{example.title}</strong><small>Prompt-built 360 location</small></span>
                    <button type="button" onClick={() => onOpenExample?.(example)}>
                      Open in Vantage <ArrowRight size={15} weight="bold" />
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="prompt-lab__showcase-empty">
              <ImageSquare size={30} weight="duotone" />
              <strong>Your next world belongs here.</strong>
              <span>Add an image to docs/showcase and rebuild. Vantage discovers it automatically.</span>
            </div>
          )}
        </motion.section>

        <motion.section
          className="prompt-lab__frameo"
          aria-labelledby={frameoTitleId}
          initial={reduceMotion ? false : { opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="prompt-lab__frameo-intro">
            <span className="prompt-lab__frameo-icon"><ChatCircleDots size={26} weight="duotone" /></span>
            <h3 id={frameoTitleId}>Use it with Frameo Agent Chat</h3>
            <p>The skill handles projection, geometry, coverage, materials, QC, and the native VANTAGE handoff.</p>

            <dl className="prompt-lab__call-spec" aria-label="Required Frameo generation settings">
              <div><dt>Model</dt><dd>openai-gpt-image-2</dd></div>
              <div><dt>Canvas</dt><dd>16:9 at 4K</dd></div>
              <div><dt>Quality</dt><dd>High</dd></div>
              <div><dt>Takes</dt><dd>2 fresh generations</dd></div>
            </dl>
          </div>

          <ol className="prompt-lab__handoff">
            <li>
              <span className="prompt-lab__stage-icon"><CopySimple size={18} /></span>
              <div><strong>Install the method</strong><p>Copy the full skill above and paste it as the first message in a new Frameo Agent Chat.</p></div>
            </li>
            <li>
              <span className="prompt-lab__stage-icon"><ChatCircleDots size={18} /></span>
              <div><strong>Describe the world</strong><p>Send your location brief or reference. Ask Frameo to compute geometry and complete the fill checklist before generation.</p></div>
            </li>
            <li>
              <span className="prompt-lab__stage-icon"><Sparkle size={18} /></span>
              <div><strong>Generate and inspect</strong><p>Make two fresh takes. Check the ceiling first, then cornice, walls, wrap, corners, horizon, and nadir.</p></div>
            </li>
            <li>
              <span className="prompt-lab__stage-icon"><CubeFocus size={18} /></span>
              <div><strong>Direct the native master</strong><p>Bring the untouched 3840 × 2160 result into VANTAGE. Do not pre-resample or bake a tonal ramp.</p></div>
            </li>
          </ol>
        </motion.section>

        <section className="prompt-lab__opener" aria-labelledby={openerTitleId}>
          <div className="prompt-lab__opener-heading">
            <div>
              <PaperPlaneTilt size={21} weight="duotone" />
              <span><strong id={openerTitleId}>Frameo handoff message</strong><small>Paste this immediately after the complete skill.</small></span>
            </div>
            <button
              className="prompt-lab__button prompt-lab__button--compact"
              type="button"
              onClick={() => void copyOpener()}
              disabled={openerState === "working"}
              data-state={openerState}
            >
              <ActionIcon state={openerState} kind="copy" />
              {actionLabel(openerState, "Copy message", "Copying", "Message copied")}
            </button>
          </div>
          <pre tabIndex={0} aria-label="Frameo handoff message"><code>{FRAMEO_CHAT_OPENER}</code></pre>
          <span className="prompt-lab__opener-status" role={openerState === "error" ? "alert" : "status"} aria-live="polite">
            {openerState === "error" ? "Clipboard access failed. Select the message and copy it manually." : openerState === "success" ? "Handoff message copied." : ""}
          </span>
        </section>

      </div>
    </section>
  );
}
