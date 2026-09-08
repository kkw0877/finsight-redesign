import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

export type BadgeTone =
  | "blue"
  | "cyan"
  | "lightBlue"
  | "lime"
  | "pink"
  | "purple"
  | "redOrange"
  | "violet"
  | "positive"
  | "negative"
  | "cautionary";

export type BadgeVariant = "solid" | "outlined";
export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  text: string;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

export function Badge({
  text,
  tone = "blue",
  variant = "solid",
  size = "sm",
  className,
  ...rest
}: BadgeProps) {
  const classes = [styles.badge, styles[size], styles[variant], styles[tone], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {text}
    </span>
  );
}
