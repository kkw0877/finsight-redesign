import styles from "./UsageBadge.module.css";

export interface UsageBadgeProps {
  text: string;
  warn?: boolean;
  className?: string;
}

export function UsageBadge({ text, warn = false, className }: UsageBadgeProps) {
  const classes = [styles.badge, warn && styles.warn, className].filter(Boolean).join(" ");

  return <span className={classes}>{text}</span>;
}
