import { Aperture, ArrowRight, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";

type WelcomeExperienceProps = {
  sourceName: string;
  onEnter: () => void;
  onOpenFiles: () => void;
  onOpenPromptLab: () => void;
};

export function WelcomeExperience({
  sourceName,
  onEnter,
  onOpenFiles,
  onOpenPromptLab,
}: WelcomeExperienceProps) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.72, ease: [0.16, 1, 0.3, 1] as const };

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
        className="welcome-brand"
        initial={reduceMotion ? false : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <span className="welcome-brand-mark"><Aperture size={22} weight="bold" /></span>
        <span>
          <strong>VANTAGE</strong>
          <small>BY DASHVERSE</small>
        </span>
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
        <div className="welcome-actions">
          <button className="welcome-primary" type="button" onClick={onEnter} autoFocus>
            Enter Vantage <ArrowRight size={17} weight="bold" />
          </button>
          <button className="welcome-secondary" type="button" onClick={onOpenFiles}>
            <UploadSimple size={17} /> Open panorama
          </button>
        </div>
      </motion.div>

      <motion.button
        className="welcome-prompt-door"
        type="button"
        onClick={onOpenPromptLab}
        initial={reduceMotion ? false : { opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...transition, delay: reduceMotion ? 0 : 0.18 }}
      >
        <span className="welcome-prompt-icon"><Sparkle size={21} weight="fill" /></span>
        <span className="welcome-prompt-copy">
          <strong>See what Vantage can do with prompts</strong>
          <small>Explore worked worlds and take the definitive 360 skill into Frameo.</small>
        </span>
        <ArrowRight className="welcome-prompt-arrow" size={18} />
      </motion.button>

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
