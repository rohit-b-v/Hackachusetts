// Headless browser walk-through of the Compare & Plan journey.
// Run against the dev server: node tests/browser-journey.mjs
// Not part of `vitest`; it is an acceptance/evidence script.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = "evidence/shots";
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log("•", ...a);
let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

async function shortlistBySearch(page, term, n = 1) {
  await page.getByPlaceholder(/search municipality/i).fill(term);
  await page.waitForTimeout(200);
  const cbs = page.locator('tbody input[type="checkbox"]');
  const count = Math.min(n, await cbs.count());
  for (let i = 0; i < count; i++) await cbs.nth(i).check();
  await page.getByPlaceholder(/search municipality/i).fill("");
  await page.waitForTimeout(150);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});

await page.goto(BASE, { waitUntil: "networkidle" });
log("loaded", BASE);

// 1) Shortlist Barnstable, then both Norfolk records (independent IDs).
await shortlistBySearch(page, "barnstable", 1);
await shortlistBySearch(page, "norfolk", 2);
const barText = await page.locator("text=/Compare shortlist/").innerText().catch(() => "");
log("compare bar:", barText.replace(/\n/g, " "));
check("selection persists across filter changes", /3\/3/.test(barText));

// 2) Open Compare & Plan.
await page.getByRole("button", { name: /Compare & Plan/i }).click();
await page.waitForSelector("text=/Compare & Plan/");
await page.waitForTimeout(400);
check("comparison table renders", (await page.locator("text=/Reported town utility/").count()) > 0);
check(
  "missing spatial shown as unknown (not a rating)",
  (await page.locator("text=/unknown \\(open inspector/i").count()) > 0
);
check("both Norfolk records present in compare", (await page.locator("text=/Norfolk/").count()) >= 2);

// Decision brief: on-screen headings use short labels 1..4.
const know = await page.locator("text=/1\\. What do we know/").count();
const nextq = await page.locator("text=/4\\. What should we do next/").count();
check("decision brief shows the four questions", know > 0 && nextq > 0);

// 2a-plan) Plan panel renders with a source label (Gemma/Cached/Template).
// The plan is fetched asynchronously; a live Gemma generation can take ~10s,
// so WAIT for the label to appear rather than counting immediately.
await page.waitForSelector("text=/Next-action plan/");
const planLabelRe = /Live Gemma|Cached \(Gemma\)|Cached \(template\)|Template-generated/;
let planLabelVisible = true;
await page
  .locator(`text=${planLabelRe}`)
  .first()
  .waitFor({ state: "visible", timeout: 90000 })
  .catch(() => {
    planLabelVisible = false;
  });
check("plan panel shows a labeled source (Gemma or template)", planLabelVisible);
const observedPlanLabel = await page
  .locator(`text=${planLabelRe}`)
  .first()
  .innerText()
  .catch(() => "(none)");
log("observed plan source label:", observedPlanLabel);
// Honesty: the label must be one of the four truthful variants and must match
// the actual source. We don't assume the environment has/doesn't have a key;
// whichever path ran, the label must be a recognized, non-misleading value.
check(
  "plan source label is a truthful variant",
  /^(Live Gemma|Cached \(Gemma\)|Cached \(template\)|Template-generated)$/.test(
    observedPlanLabel.trim()
  )
);

// 2b) Second Look: section present, evidence groups, provenance/unknowns.
check("Second Look section renders", (await page.locator("text=/Second Look/").count()) > 0);
check(
  "grid-capacity evidence group present",
  (await page.locator("text=/Grid-capacity evidence/").count()) > 0
);
check(
  "serving feeder shown as site-unverified (never inferred)",
  (await page.locator("text=/site-unverified/i").first().count()) > 0
);
check(
  "hypothetical assumption controls are labeled hypothetical",
  (await page.locator("text=/hypothetical — not sourced, not an approval/i").count()) > 0
);

