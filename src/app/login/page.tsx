"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleButton, Spinner } from "@/components/ui";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  function handleSignIn() {
    setError(false);
    setLoading(true);
    setTimeout(() => {
      router.push("/welcome");
    }, 900);
  }

  // TODO: replace with real Supabase Auth error handling
  function handleDemoFailure() {
    setError(true);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={`${styles.title} text-heading-2`}>Get started with Finsight</h1>
        <p className={`${styles.description} text-body-2-normal`}>
          Continue with your Google account
        </p>

        <div className={styles.buttonWrap}>
          <GoogleButton onClick={handleSignIn} disabled={loading} />
          {loading && (
            <div className={styles.overlay}>
              <Spinner size={32} />
              <span className={`${styles.overlayText} text-label-1-normal`}>
                Signing in...
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className={`${styles.error} text-label-2`} role="alert">
            Google sign-in failed. Please try again.
          </p>
        )}

        <Link href="/" className={`${styles.backLink} text-label-1-normal`}>
          ← Back to start
        </Link>

        {/* TODO: replace with real Supabase Auth error handling */}
        <button type="button" className={`${styles.demoLink} text-caption-1`} onClick={handleDemoFailure}>
          Demo: preview sign-in failure
        </button>
      </div>
    </main>
  );
}
