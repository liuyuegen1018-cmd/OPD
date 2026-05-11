const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ensureDir, runDir, writeJson, readJson } = require("./storage");
const { EMPLOYEES } = require("./employees");
const TOTAL_STAGES = EMPLOYEES.length;
const FIRST_EMPLOYEE = EMPLOYEES[0];

function idealSeries() {
  return Array.from({ length: TOTAL_STAGES + 1 }, (_, index) => TOTAL_STAGES - index);
}

function nowIso() {
  return new Date().toISOString();
}

function firstExisting(paths) {
  return paths.find((item) => item && fs.existsSync(item));
}

function pythonExecutable() {
  if (process.env.PYTHON) return process.env.PYTHON;
  return firstExisting([
    path.resolve(__dirname, "../../AutoResearchClaw/.venv/bin/python"),
    path.resolve(__dirname, "../../.venv/bin/python"),
    "/home/cxs/.local/bin/python3.11"
  ]) || "python3.11";
}

function createRun({ topic, mode = "auto", auto_approve = false, experiment_mode = "dry-run", to_stage = "", schedule = null, stage_employees = null }) {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const runId = `rc-${stamp}`;
  const dir = runDir(runId);
  ensureDir(dir);

  const isScheduled = mode === "scheduled" && Array.isArray(schedule) && schedule.length > 0;
  const stageSchedule = isScheduled ? schedule.reduce((acc, item) => {
    acc[item.stage] = item.planned_start;
    return acc;
  }, {}) : null;

  const firstStageTime = stageSchedule ? stageSchedule[1] : null;
  const now = new Date();
  const firstStageStartTime = firstStageTime ? new Date(firstStageTime) : null;
  const waitingForSchedule = isScheduled && firstStageStartTime && firstStageStartTime > now;

  const initialStatus = waitingForSchedule ? "scheduled" : "queued";

  const status = {
    run_id: runId,
    name: topic.slice(0, 28),
    topic,
    status: initialStatus,
    current_stage: 1,
    current_phase: "literature_review",
    progress: 0,
    active_employee_id: FIRST_EMPLOYEE.id,
    latest_output: waitingForSchedule ? `等待计划时间: ${firstStageTime}` : "等待启动",
    needs_approval: !auto_approve,
    approvals: auto_approve ? 0 : 1,
    remaining: TOTAL_STAGES,
    updated_at: nowIso()
  };
  writeJson(path.join(dir, "manifest.json"), {
    run_id: runId,
    topic,
    mode,
    auto_approve,
    experiment_mode,
    to_stage,
    stage_employees: stage_employees || {},
    created_at: nowIso()
  });
  writeJson(path.join(dir, "task_status.json"), status);
  writeJson(path.join(dir, "employees.json"), EMPLOYEES.map((employee) => ({
    id: employee.id,
    name: employee.name,
    cn: employee.cn,
    responsibility: employee.responsibility,
    stages: employee.stages,
    skill: employee.skill,
    status: employee.id === FIRST_EMPLOYEE.id ? initialStatus : "idle",
    health: "unknown",
    current_action: employee.id === FIRST_EMPLOYEE.id
      ? (waitingForSchedule ? `等待计划时间启动` : "等待启动文献研究节点")
      : "待分配",
    current_stage: employee.stageRange[0],
    active_run_id: employee.id === FIRST_EMPLOYEE.id ? runId : null,
    active_run_name: employee.id === FIRST_EMPLOYEE.id ? status.name : null,
    load: employee.id === FIRST_EMPLOYEE.id ? 0.35 : 0,
    outputs: 0,
    retry_count: 0,
    blocked_reason: null
  })));
  writeJson(path.join(dir, "artifacts_index.json"), []);
  writeJson(path.join(dir, "burndown.json"), {
    run_id: runId,
    total_points: TOTAL_STAGES,
    remaining_points: TOTAL_STAGES,
    ideal_series: idealSeries(),
    series: [{ t: 0, label: "start", remaining_points: TOTAL_STAGES }],
    employees: EMPLOYEES.map((employee) => ({
      employee_id: employee.id,
      employee_name: employee.name,
      employee_cn: employee.cn,
      remaining_points: 2,
      points: [2, 2, 2, 2, 2]
    }))
  });
  writeJson(path.join(dir, "timeline.json"), [
    {
      event_id: `${runId}-created`,
      run_id: runId,
      type: "run_created",
      timestamp: nowIso(),
      employee_id: FIRST_EMPLOYEE.id,
      stage: 1,
      payload: { topic, mode, scheduled: isScheduled }
    }
  ]);
  writeJson(path.join(dir, "guidance.json"), []);

  if (isScheduled) {
    writeJson(path.join(dir, "stage_schedule.json"), {
      run_id: runId,
      mode: "scheduled",
      schedule: stageSchedule,
      created_at: nowIso()
    });
  }

  let runner = null;
  if (!waitingForSchedule) {
    runner = startAgentRunner(runId, topic, { mode, auto_approve, to_stage });
  }
  return { ...status, runner };
}

