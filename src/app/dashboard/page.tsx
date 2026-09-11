"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  Chip,
  FileRowCard,
  SectionCard,
  Spinner,
  StatusIconCircle,
  UploadDropzone,
  UsageBadge,
} from "@/components/ui";
import styles from "./page.module.css";

type DashboardView =
  | "empty"
  | "file-selected"
  | "upload-error"
  | "extract-error"
  | "analyzing"
  | "analysis-error"
  | "result";

interface SelectedFile {
  name: string;
  size: string;
}

const FREE_LIMIT = 2;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const CATEGORIES = [
  { name: "Food & Cafe", amount: 612400, pct: 33 },
  { name: "Shopping", amount: 398200, pct: 22 },
  { name: "Other", amount: 364800, pct: 19 },
  { name: "Culture & Leisure", amount: 231000, pct: 13 },
  { name: "Transportation", amount: 156300, pct: 8 },
  { name: "Subscriptions", amount: 84900, pct: 5 },
];

const CATEGORY_COLORS = [
  "var(--blue-50)",
  "var(--green-50)",
  "var(--purple-50)",
  "var(--orange-50)",
  "var(--cyan-50)",
  "var(--pink-50)",
];

const ANOMALIES = [
  {
    title: "3 overlapping subscription payments detected",
    desc: "Netflix, Watcha, and Disney+ charges are running concurrently. You're spending ₩84,900/month on streaming subscriptions alone.",
  },
  {
    title: "Online shopping spend up 47% from last month",
    desc: "Of the ₩398,200 spent on shopping in August, a ₩79,000 charge on 8/14 and a ₩132,000 charge on 8/22 drove most of the increase.",
  },
  {
    title: "3 late-night delivery charges found",
    desc: "Delivery app charges between 1–3 AM occurred three times: 8/3, 8/11, and 8/19. Check your late-night snacking spend.",
  },
];

