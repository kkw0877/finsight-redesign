import { Icon, type IconName } from "../Icon/Icon";
import styles from "./StatusIconCircle.module.css";

export type StatusIconCircleTone = "positive" | "negative";

export interface StatusIconCircleProps {
  tone: StatusIconCircleTone;
  size?: number;
  iconSize?: number;
  className?: string;
}

const TONE_CONFIG: Record<StatusIconCircleTone, { icon: IconName; color: string }> = {
  positive: { icon: "circle-check", color: "var(--status-positive)" },
  negative: { icon: "triangle-alert", color: "var(--status-negative)" },
};

export function StatusIconCircle({ tone, size = 56, iconSize = 26, className }: StatusIconCircleProps) {
  const { icon, color } = TONE_CONFIG[tone];
  const classes = [styles.circle, styles[tone], className].filter(Boolean).join(" ");

  return (
    <div className={classes} style={{ width: size, height: size }}>
      <Icon name={icon} size={iconSize} style={{ color }} />
    </div>
  );
}
