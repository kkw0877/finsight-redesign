import {
  Badge,
  Button,
  Chip,
  FileRowCard,
  GoogleButton,
  Icon,
  SectionCard,
  Spinner,
  UploadDropzone,
  UsageBadge,
  StatusIconCircle,
} from "@/components/ui";
import styles from "./page.module.css";

const COLOR_SWATCHES: { label: string; varName: string }[] = [
  { label: "Primary", varName: "--primary-normal" },
  { label: "Label normal", varName: "--label-normal" },
  { label: "Label alternative", varName: "--label-alternative" },
  { label: "Line normal", varName: "--line-normal-normal" },
  { label: "Fill normal", varName: "--fill-normal" },
  { label: "Status positive", varName: "--status-positive" },
  { label: "Status negative", varName: "--status-negative" },
  { label: "Status cautionary", varName: "--status-cautionary" },
];

const TYPE_SCALE = [
  "display-2",
  "title-1",
  "title-3",
  "heading-1",
  "headline-1",
  "body-1-normal",
  "label-1-normal",
  "caption-1",
] as const;

const SPACE_STEPS = [2, 3, 4, 6, 7, 8, 9, 10] as const;

export default function StyleGuidePage() {
  return (
    <main className={styles.page}>
      <header>
        <div className={styles.eyebrow}>Finsight Design System</div>
        <h1 className={styles.title}>Tokens & Components</h1>
        <p className={styles.lede}>
          Foundational tokens and UI primitives, imported from the Claude Design
          project and rebuilt as Next.js-ready TypeScript components ahead of the
          full frontend build.
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Colors</h2>
        <div className={styles.swatchGrid}>
          {COLOR_SWATCHES.map((c) => (
            <div className={styles.swatch} key={c.varName}>
              <div className={styles.swatchColor} style={{ background: `var(${c.varName})` }} />
              <div className={styles.swatchLabel}>
                {c.label}
                <br />
                {c.varName}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Typography</h2>
        <div>
          {TYPE_SCALE.map((t) => (
            <div className={styles.typeRow} key={t}>
              <span className={styles.typeName}>text-{t}</span>
              <span className={`text-${t}`}>The quick brown fox</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Spacing</h2>
        <div>
          {SPACE_STEPS.map((s) => (
            <div className={styles.spaceRow} key={s}>
              <span className={styles.spaceLabel}>--space-{s}</span>
              <div className={styles.spaceBar} style={{ width: `var(--space-${s})` }} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Button</h2>
        <div className={styles.row}>
          <Button label="Start for free" color="primary" variant="solid" size="lg" />
          <Button label="Log in" color="assistive" variant="outlined" size="sm" />
          <Button label="Subscribe" color="primary" variant="solid" size="md" />
          <Button label="Maybe later" color="assistive" variant="solid" size="md" />
          <Button label="Disabled" color="primary" variant="solid" size="md" disabled />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Badge</h2>
        <div className={styles.row}>
          <Badge text="AI Spending Analysis" tone="blue" variant="solid" size="sm" />
          <Badge text="Food & Cafe" tone="blue" variant="solid" />
          <Badge text="Shopping" tone="lime" variant="solid" />
          <Badge text="Culture" tone="purple" variant="solid" />
          <Badge text="Alert" tone="negative" variant="solid" />
          <Badge text="Verified" tone="positive" variant="outlined" />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Chip</h2>
        <div className={styles.row}>
          <Chip text="CSV" variant="outlined" size="sm" />
          <Chip text="PDF" variant="outlined" size="sm" />
          <Chip text="Selected" variant="outlined" size="sm" selected />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Spinner</h2>
        <div className={styles.row}>
          <Spinner size={20} />
          <Spinner size={32} />
          <Spinner size={48} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Icon</h2>
        <div className={styles.row}>
          <Icon name="circle-check" size={28} style={{ color: "var(--status-positive)" }} />
          <Icon name="triangle-alert" size={28} style={{ color: "var(--status-negative)" }} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>SectionCard</h2>
        <div className={styles.row}>
          <SectionCard>Spending by category</SectionCard>
          <SectionCard focused>Focused section</SectionCard>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>StatusIconCircle</h2>
        <div className={styles.row}>
          <StatusIconCircle tone="positive" />
          <StatusIconCircle tone="negative" />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>UsageBadge</h2>
        <div className={styles.row}>
          <UsageBadge text="Free analyses 1/2 left" />
          <UsageBadge text="Free analyses 0/2 left" warn />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>UploadDropzone</h2>
        <div className={styles.row}>
          <UploadDropzone>Drag and drop your CSV/PDF here</UploadDropzone>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>FileRowCard</h2>
        <div className={styles.row}>
          <FileRowCard fileName="2026-08-statement.csv" fileSize="1.2MB" verified />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>GoogleButton</h2>
        <div className={styles.row}>
          <GoogleButton />
        </div>
      </section>
    </main>
  );
}
