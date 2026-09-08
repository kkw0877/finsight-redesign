import type { CSSProperties, HTMLAttributes } from "react";
import styles from "./Spinner.module.css";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  color?: string;
}

export function Spinner({ size = 24, color, className, style, ...rest }: SpinnerProps) {
  const borderWidth = Math.max(2, Math.round(size / 8));
  const mergedStyle: CSSProperties = {
    width: size,
    height: size,
    borderWidth,
    color,
    ...style,
  };

  return (
    <span
      role="status"
      aria-label="Loading"
      className={[styles.spinner, className].filter(Boolean).join(" ")}
      style={mergedStyle}
      {...rest}
    />
  );
}
