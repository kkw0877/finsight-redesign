import type { ButtonHTMLAttributes } from "react";
import styles from "./GoogleButton.module.css";

export interface GoogleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function GoogleButton({
  label = "Continue with Google",
  className,
  ...rest
}: GoogleButtonProps) {
  const classes = [styles.button, className].filter(Boolean).join(" ");

  return (
    <button type="button" className={classes} {...rest}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M19.6 10.23c0-.68-.06-1.36-.18-2.02H10v3.83h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.33Z"
        />
        <path
          fill="#34A853"
          d="M10 20c2.7 0 4.96-.89 6.61-2.42l-3.23-2.5c-.9.6-2.05.95-3.38.95-2.6 0-4.8-1.75-5.59-4.11H1.07v2.59A10 10 0 0 0 10 20Z"
        />
        <path fill="#FBBC05" d="M4.41 11.92a6 6 0 0 1 0-3.84V5.49H1.07a10 10 0 0 0 0 9.02l3.34-2.59Z" />
        <path
          fill="#EA4335"
          d="M10 3.96c1.47 0 2.79.5 3.83 1.49l2.87-2.87A9.96 9.96 0 0 0 10 0 10 10 0 0 0 1.07 5.49l3.34 2.59C5.2 5.72 7.4 3.96 10 3.96Z"
        />
      </svg>
      {label}
    </button>
  );
}
