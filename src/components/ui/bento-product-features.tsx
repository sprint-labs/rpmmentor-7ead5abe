"use client";

import * as React from "react";
import type { Variants } from "motion/react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/** Stagger the six slots in as the grid mounts. */
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

/** Each slot rises into place. */
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 10,
    },
  },
};

/** No travel, no spring — just the content, for reduced-motion users. */
const staticVariants: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
};

/**
 * Props for the BentoGridShowcase component.
 * Each prop is a "slot" in the grid; the component owns layout only, never content.
 */
interface BentoGridShowcaseProps {
  /** Tall left card, spans all three rows (e.g. Integration). */
  integration: React.ReactNode;
  /** Top-middle card (e.g. Trackers). */
  trackers: React.ReactNode;
  /** Top-right card (e.g. a headline statistic). */
  statistic: React.ReactNode;
  /** Middle-middle card (e.g. Focus). */
  focus: React.ReactNode;
  /** Middle-right card (e.g. Productivity). */
  productivity: React.ReactNode;
  /** Wide bottom card, spans two columns (e.g. Shortcuts). */
  shortcuts: React.ReactNode;
  /** Optional class names for the grid container. */
  className?: string;
}

/**
 * A responsive, animated bento grid.
 *
 * One column on mobile, three on md and up: a full-height card on the left,
 * a 2x2 block of cards top-right, and a wide card across the bottom two
 * columns. Children are passed in as slots so the grid stays presentational.
 *
 * Honours `prefers-reduced-motion`: the stagger and the rise are dropped and
 * the grid renders in its final state.
 */
export const BentoGridShowcase = ({
  integration,
  trackers,
  statistic,
  focus,
  productivity,
  shortcuts,
  className,
}: BentoGridShowcaseProps) => {
  const reduceMotion = useReducedMotion();
  const container = reduceMotion ? staticVariants : containerVariants;
  const item = reduceMotion ? staticVariants : itemVariants;

  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="visible"
      className={cn(
        // Core grid layout: 1 col on mobile, 3 on desktop
        "grid w-full grid-cols-1 gap-6 md:grid-cols-3",
        // Three explicit rows from md up
        "md:grid-rows-3",
        // Cards can grow, but never collapse below a readable height
        "auto-rows-[minmax(180px,auto)]",
        className,
      )}
    >
      {/* Slot 1: Integration (spans 3 rows) */}
      <motion.div variants={item} className="md:col-span-1 md:row-span-3">
        {integration}
      </motion.div>

      {/* Slot 2: Trackers */}
      <motion.div variants={item} className="md:col-span-1 md:row-span-1">
        {trackers}
      </motion.div>

      {/* Slot 3: Statistic */}
      <motion.div variants={item} className="md:col-span-1 md:row-span-1">
        {statistic}
      </motion.div>

      {/* Slot 4: Focus */}
      <motion.div variants={item} className="md:col-span-1 md:row-span-1">
        {focus}
      </motion.div>

      {/* Slot 5: Productivity */}
      <motion.div variants={item} className="md:col-span-1 md:row-span-1">
        {productivity}
      </motion.div>

      {/* Slot 6: Shortcuts (spans 2 cols) */}
      <motion.div variants={item} className="md:col-span-2 md:row-span-1">
        {shortcuts}
      </motion.div>
    </motion.section>
  );
};

export type { BentoGridShowcaseProps };