function runnerLogPaths(runId) {
  const logsDir = path.join(runDir(runId), "logs");
  ensureDir(logsDir);
  return {
    stdout: path.join(logsDir, "agent.stdout.log"),
    stderr: path.join(logsDir, "agent.stderr.log")
  };
}

function writeRunnerState(runId, patch) {
  const file = path.join(runDir(runId), "runner_state.json");
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    existing = {};
  }
  const state = { ...existing, ...patch, updated_at: nowIso() };
  writeJson(file, state);
  return state;
}

function researchClawCommand(runId, topic, options = {}) {
  const localConfig = path.resolve(__dirname, "../../AutoResearchClaw/config.glm5.local.yaml");
  const args = [
    "-m",
    "researchclaw",
    "run",
    "--topic",
    topic,
    "--output",
    runDir(runId),
    "--config",
    process.env.RESEARCHCLAW_CONFIG || (fs.existsSync(localConfig) ? localConfig : path.resolve(__dirname, "../../AutoResearchClaw/config.researchclaw.example.yaml")),
    "--skip-preflight"
  ];
  if (options.auto_approve !== false) args.push("--auto-approve");
  if (options.resume) args.push("--resume");
  if (options.mode && options.mode !== "auto") args.push("--mode", options.mode);
  if (options.to_stage) args.push("--to-stage", String(options.to_stage));
  return args;
}

function useOpenClawSkillsBackend() {
  return process.env.AGENT_BACKEND === "openclaw-skills";
}

function useLinClawSkillsBackend() {
  return process.env.AGENT_BACKEND === "linclaw-skills";
}

function useSkillPipelineBackend() {
  return useOpenClawSkillsBackend() || useLinClawSkillsBackend();
}

function openClawSkillsCommand(runId, topic, options = {}) {
  const script = path.resolve(__dirname, "../../scripts/openclaw-skill-pipeline.js");
  const args = [script, runId, topic, runDir(runId)];
  if (options.resume) args.push("--resume");
  if (options.to_stage) args.push("--to-stage", String(options.to_stage));
  return { executable: process.env.NODE || "node", args, cwd: path.resolve(__dirname, "../..") };
}

function linClawSkillsCommand(runId, topic, options = {}) {
  const script = path.resolve(__dirname, "../../scripts/linclaw-skill-pipeline.js");
  const args = [script, runId, topic, runDir(runId)];
  if (options.resume) args.push("--resume");
  if (options.to_stage) args.push("--to-stage", String(options.to_stage));
  return { executable: process.env.NODE || "node", args, cwd: path.resolve(__dirname, "../..") };
}

function spawnTracked(runId, executable, args, spawnOptions, meta) {
  const logs = runnerLogPaths(runId);
  const stdout = fs.openSync(logs.stdout, "a");
  const stderr = fs.openSync(logs.stderr, "a");
  const child = spawn(executable, args, {
    detached: true,
    stdio: ["ignore", stdout, stderr],
    ...spawnOptions
  });
  writeRunnerState(runId, {
    status: "running",
    pid: child.pid,
    command: [executable, ...args].join(" "),
    logs,
    ...meta
  });
  child.on("error", (error) => {
    writeRunnerState(runId, { status: "failed", error: error.message });
  });
  child.on("exit", (code, signal) => {
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(path.join(runDir(runId), "runner_state.json"), "utf8"));
    } catch {
      existing = {};
    }
    if (code === 0 && ["blocked", "approved", "guided", "paused", "scheduled"].includes(existing.status)) {
      writeRunnerState(runId, {
        exit_code: code,
        signal
      });
      return;
    }
    writeRunnerState(runId, {
      status: code === 0 ? "done" : "failed",
      exit_code: code,
      signal
    });
  });
  child.unref();
  return { pid: child.pid, logs };
}

function startAgentRunner(runId, topic, options = {}) {
  const command = process.env.AGENT_RUNNER_CMD;
  const skillPipeline = !command && useLinClawSkillsBackend()
    ? linClawSkillsCommand(runId, topic, options)
    : !command && useOpenClawSkillsBackend()
      ? openClawSkillsCommand(runId, topic, options)
      : null;
  const defaultArgs = skillPipeline ? skillPipeline.args : researchClawCommand(runId, topic, options);
  const cwd = skillPipeline?.cwd || process.env.RESEARCHCLAW_HOME || path.resolve(__dirname, "../../AutoResearchClaw");
  const executable = command || skillPipeline?.executable || pythonExecutable();
  const args = command ? [runId, topic, runDir(runId)] : defaultArgs;
  const tracked = spawnTracked(runId, executable, args, {
    cwd,
    detached: true,
    shell: false,
    env: { ...process.env, RUN_ID: runId, TOPIC: topic, RESEARCHCLAW_TO_STAGE: options.to_stage || "" }
  }, {
    mode: command ? "custom-command" : skillPipeline ? `${process.env.AGENT_BACKEND}-local` : "researchclaw-local",
    action: "run"
  });
  return { mode: command ? "custom-command" : skillPipeline ? `${process.env.AGENT_BACKEND}-local` : "researchclaw-local", pid: tracked.pid, run_id: runId };
}

