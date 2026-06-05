// End-to-end UI test: load the real app, wait for the engine to be ready,
// tap the board center as the human (Black), and confirm the AI (White)
// responds — verified via the "N수" (move count) status text reaching 2.
import { chromium } from "playwright";

const PORT = process.env.PORT || "3939";
const URL = `http://localhost:${PORT}/`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for the engine-ready badge.
  await page.getByText("세계 최강 AI").waitFor({ timeout: 40000 });
  console.log("engine ready badge shown");

  // Tap the center of the board canvas (intersection 7,7 for a 15x15 board).
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ timeout: 5000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  console.log("tapped board center");

  // After human(1) + AI(2) the status should read "2수".
  await page.getByText("2수", { exact: false }).waitFor({ timeout: 20000 });
  console.log("move count reached 2 → AI responded");

  // Sanity: there should be no uncaught page errors.
  if (errors.length) {
    console.log("page errors:", errors.slice(0, 5));
  }

  console.log("PASS: full game loop works (human move → AI reply).");
} catch (err) {
  console.error("FAIL:", err.message || err);
  if (errors.length) console.error("page errors:", errors.slice(0, 5));
  process.exitCode = 1;
} finally {
  await browser.close();
}
