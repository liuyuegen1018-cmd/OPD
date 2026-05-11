const fs = require("fs");
const path = require("path");
const express = require("express");
const mime = require("mime-types");
const { WebSocketServer } = require("ws");
const { EMPLOYEES } = require("./employees");
const { ensureSeedData } = require("./seed");
const { projectAllRuns, projectRun } = require("./projector");
const {
  createRun,
  approveRun,
  rejectRun,
  guideRun,
  resumeRun,
  pauseRun,
  interruptRun
} = require("./runner");
const {
  ROOT,
  RUNS_DIR,
  ensureDir,
  runDir,
  safeArtifactPath,
  readJson,
  writeJson,
  listRunDirs
} = require("./storage");

const APP_PORT = Number(process.env.APP_PORT || process.env.PORT || 8787);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const PROJECTED_FILE_NAMES = new Set([
  "task_status.json",
  "employees.json",
  "artifacts_index.json",
  "burndown.json",
  "timeline.json",
  "guidance.json",
  "activity.json",
  "schedule.json",
  "stage_schedule.json"
]);
const STATUS_PRIORITY = {
  blocked: 0,
  scheduled: 1,
  running: 2,
  queued: 3,
  failed: 4,
  done: 5
};

ensureDir(RUNS_DIR);
if (process.env.SEED_DEMO_DATA !== "false") ensureSeedData();
projectAllRuns();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(FRONTEND_DIR));

function loadRun(runId) {
  const dir = runDir(runId);
  if (!fs.existsSync(dir)) {
    const error = new Error("Run not found");
    error.status = 404;
    throw error;
  }
  const projected = projectRun(dir);
  reconcileRunnerState(runId, projected);
  return projected;
}

function runSummary(projected) {
  const status = projected.status;
  const active = EMPLOYEES.find((employee) => employee.id === status.active_employee_id);
  return {
    ...status,
    progress_percent: Math.round((status.progress || 0) * 100),
    active_employee_name: active?.name || status.active_employee_id,
    active_employee_cn: active?.cn || status.active_employee_id,
    artifact_count: projected.artifacts.length,
    timeline: projected.timeline
  };
}

function filterRuns(rows, query) {
  const status = query.status && query.status !== "all" ? String(query.status) : null;
  const q = query.q ? String(query.q).trim().toLowerCase() : "";
  return rows.filter((run) => {
    const matchesStatus = !status || run.status === status;
    const searchable = `${run.run_id} ${run.name || ""} ${run.topic || ""}`.toLowerCase();
    const matchesQuery = !q || searchable.includes(q);
    return matchesStatus && matchesQuery;
  });
}

function pidAlive(pid) {
  const numeric = Number(pid);
  if (!Number.isInteger(numeric) || numeric <= 0) return false;
  try {
    process.kill(numeric, 0);
    return true;
  } catch {
    return false;
  }
}

function reconcileRunnerState(runId, projected) {
  const file = path.join(runDir(runId), "runner_state.json");
  const state = readJson(file, null);
  if (!state || state.status !== "running" || pidAlive(state.pid)) return;
  const terminal = projected.status.status === "failed"
    ? "failed"
    : projected.status.status === "done" ? "done" : projected.status.status;
  writeJson(file, {
    ...state,
    status: terminal,
    exit_code: terminal === "done" ? 0 : null,
    error: ["failed", "done", "running", "queued", "blocked"].includes(terminal) ? state.error || null : "runner process exited while app was not supervising it",
    updated_at: new Date().toISOString()
  });
}

function allProjected() {
  return listRunDirs().map((dir) => {
    const projected = projectRun(dir);
    reconcileRunnerState(path.basename(dir), projected);
    return projected;
  });
}

function newestSourceMtime(dir) {
  let newest = 0;
  if (!fs.existsSync(dir)) return newest;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "logs" || PROJECTED_FILE_NAMES.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    const stat = fs.statSync(absolute);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtime(absolute));
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  }
  return newest;
}

function compareScheduleItem(a, b) {
  const priorityA = a.active
    ? (STATUS_PRIORITY[a.run_status] ?? 9)
    : a.run_status === "queued" ? 5 : 8;
  const priorityB = b.active
    ? (STATUS_PRIORITY[b.run_status] ?? 9)
    : b.run_status === "queued" ? 5 : 8;
  if (priorityA !== priorityB) return priorityA - priorityB;
  const progressA = Number(a.progress || 0);
  const progressB = Number(b.progress || 0);
  if (progressA !== progressB) return progressB - progressA;
  return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
}

