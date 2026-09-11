import type { HTMLAttributes } from "react";
import styles from "./SectionCard.module.css";

export interface SectionCardProps extends HTMLAttributes<HTMLDivElement> {
  focused?: boolean;
}

export function SectionCard({ focused = false, className, children, ...rest }: SectionCardProps) {
  const classes = [styles.card, focused && styles.focused, className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
