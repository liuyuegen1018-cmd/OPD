const fs = require("fs");
const path = require("path");
const { ensureSeedData } = require("./seed");
const { projectAllRuns } = require("./projector");
const { RUNS_DIR, safeArtifactPath } = require("./storage");

ensureSeedData();
const runs = projectAllRuns();
if (runs.length < 4) throw new Error("Expected seeded runs");
const firstArtifact = runs.flatMap((run) => run.artifacts)[0];
if (!firstArtifact) throw new Error("Expected seeded artifact");
const artifactPath = safeArtifactPath(firstArtifact.run_id, firstArtifact.path);
if (!fs.existsSync(artifactPath)) throw new Error(`Missing artifact ${artifactPath}`);
let escaped = false;
try {
  safeArtifactPath(firstArtifact.run_id, "../etc/passwd");
} catch (error) {
  escaped = true;
}
if (!escaped) throw new Error("Path traversal guard failed");
console.log(`smoke ok: ${runs.length} runs in ${path.relative(process.cwd(), RUNS_DIR)}`);
