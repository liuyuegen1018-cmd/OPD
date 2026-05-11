#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const WORKSPACE_HOST = process.env.LINCLAW_WORKSPACE_HOST
  || "/home/cxs/lyg/1/0427/linclaw/runtime/openclaw-home/workspace";
const WORKSPACE_CONTAINER = process.env.LINCLAW_WORKSPACE_CONTAINER
  || "/home/node/.openclaw/workspace";
const AUTORESEARCH_DIR = path.join(WORKSPACE_HOST, "autoresearch");
const LOCK_PATH = path.join(AUTORESEARCH_DIR, "pipeline.lock");
const OPENCLAW_TIMEOUT = String(process.env.LINCLAW_OPENCLAW_TIMEOUT || 600);
const APPROVAL_STAGES = new Set([1, 3]);

const NODES = [
  {
    stage: 1,
    id: "node-01-literature",
    phase: "literature_review",
    employee_id: "literature_researcher",
    employee_cn: "文献研究员",
    skill: "literature-review",
    title: "文献综述",
    rootFile: "01_literature",
    projectFile: "01_literature",
    runDir: "stage-01-literature",
    runFile: "literature_review.md",
    message(topic) {
      return `/skill literature-review 围绕“${topic}”执行文献综述，并将完整阶段产物写入当前工作目录下的 01_literature 文件夹`;
    }
  },
  {
    stage: 2,
    id: "node-02-theory",
    phase: "theory_formalization",
    employee_id: "theory_modeler",
    employee_cn: "理论建模员",
    skill: "theory-formalization",
    title: "理论形式化",
    rootFile: "02_theory",
    projectFile: "02_theory",
    runDir: "stage-02-theory",
    runFile: "theory_formalization.md",
    message() {
      return "/skill theory-formalization 读取当前工作目录下的 01_literature，完成理论形式化，并将完整阶段产物写入当前工作目录下的 02_theory 文件夹";
    }
  },
  {
    stage: 3,
    id: "node-03-experiment",
    phase: "experiment_design",
    employee_id: "experiment_designer",
    employee_cn: "实验设计员",
    skill: "experiment-design",
    title: "实验设计",
    rootFile: "03_experiment",
    projectFile: "03_experiment",
    runDir: "stage-03-experiment",
    runFile: "experiment_design.md",
    preferredRunFiles: ["experiment_plan.md", "README.md"],
    message() {
      return "/skill experiment-design 读取当前工作目录下的 02_theory/theory_final.md 和 02_theory/testable_implications.md，完成实验设计，并将完整阶段产物写入当前工作目录下的 03_experiment 文件夹";
    }
  },
  {
    stage: 4,
    id: "node-04-execution",
    phase: "experiment_execution",
    employee_id: "experiment_executor",
    employee_cn: "实验执行员",
    skill: "experiment-execution",
    title: "实验执行",
    rootFile: "03_experiment",
    projectFile: "03_experiment",
    runDir: "stage-04-execution",
    runFile: "experiment_execution.md",
    preferredRunFiles: ["EXECUTION_REPORT.md", "results/experiment_analysis.md", "results/summary.md", "reproduce.md"],
    message() {
      return "/skill experiment-execution 读取当前工作目录下的 02_theory 和 03_experiment，完成实验执行得到结果，并将完整阶段产物写入当前工作目录下的 03_experiment 文件夹";
    }
  },
  {
    stage: 5,
    id: "node-05-writing",
    phase: "academic_writing",
    employee_id: "academic_writer",
    employee_cn: "论文写作员",
    skill: "academic-writing",
    title: "论文写作",
    rootFile: "05_output",
    projectFile: "05_output",
    runDir: "stage-05-writing",
    runFile: "paper_draft.md",
    preferredRunFiles: ["manuscript/paper_draft.md", "paper_draft.md", "manuscript/main.md", "manuscript/README.md"],
    message() {
      return "/skill academic-writing 读取当前工作目录下的 02_theory/theory_final.md 和 03_experiment/results，完成学术写作，并将完整阶段产物写入当前工作目录下的 05_output 文件夹";
    }
  },
  {
    stage: 6,
    id: "node-06-review",
    phase: "paper_review",
    employee_id: "academic_reviewer",
    employee_cn: "学术评审员",
    skill: "paper-review",
    title: "学术评审",
    rootFile: "06_review",
    projectFile: "06_review",
    runDir: "stage-06-review",
    runFile: "review_report.md",
    preferredRunFiles: ["review.md", "review_report.md", "README.md"],
    message() {
      return "/skill paper-review 读取当前工作目录下的 05_output，使用快速模式 quick 完成学术论文同行评审，并将评审报告写入当前工作目录下的 06_review/review.md";
    }
  }
];

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function buildNodeMessage(node, topic) {
  const base = node.message(topic);
  return `${base}。强制文件写入要求：当前工作目录就是 ${WORKSPACE_CONTAINER}；必须在当前工作目录下创建并写入 ${node.rootFile}；不要写入 workspace/${node.rootFile}、/workspace/${node.rootFile} 或其他路径；不要只在对话中回复结果，必须实际写入文件系统；完成前请确认 ${node.rootFile} 中至少存在一个非空 Markdown 或文本产物文件。`;
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

function appendTimeline(runDir, runId, type, node, payload = {}) {
  const file = path.join(runDir, "timeline.json");
  const rows = readJson(file, []);
  rows.push({
    event_id: `${runId}-${type}-${node?.stage || 0}-${Date.now()}`,
    run_id: runId,
    type,
    timestamp: nowIso(),
    employee_id: node?.employee_id || null,
    stage: node?.stage || null,
    payload
  });
  writeJson(file, rows);
}

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    ensureDir(target);
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function materializeRunArtifact(source, targetFile, preferredRunFiles = []) {
  const stat = fs.statSync(source);
  ensureDir(path.dirname(targetFile));
  if (stat.isFile()) {
    if (stat.size <= 0) {
      throw new Error(`Expected artifact file is empty: ${source}`);
    }
    fs.copyFileSync(source, targetFile);
    return source;
  }
  for (const preferred of preferredRunFiles) {
    const candidate = path.join(source, preferred);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && fs.statSync(candidate).size > 0) {
      fs.copyFileSync(candidate, targetFile);
      return candidate;
    }
  }
  const candidates = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) candidates.push(absolute);
    }
  }
  walk(source);
  const nonEmpty = candidates.filter((file) => fs.statSync(file).size > 0);
  const picked = nonEmpty.find((file) => /\.(md|txt)$/i.test(file)) || nonEmpty[0];
  if (picked) {
    fs.copyFileSync(picked, targetFile);
    return picked;
  }
  throw new Error(`Expected artifact directory has no non-empty files: ${source}`);
}

