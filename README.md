# Handdown

A React + TypeScript workstation preview built from the supplied development specification.

## Run

Node 22+, `npm ci`, `npm run dev`. Build with `npm run build` (includes strict TypeScript checks).

## Implemented

Responsive lesson library, search and status filters, grid/list view, manual draft creation and editing, five-step reference lesson, photo upload, local practice progress, local review cases with separate reuse permission, local review annotations with required reasons, camera permission test and track cleanup, browser model availability probe, workspace JSON export.

## Current boundaries

This is a prototype, not the specification's completed P0 release. Data persists in localStorage in this browser only. Photos remain local. No authenticated permissions, backend, Firebase project, cloud video authoring, Firebase AI Logic inference, service-worker offline shell, immutable publication, real image evaluation or model accuracy claims are implemented. The seeded lesson uses a reference illustration, not a tested physical assembly reference. The profile perspective is cosmetic and does not grant permissions. Manual acknowledgements never become AI passes. Review annotations are not authenticated supervisor decisions. Large media can exceed browser storage limits.

## Next release gates

1. Configure development Firebase, App Check and seeded roles; validate real-device local image inference through Firebase AI Logic.
2. Freeze checkpoint conditions and measure Gate A before enabling any visual pass output.
3. Implement cloud authoring with explicit consent and schemas; add approved immutable versions.
4. Replace local preview storage with Dexie, asset integrity validation and a service worker; build the authenticated review backend and outbox.
5. Run Gate B, rules tests, full offline reload and complete end-to-end scenario on the target workstation.

Build/typecheck passed. Browser QA could not run because the managed browser sandbox failed to initialize.

## UI redesign and Impeccable

Installed project-local Codex skill with `npx impeccable install --providers=codex --scope=project`. Skill lives in `.agents/skills/impeccable/`; hook configuration is in `.codex/hooks.json`. Codex may require a reload and hook approval to activate automatic checks in future sessions; this session read the skill and ran its detector directly.

The user selected the workshop catalogue direction, captured in PRODUCT.md, DESIGN.md and .impeccable/design.json. Replaced the marketing hero and small typography with a task-first catalogue, paired reference and step sequence, dark navigation and warm orange actions. Includes keyboard dialog focus containment and Escape handling.

Verification: strict TypeScript and production build pass. Impeccable source scan produced no findings (regex-only, not a rendered accessibility audit). Independent Impeccable finish review returned `recapture`: managed browser initialization and preview relay failed, so desktop/mobile captures and visual approval remain outstanding.
