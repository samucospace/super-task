// Copies just the static runtime files (no docs, no tooling, no source
// control) into www/, which is the Capacitor webDir packaged into the app.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WWW_DIR = path.join(ROOT, "www");

const RUNTIME_FILES = [
  "index.html",
  "styles.css",
  "core.js",
  "dom.js",
  "bootstrap.js",
  "auth-config.js",
  "auth.js",
  "storage.js",
  "repositories.js",
  "sync-queue.js",
  "app.js",
  "manifest.json",
  "service-worker.js"
];

fs.rmSync(WWW_DIR, { recursive: true, force: true });
fs.mkdirSync(WWW_DIR, { recursive: true });

for (const file of RUNTIME_FILES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    if (file === "auth-config.js") {
      console.warn(`Skipping missing ${file} (copy auth-config.example.js to auth-config.js first).`);
      continue;
    }
    throw new Error(`Missing required runtime file: ${file}`);
  }
  fs.copyFileSync(src, path.join(WWW_DIR, file));
}

console.log(`Copied ${RUNTIME_FILES.length} files into ${WWW_DIR}`);