function detectContainer() {
  if (process.env.LINCLAW_CONTAINER) return process.env.LINCLAW_CONTAINER;
  const result = spawnSync("docker", ["ps", "--format", "{{.Names}} {{.Image}}"], { encoding: "utf8" });
  if (result.status !== 0) return "linclaw-agent";
  const line = result.stdout.split(/\r?\n/).find((item) => item.includes("linclaw:local"));
  return line ? line.split(/\s+/)[0] : "linclaw-agent";
}

function dockerExec(container, args, options = {}) {
  const result = spawnSync("docker", ["exec", ...args], {
    encoding: "utf8",
    timeout: Number(process.env.LINCLAW_DOCKER_TIMEOUT_MS || 900000),
    ...options
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error
  };
}

function cleanupRootArtifacts(container) {
  const files = NODES.map((node) => node.rootFile);
  dockerExec(container, ["-w", WORKSPACE_CONTAINER, container, "rm", "-rf", ...files]);
}

function acquireLock(runId, topic) {
  ensureDir(AUTORESEARCH_DIR);
  try {
    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.writeFileSync(fd, JSON.stringify({ run_id: runId, topic, pid: process.pid, created_at: nowIso() }, null, 2));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = readJson(LOCK_PATH, null);
    if (existing && !pidAlive(existing.pid)) {
      fs.unlinkSync(LOCK_PATH);
      return acquireLock(runId, topic);
    }
    return false;
  }
}

function releaseLock(runId) {
  const existing = readJson(LOCK_PATH, null);
  if (!existing || existing.run_id === runId || existing.pid === process.pid) {
    try {
      fs.unlinkSync(LOCK_PATH);
    } catch {
      // Already released.
    }
  }
}

function updateStatus(runDir, runId, topic, node, status) {
  writeJson(path.join(runDir, "task_status.json"), {
    run_id: runId,
    name: topic.slice(0, 28),
    topic,
    status,
    current_stage: node.stage,
    current_phase: node.phase,
    progress: status === "done" ? 1 : Math.max(0, (node.stage - 1) / NODES.length),
    active_employee_id: node.employee_id,
    active_employee_cn: node.employee_cn,
    latest_output: status === "queued" ? "等待启动" : `${node.runDir}/${node.runFile}`,
    needs_approval: false,
    approvals: 0,
    remaining: status === "done" ? 0 : Math.max(0, NODES.length - node.stage + 1),
    updated_at: nowIso()
  });
}

function updateBlockedStatus(runDir, runId, topic, node, reason) {
  writeJson(path.join(runDir, "task_status.json"), {
    run_id: runId,
    name: topic.slice(0, 28),
    topic,
    status: "blocked",
    current_stage: node.stage,
    current_phase: node.phase,
    progress: Math.max(0, node.stage / NODES.length),
    active_employee_id: node.employee_id,
    active_employee_cn: node.employee_cn,
    latest_output: `${node.runDir}/${node.runFile}`,
    needs_approval: true,
    approvals: 1,
    remaining: Math.max(0, NODES.length - node.stage),
    blocked_reason: reason,
    updated_at: nowIso()
  });
}

function updateEmployees(runDir, runId, topic, activeNode, completedStage) {
  const employees = [
    ["literature_researcher", "Literature Researcher", "文献研究员", "1", "文献检索、证据整理、研究空白归纳"],
    ["theory_modeler", "Theory Modeler", "理论建模员", "2", "理论框架、研究假设、可验证问题形式化"],
    ["experiment_designer", "Experiment Designer", "实验设计员", "3", "实验方案、数据集、指标、基线与验证路径"],
    ["experiment_executor", "Experiment Executor", "实验执行员", "4", "实验运行、日志整理、结果汇总与复现报告"],
    ["academic_writer", "Academic Writer", "论文写作员", "5", "论文结构、方法叙述、结果表达与草稿生成"],
    ["academic_reviewer", "Academic Reviewer", "学术评审员", "6", "质量审查、审稿意见、修改建议与归档检查"]
  ].map(([id, name, cn, stages, responsibility], index) => {
    const stage = index + 1;
    const done = stage <= completedStage;
    const active = activeNode && activeNode.stage === stage;
    return {
      id,
      name,
      cn,
      responsibility,
      stages,
      status: active ? "working" : done ? "done" : "idle",
      health: active ? "active" : done ? "good" : "unknown",
      current_action: active ? `正在执行${activeNode.title}` : done ? "阶段已完成" : "待分配",
      current_stage: stage,
      active_run_id: active ? runId : null,
      active_run_name: active ? topic.slice(0, 28) : null,
      load: active ? 0.7 : done ? 0.15 : 0,
      outputs: done ? 1 : 0,
      retry_count: 0,
      blocked_reason: null
    };
  });
  writeJson(path.join(runDir, "employees.json"), employees);
}

function updateEmployeesBlocked(runDir, runId, topic, node) {
  const existing = readJson(path.join(runDir, "employees.json"), []);
  const employees = existing.length ? existing : [];
  const rows = employees.map((employee) => {
    if (employee.id !== node.employee_id) return employee;
    return {
      ...employee,
      status: "blocked",
      health: "critical",
      current_action: `${node.title}等待人工审批`,
      active_run_id: runId,
      active_run_name: topic.slice(0, 28),
      current_stage: node.stage,
      load: 0.35,
      blocked_reason: `${node.title}已完成，等待人工确认后继续`
    };
  });
  writeJson(path.join(runDir, "employees.json"), rows);
}

function syncArtifact(runDir, runId, node) {
  const source = path.join(WORKSPACE_HOST, node.rootFile);
  if (!fs.existsSync(source)) {
    throw new Error(`LinClaw skill did not create expected workspace artifact: ${source}`);
  }
  const projectTarget = path.join(AUTORESEARCH_DIR, "projects", runId, node.projectFile);
  const runTarget = path.join(runDir, node.runDir, node.runFile);
  copyRecursive(source, projectTarget);
  const materializedFrom = materializeRunArtifact(source, runTarget, node.preferredRunFiles || []);
  return { source, projectTarget, runTarget, materializedFrom };
}

function runSkill(container, runId, topic, node) {
  const message = buildNodeMessage(node, topic);
  return dockerExec(container, [
    "-w",
    WORKSPACE_CONTAINER,
    container,
    "openclaw",
    "agent",
    "--session-id",
    runId,
    "--local",
    "--json",
    "--timeout",
    OPENCLAW_TIMEOUT,
    "--message",
    message
  ]);
}

function writeNodeStarted(runDir, runId, topic, node) {
  const dir = path.join(runDir, node.runDir);
  ensureDir(dir);
  writeJson(path.join(dir, "node_meta.json"), {
    id: node.id,
    stage: node.stage,
    phase: node.phase,
    skill: node.skill,
    employee_id: node.employee_id,
    employee_cn: node.employee_cn,
    status: "running",
    started_at: nowIso()
  });
  fs.writeFileSync(path.join(dir, "skill_prompt.txt"), buildNodeMessage(node, topic), "utf8");
  appendTimeline(runDir, runId, "stage_started", node, { skill: node.skill });
}

function writeNodeDone(runDir, runId, node, syncResult, external) {
  const dir = path.join(runDir, node.runDir);
  fs.writeFileSync(path.join(dir, "skill.stdout.log"), external.stdout, "utf8");
  fs.writeFileSync(path.join(dir, "skill.stderr.log"), external.stderr, "utf8");
  const completedAt = nowIso();
  const nextStage = node.stage < NODES.length ? node.stage + 1 : null;
  writeJson(path.join(dir, "node_result.json"), {
    node_id: node.id,
    skill: node.skill,
    status: "done",
    artifact: `${node.runDir}/${node.runFile}`,
    source_artifact: path.relative(WORKSPACE_HOST, syncResult.source),
    project_artifact: path.relative(WORKSPACE_HOST, syncResult.projectTarget),
    next_stage: nextStage,
    summary: `${node.title} 已完成`,
    completed_at: completedAt
  });
  writeJson(path.join(dir, "decision.json"), {
    status: "done",
    ts: completedAt,
    node_id: node.id,
    skill: node.skill,
    next_stage: nextStage,
    summary: `${node.title} 已完成`
  });
  appendTimeline(runDir, runId, "stage_completed", node, { skill: node.skill, artifact: `${node.runDir}/${node.runFile}` });
}

function approvalRecordPath(runDir, stage) {
  return path.join(runDir, "hitl", "approvals", `stage_${String(stage).padStart(2, "0")}.json`);
}

function hasApproval(runDir, stage) {
  return fs.existsSync(approvalRecordPath(runDir, stage));
}

function clearWaiting(runDir) {
  for (const file of [path.join(runDir, "hitl", "waiting.json"), path.join(runDir, "hitl", "response.json")]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // Nothing to clear.
    }
  }
}

