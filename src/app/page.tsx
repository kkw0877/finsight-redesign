import Link from "next/link";
import { Badge, Button, Chip, SectionCard } from "@/components/ui";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.wordmark}>Finsight</span>
        <Link href="/login">
          <Button label="Log in" variant="outlined" color="assistive" size="sm" />
        </Link>
      </header>

      <section className={styles.hero}>
        <Badge text="AI Spending Analysis" tone="blue" variant="solid" size="sm" />
        <h1 className={`${styles.heroTitle} text-display-2`}>
          One card statement, see your spending habits
        </h1>
        <p className={`${styles.heroDescription} text-body-1-normal`}>
          Upload a CSV or PDF card statement and Finsight&apos;s AI breaks down your
          spending by category, flags unusual charges, and gives you concrete ways to
          save — all on one dashboard.
        </p>
        <Link href="/login">
          <Button
            label="Start for free"
            variant="solid"
            color="primary"
            size="lg"
            className={styles.heroCta}
          />
        </Link>
        <p className={`${styles.heroCaption} text-caption-1`}>
          Free users get 2 analyses per month
        </p>
      </section>

      <section className={styles.features}>
        <SectionCard className={styles.featureCard}>
          <h2 className={`${styles.featureTitle} text-headline-1`}>
            Track spending by category
          </h2>
          <p className={`${styles.featureDescription} text-body-2-normal`}>
            See exactly where your money goes across fixed spending categories, with
            totals and share of your overall spend.
          </p>
        </SectionCard>
        <SectionCard className={styles.featureCard}>
          <h2 className={`${styles.featureTitle} text-headline-1`}>
            Detect unusual spending
          </h2>
          <p className={`${styles.featureDescription} text-body-2-normal`}>
            Finsight flags charges that break from your usual pattern, along with the
            reasoning behind each one.
          </p>
        </SectionCard>
        <SectionCard className={styles.featureCard}>
          <h2 className={`${styles.featureTitle} text-headline-1`}>
            Actionable savings tips
          </h2>
          <p className={`${styles.featureDescription} text-body-2-normal`}>
            Get concrete, personalized suggestions for cutting costs based on your
            actual transactions.
          </p>
        </SectionCard>
      </section>

      <section className={styles.pricingStrip}>
        <div className={styles.formatChips}>
          <Chip text="CSV supported" variant="outlined" size="sm" />
          <Chip text="PDF supported" variant="outlined" size="sm" />
        </div>
        <div className={styles.pricingPills}>
          <span className={`${styles.pill} text-label-1-normal`}>
            Free · 2 analyses/month
          </span>
          <span className={`${styles.pill} text-label-1-normal`}>
            Paid · ₩9,900/mo for up to 4 analyses/month
          </span>
        </div>
      </section>

      <footer className={styles.footer}>
        <p className={`${styles.disclaimer} text-caption-1`}>
          Finsight&apos;s results are AI-generated reference information to help you
          understand your spending — not professional financial, investment, or credit
          advice.
        </p>
        <p className={`${styles.disclaimer} text-caption-1`}>
          Your card statement data is sent abroad (to Anthropic, in the United States)
          for AI analysis. See our{" "}
          <Link href="/privacy" className={styles.footerLink}>
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
      </footer>
    </div>
  );
}
