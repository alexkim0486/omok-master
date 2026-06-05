// Browser smoke test: verify the Rapfi championship engine actually loads in a
// real browser, instantiates its wasm, and returns a legal move. Uses the
// system Chrome (no Playwright browser download needed).
import { chromium } from "playwright";

const PORT = process.env.PORT || "3939";
const URL = `http://localhost:${PORT}/`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [page error]", m.text());
});

try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  const result = await page.evaluate(async () => {
    const w = new Worker("/engine/engine-worker.js");
    const lines = [];
    const t0 = performance.now();
    const out = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("timeout waiting for move")), 40000);
      let readyAt = 0;
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") {
          readyAt = performance.now();
          w.postMessage({ type: "command", data: "START 15" });
          w.postMessage({ type: "command", data: "INFO RULE 2" });
          w.postMessage({ type: "command", data: "INFO TIMEOUT_TURN 1500" });
          w.postMessage({ type: "command", data: "BEGIN" });
        } else if (m.type === "stdout") {
          const line = (m.line || "").trim();
          if (line) lines.push(line);
          if (
            line &&
            line.indexOf(" ") === -1 &&
            line.indexOf(",") !== -1 &&
            line !== "OK" &&
            line !== "SWAP"
          ) {
            clearTimeout(to);
            resolve({
              move: line,
              readyMs: Math.round(readyAt - t0),
              moveMs: Math.round(performance.now() - readyAt),
              lines,
            });
          }
        } else if (m.type === "error") {
          clearTimeout(to);
          reject(new Error("engine error: " + m.error));
        }
      };
      w.postMessage({ type: "init", base: "/engine/build/" });
    });
    return out;
  });

  const [xs, ys] = result.move.split(",");
  const x = Number(xs);
  const y = Number(ys);
  const valid = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 15 && y >= 0 && y < 15;

  console.log("engine ready in :", result.readyMs, "ms");
  console.log("first move      :", result.move, valid ? "(valid)" : "(INVALID)");
  console.log("think time      :", result.moveMs, "ms");

  if (!valid) {
    console.error("FAIL: engine returned an invalid move");
    process.exitCode = 1;
  } else {
    console.log("PASS: Rapfi engine loaded and produced a legal move in-browser.");
  }
} catch (err) {
  console.error("FAIL:", err.message || err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
