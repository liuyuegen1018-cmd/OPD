const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const RUNS_DIR = path.resolve(process.env.RUNS_DIR || path.join(ROOT, "runs"));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function assertInside(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    const error = new Error("Path escapes allowed root");
    error.status = 403;
    throw error;
  }
  return resolvedTarget;
}

function safeRunId(runId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
    const error = new Error("Invalid run id");
    error.status = 400;
    throw error;
  }
  return runId;
}

function runDir(runId) {
  return assertInside(RUNS_DIR, path.join(RUNS_DIR, safeRunId(runId)));
}

function projectsDir(runId) {
  const workspaceHost = process.env.LINCLAW_WORKSPACE_HOST
    || path.join(path.dirname(RUNS_DIR), "workspace");
  return path.join(workspaceHost, "autoresearch", "projects", safeRunId(runId));
}

function safeArtifactPath(runId, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    const error = new Error("Invalid artifact path");
    error.status = 400;
    throw error;
  }
  if (relativePath.startsWith("projects/")) {
    return assertInside(projectsDir(runId), path.join(projectsDir(runId), relativePath.slice(9)));
  }
  return assertInside(runDir(runId), path.join(runDir(runId), relativePath));
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

function listRunDirs() {
  ensureDir(RUNS_DIR);
  return fs.readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => runDir(entry.name));
}

module.exports = {
  ROOT,
  RUNS_DIR,
  ensureDir,
  runDir,
  projectsDir,
  safeArtifactPath,
  readJson,
  writeJson,
  listRunDirs
};
