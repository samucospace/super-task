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

  if (file === "auth-config.js") {
    const envUrl = process.env.SUPABASE_URL;
    const envKey = process.env.SUPABASE_ANON_KEY;
    if (envUrl && envKey) {
      const content = `window.SUPER_TASK_SUPABASE_CONFIG = {\n  url: "${envUrl.trim()}",\n  anonKey: "${envKey.trim()}"\n};\n`;
      fs.writeFileSync(path.join(WWW_DIR, file), content, "utf8");
      console.log("Generated auth-config.js from SUPABASE_URL and SUPABASE_ANON_KEY environment variables.");
      continue;
    }
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(WWW_DIR, file));
      continue;
    }
    console.warn(`Skipping missing ${file} (copy auth-config.example.js to auth-config.js first or set SUPABASE_URL / SUPABASE_ANON_KEY).`);
    continue;
  }

  if (!fs.existsSync(src)) {
    throw new Error(`Missing required runtime file: ${file}`);
  }
  fs.copyFileSync(src, path.join(WWW_DIR, file));
}

console.log(`Copied ${RUNTIME_FILES.length} files into ${WWW_DIR}`);