// Change both assumptions on the FIRST card and observe a verdict change.
const firstProposed = page.getByLabel(/Proposed solar capacity/i).first();
const firstGrid = page.getByLabel(/Hypothetical grid-capacity assumption/i).first();
// Over-size the proposal vs a small hypothetical grid capacity → potential constraint.
await firstProposed.fill("9");
await firstGrid.fill("5");
await page.waitForTimeout(150);
check(
  "grid screen flags a potential constraint when proposed exceeds hypothetical",
  (await page.locator("text=/potential constraint/i").count()) > 0
);
check(
  "verdict reason names the hypothetical value and is not an approval",
  (await page.locator("text=/not interconnection approval/i").count()) > 0
);
check("a changed marker appears after editing assumptions", (await page.locator("text=/changed/").count()) > 0);

// 2c) Export: copied brief must carry the labeled hypothetical Second Look value
// (copy and print derive from one source). Grant clipboard, click Copy, read it.
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
await page.getByRole("button", { name: /Copy combined brief/i }).click();
await page.waitForTimeout(200);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check("copied brief includes the Second Look hypothetical label", /HYPOTHETICAL/.test(clip));
check("copied brief includes a second-look next item", /second-look/.test(clip));
check(
  "copied brief flags the potential constraint from the over-sized proposal",
  /potential constraint/i.test(clip)
);

// Reset restores baseline (grid assumption cleared → grid screen back to unknown).
await page.getByRole("button", { name: /Reset assumptions/i }).first().click();
await page.waitForTimeout(150);
const gridAfterReset = await firstGrid.inputValue();
check("reset clears the hypothetical grid-capacity input", gridAfterReset === "");

// 3) Edit the FIRST card's checklist note; remember which facility it is.
await page.waitForSelector('input[placeholder="Note"]');
const firstCardName = await page
  .locator(".print-block .text-sm.font-bold")
  .first()
  .innerText()
  .catch(() => "");
await page.locator('input[placeholder="Note"]').first().fill("JOURNEY_NOTE_123");
await page.waitForTimeout(150);
log("edited checklist note on:", firstCardName);

// print preview screenshots
await page.emulateMedia({ media: "print" });
await page.screenshot({ path: `${OUT}/compare-print.png`, fullPage: true });
await page.emulateMedia({ media: "screen" });
await page.screenshot({ path: `${OUT}/compare-screen.png`, fullPage: true });
log("captured print + screen screenshots");

// 4) Reload; re-open the SAME shortlist; checklist note must persist.
await page.reload({ waitUntil: "networkidle" });
await shortlistBySearch(page, "barnstable", 1);
await shortlistBySearch(page, "norfolk", 2);
await page.getByRole("button", { name: /Compare & Plan/i }).click();
await page.waitForSelector('input[placeholder="Note"]');
await page.waitForTimeout(200);
// Find a note input whose value persisted (order is stable: barnstable first).
const noteValues = await page.locator('input[placeholder="Note"]').evaluateAll((els) =>
  els.map((e) => e.value)
);
check("checklist note persists across reload", noteValues.includes("JOURNEY_NOTE_123"));
check(
  "note did not leak to the other two facilities",
  noteValues.filter((v) => v === "JOURNEY_NOTE_123").length === 1
);

// 5) External-service failure: block MassGIS, open inspector, workflow usable.
await page.route("**/arcgisserver.digital.mass.gov/**", (r) => r.abort());
await page.route("**/services1.arcgis.com/**", (r) => r.abort());
await page.getByRole("button", { name: /Close compare/i }).click();
await page.waitForTimeout(200);
await shortlistBySearch(page, "barnstable", 0); // just to reset search box
await page.getByPlaceholder(/search municipality/i).fill("barnstable");
await page.waitForTimeout(200);
await page.locator("tbody tr").first().getByRole("button", { name: /Inspect/i }).click();
await page.waitForTimeout(1200);
const errShown = await page
  .locator("text=/Could not reach the live MassGIS endpoint/i")
  .count();
const briefStillThere = await page.locator("text=/Municipal Opportunity Brief/").count();
check("inspector shows truthful error on service failure", errShown > 0);
check("local brief still usable during service failure", briefStillThere > 0);
await page.screenshot({ path: `${OUT}/inspector-offline.png`, fullPage: false });

await browser.close();
console.log(failures === 0 ? "\nALL BROWSER CHECKS PASSED" : `\n${failures} BROWSER CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