function consumeApprovalResponse(runDir, runId) {
  const responsePath = path.join(runDir, "hitl", "response.json");
  const response = readJson(responsePath, null);
  if (!response || response.action !== "approve") return null;

  let approvedStage = Number(response.stage);
  if (!approvedStage) {
    const waiting = readJson(path.join(runDir, "hitl", "waiting.json"), null);
    if (waiting) {
      approvedStage = Number(waiting.stage);
    }
  }
  if (!approvedStage) return null;

  const node = NODES.find((item) => item.stage === approvedStage);
  ensureDir(path.join(runDir, "hitl", "approvals"));
  writeJson(approvalRecordPath(runDir, approvedStage), {
    stage: approvedStage,
    action: "approve",
    message: response.message || "",
    approved_at: nowIso()
  });
  if (node) {
    writeJson(path.join(runDir, node.runDir, "decision.json"), {
      status: "done",
      ts: nowIso(),
      node_id: node.id,
      skill: node.skill,
      next_stage: approvedStage < NODES.length ? approvedStage + 1 : null,
      summary: `${node.title}审批通过`
    });
    appendTimeline(runDir, runId, "approval_resolved", node, { action: "approve", message: response.message || "" });
  }
  clearWaiting(runDir);
  return approvedStage;
}

function requestApproval(runDir, runId, topic, node) {
  const reason = node.stage === 1
    ? "文献综述已完成，请确认研究范围、文献质量、关键词和研究空白是否合理。"
    : "实验设计已完成，请确认数据集、baseline、评价指标和实验协议是否可靠。";
  const requestedAt = nowIso();
  ensureDir(path.join(runDir, "hitl"));
  writeJson(path.join(runDir, "hitl", "waiting.json"), {
    run_id: runId,
    stage: node.stage,
    node_id: node.id,
    phase: node.phase,
    employee_id: node.employee_id,
    employee_cn: node.employee_cn,
    title: node.title,
    reason,
    artifact: `${node.runDir}/${node.runFile}`,
    requested_at: requestedAt
  });
  writeJson(path.join(runDir, node.runDir, "decision.json"), {
    status: "blocked_approval",
    ts: requestedAt,
    node_id: node.id,
    skill: node.skill,
    next_stage: node.stage + 1,
    summary: reason
  });
  updateBlockedStatus(runDir, runId, topic, node, reason);
  updateEmployeesBlocked(runDir, runId, topic, node);
  writeJson(path.join(runDir, "runner_state.json"), {
    status: "blocked",
    mode: "linclaw-skills",
    action: "wait_approval",
    run_id: runId,
    stage: node.stage,
    reason,
    updated_at: requestedAt
  });
  writeJson(path.join(runDir, "pipeline_summary.json"), {
    run_id: runId,
    final_status: "blocked",
    final_stage: node.stage,
    total_stages: NODES.length,
    backend: "linclaw-skills",
    reason,
    waiting_approval: true,
    updated_at: requestedAt
  });
  appendTimeline(runDir, runId, "approval_required", node, { reason, artifact: `${node.runDir}/${node.runFile}` });
}