const RECOMMENDATIONS = [
  {
    title: "Cancel just one duplicate subscription to save up to ₩17,000/month",
    desc: "Watcha and Disney+ content overlaps. Consider keeping just one.",
  },
  {
    title: "Try setting a ₩300,000 monthly shopping budget",
    desc: "Shopping spend was 47% higher than usual this month. Consider setting an alert before your next purchase.",
  },
  {
    title: "Save on food by grocery shopping instead of delivery",
    desc: "Swapping those 3 late-night deliveries for home cooking could save about ₩60,000/month.",
  },
];

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString("en-US")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [freeRemaining, setFreeRemaining] = useState(FREE_LIMIT);
  const [view, setView] = useState<DashboardView>("empty");
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ADR-017: analysis runs synchronously server-side (no polling). This timeout
  // simulates that single request/response round trip since there is no backend yet.
  useEffect(() => {
    if (view !== "analyzing") return;

    analysisTimeoutRef.current = setTimeout(() => {
      setFreeRemaining((prev) => Math.max(0, prev - 1));
      setView("result");
    }, 2200);

    return () => {
      if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);
    };
  }, [view]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const hasValidExtension = /\.(csv|pdf)$/i.test(file.name);
    if (!hasValidExtension || file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setView("upload-error");
      return;
    }

    setSelectedFile({ name: file.name, size: formatFileSize(file.size) });
    setView("file-selected");
  }

  function handleStartAnalysis() {
    if (freeRemaining <= 0) {
      router.push("/billing");
      return;
    }
    setView("analyzing");
  }

  function handleChooseDifferentFile() {
    setSelectedFile(null);
    setView("empty");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.wordmark}>Finsight</span>
        <div className={styles.headerRight}>
          <UsageBadge
            text={
              freeRemaining === 0
                ? "You've used all your free analyses this month."
                : `Free analyses ${freeRemaining}/2 left`
            }
            warn={freeRemaining === 0}
          />
          <div className={styles.avatar}>A</div>
          {/* TODO: replace with real Supabase Auth session invalidation */}
          <Link href="/" className={`${styles.logoutLink} text-label-1-normal`}>
            Log out
          </Link>
        </div>
      </header>

      <main className={view === "result" ? styles.resultMain : styles.main}>
        {view === "empty" && (
          <>
            {freeRemaining === 0 && (
              <div className={styles.limitBanner}>
                <p className={`${styles.limitBannerText} text-body-2-normal`}>
                  You&apos;ve used all your free analyses this month.
                </p>
                <Link href="/billing">
                  <Button
                    label="Subscribe to keep analyzing"
                    variant="solid"
                    color="primary"
                    size="sm"
                  />
                </Link>
              </div>
            )}

            <UploadDropzone>
              <h1 className={`${styles.dropzoneTitle} text-heading-2`}>
                Upload your card statement
              </h1>
              <p className={`${styles.dropzoneDescription} text-body-2-normal`}>
                Upload a CSV or PDF card statement to see your spending by category,
                unusual charges, and ways to save.
              </p>
              <div className={styles.chipRow}>
                <Chip text="CSV" variant="outlined" size="sm" />
                <Chip text="PDF" variant="outlined" size="sm" />
              </div>
              <label className={styles.fileInputLabel}>
                Choose file
                <input
                  type="file"
                  accept=".csv,.pdf"
                  className={styles.fileInput}
                  onChange={handleFileChange}
                />
              </label>
            </UploadDropzone>

            {/* Demo-only trigger: there is no real backend yet to reproduce an actual
                extraction failure, so this simulates the F-ILFWKT "extract failed" path. */}
            <button
              type="button"
              className={`${styles.demoLink} text-caption-1`}
              onClick={() => setView("extract-error")}
            >
              Demo: simulate corrupted file
            </button>
          </>
        )}

        {view === "file-selected" && selectedFile && (
          <div className={styles.fileSelectedWrap}>
            <FileRowCard
              fileName={selectedFile.name}
              fileSize={selectedFile.size}
              verified
            />
            <Button
              label="Start analysis"
              variant="solid"
              color="primary"
              size="lg"
              fullWidth
              onClick={handleStartAnalysis}
            />
            <button
              type="button"
              className={`${styles.secondaryLink} text-label-1-normal`}
              onClick={handleChooseDifferentFile}
            >
              Choose a different file
            </button>
          </div>
        )}

        {view === "upload-error" && (
          <div className={styles.statusWrap}>
            <StatusIconCircle tone="negative" />
            <h1 className={`${styles.statusTitle} text-heading-2`}>
              We couldn&apos;t process that file
            </h1>
            <p className={`${styles.statusDescription} text-body-2-normal`}>
              Please upload a CSV or PDF card statement under 20MB.
            </p>
            <Button
              label="Upload again"
              variant="solid"
              color="primary"
              size="lg"
              onClick={() => setView("empty")}
            />
          </div>
        )}

        {view === "extract-error" && (
          <div className={styles.statusWrap}>
            <StatusIconCircle tone="negative" />
            <h1 className={`${styles.statusTitle} text-heading-2`}>
              We couldn&apos;t read this statement
            </h1>
            <p className={`${styles.statusDescription} text-body-2-normal`}>
              The file may be corrupted or in a format we can&apos;t extract from yet.
              Please check the file and upload it again.
            </p>
            <Button
              label="Upload again"
              variant="solid"
              color="primary"
              size="lg"
              onClick={() => setView("empty")}
            />
          </div>
        )}

        {view === "analyzing" && (
          <div className={styles.statusWrap}>
            <Spinner size={48} />
            <h1 className={`${styles.statusTitle} text-heading-2`}>
              Analyzing your card statement
            </h1>
            <ul className={`${styles.checklist} text-body-2-normal`}>
              <li>Extracting transactions ✓</li>
              <li>Analyzing spending patterns...</li>
              <li>Generating insights...</li>
            </ul>
            {/* Demo-only trigger to preview the F-KCOAUD analysis-failure path. */}
            <button
              type="button"
              className={`${styles.demoLink} text-caption-1`}
              onClick={() => setView("analysis-error")}
            >
              Demo: preview analysis failure
            </button>
          </div>
        )}

        {view === "analysis-error" && (
          <div className={styles.statusWrap}>
            <StatusIconCircle tone="negative" />
            <h1 className={`${styles.statusTitle} text-heading-2`}>Analysis failed</h1>
            <p className={`${styles.statusDescription} text-body-2-normal`}>
              Something went wrong while analyzing your statement. This didn&apos;t use
              up one of your free analyses — please try again.
            </p>
            <Button
              label="Retry analysis"
              variant="solid"
              color="primary"
              size="lg"
              onClick={() => setView("analyzing")}
            />
          </div>
        )}

        {view === "result" && (
          <>
            <div className={styles.resultHeader}>
              <div>
                <h1 className={`${styles.resultTitle} text-heading-2`}>
                  August Card Statement Analysis
                </h1>
                <p className={`${styles.resultSubtitle} text-body-2-normal`}>
                  Total spend ₩1,847,600 · 42 transactions · just analyzed
                </p>
              </div>
              <Button
                label="Analyze new statement"
                variant="outlined"
                color="assistive"
                size="md"
                onClick={handleChooseDifferentFile}
              />
            </div>

            <SectionCard className={styles.resultSection}>
              <h2 className={`${styles.sectionTitle} text-headline-1`}>
                Spending by category
              </h2>
              <div className={styles.categoryList}>
                {CATEGORIES.map((category, index) => (
                  <div key={category.name} className={styles.categoryRow}>
                    <div className={styles.categoryLabelRow}>
                      <span className="text-body-2-normal">{category.name}</span>
                      <span className="text-body-2-normal">
                        {formatWon(category.amount)} · {category.pct}%
                      </span>
                    </div>
                    <div className={styles.categoryBarTrack}>
                      <div
                        className={styles.categoryBarFill}
                        style={{
                          width: `${category.pct}%`,
                          background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard className={styles.resultSection}>
              <h2 className={`${styles.sectionTitle} text-headline-1`}>
                Unusual spending
              </h2>
              <div className={styles.insightList}>
                {ANOMALIES.map((anomaly) => (
                  <div key={anomaly.title} className={styles.insightItem}>
                    <div className={styles.insightHeader}>
                      <span className={`${styles.insightTitle} text-body-1-normal`}>
                        {anomaly.title}
                      </span>
                      <Badge text="Alert" tone="negative" size="sm" />
                    </div>
                    <p className={`${styles.insightDescription} text-body-2-normal`}>
                      {anomaly.desc}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard className={styles.resultSection}>
              <h2 className={`${styles.sectionTitle} text-headline-1`}>
                Savings recommendations
              </h2>
              <div className={styles.insightList}>
                {RECOMMENDATIONS.map((recommendation) => (
                  <div key={recommendation.title} className={styles.insightItem}>
                    <span className={`${styles.insightTitle} text-body-1-normal`}>
                      {recommendation.title}
                    </span>
                    <p className={`${styles.insightDescription} text-body-2-normal`}>
                      {recommendation.desc}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <p className={`${styles.disclaimer} text-caption-1`}>
              These insights are AI-generated reference information to help you
              understand your spending — not professional financial, investment, or
              credit advice.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
