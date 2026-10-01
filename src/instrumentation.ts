import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken && process.env.NODE_ENV === "development") {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
  );
}

if (!host && process.env.NODE_ENV === "development") {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
  );
}

export const posthogLogProvider =
  projectToken && host
    ? new LoggerProvider({
        resource: resourceFromAttributes({
          "service.name": "finsight-redesign",
          "deployment.environment": process.env.NODE_ENV ?? "production",
        }),
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: new URL("/i/v1/logs", host).toString(),
              headers: {
                Authorization: `Bearer ${projectToken}`,
                "Content-Type": "application/json",
              },
            }),
          }),
        ],
      })
    : undefined;

const posthogLogger = posthogLogProvider?.getLogger("finsight-posthog-logs");

type LogAttributes = Record<string, boolean | number | string>;

export function emitPostHogLog(
  body: string,
  severity: "ERROR" | "INFO",
  attributes: LogAttributes,
) {
  posthogLogger?.emit({
    body,
    severityNumber: severity === "ERROR" ? SeverityNumber.ERROR : SeverityNumber.INFO,
    severityText: severity,
    attributes,
  });
}

export async function flushPostHogLogs() {
  await posthogLogProvider?.forceFlush();
}

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && posthogLogProvider) {
    logs.setGlobalLoggerProvider(posthogLogProvider);
  }
}