function writeNodeFailed(runDir, node, external, error) {
  const dir = path.join(runDir, node.runDir);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "skill.stdout.log"), external?.stdout || "", "utf8");
  fs.writeFileSync(path.join(dir, "skill.stderr.log"), external?.stderr || error.message, "utf8");
  writeJson(path.join(dir, "node_result.json"), {
    node_id: node.id,
    skill: node.skill,
    status: "failed",
    error: error.message,
    completed_at: nowIso()
  });
  writeJson(path.join(dir, "decision.json"), {
    status: "failed",
    ts: nowIso(),
    node_id: node.id,
    skill: node.skill,
    summary: error.message
  });
}

function ensureManifest(runDir, runId, topic) {
  const manifestPath = path.join(runDir, "manifest.json");
  const existing = readJson(manifestPath, {});
  writeJson(manifestPath, {
    ...existing,
    run_id: runId,
    name: existing.name || topic.slice(0, 28),
    topic,
    backend: "linclaw-skills",
    serial: true,
    workspace_host: WORKSPACE_HOST,
    created_at: existing.created_at || nowIso(),
    updated_at: nowIso()
  });
}

function getStageSchedule(runDir) {
  const scheduleFile = path.join(runDir, "stage_schedule.json");
  return readJson(scheduleFile, null);
}

