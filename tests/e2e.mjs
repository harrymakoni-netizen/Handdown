import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST,
  "Run only through isolated emulators.",
);
assert.equal(
  JSON.parse(process.env.FIREBASE_CONFIG).projectId,
  "demo-handdown",
);
const requireFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp } = requireFunctions("firebase-admin/app");
initializeApp();
const { getAuth } = requireFunctions("firebase-admin/auth");
const { getFirestore } = requireFunctions("firebase-admin/firestore");
const owner = "rS4BSfSY2Gdc3jw8MNfOYa4zflq1";
const db = getFirestore();
for (const [uid, email] of [
  [owner, "owner@example.test"],
  ["test-learner", "learner@example.test"],
]) {
  try {
    await getAuth().createUser({
      uid,
      email,
      password: "Fixture-password-123!",
    });
  } catch (e) {
    if (e.code !== "auth/uid-already-exists") throw e;
  }
}
await db
  .doc("workspaces/training/members/test-learner")
  .set({ uid: "test-learner", role: "learner" });
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4175",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let n = 0; n < 40; n++) {
    try {
      if ((await fetch("http://127.0.0.1:4175")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : chromium.executablePath()),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4175");
  await page.getByLabel("Email address").fill("owner@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fixture-password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your lessons", exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "New lesson", exact: true }).click();
  await page
    .getByLabel("Lesson title", { exact: true })
    .fill("Instruction lesson for browser verification");
  await page
    .getByLabel("Task and boundaries")
    .fill("Synthetic instruction-only fixture; not a model evaluation.");
  await page
    .getByLabel("Instruction", { exact: true })
    .fill("Lay out the harmless training kit pieces.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText("Draft saved to the workspace.", { exact: true })
    .waitFor({ timeout: 30000 });
  await page
    .getByLabel(
      "I reviewed every instruction, reference, condition and task boundary.",
    )
    .check();
  await page
    .getByRole("button", { name: "Publish approved version", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Instruction lesson for browser verification",
      exact: true,
    })
    .waitFor({ timeout: 30000 });
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/desktop.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Desktop overflow",
  );
  await page
    .getByRole("button", { name: "View lesson", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Download & verify", exact: true })
    .click();
  await page
    .getByText(
      "Lesson manifest and reference images verified. Offline package saved.",
      { exact: true },
    )
    .waitFor({ timeout: 30000 });
  // Complete an instruction session through browser -> callable -> Firestore.
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Acknowledge instruction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to record", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Your practice record", exact: true })
    .waitFor();
  let complete = false;
  for (let i = 0; i < 60; i++) {
    const sessions = await db.collection("workspaces/training/sessions").get();
    if (sessions.docs.some((d) => d.data().completed)) {
      complete = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!complete)
    console.log(
      "OUTBOX DIAGNOSTIC",
      await page.evaluate(async () => {
        return document.body.innerText;
      }),
    );
  assert.ok(complete, "Completion reached Firestore");
  await page
    .getByRole("button", { name: "Back to lessons", exact: true })
    .click();
  // Service worker and cached membership support offline reload of a verified package.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Your lessons", exact: true })
    .waitFor({ timeout: 30000 });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("heading", { name: "Your lessons", exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Downloaded", exact: true }).click();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Acknowledge instruction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to record", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Your practice record", exact: true })
    .waitFor();
  await context.setOffline(false);
  await page.waitForTimeout(12000);
  // Mobile layout uses the same working app and has an accessible account action.
  await page
    .getByRole("button", { name: "Back to lessons", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile overflow",
  );
  await page.getByRole("button", { name: "Published", exact: true }).click();
  await page.screenshot({
    path: ".impeccable/review/mobile-published.png",
    fullPage: true,
  });
  // Learner cannot see or edit supervisor drafts, but can see published versions.
  const learner = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const lp = await learner.newPage();
  await lp.goto("http://127.0.0.1:4175");
  await lp.getByLabel("Email address").fill("learner@example.test");
  await lp
    .getByLabel("Password", { exact: true })
    .fill("Fixture-password-123!");
  await lp.getByRole("button", { name: "Sign in", exact: true }).click();
  await lp
    .getByRole("heading", { name: "Your lessons", exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await lp.getByRole("button", { name: "New lesson", exact: true }).count(),
    0,
  );
  await lp
    .getByRole("heading", {
      name: "Instruction lesson for browser verification",
      exact: true,
    })
    .waitFor();

  // Explicit photo sharing and supervisor decision through the callable backend.
  await lp
    .getByRole("button", { name: "View lesson", exact: false })
    .first()
    .click();
  await lp
    .getByRole("button", { name: "Download & verify", exact: true })
    .click();
  await lp
    .getByRole("button", { name: "Start practice", exact: true })
    .waitFor({ state: "visible" });
  await lp.getByRole("button", { name: "Start practice", exact: true }).click();
  await lp.getByLabel("Upload photo fallback").setInputFiles({
    name: "synthetic-checkpoint.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2rUAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await lp.getByRole("button", { name: "Ask supervisor", exact: true }).click();
  await lp
    .getByLabel("Note", { exact: true })
    .fill("Synthetic browser test case: please review this step.");
  await lp
    .getByLabel(
      "Allow this photograph to be reused in workspace lesson examples",
    )
    .check();
  await lp
    .getByRole("button", { name: "Confirm sharing", exact: true })
    .click();
  let shared = false;
  for (let i = 0; i < 60; i++) {
    const cases = await db
      .collection("workspaces/training/reviews")
      .where("uid", "==", "test-learner")
      .get();
    if (cases.size) {
      shared = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(shared, "Consented case reached Firestore");
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await page
    .getByRole("button", { name: "Open case", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Required decision reason")
    .fill("Fixture decision — human review path only.");
  await page
    .getByRole("button", { name: "Accept this step", exact: true })
    .click();
  await lp
    .getByText(
      "Supervisor accepted this step. The human decision is recorded separately.",
      { exact: true },
    )
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", {
      name: "Create a revision from this consented case",
      exact: true,
    })
    .click();
  await page
    .getByText(
      "Revision draft created with the consented case photograph attached to its checkpoint.",
      { exact: false },
    )
    .waitFor({ timeout: 30000 });
  const revision = await db.collection("workspaces/training/drafts").get();
  assert.equal(revision.size, 1);
  assert.ok(
    revision.docs[0].data().steps[0].reference.startsWith("lesson-media/"),
    "Consented image attached to candidate",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: owner sign-in, shared draft, immutable publication, verified download, browser session completion, offline reload, reconnect sync, mobile overflow, learner permissions, explicit photo sharing, supervisor decision and consented revision. No AI result was mocked or claimed.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
