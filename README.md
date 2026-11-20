# Handdown

Handdown turns an expert's short demonstration into a supervisor-approved lesson. A learner follows a specific version, checks selected visible conditions locally and explicitly asks a supervisor for help when needed.

Built with React, TypeScript, Vite, Firebase Authentication, Firestore, Storage, callable Functions, App Check and Firebase AI Logic. Hosted on Firebase. The current sprint project is temporary; see the account provider's expiry instructions.

## Implemented

- Email/password sign-in, password reset and owner-managed workspace membership.
- Shared draft editing, video-to-draft through cloud Gemini with explicit consent, video-frame or uploaded references. Demonstrations support MP4/MOV/WebM up to 100 MiB and 10 minutes; files over 12 MiB use private Storage and require Agent Platform Gemini API enabled in Firebase AI Logic.
- Immutable approved versions, content/manifest hashes and reference digests; real-device evaluation gates for visual checkpoints.
- Guided practice with ordered steps, camera/photo capture, local-only Firebase AI Logic checks, explicit uncertainty and error recovery.
- Verified lesson downloads, PWA shell, account-scoped IndexedDB, offline reload and an ordered idempotent outbox.
- Explicit photograph/note sharing, independent example-reuse permission, attributed supervisor decisions and consented candidate revisions.
- Separate learner acknowledgements, client-reported local observations and supervisor decisions in completion records.
- Firestore/Storage isolation, trusted business mutations through role-checked/App Check protected callable Functions, withdrawal handling and shared-photo retention.

## What has and has not been verified

Synthetic tests exercise software behavior; they are not measurements of the visual model. The browser test uses an instruction-only fixture and explicit synthetic photographs. It never simulates an AI pass.

The supplied-account live sign-in and App Check were verified by the user before this release. The complete new backend/client must still be deployed and exercised on that project. Cloud Gemini video drafting and the local image model require live provider and device testing. Gate A/B performance, physical correctness, novice usability and production latency have not been measured by this repository's automated tests. Visual publication stays blocked until the real evaluation report meets the gate. See [release instructions](docs/RELEASE.md).

## Development

Use Node 24.12+ for the client SDK/tooling and Java 21 for emulators. Deployed Functions use Node 22, supported by their pinned server dependencies.

```sh
npm ci
npm --prefix functions ci
npm run dev
```

The production web configuration is in `src/firebase/client.ts`; the public App Check site key is registered for the primary Firebase Hosting domain. Local real-service development requires a separately registered App Check debug provider; no debug credentials are in the repository. For isolated emulator development, use the test commands below. Emulator connections and App Check bypass are enabled only in explicit development/test builds and Functions emulator processes, never the standard production build.

## Checks

```sh
npm run build
npm test
npm run test:integration
npm run test:e2e
```

`npm test` covers deterministic visual policy, schema rejection, publication evidence gates and hash contracts. Integration tests use `demo-handdown` emulators for roles, data isolation, immutable image writes, callable business operations, idempotent events, withdrawal, review decisions and retention. Browser tests exercise owner sign-in → shared draft → publication → download → session completion, offline reload/reconnection, learner access, photo sharing, supervisor decisions and consented revision.

The browser test uses Playwright and defaults to `/usr/bin/chromium` in the managed environment. Install Playwright Chromium on another development machine or set `CHROMIUM_PATH` to a suitable browser. The test build is isolated from the real Firebase project; run a normal production build again before packaging. Deployment always rebuilds normally.

Some environments route all HTTP through a proxy that ignores `NO_PROXY`. If the Firebase Storage emulator cannot reach the local Firestore emulator, run the emulator tests with proxy variables removed **for that test subprocess only**. This is not a change to deployed security rules.

## Deployment

From the Google Cloud Shell already authenticated to the assigned account:

```sh
cd ~/Handdown
git pull --ff-only
bash scripts/deploy-firebase.sh
```

This deploys the scoped Handdown Functions codebase, Firestore rules, Storage rules and Hosting, then applies reference-download CORS. Keep the default project `fbailogic26vrt-3048` only while using the supplied sprint account. No service-account JSON, user passwords or CLI authentication tokens belong in GitHub.

Only a named trusted owner UID may bootstrap workspace membership. For a different Firebase project, change that UID in both `src/firebase/workspace.ts` and `firestore.rules`, replace the web/App Check configuration, `.firebaserc`, deploy script targets and Storage CORS origins, and redeploy. Create supervisor/learner Authentication accounts privately in the console, then add their UIDs through the signed-in owner's account panel.

## Source layout

- `shared/domain.ts`: lesson contracts, observation parsing, deterministic outcomes, evaluation gate and canonical hash serialization.
- `src/ai/`: strictly separated cloud authoring and local-only verification adapters.
- `src/offline/`: verified packages, account sessions and ordered outbox.
- `src/features/`: authoring, validation, practice, capture, review and app update interfaces.
- `functions/src/`: trusted versioning, sessions, review, consented revisions and retention.
- `tests/`: policy, permissions, backend and browser checks.

[Release and privacy details](docs/RELEASE.md) explain the complete workflow and the live gates remaining before a visual-check release.

## Licenses

Handdown application code is MIT licensed. The bundled IBM Plex Sans fonts retain their SIL Open Font License in `public/fonts/OFL.txt`. The installed Impeccable skill materials retain Apache-2.0 licensing; see `third-party/impeccable-LICENSE.txt`. These third-party materials are excluded from the application's MIT grant.