function waitForScheduledStage(runDir, runId, topic, node, stageSchedule) {
  if (!stageSchedule || stageSchedule.mode !== "scheduled") return false;

  const plannedStart = stageSchedule.schedule?.[node.stage];
  if (!plannedStart) return false;

  const now = new Date();
  const plannedTime = new Date(plannedStart);

  if (plannedTime > now) {
    const statusFile = path.join(runDir, "task_status.json");
    writeJson(statusFile, {
      run_id: runId,
      name: topic.slice(0, 28),
      topic,
      status: "scheduled",
      current_stage: node.stage,
      current_phase: node.phase,
      progress: Math.max(0, (node.stage - 1) / NODES.length),
      active_employee_id: node.employee_id,
      active_employee_cn: node.employee_cn,
      latest_output: `等待计划时间: ${plannedStart}`,
      needs_approval: false,
      approvals: 0,
      remaining: Math.max(0, NODES.length - node.stage + 1),
      updated_at: nowIso()
    });

    updateEmployees(runDir, runId, topic, node, node.stage - 1);

    writeJson(path.join(runDir, "runner_state.json"), {
      status: "scheduled",
      mode: "linclaw-skills",
      run_id: runId,
      stage: node.stage,
      planned_start: plannedStart,
      updated_at: nowIso()
    });

    appendTimeline(runDir, runId, "stage_scheduled_wait", node, { planned_start: plannedStart });
    console.log(`[scheduled] Run ${runId} stage ${node.stage} waiting for ${plannedStart}`);
    return true;
  }

  return false;
}

