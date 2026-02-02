import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BACKEND_ROOT, "..");

const SRC_DIR = path.join(REPO_ROOT, "public", "imagens", "fotos-conselheiros");
const DEST_DIR = path.join(BACKEND_ROOT, "public", "imagens", "fotos-conselheiros");
const MANIFEST_PATH = path.join(DEST_DIR, "manifest.json");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readDirFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isFile()).map(e => e.name);
  } catch {
    return [];
  }
}

async function copyAll() {
  await ensureDir(DEST_DIR);
  const files = await readDirFiles(SRC_DIR);
  if (!files.length) {
    console.log("[sync-photos] Nenhum arquivo encontrado em:", SRC_DIR);
    return;
  }
  await Promise.all(files.map(async (name) => {
    const from = path.join(SRC_DIR, name);
    const to = path.join(DEST_DIR, name);
    await fs.copyFile(from, to);
  }));
  console.log(`[sync-photos] Copiados ${files.length} arquivos para ${DEST_DIR}`);
}

async function writeManifest() {
  const files = await readDirFiles(DEST_DIR);
  const list = files.filter(f => f.toLowerCase() !== "manifest.json").sort((a, b) => a.localeCompare(b, "pt-BR"));
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(list, null, 2) + "\n");
  console.log(`[sync-photos] Manifest atualizado com ${list.length} arquivos`);
}

async function main() {
  await copyAll();
  await writeManifest();
}

main().catch((err) => {
  console.error("[sync-photos] Falha:", err);
  process.exit(1);
});
