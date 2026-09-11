import Link from "next/link";
import { Button, StatusIconCircle } from "@/components/ui";
import styles from "./page.module.css";

export default function WelcomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <StatusIconCircle tone="positive" />
        <h1 className={`${styles.title} text-heading-2`}>Welcome!</h1>
        <p className={`${styles.description} text-body-2-normal`}>
          Your Finsight account is ready. Let&apos;s start your first analysis.
        </p>
        <Link href="/dashboard">
          <Button label="Go to dashboard" variant="solid" color="primary" size="lg" />
        </Link>
      </div>
    </main>
  );
}
