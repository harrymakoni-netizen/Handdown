#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm --prefix functions ci
npm run build
npm --prefix functions run build
npx firebase projects:list
# This project is deliberately fixed to the supplied sprint environment.
npx firebase deploy --only firestore:rules,storage,functions:handdown,hosting --project fbailogic26vrt-3048
gcloud storage buckets update gs://fbailogic26vrt-3048.firebasestorage.app --cors-file=storage.cors.json
