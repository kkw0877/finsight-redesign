import type { HTMLAttributes } from "react";
import styles from "./UploadDropzone.module.css";

export type UploadDropzoneProps = HTMLAttributes<HTMLDivElement>;

export function UploadDropzone({ className, children, ...rest }: UploadDropzoneProps) {
  const classes = [styles.dropzone, className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