function checkInterruptSignal(runDir) {
  const interruptFile = path.join(runDir, "hitl", "interrupt.json");
  if (fs.existsSync(interruptFile)) {
    const signal = readJson(interruptFile, null);
    if (signal && signal.action === "interrupt") {
      return true;
    }
  }
  return false;
}

function main() {
  const [runId, topicArg, runDirArg, ...flags] = process.argv.slice(2);
  if (!runId || !topicArg || !runDirArg) {
    console.error("Usage: linclaw-skill-pipeline.js <runId> <topic> <runDir> [--resume] [--to-stage N]");
    process.exit(2);
  }
  const topic = topicArg;
  const runDir = path.resolve(runDirArg);
  const container = detectContainer();
  const toStageIndex = flags.indexOf("--to-stage");
  const toStage = toStageIndex >= 0 ? Number(flags[toStageIndex + 1]) : NODES.length;
  const targetStage = Number.isFinite(toStage) && toStage > 0 ? Math.min(NODES.length, toStage) : NODES.length;
  ensureDir(runDir);
  ensureDir(path.join(AUTORESEARCH_DIR, "projects", runId));
  ensureManifest(runDir, runId, topic);

  const stageSchedule = getStageSchedule(runDir);
  const manifest = readJson(path.join(runDir, "manifest.json"), {});
  const isScheduledMode = manifest.mode === "scheduled" && stageSchedule;

  if (!acquireLock(runId, topic)) {
    const lock = readJson(LOCK_PATH, {});
    const message = `LinClaw serial pipeline is locked by ${lock.run_id || "another run"}`;
    writeJson(path.join(runDir, "runner_state.json"), { status: "failed", mode: "linclaw-skills", error: message, updated_at: nowIso() });
    console.error(message);
    process.exit(1);
  }

  writeJson(path.join(runDir, "runner_state.json"), {
    status: "running",
    mode: "linclaw-skills",
    action: flags.includes("--resume") ? "resume" : "run",
    run_id: runId,
    container,
    script: __filename,
    workspace_host: WORKSPACE_HOST,
    started_at: nowIso(),
    updated_at: nowIso()
  });

  let failed = false;
  let blockedForApproval = false;
  let waitingForSchedule = false;
  try {
    if (flags.includes("--resume")) {
      consumeApprovalResponse(runDir, runId);
      const prevSummary = readJson(path.join(runDir, "pipeline_summary.json"), {});
      if (prevSummary.waiting_approval) {
        writeJson(path.join(runDir, "pipeline_summary.json"), {
          ...prevSummary,
          final_status: "running",
          waiting_approval: false,
          updated_at: nowIso()
        });
      }
    }
    if (!flags.includes("--resume")) cleanupRootArtifacts(container);
    let interrupted = false;
    for (const node of NODES.filter((item) => item.stage <= targetStage)) {
      const existing = readJson(path.join(runDir, node.runDir, "node_result.json"), null);
      if (flags.includes("--resume") && existing?.status === "done") continue;

      if (checkInterruptSignal(runDir)) {
        console.log(`[interrupt] Run ${runId} received interrupt signal before stage ${node.stage}, exiting gracefully`);
        writeJson(path.join(runDir, "runner_state.json"), {
          status: "interrupted",
          mode: "linclaw-skills",
          run_id: runId,
          stage: node.stage - 1,
          interrupted_at: nowIso(),
          updated_at: nowIso()
        });
        writeJson(path.join(runDir, "pipeline_summary.json"), {
          run_id: runId,
          final_status: "interrupted",
          final_stage: node.stage - 1,
          total_stages: NODES.length,
          backend: "linclaw-skills",
          reason: "用户请求打断",
          updated_at: nowIso()
        });
        appendTimeline(runDir, runId, "run_interrupted", node, { reason: "用户请求打断" });
        interrupted = true;
        break;
      }

      if (isScheduledMode && waitForScheduledStage(runDir, runId, topic, node, stageSchedule)) {
        waitingForSchedule = true;
        break;
      }

      writeNodeStarted(runDir, runId, topic, node);
      updateStatus(runDir, runId, topic, node, "running");
      updateEmployees(runDir, runId, topic, node, node.stage - 1);
      writeJson(path.join(runDir, "runner_state.json"), {
        ...readJson(path.join(runDir, "runner_state.json"), {}),
        status: "running",
        stage: node.stage,
        updated_at: nowIso()
      });
      const external = runSkill(container, runId, topic, node);
      if (!external.ok) {
        const error = external.error || new Error(external.stderr || `docker exec exited with ${external.status}`);
        writeNodeFailed(runDir, node, external, error);
        throw error;
      }
      let syncResult;
      try {
        syncResult = syncArtifact(runDir, runId, node);
      } catch (error) {
        writeNodeFailed(runDir, node, external, error);
        throw error;
      }
      writeNodeDone(runDir, runId, node, syncResult, external);
      updateEmployees(runDir, runId, topic, null, node.stage);
      if (APPROVAL_STAGES.has(node.stage) && !hasApproval(runDir, node.stage)) {
        if (manifest.auto_approve) {
          ensureDir(path.join(runDir, "hitl", "approvals"));
          writeJson(approvalRecordPath(runDir, node.stage), {
            stage: node.stage,
            action: "auto_approve",
            message: "auto_approve enabled",
            approved_at: nowIso()
          });
        } else {
          writeJson(path.join(runDir, "checkpoint.json"), {
            last_completed_stage: node.stage,
            current_stage: node.stage,
            stage_name: node.phase,
            waiting_approval: true,
            updated_at: nowIso()
          });
          requestApproval(runDir, runId, topic, node);
          blockedForApproval = true;
          break;
        }
      }
    }
    if (blockedForApproval || waitingForSchedule || interrupted) return;
    const finalNode = NODES[Math.min(targetStage, NODES.length) - 1];
    updateStatus(runDir, runId, topic, finalNode, targetStage >= NODES.length ? "done" : "running");
    writeJson(path.join(runDir, "checkpoint.json"), {
      last_completed_stage: targetStage,
      current_stage: targetStage,
      stage_name: finalNode.phase,
      updated_at: nowIso()
    });
    writeJson(path.join(runDir, "pipeline_summary.json"), {
      run_id: runId,
      final_status: targetStage >= NODES.length ? "done" : "running",
      final_stage: targetStage,
      total_stages: NODES.length,
      backend: "linclaw-skills",
      serial: true,
      container,
      script: __filename,
      workspace_host: WORKSPACE_HOST,
      skills: NODES.map((node) => node.skill),
      updated_at: nowIso()
    });
    writeJson(path.join(runDir, "runner_state.json"), {
      status: "done",
      mode: "linclaw-skills",
      run_id: runId,
      updated_at: nowIso()
    });
  } catch (error) {
    writeJson(path.join(runDir, "pipeline_summary.json"), {
      run_id: runId,
      final_status: "failed",
      backend: "linclaw-skills",
      error: error.message,
      updated_at: nowIso()
    });
    writeJson(path.join(runDir, "runner_state.json"), {
      status: "failed",
      mode: "linclaw-skills",
      error: error.message,
      updated_at: nowIso()
    });
    console.error(error.stack || error.message);
    failed = true;
  } finally {
    releaseLock(runId);
  }
  if (failed) process.exit(1);
}

main();
