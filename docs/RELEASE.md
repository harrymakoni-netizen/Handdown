# Handdown release and verification

## Deploy from the assigned account

In the existing Google Cloud Shell checkout:

```sh
cd ~/Handdown
git pull --ff-only
bash scripts/deploy-firebase.sh
```

The script installs both lockfiles, builds the client and Functions, deploys only the Handdown codebase plus Hosting and rules, then configures browser CORS for private reference downloads. Continue using the supplied account. Never copy administrative credentials or debug tokens into GitHub. The standard deployed build has no emulator connections or debug bypass.

Functions run in `africa-south1`, Node 22. Initial deployment may ask to enable Cloud Functions, Cloud Run, Eventarc, Cloud Build, Artifact Registry and Cloud Scheduler APIs or grant the Storage service agent Firestore access for rules. Accept only prompts for this assigned project. Do not delete unrelated functions. The provided sprint billing must support these services; if organisation policy or permissions deny deployment, preserve the exact error for resolution. No functions deployment has been performed from the assistant's unauthenticated workspace.

Only `fbailogic26vrt-3048.web.app` and its Firebase Hosting alternate are in the CORS policy. Also authorise the alternate domain in App Check and Authentication if it will be used. Use the primary `.web.app` origin for evaluation. Vercel does not host these Firebase callable Functions; it may host the static client with a separately authorised domain. All client service calls target the Firebase backend.

## First complete workflow

1. Sign in as the provisioned owner. Verify App Check on Device readiness.
2. Add the learner's existing Authentication UID in Your account.
3. Create a draft manually or select an MP4 under 8 MiB and 90 seconds. Confirm cloud processing before calling Generate draft from video. The pinned cloud model is `gemini-3.8-flash`; a provider error must be resolved explicitly, not by silently choosing another model.
4. Review every generated field. Add real reference photographs. The harmless stand template is an editable starting point, never evaluation evidence.
5. Save the draft. For instruction-only walkthrough testing, use at most two instruction steps. Publishing visual checks requires actual evaluation evidence.
6. On the target supported desktop Chrome device, prepare the local model, label fresh evaluation photographs, then run the frozen local evaluator. A holdout needs 12 correct, 20 incorrect and 8 obscured images per checkpoint, with distinct reset groups. At least 10 correct must pass; no incorrect or obscured image may pass. Capture Gate A screening before Gate B and keep regression cases separated. Save/export the actual report. No fixture is accepted as evidence of real model performance.
7. Explicitly approve every step and publish. Download and verify its immutable version and assets in the learner account.
8. Start practice. Instruction steps record acknowledgements. Visual steps require on-device model output or a distinct supervisor decision. A result does not auto-advance the step.
9. Capture an insufficient view, preview the exact photo and note, choose reuse permission independently, and confirm sharing. Offline requests stay queued and are not labelled delivered.
10. Reconnect. A supervisor decides the case with a reason. Acceptance applies only to that session and checkpoint. Refresh/retry outbox if a pending session-start error blocks delivery.
11. A decided, consented case can produce a revision with that image attached. Re-test before publication. Existing sessions remain pinned to their original immutable version.
12. Complete the session and inspect source distinctions and sync state. A session record is not competence certification or a product-quality guarantee.

## Offline and privacy behavior

The service worker caches the app shell and self-hosted fonts. Downloaded packages live in account-scoped IndexedDB, including manifest and asset digest checks. Persisted Firebase sign-in plus membership confirmed in the preceding 24 hours and an existing download permit offline reload. This is cached access, not proof that membership has not been revoked; all server writes re-check current membership. Browser storage is not encrypted. Sign-out unmounts the account view, but retains that account's local packages and outbox.

Routine capture and local evaluation images do not go to the cloud. Selected authoring videos go to cloud Gemini with consent and are not retained as workspace originals. Reference images are immutable uploads. Selected review photos are private to the uploader and supervisors, not other learners. A daily task expires shared review originals after 30 days; copied, consented lesson references remain with immutable versions. A queued sharing request can be abandoned locally; that cannot undo a request the server already accepted. Orphaned review uploads expire after 30 days. The provided account/project itself expires according to the sprint email; export needed non-sensitive evidence before that deadline.

Outbox events carry stable IDs and are sent in order. The server rejects missing steps, invalid event types and wrong-owner sessions; it stores model observations as client-reported. Client membership caches and client-reported evaluation results are not trusted proof of physical work. Publication verifies submitted gates and hashes, not model execution attestation.

## Required live release gates

- Cloud Gemini authoring on the supplied provider, quotas and real selected video.
- Production callable Functions, Firestore rules, Storage access, CORS and App Check.
- Supported workstation local image inference, Gate A then fresh Gate B and regression outcomes.
- Actual camera permission/capture and camera shutdown on exit/background.
- Cross-account learner/supervisor flow and offline reload with the target browser/model.
- Novice usability observation; real latency median/p95 from the evaluator's exported durations.

These live gates cannot be certified by a passing build or synthetic test. Keep visual publication blocked when evidence is absent or fails. An instruction-only lesson can exercise the shared system without pretending to have local visual validation.
