const fs = require("fs");
const path = require("path");
const { EMPLOYEES, employeeForStage } = require("./employees");
const { listRunDirs, readJson, writeJson, projectsDir } = require("./storage");
const TOTAL_STAGES = EMPLOYEES.length;

const PROJECTED_FILES = new Set([
  "manifest.json",
  "task_status.json",
  "employees.json",
  "artifacts_index.json",
  "burndown.json",
  "timeline.json",
  "guidance.json",
  "runner_state.json",
  "activity.json",
  "schedule.json",
  "node_meta.json",
  "node_result.json",
  "decision.json",
  "stage_health.json",
  "skill_prompt.txt",
  "skill.stdout.log",
  "skill.stderr.log"
]);

const STAGE_NAMES = {
  1: "literature_review",
  2: "theory_formalization",
  3: "experiment_design",
  4: "experiment_execution",
  5: "academic_writing",
  6: "paper_review"
};

function idealSeries() {
  return Array.from({ length: TOTAL_STAGES + 1 }, (_, index) => TOTAL_STAGES - index);
}

function inferArtifactType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md") return "markdown";
  if (ext === ".json" || ext === ".jsonl") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  if (ext === ".log" || ext === ".txt") return "log";
  if (ext === ".pdf") return "pdf";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return "image";
  if ([".csv", ".tsv"].includes(ext)) return "table";
  if ([".py", ".js", ".ts", ".sh"].includes(ext)) return "code";
  return "raw";
}

function safeReadJson(filePath, fallback = null) {
  try {
    return readJson(filePath, fallback);
  } catch {
    return fallback;
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function walkFiles(dir, root = dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "__pycache__", ".venv"].includes(entry.name)) continue;
      walkFiles(absolute, root, files);
    } else if (entry.isFile()) {
      if (PROJECTED_FILES.has(entry.name)) continue;
      if (relative.startsWith(`hitl${path.sep}snapshots${path.sep}`)) continue;
      if (entry.name.endsWith(".tmp") || entry.name.startsWith(".") && entry.name.endsWith(".tmp")) continue;
      files.push({ absolute, relative });
    }
  }
  return files;
}

function stageFromRelative(relativePath) {
  const match = relativePath.match(/(?:^|[/\\])stage-(\d{2})(?:[-_/\\]|$)/) || relativePath.match(/stage[_-](\d{2})/);
  return match ? Number(match[1]) : 0;
}

function stageFromProjectDir(dirName) {
  const match = dirName.match(/^(\d{2})_/);
  return match ? Number(match[1]) : 0;
}


function stageDecisions(runDir) {
  const decisions = new Map();
  for (const entry of fs.readdirSync(runDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^stage-\d{2}/.test(entry.name)) continue;
    const stage = Number(entry.name.match(/^stage-(\d{2})/)?.[1] || 0);
    const decision = safeReadJson(path.join(runDir, entry.name, "decision.json"), null);
    if (stage && decision) {
      decisions.set(stage, decision);
      continue;
    }
    const nodeResult = safeReadJson(path.join(runDir, entry.name, "node_result.json"), null);
    if (stage && nodeResult) {
      decisions.set(stage, {
        status: nodeResult.status || "done",
        ts: nodeResult.completed_at || nodeResult.updated_at,
        next_stage: nodeResult.next_stage,
        node_id: nodeResult.node_id,
        skill: nodeResult.skill,
        summary: nodeResult.summary
      });
    }
  }
  return decisions;
}

function walkArtifacts(runDir) {
  const runId = path.basename(runDir);
  const decisions = stageDecisions(runDir);
  const manifest = safeReadJson(path.join(runDir, "manifest.json"), {});
  const stageEmployees = manifest.stage_employees || {};
  const projDir = projectsDir(runId);
  if (!fs.existsSync(projDir)) return [];
  return walkFiles(projDir)
    .filter(({ relative }) => {
      const parts = relative.split(path.sep);
      return stageFromProjectDir(parts[0]) > 0;
    })
    .map(({ absolute, relative }) => {
      const parts = relative.split(path.sep);
      const stage = stageFromProjectDir(parts[0]);
      const scopedPath = `projects/${parts.join("/")}`;
      return buildArtifact(runId, absolute, scopedPath, decisions, stage, stageEmployees);
    })
    .filter(Boolean)
    .sort((a, b) => a.stage - b.stage || a.path.localeCompare(b.path));
}

