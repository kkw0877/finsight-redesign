import styles from "./page.module.css";

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <h1 className={`${styles.title} text-heading-2`}>Privacy Policy</h1>
      <p className={`${styles.body} text-body-2-normal`}>
        Finsight&apos;s privacy policy is still being prepared. To generate your
        spending analysis, your uploaded card statement data is sent to Anthropic
        (based in the United States) for AI processing.
      </p>
    </main>
  );
}
