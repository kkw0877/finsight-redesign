import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "solid" | "outlined";
export type ButtonColor = "primary" | "assistive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  label,
  variant = "solid",
  color = "primary",
  size = "md",
  fullWidth = false,
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[size],
    styles[color],
    styles[variant],
    fullWidth && styles.fullWidth,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} {...rest}>
      {label}
    </button>
  );
}
