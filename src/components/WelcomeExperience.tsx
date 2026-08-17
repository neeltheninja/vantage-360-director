import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowRight,
  CaretLeft,
  CaretRight,
  CheckCircle,
  CopySimple,
  DownloadSimple,
  FileMd,
  Sparkle,
  UploadSimple,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { ShowcaseExample } from "../lib/showcase";
import panoramaSkillUrl from "../../docs/SKILL-FinalPanorama(DEFINITE).md?url";

const SKILL_FILENAME = "SKILL-FinalPanorama(DEFINITE).md";

async function copyText(text: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.left = "-9999px";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy failed");
}

type WelcomeExperienceProps = {
  sourceName: string;
  onEnter: () => void;
  onOpenFiles: () => void;
  onOpenPromptLab: () => void;
  examples: readonly ShowcaseExample[];
  onOpenExample: (example: ShowcaseExample) => void;
};

export function WelcomeExperience({
  sourceName,
  onEnter,
  onOpenFiles,
  onOpenPromptLab,
  examples,
  onOpenExample,
}: WelcomeExperienceProps) {
  const reduceMotion = useReducedMotion();
  const worlds = useRef<HTMLDivElement>(null);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const [skillCopied, setSkillCopied] = useState(false);
  const copyReset = useRef<number | null>(null);
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.72, ease: [0.16, 1, 0.3, 1] as const };

  const scrollWorlds = (direction: -1 | 1) => {
    const shelf = worlds.current;
    if (!shelf) return;
    shelf.scrollBy({
      left: direction * Math.min(620, shelf.clientWidth * 0.82),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    if (reduceMotion || autoScrollPaused || examples.length < 2) return;
    let frame = 0;
    let previous = performance.now();

    const advance = (now: number) => {
      const shelf = worlds.current;
      const elapsed = Math.min(48, now - previous);
      previous = now;
      if (shelf) {
        const loopWidth = shelf.scrollWidth / 2;
        shelf.scrollLeft += elapsed * 0.018;
        if (shelf.scrollLeft >= loopWidth) shelf.scrollLeft -= loopWidth;
      }
      frame = window.requestAnimationFrame(advance);
    };

    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [autoScrollPaused, examples.length, reduceMotion]);

  useEffect(() => () => {
    if (copyReset.current) window.clearTimeout(copyReset.current);
  }, []);

  const copySkill = async () => {
    try {
      const response = await fetch(panoramaSkillUrl);
      if (!response.ok) throw new Error("Skill download failed");
      await copyText(await response.text());
      setSkillCopied(true);
      if (copyReset.current) window.clearTimeout(copyReset.current);
      copyReset.current = window.setTimeout(() => setSkillCopied(false), 2400);
    } catch {
      setSkillCopied(false);
    }
  };

  const downloadSkill = () => {
    const link = document.createElement("a");
    link.href = panoramaSkillUrl;
    link.download = SKILL_FILENAME;
    link.click();
  };

  const exampleList = (duplicate = false) => (
    <ul className="welcome-worlds-list" aria-label={duplicate ? undefined : "Showcase panoramas"} aria-hidden={duplicate || undefined}>
      {examples.map((example) => {
        const thumbnail = `${import.meta.env.BASE_URL}showcase-thumbs/${example.filename.replace(/\.[^.]+$/, "")}.webp`;
        return (
          <li key={`${duplicate ? "loop-" : ""}${example.id}`}>
            <button type="button" tabIndex={duplicate ? -1 : undefined} onClick={() => onOpenExample(example)} aria-label={`Open ${example.title} in Vantage`}>
              <img
                src={thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  if (event.currentTarget.src !== example.src) event.currentTarget.src = example.src;
                }}
              />
              <span>{example.title}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <motion.section
      className="welcome-experience"
      role="region"
      aria-labelledby="welcome-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.34 }}
    >
      <div className="welcome-scrim" aria-hidden="true" />

      <motion.header
        className="welcome-topbar"
        initial={reduceMotion ? false : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <div className="welcome-brand">
          <span className="welcome-brand-mark"><Aperture size={22} weight="bold" /></span>
          <span className="welcome-brand-copy">
            <strong>VANTAGE</strong>
            <small>BY DASHVERSE</small>
          </span>
        </div>
        <div className="welcome-top-actions" aria-label="Open Vantage">
          <button className="welcome-secondary" type="button" onClick={onOpenFiles} aria-label="Open panorama">
            <UploadSimple size={17} />
            <span className="welcome-open-full">Open panorama</span>
            <span className="welcome-open-short" aria-hidden="true">Open</span>
          </button>
          <button className="welcome-primary" type="button" onClick={onEnter} autoFocus>
            Enter Vantage <ArrowRight size={17} weight="bold" />
          </button>
        </div>
      </motion.header>

      <motion.div
        className="welcome-story"
        initial={reduceMotion ? false : { opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transition, delay: reduceMotion ? 0 : 0.08 }}
      >
        <span className="welcome-label">A PANORAMA DIRECTOR</span>
        <h1 id="welcome-title">Every direction is a frame.</h1>
        <p>Step into a prompt-built world, direct the view, and export the shot.</p>
      </motion.div>

      <motion.aside
        className="welcome-worlds"
        aria-labelledby="welcome-worlds-title"
        initial={reduceMotion ? false : { opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...transition, delay: reduceMotion ? 0 : 0.18 }}
      >
        <section className="welcome-skill" aria-labelledby="welcome-skill-title">
          <span className="welcome-skill-icon"><FileMd size={23} weight="duotone" /></span>
          <span className="welcome-skill-copy">
            <small>Vantage production system</small>
            <strong id="welcome-skill-title">The complete panorama Skill.md</strong>
            <span>Complete Markdown instructions for generating reliable 360 worlds with Frameo.</span>
          </span>
          <span className="welcome-skill-actions">
            <button type="button" onClick={() => void copySkill()} aria-label="Copy the complete panorama skill">
              {skillCopied ? <CheckCircle size={16} weight="fill" /> : <CopySimple size={16} />}
              {skillCopied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={downloadSkill} aria-label="Download the complete panorama skill as Markdown">
              <DownloadSimple size={16} /> Download .md
            </button>
            <button type="button" onClick={onOpenPromptLab} aria-label="Open the Frameo guide and panorama skill reader">
              Read guide <ArrowRight size={15} />
            </button>
          </span>
        </section>

        <header className="welcome-worlds-header">
          <div>
            <span className="welcome-prompt-icon"><Sparkle size={18} weight="fill" /></span>
            <span>
              <strong id="welcome-worlds-title">Explore prompt worlds</strong>
              <small>Select any panorama to direct it immediately.</small>
            </span>
          </div>
          <div className="welcome-worlds-actions">
            <button type="button" onClick={() => scrollWorlds(-1)} aria-label="Scroll showcase left"><CaretLeft size={16} /></button>
            <button type="button" onClick={() => scrollWorlds(1)} aria-label="Scroll showcase right"><CaretRight size={16} /></button>
          </div>
        </header>
        <div
          className="welcome-worlds-track"
          ref={worlds}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") setAutoScrollPaused(true); }}
          onPointerLeave={(event) => { if (event.pointerType === "mouse") setAutoScrollPaused(false); }}
          onPointerDown={() => setAutoScrollPaused(true)}
          onFocusCapture={() => setAutoScrollPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setAutoScrollPaused(false);
          }}
          onWheel={(event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.currentTarget.scrollLeft += event.deltaY;
          }}
        >
          <div className="welcome-worlds-marquee">
            {exampleList()}
            {exampleList(true)}
          </div>
        </div>
      </motion.aside>

      <motion.footer
        className="welcome-footer"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.6, delay: reduceMotion ? 0 : 0.3 }}
      >
        <span>{sourceName}</span>
        <span>Made by <strong>Soumya Deepta Sarkar</strong></span>
      </motion.footer>
    </motion.section>
  );
}
