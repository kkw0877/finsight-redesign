"use client";

import { useEffect, useState, type ChangeEvent } from "react";
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
import type { AnalysisResult } from "@/types/analysis";
import type { UsageStatus } from "@/types/usage";
import styles from "./page.module.css";

type DashboardView =
  | "empty"
  | "file-selected"
  | "upload-error"
  | "extract-error"
  | "analyzing"
  | "analysis-error"
  | "result";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const DEFAULT_UPLOAD_ERROR_MESSAGE =
  "Please upload a CSV or PDF card statement under 20MB.";
const DEFAULT_ANALYSIS_ERROR_MESSAGE =
  "Something went wrong while analyzing your statement. This didn't use up one of your free analyses — please try again.";

const CATEGORY_COLORS = [
  "var(--blue-50)",
  "var(--green-50)",
  "var(--purple-50)",
  "var(--orange-50)",
  "var(--cyan-50)",
  "var(--pink-50)",
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
  const [view, setView] = useState<DashboardView>("empty");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState(DEFAULT_UPLOAD_ERROR_MESSAGE);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState(
    DEFAULT_ANALYSIS_ERROR_MESSAGE,
  );

  async function refreshUsage() {
    try {
      const response = await fetch("/api/usage");
      if (response.ok) setUsage(await response.json());
    } catch {
      // Usage badge just keeps showing the last known value.
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/usage")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: UsageStatus | null) => {
        if (active && data) setUsage(data);
      })
      .catch(() => {});

    fetch("/api/analysis/latest")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AnalysisResult | null) => {
        if (active && data) {
          setAnalysisResult(data);
          setView("result");
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const usageLoaded = usage !== null;
  const freeRemaining = usage?.freeRemaining ?? 0;
  const freeLimit = usage?.freeLimit ?? 2;
  const subscriptionRemaining = usage?.subscriptionRemaining ?? 0;
  const hasNoRemainingAnalyses =
    usageLoaded && freeRemaining <= 0 && subscriptionRemaining <= 0;

  const usageBadgeText = !usageLoaded
    ? "Loading usage…"
    : hasNoRemainingAnalyses
      ? "You've used all your free analyses this month."
      : `Free analyses ${freeRemaining}/${freeLimit} left`;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const hasValidExtension = /\.(csv|pdf)$/i.test(file.name);
    if (!hasValidExtension || file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setUploadErrorMessage(DEFAULT_UPLOAD_ERROR_MESSAGE);
      setView("upload-error");
      return;
    }

    setSelectedFile(file);
    setView("file-selected");
  }

  async function handleStartAnalysis() {
    if (!selectedFile) return;

    if (hasNoRemainingAnalyses) {
      router.push("/billing");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    let uploadResponse: Response;
    try {
      uploadResponse = await fetch("/api/upload", { method: "POST", body: formData });
    } catch {
      setAnalysisErrorMessage(DEFAULT_ANALYSIS_ERROR_MESSAGE);
      setView("analysis-error");
      return;
    }

    if (uploadResponse.status !== 200) {
      const body = await uploadResponse.json().catch(() => null);
      setUploadErrorMessage(body?.error ?? DEFAULT_UPLOAD_ERROR_MESSAGE);
      setView("upload-error");
      return;
    }

    setView("analyzing");

    let analysisResponse: Response;
    try {
      analysisResponse = await fetch("/api/analysis/start", { method: "POST" });
    } catch {
      setAnalysisErrorMessage(DEFAULT_ANALYSIS_ERROR_MESSAGE);
      setView("analysis-error");
      return;
    }

    if (analysisResponse.status === 200) {
      const result: AnalysisResult = await analysisResponse.json();
      setAnalysisResult(result);
      setView("result");
      refreshUsage();
      return;
    }

    if (analysisResponse.status === 402) {
      router.push("/billing");
      return;
    }

    const body = await analysisResponse.json().catch(() => null);
    setAnalysisErrorMessage(body?.error ?? DEFAULT_ANALYSIS_ERROR_MESSAGE);
    setView("analysis-error");
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
          <UsageBadge text={usageBadgeText} warn={hasNoRemainingAnalyses} />
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
            {hasNoRemainingAnalyses && (
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
              fileSize={formatFileSize(selectedFile.size)}
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
              {uploadErrorMessage}
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
              onClick={() => {
                setAnalysisErrorMessage(DEFAULT_ANALYSIS_ERROR_MESSAGE);
                setView("analysis-error");
              }}
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
              {analysisErrorMessage}
            </p>
            <Button
              label="Retry analysis"
              variant="solid"
              color="primary"
              size="lg"
              onClick={handleStartAnalysis}
            />
          </div>
        )}

        {view === "result" && analysisResult && (
          <>
            <div className={styles.resultHeader}>
              <div>
                <h1 className={`${styles.resultTitle} text-heading-2`}>
                  {analysisResult.summary.periodStart} – {analysisResult.summary.periodEnd}{" "}
                  Card Statement Analysis
                </h1>
                <p className={`${styles.resultSubtitle} text-body-2-normal`}>
                  Total spend {formatWon(analysisResult.summary.totalAmount)}
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
                {analysisResult.categoryBreakdown.map((category, index) => (
                  <div key={category.category} className={styles.categoryRow}>
                    <div className={styles.categoryLabelRow}>
                      <span className="text-body-2-normal">{category.category}</span>
                      <span className="text-body-2-normal">
                        {formatWon(category.amount)} · {Math.round(category.ratio * 100)}%
                      </span>
                    </div>
                    <div className={styles.categoryBarTrack}>
                      <div
                        className={styles.categoryBarFill}
                        style={{
                          width: `${Math.round(category.ratio * 100)}%`,
                          background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                    <p className={`${styles.insightDescription} text-body-2-normal`}>
                      {category.description}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard className={styles.resultSection}>
              <h2 className={`${styles.sectionTitle} text-headline-1`}>
                Unusual spending
              </h2>
              <div className={styles.insightList}>
                {analysisResult.anomalies.map((anomaly, index) => (
                  <div key={index} className={styles.insightItem}>
                    <div className={styles.insightHeader}>
                      <span className={`${styles.insightTitle} text-body-1-normal`}>
                        {anomaly.reason}
                      </span>
                      <Badge text="Alert" tone="negative" size="sm" />
                    </div>
                    <p className={`${styles.insightDescription} text-body-2-normal`}>
                      {anomaly.note} ({anomaly.relatedTransactions.join(", ")})
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
                {analysisResult.recommendations.map((recommendation, index) => (
                  <div key={index} className={styles.insightItem}>
                    <span className={`${styles.insightTitle} text-body-1-normal`}>
                      {recommendation.text}
                    </span>
                    <p className={`${styles.insightDescription} text-body-2-normal`}>
                      {recommendation.basis}
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
