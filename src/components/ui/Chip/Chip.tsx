import type { HTMLAttributes } from "react";
import styles from "./Chip.module.css";

export type ChipVariant = "solid" | "outlined";
export type ChipSize = "sm" | "md";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  text: string;
  variant?: ChipVariant;
  size?: ChipSize;
  selected?: boolean;
}

export function Chip({
  text,
  variant = "outlined",
  size = "sm",
  selected = false,
  className,
  ...rest
}: ChipProps) {
  const classes = [
    styles.chip,
    styles[size],
    styles[variant],
    selected && styles.selected,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {text}
    </span>
  );
}
