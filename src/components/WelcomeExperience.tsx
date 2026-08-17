import { useEffect, useRef, useState } from "react";
import { Aperture, ArrowRight, CaretLeft, CaretRight, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { ShowcaseExample } from "../lib/showcase";

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
  const worlds = useRef<HTMLUListElement>(null);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
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
    const timer = window.setInterval(() => {
      const shelf = worlds.current;
      if (!shelf) return;
      const atEnd = shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 12;
      shelf.scrollTo({
        left: atEnd ? 0 : shelf.scrollLeft + Math.min(620, shelf.clientWidth * 0.82),
        behavior: "smooth",
      });
    }, 4200);
    return () => window.clearInterval(timer);
  }, [autoScrollPaused, examples.length, reduceMotion]);

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
        <header className="welcome-worlds-header">
          <div>
            <span className="welcome-prompt-icon"><Sparkle size={18} weight="fill" /></span>
            <span>
              <strong id="welcome-worlds-title">Explore prompt worlds</strong>
              <small>Select any panorama to direct it immediately.</small>
            </span>
          </div>
          <div className="welcome-worlds-actions">
            <button type="button" onClick={onOpenPromptLab} aria-label="Open Frameo guide and panorama skill">Guide</button>
            <button type="button" onClick={() => scrollWorlds(-1)} aria-label="Scroll showcase left"><CaretLeft size={16} /></button>
            <button type="button" onClick={() => scrollWorlds(1)} aria-label="Scroll showcase right"><CaretRight size={16} /></button>
          </div>
        </header>
        <ul
          className="welcome-worlds-track"
          ref={worlds}
          aria-label="Showcase panoramas"
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
          {examples.map((example) => {
            const thumbnail = `${import.meta.env.BASE_URL}showcase-thumbs/${example.filename.replace(/\.[^.]+$/, "")}.webp`;
            return (
              <li key={example.id}>
                <button type="button" onClick={() => onOpenExample(example)} aria-label={`Open ${example.title} in Vantage`}>
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
