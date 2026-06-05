/*
 * Rapfi engine host — a classic Web Worker that loads the single-threaded
 * WebAssembly build of the Rapfi Gomoku/Renju engine and relays the Gomocup
 * protocol between the main thread and the engine.
 *
 * Rapfi is GPLv3 (https://github.com/dhbloo/rapfi). The prebuilt wasm/data
 * artifacts under ./build are redistributed under that license.
 *
 * Messages IN (from main thread):
 *   { type: 'init', base: '/engine/build/' }
 *   { type: 'command', data: '<gomocup command>' }
 * Messages OUT (to main thread):
 *   { type: 'ready' }
 *   { type: 'stdout', line }   // raw engine output line
 *   { type: 'stderr', line }
 *   { type: 'status', status } // loading/progress text
 *   { type: 'error', error }
 *   { type: 'exit', code }
 */

let engine = null;

function locateFile(url, dir) {
  // The engine asks for a hashed data file name; redirect to rapfi.data.
  if (/^rapfi.*\.data$/.test(url)) url = "rapfi.data";
  return dir + url;
}

// Minimal WebAssembly SIMD feature detection (from wasm-feature-detect).
function simdSupported() {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10,
        1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
      ]),
    );
  } catch {
    return false;
  }
}

// Non-shared linear memory for the single-threaded build (mirrors gomocalc).
function makeMemory() {
  const PAGES_PER_MB = (1024 * 1024) / 65536; // 16 pages per MB
  return new WebAssembly.Memory({
    initial: Math.floor(64 * PAGES_PER_MB), // 64 MB
    maximum: Math.floor(2048 * PAGES_PER_MB), // up to 2 GB
    shared: false,
  });
}

self.onmessage = function (e) {
  const { type, data, base } = e.data || {};

  if (type === "init") {
    const dir = base || "/engine/build/";
    const variant = simdSupported() ? "rapfi-single-simd128.js" : "rapfi-single.js";
    try {
      self.importScripts(dir + variant);
    } catch (err) {
      // Fall back to the plain (non-SIMD) build if the SIMD glue fails to load.
      try {
        self.importScripts(dir + "rapfi-single.js");
      } catch (err2) {
        self.postMessage({ type: "error", error: "failed to load engine script: " + err2 });
        return;
      }
    }

    self
      .Rapfi({
        locateFile: (url) => locateFile(url, dir),
        onReceiveStdout: (o) => self.postMessage({ type: "stdout", line: o }),
        onReceiveStderr: (o) => self.postMessage({ type: "stderr", line: o }),
        onExit: (c) => self.postMessage({ type: "exit", code: c }),
        setStatus: (s) => self.postMessage({ type: "status", status: s }),
        wasmMemory: makeMemory(),
      })
      .then((instance) => {
        engine = instance;
        self.postMessage({ type: "ready" });
      })
      .catch((err) => {
        self.postMessage({ type: "error", error: String(err) });
      });
  } else if (type === "command") {
    if (engine) engine.sendCommand(data);
  }
};