function runHitlCommand(runId, command, args = []) {
  const cwd = process.env.RESEARCHCLAW_HOME || path.resolve(__dirname, "../../AutoResearchClaw");
  const executable = pythonExecutable();
  const fullArgs = ["-m", "researchclaw", command, runDir(runId), ...args];
  const tracked = spawnTracked(runId, executable, fullArgs, {
    cwd,
    detached: true,
    shell: false,
    env: { ...process.env, RUN_ID: runId }
  }, {
    mode: "researchclaw-hitl",
    action: command
  });
  return { run_id: runId, command, pid: tracked.pid };
}

function approveRun(runId, message = "") {
  if (useSkillPipelineBackend()) {
    const controlDir = path.join(runDir(runId), "hitl");
    ensureDir(controlDir);
    let waiting = {};
    try {
      waiting = JSON.parse(fs.readFileSync(path.join(controlDir, "waiting.json"), "utf8"));
    } catch {
      waiting = {};
    }
    writeJson(path.join(controlDir, "response.json"), { action: "approve", stage: waiting.stage || null, message, updated_at: nowIso() });
    return writeRunnerState(runId, { status: "approved", action: "approve" });
  }
  return runHitlCommand(runId, "approve", message ? ["--message", message] : []);
}

function rejectRun(runId, reason = "") {
  if (useSkillPipelineBackend()) {
    const controlDir = path.join(runDir(runId), "hitl");
    ensureDir(controlDir);
    let waiting = {};
    try {
      waiting = JSON.parse(fs.readFileSync(path.join(controlDir, "waiting.json"), "utf8"));
    } catch {
      waiting = {};
    }
    writeJson(path.join(controlDir, "response.json"), { action: "reject", stage: waiting.stage || null, reason, updated_at: nowIso() });
    return writeRunnerState(runId, { status: "rejected", action: "reject" });
  }
  return runHitlCommand(runId, "reject", reason ? ["--reason", reason] : []);
}

function guideRun(runId, stage, message) {
  if (useSkillPipelineBackend()) {
    const controlDir = path.join(runDir(runId), "hitl", "guidance");
    ensureDir(controlDir);
    const normalizedStage = String(stage || 1).padStart(2, "0");
    const guidancePath = path.join(controlDir, `stage_${normalizedStage}.md`);
    fs.writeFileSync(guidancePath, message || "", "utf8");
    return writeRunnerState(runId, { status: "guided", action: "guide", stage: Number(stage || 1) });
  }
  return runHitlCommand(runId, "guide", ["--stage", String(stage || 1), "--message", message]);
}

function resumeRun(runId) {
  const manifest = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(runDir(runId), "manifest.json"), "utf8"));
    } catch {
      return {};
    }
  })();
  const topic = manifest.topic || "Untitled research task";
  if (useSkillPipelineBackend()) {
    const runner = startAgentRunner(runId, topic, {
      resume: true,
      auto_approve: manifest.auto_approve,
      mode: manifest.mode,
      to_stage: manifest.to_stage
    });
    return { run_id: runId, pid: runner.pid };
  }
  const args = researchClawCommand(runId, topic, {
    resume: true,
    auto_approve: manifest.auto_approve,
    mode: manifest.mode,
    to_stage: manifest.to_stage
  });
  const cwd = process.env.RESEARCHCLAW_HOME || path.resolve(__dirname, "../../AutoResearchClaw");
  const tracked = spawnTracked(runId, pythonExecutable(), args, {
    cwd,
    detached: true,
    shell: false,
    env: { ...process.env, RUN_ID: runId, TOPIC: topic }
  }, {
    mode: "researchclaw-local",
    action: "resume"
  });
  return { run_id: runId, pid: tracked.pid };
}

function pauseRun(runId, message = "") {
  const controlDir = path.join(runDir(runId), "hitl");
  ensureDir(controlDir);
  writeJson(path.join(controlDir, "response.json"), { action: "pause", message });
  return writeRunnerState(runId, { status: "paused", action: "pause_requested" });
}

module.exports = {
  createRun,
  startAgentRunner,
  approveRun,
  rejectRun,
  guideRun,
  resumeRun,
  pauseRun,
  interruptRun,
  writeRunnerState
};

function interruptRun(runId) {
  const dir = runDir(runId);
  const controlDir = path.join(dir, "hitl");
  ensureDir(controlDir);
  writeJson(path.join(controlDir, "interrupt.json"), {
    action: "interrupt",
    requested_at: nowIso()
  });

  const runnerStateFile = path.join(dir, "runner_state.json");
  const existing = readJson(runnerStateFile, {});
  if (existing.pid) {
    try {
      process.kill(existing.pid, 0);
      console.log(`[interrupt] Run ${runId} interrupt signal sent, pid ${existing.pid} will check and exit after current stage`);
    } catch (e) {
      console.log(`[interrupt] Run ${runId} process ${existing.pid} already exited`);
    }
  }

  writeRunnerState(runId, { ...existing, status: "interrupted", action: "interrupt_requested" });
  return { run_id: runId, status: "interrupted" };
}
