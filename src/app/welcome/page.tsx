"use client";

import { useEffect } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { Button, StatusIconCircle } from "@/components/ui";
import styles from "./page.module.css";

function identifyFromUsageResponse(response: Response) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || !process.env.NEXT_PUBLIC_POSTHOG_HOST) {
    return;
  }

  const userId = response.headers?.get("X-Finsight-PostHog-Distinct-Id");
  if (!userId) return;

  posthog.identify(userId);
}

export default function WelcomePage() {
  useEffect(() => {
    fetch("/api/usage")
      .then((response) => {
        if (response.ok) identifyFromUsageResponse(response);
      })
      .catch(() => {});
  }, []);

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