function buildArtifact(runId, absolute, relative, decisions, overrideStage, stageEmployees = {}) {
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return null;
  }
  let stage = overrideStage || stageFromRelative(relative);
  // 特殊处理：03_experiment/results 目录属于 Stage 4（实验执行）
  if (relative.includes('/03_experiment/results') || relative.includes('\\03_experiment\\results')) {
    stage = 4;
  }
  // 使用 stage_employees 配置获取员工 ID（支持自定义员工）
  const assignedEmployeeId = stageEmployees[String(stage)];
  const employee = assignedEmployeeId ? employeeForStage(stage) : employeeForStage(stage || 1);
  const employeeId = assignedEmployeeId || employee.id;
  const decision = decisions.get(stage);
  const basename = path.basename(relative);
  return {
    artifact_id: `${runId}:${relative.split(path.sep).join("/")}`,
    run_id: runId,
    employee_id: employeeId,
    title: basename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
    type: inferArtifactType(relative),
    stage,
    status: decision?.status === "done" ? "verified" : decision?.status || "generated",
    path: relative.split(path.sep).join("/"),
    content_type: inferArtifactType(relative),
    created_at: stat.birthtime.toISOString(),
    updated_at: stat.mtime.toISOString(),
    upstream: [],
    size: stat.size
  };
}

function checkpointStage(checkpoint) {
  if (!checkpoint) return null;
  const candidates = [
    checkpoint.stage,
    checkpoint.current_stage,
    checkpoint.next_stage,
    checkpoint.last_completed_stage,
    checkpoint.completed_stage
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.min(TOTAL_STAGES, Math.max(1, n));
  }
  if (typeof checkpoint.stage_name === "string") {
    const found = Object.entries(STAGE_NAMES).find(([, name]) => name === checkpoint.stage_name.toLowerCase());
    if (found) return Number(found[0]);
  }
  return null;
}

function latestDecision(decisions) {
  return [...decisions.entries()]
    .sort(([a], [b]) => b - a)
    .map(([stage, decision]) => ({ stage, decision }))[0] || null;
}

function normalizeStatus(raw) {
  if (!raw) return "queued";
  if (["done", "completed", "success"].includes(raw)) return "done";
  if (["failed", "error"].includes(raw)) return "failed";
  if (["interrupted"].includes(raw)) return "interrupted";
  if (["blocked_approval", "blocked", "paused", "waiting", "rejected"].includes(raw)) return "blocked";
  if (["running", "retrying", "approved"].includes(raw)) return "running";
  if (["scheduled"].includes(raw)) return "scheduled";
  if (["pending", "queued"].includes(raw)) return "queued";
  return raw;
}

