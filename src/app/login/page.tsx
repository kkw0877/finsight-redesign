"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { GoogleButton, Spinner } from "@/components/ui";
import styles from "./page.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "구글 로그인에 실패했습니다. 다시 시도해주세요.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const errorParam = searchParams.get("error");
  const errorMessage = errorParam ? ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.oauth_failed : null;

  function handleSignIn() {
    setLoading(true);
    window.location.href = "/api/auth/google";
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

        {errorMessage && (
          <p className={`${styles.error} text-label-2`} role="alert">
            {errorMessage}
          </p>
        )}

        <Link href="/" className={`${styles.backLink} text-label-1-normal`}>
          ← Back to start
        </Link>
      </div>
    </main>
  );
}
