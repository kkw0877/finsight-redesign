"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, SectionCard, Spinner, StatusIconCircle } from "@/components/ui";
import styles from "./page.module.css";
import type { CheckoutStartResponse } from "@/types/api";
import type { UsageStatus } from "@/types/usage";

type BillingView = "loading" | "plan" | "redirecting" | "subscribed" | "error";

const PLAN_BENEFITS = [
  "2 additional analyses per month after your free 2 (up to 4/month total)",
  "Priority anomaly alerts",
  "Cancel anytime",
];

const GENERIC_ERROR_MESSAGE = "결제 처리 중 문제가 발생했습니다. 다시 시도해주세요";

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BillingPage() {
  const [view, setView] = useState<BillingView>("loading");
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/usage")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: UsageStatus | null) => {
        if (!active) return;
        if (data && (data.subscriptionStatus === "active" || data.subscriptionStatus === "cancel_scheduled")) {
          setUsage(data);
          setView("subscribed");
        } else {
          setView("plan");
        }
      })
      .catch(() => {
        if (active) setView("plan");
      });

    return () => {
      active = false;
    };
  }, []);

  async function handlePay() {
    setView("redirecting");
    try {
      const response = await fetch("/api/subscription/checkout", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? GENERIC_ERROR_MESSAGE);
        setView("error");
        return;
      }
      const { checkoutUrl } = data as CheckoutStartResponse;
      window.location.href = checkoutUrl;
    } catch {
      setErrorMessage(GENERIC_ERROR_MESSAGE);
      setView("error");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {view === "loading" && (
          <div className={styles.overlay}>
            <Spinner size={32} />
          </div>
        )}

        {(view === "plan" || view === "redirecting") && (
          <div className={styles.planWrap}>
            <h1 className={`${styles.title} text-heading-2`}>
              Keep analyzing with a monthly subscription
            </h1>
            <SectionCard className={styles.planCard}>
              <span className={`${styles.planName} text-headline-1`}>Finsight Premium</span>
              <span className={`${styles.planPrice} text-heading-2`}>
                ₩9,900 <span className={styles.planPriceUnit}>/ month</span>
              </span>
              <ul className={`${styles.benefitList} text-body-2-normal`}>
                {PLAN_BENEFITS.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            </SectionCard>
            <Button
              label="Pay ₩9,900"
              variant="solid"
              color="primary"
              size="lg"
              fullWidth
              disabled={view === "redirecting"}
              onClick={handlePay}
            />
            <Link href="/dashboard" className={`${styles.secondaryLink} text-label-1-normal`}>
              Maybe later
            </Link>

            {view === "redirecting" && (
              <div className={styles.overlay}>
                <Spinner size={24} />
                <span className={`${styles.overlayText} text-label-1-normal`}>
                  Redirecting to payment...
                </span>
              </div>
            )}
          </div>
        )}

        {view === "subscribed" && (
          <>
            <StatusIconCircle tone="positive" />
            <h1 className={`${styles.title} text-heading-2`}>You&apos;re already subscribed</h1>
            <p className={`${styles.description} text-body-2-normal`}>
              Your Finsight Premium subscription is active.
              {usage?.currentPeriodEnd && (
                <> Next billing date: {formatDate(usage.currentPeriodEnd)}.</>
              )}
            </p>
            <Link href="/dashboard">
              <Button label="Back to dashboard" variant="solid" color="primary" size="lg" />
            </Link>
          </>
        )}

        {view === "error" && (
          <>
            <StatusIconCircle tone="negative" />
            <h1 className={`${styles.title} text-heading-2`}>Payment failed</h1>
            <p className={`${styles.description} text-body-2-normal`}>{errorMessage}</p>
            <Button
              label="Retry payment"
              variant="solid"
              color="primary"
              size="lg"
              onClick={() => setView("plan")}
            />
            <Link href="/dashboard" className={`${styles.secondaryLink} text-label-1-normal`}>
              Back to dashboard
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