function projectStatus(runDir, artifacts, decisions, timeline) {
  const manifest = safeReadJson(path.join(runDir, "manifest.json"), {});
  const previous = safeReadJson(path.join(runDir, "task_status.json"), null);
  const checkpoint = safeReadJson(path.join(runDir, "checkpoint.json"), null);
  const pipelineSummary = safeReadJson(path.join(runDir, "pipeline_summary.json"), null);
  const runnerState = safeReadJson(path.join(runDir, "runner_state.json"), null);
  const waiting = safeReadJson(path.join(runDir, "hitl", "waiting.json"), null);
  const stageSchedule = safeReadJson(path.join(runDir, "stage_schedule.json"), null);
  const latest = artifacts[artifacts.length - 1];
  const latestStageDecision = latestDecision(decisions);
  const completedStage = Number(checkpoint?.last_completed_stage || 0);
  const nextStage = Number(latestStageDecision?.decision?.next_stage || 0);
  const summaryStatus = normalizeStatus(pipelineSummary?.final_status);
  const summaryFinalStage = Number(pipelineSummary?.final_stage || 0);
  const summaryTerminal = ["done", "failed"].includes(summaryStatus) && summaryFinalStage > 0;
  const runnerStatus = runnerState?.status === "unknown" ? null : runnerState?.status;
  const runnerActive = ["running", "retrying", "approved", "guided"].includes(runnerStatus);
  const runnerScheduled = runnerStatus === "scheduled";

  const currentStage = waiting?.stage
    || (runnerActive ? previous?.current_stage : null)
    || (runnerScheduled ? runnerState?.stage : null)
    || (!runnerActive && summaryTerminal ? summaryFinalStage : null)
    || (nextStage > 0 ? nextStage : null)
    || (completedStage > 0 && completedStage < TOTAL_STAGES ? completedStage + 1 : null)
    || checkpointStage(checkpoint)
    || latestStageDecision?.stage
    || latest?.stage
    || previous?.current_stage
    || 1;
  const stageEmployees = manifest.stage_employees || {};
  const assignedEmployeeId = stageEmployees[String(currentStage)];
  const baseEmployee = employeeForStage(currentStage);
  // 如果有分配的员工（包括自定义员工），使用分配的 ID；否则使用默认员工
  const activeEmployeeId = assignedEmployeeId || baseEmployee.id;
  const decisionStatus = latestStageDecision?.decision?.status;

  const isScheduledMode = manifest.mode === "scheduled" && stageSchedule;
  const plannedStart = isScheduledMode ? (runnerState?.planned_start || stageSchedule.schedule?.[currentStage]) : null;
  const now = new Date();
  const plannedTime = plannedStart ? new Date(plannedStart) : null;
  const waitingForSchedule = runnerScheduled || (isScheduledMode && plannedTime && plannedTime > now && !runnerActive);

  let status = normalizeStatus(runnerStatus || pipelineSummary?.final_status || manifest.status || previous?.status || (latest ? "running" : "queued"));

  if (waitingForSchedule) {
    status = "scheduled";
  } else if ((waiting && !runnerActive) || decisionStatus === "blocked_approval") {
    status = "blocked";
  } else if (runnerActive) {
    status = "running";
  } else if (decisionStatus === "failed") {
    status = "failed";
  } else if (summaryTerminal) {
    status = summaryStatus;
  } else if (decisionStatus === "done" && currentStage < TOTAL_STAGES && runnerStatus !== "failed") {
    status = runnerStatus === "done" ? "done" : "running";
  } else if (decisionStatus === "done" && currentStage >= TOTAL_STAGES) {
    status = "done";
  }

  const approvals = waiting ? 1 : decisions.get(currentStage)?.status === "blocked_approval" ? 1 : 0;
  const latestEvent = timeline[timeline.length - 1];

  let latestOutput = latest?.path || previous?.latest_output || "等待产出";
  if (waitingForSchedule && plannedStart) {
    latestOutput = `等待计划时间: ${plannedStart}`;
  }

  return {
    run_id: manifest.run_id || path.basename(runDir),
    name: manifest.name || previous?.name || manifest.topic?.slice(0, 28) || path.basename(runDir),
    topic: manifest.topic || previous?.topic || "Untitled research task",
    status,
    current_stage: currentStage,
    current_phase: STAGE_NAMES[currentStage] || baseEmployee.id,
    progress: status === "done" ? 1 : Math.min(0.99, Math.max(0, (currentStage - 1) / TOTAL_STAGES)),
    active_employee_id: activeEmployeeId,
    latest_output: latestOutput,
    needs_approval: Boolean(waiting) || approvals > 0,
    approvals,
    remaining: status === "done" ? 0 : Math.max(0, TOTAL_STAGES - currentStage + 1),
    updated_at: latestEvent?.timestamp || latest?.updated_at || runnerState?.updated_at || manifest.created_at || new Date().toISOString(),
    checkpoint,
    pipeline_summary: pipelineSummary,
    waiting,
    stage_schedule: stageSchedule,
    planned_start: plannedStart
  };
}

