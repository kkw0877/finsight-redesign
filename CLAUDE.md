@AGENTS.md

# Finsight — design system & frontend

## Source of truth
- UI/UX prototype: Claude Design project "Finsight 인터랙티브 프로토타입 UI"
  (project id `0983a2c2-9715-47cc-8487-52b3d72dc931`, file `Finsight Prototype.dc.html`).
  Re-fetch via the `DesignSync` tool (`get_project` / `list_files` / `get_file`) if tokens,
  the icon set, or more components need to be re-synced from Figma later.
- Design system: `wanted-design-system-14898f52-493d-47d6-b09a-21e9806b41cc`.

## Tokens (`src/styles/tokens/`)
Copied verbatim from the design system's CSS export (`fig-tokens.css`, `typography.css`,
`spacing.css`, `shadow.css`, `fonts.css`). Imported once via `src/styles/tokens/index.css`,
which `src/app/globals.css` imports. Don't hand-edit token values — re-sync from the Design
source instead, so numbers stay traceable back to Figma.

## Styling approach
CSS Modules + CSS custom properties. No Tailwind — the token export is already CSS
variables, so this avoids a duplicate token-mapping layer. TypeScript, Next.js App Router.

## Components (`src/components/ui/`)
Only the components actually used by the Finsight prototype flow are implemented: Button,
Badge, Chip, Spinner (maps to the design system's "Circular"), Icon. The full Wanted design
system has ~80 components and ~300 icons — deliberately not all ported. Add more only as
real screens need them, following the existing pattern: `ComponentName/ComponentName.tsx` +
`ComponentName.module.css`, exported from `src/components/ui/index.ts`.

**Icon caveat**: `src/components/ui/Icon/icons.ts` only has 2 hand-drawn icons
(`circle-check`, `triangle-alert`) as stand-ins. The source icon bundle exceeded the Design
API's response size cap when fetched, so the exact filled "2" variants used in the prototype
weren't recoverable. Re-sync from Design, or switch to an icon package (e.g. lucide-react),
before relying on more icons.

## Pages
- `/style-guide` — live reference for every token and component. Check changes here before
  wiring them into real screens.
- `/` currently just redirects to `/style-guide` — no real landing page exists yet. Replace
  this once landing-page work starts.

## Not yet done
- No PRD/spec for the actual business logic (free-tier quota rules, payment provider, file
  parsing / AI analysis contracts). The original Claude Design prototype only has hardcoded
  demo logic for these paths — write the spec before implementing real screens that depend
  on it.
- Not a git repository yet — no version history exists for anything above.
