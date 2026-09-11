"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, SectionCard, Spinner, StatusIconCircle } from "@/components/ui";
import styles from "./page.module.css";

type BillingView = "plan" | "paying" | "success" | "error";

const PLAN_BENEFITS = [
  "2 additional analyses per month after your free 2 (up to 4/month total)",
  "Priority anomaly alerts",
  "Cancel anytime",
];

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BillingPage() {
  const [view, setView] = useState<BillingView>("plan");
  const payTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (payTimeoutRef.current) clearTimeout(payTimeoutRef.current);
    };
  }, []);

  function handlePay() {
    setView("paying");
    payTimeoutRef.current = setTimeout(() => {
      setView("success");
    }, 900);
  }

  // TODO: replace with a real Polar checkout session (F-UXSBGF); this only previews the UI state.
  function handlePreviewFailure() {
    if (payTimeoutRef.current) clearTimeout(payTimeoutRef.current);
    setView("error");
  }

  const today = new Date();
  const nextBillingDate = new Date(today);
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {(view === "plan" || view === "paying") && (
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
              disabled={view === "paying"}
              onClick={handlePay}
            />
            <Link href="/dashboard" className={`${styles.secondaryLink} text-label-1-normal`}>
              Maybe later
            </Link>
            <button
              type="button"
              className={`${styles.demoLink} text-caption-1`}
              onClick={handlePreviewFailure}
            >
              Demo: preview payment failure
            </button>

            {view === "paying" && (
              <div className={styles.overlay}>
                <Spinner size={24} />
                <span className={`${styles.overlayText} text-label-1-normal`}>
                  Processing payment...
                </span>
              </div>
            )}
          </div>
        )}

        {view === "success" && (
          <>
            <StatusIconCircle tone="positive" />
            <h1 className={`${styles.title} text-heading-2`}>Your subscription is active!</h1>
            <SectionCard className={styles.receiptCard}>
              <div className={styles.receiptRow}>
                <span className="text-body-2-normal">Plan</span>
                <span className="text-body-2-normal">Finsight Premium</span>
              </div>
              <div className={styles.receiptRow}>
                <span className="text-body-2-normal">Amount</span>
                <span className="text-body-2-normal">₩9,900</span>
              </div>
              <div className={styles.receiptRow}>
                <span className="text-body-2-normal">Billed on</span>
                <span className="text-body-2-normal">{formatDate(today)}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className="text-body-2-normal">Next billing date</span>
                <span className="text-body-2-normal">{formatDate(nextBillingDate)}</span>
              </div>
            </SectionCard>
            <Link href="/dashboard">
              <Button label="Back to dashboard" variant="solid" color="primary" size="lg" />
            </Link>
          </>
        )}

        {view === "error" && (
          <>
            <StatusIconCircle tone="negative" />
            <h1 className={`${styles.title} text-heading-2`}>Payment failed</h1>
            <p className={`${styles.description} text-body-2-normal`}>
              Check your card details and try again. Your subscription status hasn&apos;t
              changed.
            </p>
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
