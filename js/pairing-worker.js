// pairing-worker.js
// Runs Pairings.optimize() on a background thread so the main thread
// stays responsive during long generation runs.
//
// Place this file at js/pairing-worker.js (same directory as pairings.js).

importScripts('pairings.js');

self.onmessage = function (e) {
  const params = e.data;
  try {
    const result = Pairings.optimize({
      ...params,
      onProgress: (info) => {
        self.postMessage({ progress: true, ...info });
      }
    });
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