function appendTimeline(runId, type, payload = {}) {
  const file = path.join(runDir(runId), "timeline.json");
  const timeline = readJson(file, []);
  const event = {
    event_id: `${runId}-${Date.now()}`,
    run_id: runId,
    type,
    timestamp: new Date().toISOString(),
    employee_id: payload.employee_id || null,
    stage: payload.stage || null,
    payload
  };
  timeline.push(event);
  writeJson(file, timeline);
  broadcast(event);
  return event;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    runs_dir: RUNS_DIR,
    researchclaw_home: process.env.RESEARCHCLAW_HOME || path.join(ROOT, "AutoResearchClaw")
  });
});

app.get("/api/runs", (req, res, next) => {
  try {
    const rows = allProjected().map(runSummary);
    res.json(filterRuns(rows, req.query));
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs", (req, res, next) => {
  try {
    const topic = String(req.body.topic || "").trim();
    if (!topic) {
      res.status(400).json({ error: "topic is required" });
      return;
    }
    const status = createRun({
      topic,
      mode: req.body.mode,
      auto_approve: Boolean(req.body.auto_approve),
      experiment_mode: req.body.experiment_mode,
      to_stage: req.body.to_stage,
      schedule: req.body.schedule,
      stage_employees: req.body.stage_employees
    });
    appendTimeline(status.run_id, "run_created", { topic });
    res.status(201).json(status);
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:runId", (req, res, next) => {
  try {
    res.json(loadRun(req.params.runId).status);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/runs/:runId", (req, res, next) => {
  try {
    const runDirPath = runDir(req.params.runId);
    if (!fs.existsSync(runDirPath)) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    const status = readJson(path.join(runDirPath, "task_status.json"), {});
    if (["running", "scheduled"].includes(status.status)) {
      res.status(400).json({ error: "Cannot delete running or scheduled run" });
      return;
    }
    fs.rmSync(runDirPath, { recursive: true, force: true });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:runId/employees", (req, res, next) => {
  try {
    res.json(loadRun(req.params.runId).employees);
  } catch (error) {
    next(error);
  }
});

app.get("/api/employees", (req, res, next) => {
  try {
    const projected = allProjected();
    const rows = EMPLOYEES.map((employee) => {
      const activeRun = projected.find((run) => run.status.active_employee_id === employee.id && ["running", "blocked", "queued", "failed"].includes(run.status.status));
      const state = activeRun?.employees.find((item) => item.id === employee.id);
      if (activeRun?.status.status === "failed" && activeRun.status.active_employee_id === employee.id) {
        return {
          id: employee.id,
          name: employee.name,
          cn: employee.cn,
          responsibility: employee.responsibility,
          stages: employee.stages,
          status: "failed",
          health: "critical",
          current_action: `Stage ${activeRun.status.current_stage} 执行失败`,
          active_run_id: activeRun.status.run_id,
          active_run_name: activeRun.status.name,
          current_stage: activeRun.status.current_stage,
          load: 0.25,
          outputs: activeRun.artifacts.filter((artifact) => artifact.employee_id === employee.id).length,
          blocked_reason: activeRun.status.pipeline_summary?.error || "当前阶段执行失败"
        };
      }
      return state || {
        id: employee.id,
        name: employee.name,
        cn: employee.cn,
        responsibility: employee.responsibility,
        stages: employee.stages,
        status: "idle",
        health: "unknown",
        current_action: "待分配",
        active_run_id: null,
        active_run_name: null,
        current_stage: employee.stageRange[0],
        load: 0,
        outputs: projected.reduce((sum, run) => sum + run.artifacts.filter((artifact) => artifact.employee_id === employee.id).length, 0)
      };
    });
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/employees/settings", (req, res, next) => {
  try {
    const customPath = path.join(ROOT, "custom-employees.json");
    const data = readJson(customPath, { customEmployees: [], hiddenEmployeeIds: [] });
    const hiddenSet = new Set(data.hiddenEmployeeIds || []);

    const allEmployees = EMPLOYEES.map((emp) => ({
      ...emp,
      isCustom: false,
      isHidden: hiddenSet.has(emp.id)
    })).concat((data.customEmployees || []).map((emp) => ({
      ...emp,
      isCustom: true,
      isHidden: hiddenSet.has(emp.id)
    })));

    res.json({ employees: allEmployees, hiddenIds: [...hiddenSet] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/employees/custom", (req, res, next) => {
  try {
    const { name, cn, stages, skill, responsibility } = req.body;
    if (!name || !stages) {
      res.status(400).json({ error: "name and stages are required" });
      return;
    }

    const stage = Number(stages);
    const id = `custom_${stage}_${Date.now()}`;
    const employee = {
      id,
      name,
      cn: cn || name,
      stages: String(stage),
      stageRange: [stage, stage],
      skill: skill || `custom-stage-${stage}`,
      responsibility: responsibility || `负责第${stage}阶段任务`,
      createdAt: new Date().toISOString()
    };

    const customPath = path.join(ROOT, "custom-employees.json");
    const data = readJson(customPath, { customEmployees: [], hiddenEmployeeIds: [] });
    data.customEmployees = data.customEmployees || [];
    data.customEmployees.push(employee);
    data.updatedAt = new Date().toISOString();
    writeJson(customPath, data);

    res.status(201).json({ ...employee, isCustom: true, isHidden: false });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/employees/custom/:employeeId", (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const customPath = path.join(ROOT, "custom-employees.json");
    const data = readJson(customPath, { customEmployees: [], hiddenEmployeeIds: [] });

    const customIndex = (data.customEmployees || []).findIndex((e) => e.id === employeeId);
    if (customIndex >= 0) {
      data.customEmployees.splice(customIndex, 1);
    } else {
      data.hiddenEmployeeIds = data.hiddenEmployeeIds || [];
      if (!data.hiddenEmployeeIds.includes(employeeId)) {
        data.hiddenEmployeeIds.push(employeeId);
      }
    }
    data.updatedAt = new Date().toISOString();
    writeJson(customPath, data);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/employees/migrate", (req, res, next) => {
  try {
    const { customEmployees, hiddenEmployeeIds } = req.body;
    const customPath = path.join(ROOT, "custom-employees.json");
    const existing = readJson(customPath, { customEmployees: [], hiddenEmployeeIds: [] });

    const merged = {
      customEmployees: [...(existing.customEmployees || []), ...(customEmployees || [])],
      hiddenEmployeeIds: [...new Set([...(existing.hiddenEmployeeIds || []), ...(hiddenEmployeeIds || [])])],
      updatedAt: new Date().toISOString(),
      migratedAt: new Date().toISOString()
    };

    writeJson(customPath, merged);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/employees/activity", (req, res, next) => {
  try {
    const projected = allProjected();
    const merged = new Map();
    for (const run of projected) {
      for (const row of run.activity || []) {
        const existing = merged.get(row.employee_id) || {
          employee_id: row.employee_id,
          active_days_30w: 0,
          trigger_count: 0,
          output_count: 0,
          load_percent: 0,
          heatmap: Array.from({ length: 210 }, (_, index) => ({ index, level: 0 }))
        };
        existing.active_days_30w = Math.max(existing.active_days_30w, row.active_days_30w || 0);
        existing.trigger_count += row.trigger_count || 0;
        existing.output_count += row.output_count || 0;
        existing.load_percent = Math.max(existing.load_percent, row.load_percent || 0);
        existing.heatmap = existing.heatmap.map((cell, index) => ({
          index,
          level: Math.max(cell.level || 0, row.heatmap?.[index]?.level || 0)
        }));
        merged.set(row.employee_id, existing);
      }
    }
    res.json([...merged.values()]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/schedule", (req, res, next) => {
  try {
    const projected = allProjected();
    const rows = projected.flatMap((run) => (run.schedule || []).map((item) => ({
      ...item,
      run_id: run.status.run_id,
      run_name: run.status.name,
      run_status: run.status.status,
      progress: run.status.progress,
      updated_at: run.status.updated_at
    })));
    const byEmployee = new Map();
    for (const row of rows.sort(compareScheduleItem)) {
      if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, row);
    }
    res.json([...byEmployee.values()]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:runId/artifacts", (req, res, next) => {
  try {
    let artifacts = loadRun(req.params.runId).artifacts;
    if (req.query.employee_id && req.query.employee_id !== "all") {
      artifacts = artifacts.filter((artifact) => artifact.employee_id === req.query.employee_id);
    }
    res.json(artifacts);
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:runId/burndown", (req, res, next) => {
  try {
    res.json(loadRun(req.params.runId).burndown);
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:runId/timeline", (req, res, next) => {
  try {
    res.json(loadRun(req.params.runId).timeline);
  } catch (error) {
    next(error);
  }
});

app.get("/api/artifacts/:artifactId/content", (req, res, next) => {
  try {
    const artifact = findArtifact(req.params.artifactId);
    const filePath = safeArtifactPath(artifact.run_id, artifact.path);
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024 || ["pdf", "image"].includes(artifact.content_type)) {
      res.json({
        artifact_id: artifact.artifact_id,
        content_type: artifact.content_type,
        encoding: "binary",
        raw_url: `/api/artifacts/${encodeURIComponent(artifact.artifact_id)}/raw`
      });
      return;
    }
    res.json({
      artifact_id: artifact.artifact_id,
      content_type: artifact.content_type,
      encoding: "utf-8",
      content: fs.readFileSync(filePath, "utf8")
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/artifacts/:artifactId/raw", (req, res, next) => {
  try {
    const artifact = findArtifact(req.params.artifactId);
    const filePath = safeArtifactPath(artifact.run_id, artifact.path);
    res.type(mime.lookup(filePath) || "application/octet-stream");
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

app.post("/api/artifacts/:artifactId/guide", (req, res, next) => {
  try {
    const artifact = findArtifact(req.params.artifactId);
    const file = path.join(runDir(artifact.run_id), "guidance.json");
    const rows = readJson(file, []);
    const guide = {
      id: `guide-${Date.now()}`,
      run_id: artifact.run_id,
      artifact_id: artifact.artifact_id,
      employee_id: artifact.employee_id,
      stage: artifact.stage,
      action: "guide",
      scope: req.body.scope || "current_artifact",
      message: String(req.body.message || ""),
      priority: req.body.priority || "normal",
      created_at: new Date().toISOString()
    };
    rows.push(guide);
    writeJson(file, rows);
    guideRun(artifact.run_id, artifact.stage || 1, guide.message);
    appendTimeline(artifact.run_id, "guide_created", guide);
    res.status(201).json(guide);
  } catch (error) {
    next(error);
  }
});

app.post("/api/artifacts/:artifactId/regenerate", (req, res, next) => {
  try {
    const artifact = findArtifact(req.params.artifactId);
    const event = appendTimeline(artifact.run_id, "regenerate_requested", {
      artifact_id: artifact.artifact_id,
      employee_id: artifact.employee_id,
      stage: artifact.stage,
      message: req.body.message || ""
    });
    res.status(202).json(event);
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/:runId/guide", (req, res, next) => {
  try {
    loadRun(req.params.runId);
    const stage = Number(req.body.stage || 1);
    const message = String(req.body.message || "");
    const result = guideRun(req.params.runId, stage, message);
    const event = appendTimeline(req.params.runId, "guide_created", { stage, message });
    res.status(202).json({ ...event, runner: result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/:runId/approve", (req, res, next) => {
  try {
    loadRun(req.params.runId);
    const approved = approveRun(req.params.runId, req.body?.message || "");
    const runner = process.env.AGENT_BACKEND === "linclaw-skills" || process.env.AGENT_BACKEND === "openclaw-skills"
      ? resumeRun(req.params.runId)
      : approved;
    const event = appendTimeline(req.params.runId, "approval_resolved", { action: "approve", message: req.body?.message || "" });
    res.status(202).json({ ...event, approved, runner });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/:runId/reject", (req, res, next) => {
  try {
    loadRun(req.params.runId);
    const runner = rejectRun(req.params.runId, req.body?.message || req.body?.reason || "");
    const event = appendTimeline(req.params.runId, "approval_resolved", { action: "reject", message: req.body?.message || req.body?.reason || "" });
    res.status(202).json({ ...event, runner });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/:runId/resume", (req, res, next) => {
  try {
    loadRun(req.params.runId);
    const runner = resumeRun(req.params.runId);
    const event = appendTimeline(req.params.runId, "run_resumed", { message: req.body?.message || "" });
    res.status(202).json({ ...event, runner });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/:runId/interrupt", (req, res, next) => {
  try {
    loadRun(req.params.runId);
    const result = interruptRun(req.params.runId);
    const event = appendTimeline(req.params.runId, "run_interrupted", { message: req.body?.message || "用户请求打断" });
    res.status(202).json({ ...event, ...result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/:runId/retry", (req, res, next) => {
  try {
    loadRun(req.params.runId);
    const runner = resumeRun(req.params.runId);
    const event = appendTimeline(req.params.runId, "retry_started", { message: req.body?.message || "" });
    res.status(202).json({ ...event, runner });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/:runId/pause", (req, res, next) => {
  try {
    loadRun(req.params.runId);
    const runner = pauseRun(req.params.runId, req.body?.message || "");
    const event = appendTimeline(req.params.runId, "run_paused", { message: req.body?.message || "" });
    res.status(202).json({ ...event, runner });
  } catch (error) {
    next(error);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

function findArtifact(artifactId) {
  for (const projected of allProjected()) {
    const artifact = projected.artifacts.find((item) => item.artifact_id === artifactId);
    if (artifact) return artifact;
  }
  const error = new Error("Artifact not found");
  error.status = 404;
  throw error;
}

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({ error: error.message || "Internal server error" });
});

const server = app.listen(APP_PORT, () => {
  console.log(`AutoResearch Workbench listening on http://localhost:${APP_PORT}`);
});

const wss = new WebSocketServer({ noServer: true });
const sockets = new Set();
wss.on("connection", (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify({
    event_id: `connected-${Date.now()}`,
    type: "projector_updated",
    timestamp: new Date().toISOString(),
    payload: { runs: listRunDirs().length }
  }));
  socket.on("close", () => sockets.delete(socket));
});

function broadcast(event) {
  const message = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(message);
  }
}

const runMtimes = new Map();
function projectorTick() {
  try {
    for (const dir of listRunDirs()) {
      const runId = path.basename(dir);
      const mtime = newestSourceMtime(dir);
      if (runMtimes.get(runId) === mtime) continue;
      runMtimes.set(runId, mtime);
      const projected = projectRun(dir);
      broadcast({
        event_id: `${runId}-projector-${Date.now()}`,
        run_id: runId,
        type: "projector_updated",
        timestamp: new Date().toISOString(),
        employee_id: projected.status.active_employee_id,
        stage: projected.status.current_stage,
        payload: {
          status: projected.status.status,
          artifacts: projected.artifacts.length
        }
      });
    }
  } catch (error) {
    console.error("projector tick failed", error);
  }
}

function scheduleTick() {
  try {
    const now = new Date();
    for (const dir of listRunDirs()) {
      const runId = path.basename(dir);
      const scheduleFile = path.join(dir, "stage_schedule.json");
      const statusFile = path.join(dir, "task_status.json");
      const manifestFile = path.join(dir, "manifest.json");
      const runnerStateFile = path.join(dir, "runner_state.json");

      if (!fs.existsSync(scheduleFile)) continue;

      const stageSchedule = readJson(scheduleFile, null);
      const status = readJson(statusFile, null);
      const manifest = readJson(manifestFile, {});
      const runnerState = readJson(runnerStateFile, null);

      if (!stageSchedule || !status) continue;
      if (manifest.mode !== "scheduled") continue;

      const currentStage = status.current_stage || 1;
      const plannedStart = stageSchedule.schedule?.[currentStage];

      if (!plannedStart) continue;

      const plannedTime = new Date(plannedStart);
      const runnerActive = runnerState && ["running", "retrying", "approved", "guided"].includes(runnerState.status);
      const isScheduled = runnerState && runnerState.status === "scheduled";

      if (plannedTime <= now && !runnerActive) {
        if (isScheduled || status.status === "scheduled") {
          const topic = manifest.topic || "Untitled research task";
          resumeRun(runId);
          appendTimeline(runId, "stage_scheduled_start", {
            stage: currentStage,
            planned_start: plannedStart
          });
          console.log(`[scheduler] Run ${runId} stage ${currentStage} started at planned time ${plannedStart}`);
        }
      } else if (plannedTime > now && !runnerActive) {
        if (status.status !== "scheduled") {
          writeJson(statusFile, { ...status, status: "scheduled", updated_at: new Date().toISOString() });
          console.log(`[scheduler] Run ${runId} stage ${currentStage} waiting for planned time ${plannedStart}`);
        }
      }
    }
  } catch (error) {
    console.error("schedule tick failed", error);
  }
}

setInterval(projectorTick, Number(process.env.PROJECTOR_INTERVAL_MS || 3000)).unref();
setInterval(scheduleTick, Number(process.env.SCHEDULE_INTERVAL_MS || 10000)).unref();

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/ws/runs" || /^\/ws\/runs\/[^/]+$/.test(url.pathname)) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
    return;
  }
  socket.destroy();
});

module.exports = { app, server };
