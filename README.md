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