function projectTimeline(runDir, artifacts, decisions) {
  const runId = path.basename(runDir);
  const existing = safeReadJson(path.join(runDir, "timeline.json"), []);
  const interventions = readJsonl(path.join(runDir, "hitl", "interventions.jsonl"));
  const guidanceFiles = fs.existsSync(path.join(runDir, "hitl", "guidance"))
    ? fs.readdirSync(path.join(runDir, "hitl", "guidance")).filter((name) => name.endsWith(".md"))
    : [];
  const generated = [];
  for (const [stage, decision] of decisions.entries()) {
    const employee = employeeForStage(stage);
    generated.push({
      event_id: `${runId}-stage-${stage}-${decision.ts || "decision"}`,
      run_id: runId,
      type: decision.status === "failed" ? "stage_failed" : decision.status === "blocked_approval" ? "approval_required" : "stage_completed",
      timestamp: decision.ts || new Date().toISOString(),
      employee_id: employee.id,
      stage,
      payload: decision
    });
  }
  for (const artifact of artifacts) {
    generated.push({
      event_id: `${runId}-artifact-${artifact.path}`,
      run_id: runId,
      type: "artifact_created",
      timestamp: artifact.updated_at,
      employee_id: artifact.employee_id,
      stage: artifact.stage,
      payload: { artifact_id: artifact.artifact_id, path: artifact.path }
    });
  }
  for (const item of interventions) {
    generated.push({
      event_id: `${runId}-hitl-${item.timestamp || Math.random()}`,
      run_id: runId,
      type: item.type || item.action || "hitl_intervention",
      timestamp: item.timestamp || item.created_at || new Date().toISOString(),
      employee_id: item.employee_id || null,
      stage: item.stage || null,
      payload: item
    });
  }
  for (const file of guidanceFiles) {
    const stage = Number(file.match(/stage_(\d{2})/)?.[1] || 0);
    const full = path.join(runDir, "hitl", "guidance", file);
    const stat = fs.statSync(full);
    generated.push({
      event_id: `${runId}-guidance-${file}`,
      run_id: runId,
      type: "guide_created",
      timestamp: stat.mtime.toISOString(),
      employee_id: employeeForStage(stage || 1).id,
      stage,
      payload: { path: `hitl/guidance/${file}` }
    });
  }
  const byId = new Map([...existing, ...generated].map((event) => [event.event_id, event]));
  return [...byId.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function projectEmployees(status, artifacts, decisions, timeline, manifest) {
  return EMPLOYEES.map((employee) => {
    const outputs = artifacts.filter((artifact) => artifact.employee_id === employee.id).length;
    const inRangeDone = [...decisions.entries()].filter(([stage, decision]) => {
      const [start, end] = employee.stageRange;
      return stage >= start && stage <= end && decision.status === "done";
    }).length;
    const blocked = status.waiting && employee.id === status.active_employee_id;
    const active = employee.id === status.active_employee_id && ["running", "blocked", "queued"].includes(status.status);
    const complete = status.current_stage > employee.stageRange[1]
      || (status.status === "done" && status.current_stage >= employee.stageRange[0] && status.current_stage <= employee.stageRange[1]);
    const queued = status.current_stage < employee.stageRange[0] || status.status === "queued";
    const relatedEvents = timeline.filter((event) => event.employee_id === employee.id);
    const load = blocked ? 0.76 : active ? 0.82 : queued ? 0.28 : complete ? 0.14 : 0.35;
    return {
      id: employee.id,
      name: employee.name,
      cn: employee.cn,
      responsibility: employee.responsibility,
      stages: employee.stages,
      status: blocked ? "blocked" : active ? "working" : complete ? "done" : queued ? "queued" : "idle",
      health: blocked ? "critical" : active ? "active" : complete ? "good" : "unknown",
      current_action: blocked ? `等待用户处理 Stage ${status.current_stage}` : active ? `正在处理 ${status.current_phase}` : complete ? "当前任务范围已完成" : "等待上游节点推进",
      current_stage: active ? status.current_stage : employee.stageRange[0],
      active_run_id: active ? status.run_id : null,
      active_run_name: active ? status.name : null,
      load,
      outputs,
      completed_stages: inRangeDone,
      retry_count: relatedEvents.filter((event) => event.type === "retry_started").length,
      blocked_reason: blocked ? status.waiting?.reason || "等待人工输入" : null,
      last_event_at: relatedEvents[relatedEvents.length - 1]?.timestamp || null
    };
  });
}

function projectBurndown(status, employees, timeline) {
  const stageEvents = timeline.filter((event) => event.stage).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const series = stageEvents.length
    ? stageEvents.map((event, index) => ({
      t: index,
      label: `stage-${event.stage}`,
      remaining_points: Math.max(0, TOTAL_STAGES - Number(event.stage) + (event.type === "stage_completed" ? 0 : 1))
    }))
    : [{ t: 0, label: "start", remaining_points: TOTAL_STAGES }, { t: 1, label: "now", remaining_points: status.remaining }];
  return {
    run_id: status.run_id,
    total_points: TOTAL_STAGES,
    remaining_points: status.remaining,
    ideal_series: idealSeries(),
    series,
    employees: employees.map((employee) => ({
      employee_id: employee.id,
      employee_name: employee.name,
      employee_cn: employee.cn,
      remaining_points: employee.status === "done" ? 0 : Math.max(1, Math.ceil(status.remaining * employee.load / 3)),
      points: employee.status === "done" ? [3, 2, 1, 0, 0] : [3, 3, 2, 2, Math.max(1, Math.ceil(employee.load * 5))]
    }))
  };
}

function projectActivity(status, employees, timeline) {
  return employees.map((employee) => {
    const events = timeline.filter((event) => event.employee_id === employee.id);
    const heatmap = Array.from({ length: 210 }, (_, index) => {
      const eventBoost = events.length ? (index + events.length + employee.outputs) % 5 : (index + employee.outputs) % 3;
      const level = employee.status === "working" || employee.status === "blocked"
        ? Math.min(4, eventBoost + 1)
        : Math.min(4, eventBoost);
      return { index, level };
    });
    return {
      employee_id: employee.id,
      active_days_30w: heatmap.filter((cell) => cell.level > 0).length,
      trigger_count: events.length,
      output_count: employee.outputs,
      load_percent: Math.round(employee.load * 100),
      heatmap
    };
  });
}

function projectSchedule(status, employees) {
  return employees.map((employee, index) => {
    const active = employee.id === status.active_employee_id && ["running", "blocked", "queued"].includes(status.status);
    return {
      employee_id: employee.id,
      employee_cn: employee.cn,
      employee_name: employee.name,
      active,
      task: active ? `Stage ${status.current_stage}/${TOTAL_STAGES} · ${status.current_phase}` : employee.status === "done" ? "已完成，等待新项目" : `Stage ${employee.stages} · 待排期`,
      project: active ? status.name : status.status === "queued" ? status.name : "等待项目交接",
      start_offset: active ? Math.min(10, index % 5) : Math.min(12, 2 + index),
      duration_days: active ? (status.status === "blocked" ? 4 : 6) : employee.status === "idle" ? 2 : 3,
      color: status.status === "blocked" && active ? "amber" : active ? "cyan" : employee.status === "done" ? "green" : ""
    };
  });
}

function projectRun(runDir) {
  const artifacts = walkArtifacts(runDir);
  const decisions = stageDecisions(runDir);
  const timeline = projectTimeline(runDir, artifacts, decisions);
  const manifest = safeReadJson(path.join(runDir, "manifest.json"), {});
  const status = projectStatus(runDir, artifacts, decisions, timeline);
  const employees = projectEmployees(status, artifacts, decisions, timeline, manifest);
  const burndown = projectBurndown(status, employees, timeline);
  const activity = projectActivity(status, employees, timeline);
  const schedule = projectSchedule(status, employees);

  writeJson(path.join(runDir, "task_status.json"), status);
  writeJson(path.join(runDir, "employees.json"), employees);
  writeJson(path.join(runDir, "artifacts_index.json"), artifacts);
  writeJson(path.join(runDir, "burndown.json"), burndown);
  writeJson(path.join(runDir, "activity.json"), activity);
  writeJson(path.join(runDir, "schedule.json"), schedule);

  return { status, employees, artifacts, burndown, timeline, activity, schedule };
}

function projectAllRuns() {
  return listRunDirs().map(projectRun);
}

module.exports = { projectRun, projectAllRuns, inferArtifactType, STAGE_NAMES, TOTAL_STAGES };
