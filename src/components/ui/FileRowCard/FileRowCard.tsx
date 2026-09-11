import { Badge } from "../Badge/Badge";
import styles from "./FileRowCard.module.css";

export interface FileRowCardProps {
  fileName: string;
  fileSize: string;
  verified?: boolean;
  className?: string;
}

export function FileRowCard({ fileName, fileSize, verified = false, className }: FileRowCardProps) {
  const classes = [styles.card, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className={styles.iconBox} />
      <div className={styles.info}>
        <div className={styles.fileName}>{fileName}</div>
        <div className={styles.fileSize}>{fileSize}</div>
      </div>
      {verified && <Badge text="Format verified" tone="positive" />}
    </div>
  );
}
