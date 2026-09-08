/**
 * Local icon registry. The Wanted design system ships ~300 icons, but the
 * source export's icon-data bundle exceeded the API's size cap and only the
 * icons actually used by the prototype were recoverable, so only those are
 * defined here. Add more entries as new icons are needed, or swap this file
 * for an icon package (e.g. lucide-react) once the Next.js app is underway.
 */
export type IconName = "circle-check" | "triangle-alert";

export const icons: Record<IconName, { viewBox: string; path: string }> = {
  "circle-check": {
    viewBox: "0 0 24 24",
    path: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm4.7 7.7-5.4 5.4a1 1 0 0 1-1.42 0l-2.58-2.58a1 1 0 1 1 1.42-1.42l1.87 1.87 4.69-4.69a1 1 0 0 1 1.42 1.42Z",
  },
  "triangle-alert": {
    viewBox: "0 0 24 24",
    path: "M12 2.5a1.75 1.75 0 0 1 1.53.9l8.4 15a1.75 1.75 0 0 1-1.53 2.6H3.6a1.75 1.75 0 0 1-1.53-2.6l8.4-15A1.75 1.75 0 0 1 12 2.5Zm0 6.5a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1Zm0 8a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z",
  },
};
