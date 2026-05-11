const fs = require("fs");
const path = require("path");
const { EMPLOYEES } = require("./employees");
const { RUNS_DIR, ensureDir, writeJson } = require("./storage");

const SEED_RUNS = [
  {
    run_id: "rc-gnn-drug",
    name: "GNN 药物发现泛化研究",
    topic: "Graph neural networks for drug discovery",
    status: "running",
    current_stage: 3,
    current_phase: "experiment_design",
    progress: 0.4,
    active_employee_id: "experiment_designer",
    latest_output: "stage-03-experiment/experiment_design.md",
    needs_approval: false,
    approvals: 1,
    remaining: 3,
    updated_at: "2026-04-30T15:42:00+08:00"
  },
  {
    run_id: "rc-mm-survey",
    name: "多模态科研综述",
    topic: "Multimodal agents for scientific literature review",
    status: "blocked",
    current_stage: 1,
    current_phase: "literature_review",
    progress: 0.22,
    active_employee_id: "literature_researcher",
    latest_output: "stage-01-literature/gate_notes.md",
    needs_approval: true,
    approvals: 1,
    remaining: 5,
    updated_at: "2026-04-30T15:28:00+08:00"
  },
  {
    run_id: "rc-rl-efficiency",
    name: "强化学习效率研究",
    topic: "Sample-efficient reinforcement learning for scientific automation",
    status: "queued",
    current_stage: 1,
    current_phase: "literature_review",
    progress: 0,
    active_employee_id: "literature_researcher",
    latest_output: "等待启动",
    needs_approval: false,
    approvals: 0,
    remaining: 5,
    updated_at: "2026-04-30T14:59:00+08:00"
  },
  {
    run_id: "rc-code-review",
    name: "LLM 代码评审基准",
    topic: "Reliability evaluation of LLM code review on real bug fixes",
    status: "done",
    current_stage: 5,
    current_phase: "paper_review",
    progress: 1,
    active_employee_id: "academic_reviewer",
    latest_output: "stage-05-review/review_report.md",
    needs_approval: false,
    approvals: 0,
    remaining: 0,
    updated_at: "2026-04-30T13:44:00+08:00"
  }
];

const ARTIFACTS = [
  ["rc-gnn-drug", "a1", "literature_researcher", "Literature Review", "markdown", 1, "verified", "stage-01-literature/literature_review.md", "# Literature Review\n\nTopic: Graph neural networks for drug discovery.\n\nTop clusters:\n1. Molecular graph pretraining\n2. Scaffold generalization\n3. Uncertainty calibration\n"],
  ["rc-gnn-drug", "a2", "theory_modeler", "Theory Formalization", "markdown", 2, "verified", "stage-02-theory/theory_formalization.md", "# Theory Formalization\n\nHypothesis: scaffold-aware contrastive augmentation improves OOD AUROC.\n"],
  ["rc-gnn-drug", "a3", "experiment_designer", "Experiment Design", "markdown", 3, "draft", "stage-03-experiment/experiment_design.md", "# Experiment Design\n\nDataset: MoleculeNet\nSplit: scaffold\nBaselines: GCN, GIN, GraphMVP\nMetrics: AUROC, ECE\n"],
  ["rc-mm-survey", "a7", "literature_researcher", "Multimodal Paper Pool", "markdown", 1, "generated", "stage-01-literature/literature_review.md", "# Literature Review\n\n128 papers screened across RAG, vision-language, and scientific writing.\n"],
  ["rc-mm-survey", "a8", "literature_researcher", "Review Gate Notes", "markdown", 1, "draft", "stage-01-literature/gate_notes.md", "# Gate Notes\n\nBlocked: literature shortlist has too many weakly relevant survey papers.\nNeed stricter inclusion criteria.\n"],
  ["rc-code-review", "a9", "academic_writer", "Paper Draft", "markdown", 4, "archived", "stage-04-writing/paper_draft.md", "# Paper Draft\n\nThis placeholder represents the exported paper draft artifact.\n"],
  ["rc-code-review", "a10", "academic_reviewer", "Review Report", "markdown", 5, "archived", "stage-05-review/review_report.md", "# Review Report\n\nThe benchmark paper passed the final quality check.\n"]
];

function employeeState(run, employee) {
  const active = run.active_employee_id === employee.id;
  const complete = run.current_stage > employee.stageRange[1] || run.status === "done";
  const queued = run.current_stage < employee.stageRange[0] || run.status === "queued";
  const blocked = active && run.status === "blocked";
  const artifacts = ARTIFACTS.filter(([runId, , employeeId]) => runId === run.run_id && employeeId === employee.id);
  return {
    id: employee.id,
    name: employee.name,
    cn: employee.cn,
    responsibility: employee.responsibility,
    stages: employee.stages,
    status: blocked ? "blocked" : active ? "working" : complete ? "done" : queued ? "queued" : "idle",
    health: blocked ? "critical" : active ? "active" : complete ? "good" : "unknown",
    current_action: active ? `正在处理 ${run.current_phase} 阶段` : complete ? "当前任务范围已完成" : "等待上游阶段推进",
    current_stage: active ? run.current_stage : employee.stageRange[0],
    active_run_id: active ? run.run_id : null,
    active_run_name: active ? run.name : null,
    load: active ? 0.82 : queued ? 0.28 : 0.1,
    outputs: artifacts.length,
    retry_count: blocked ? 1 : 0,
    blocked_reason: blocked ? "等待用户确认文献纳入标准" : null
  };
}

function burndownFor(run) {
  const start = EMPLOYEES.length;
  const remaining = run.remaining;
  const series = [start, Math.max(remaining + 9, remaining), Math.max(remaining + 5, remaining), remaining + 2, remaining, remaining]
    .map((value, index) => ({
      t: index,
      label: index === 0 ? "start" : index === 5 ? "now" : `stage-${index}`,
      remaining_points: Math.min(start, value)
    }));
  return {
    run_id: run.run_id,
    total_points: start,
    remaining_points: remaining,
    ideal_series: Array.from({ length: start + 1 }, (_, index) => start - index),
    series,
    employees: EMPLOYEES.map((employee) => ({
      employee_id: employee.id,
      employee_name: employee.name,
      employee_cn: employee.cn,
      remaining_points: employee.id === run.active_employee_id ? Math.max(1, Math.ceil(remaining / 3)) : Math.max(0, Math.ceil(remaining / 8)),
      points: employee.id === run.active_employee_id ? [5, 5, 5, 4, 4] : [3, 3, 2, 1, run.status === "done" ? 0 : 1]
    }))
  };
}

function timelineFor(run) {
  return [
    {
      event_id: `${run.run_id}-evt-001`,
      run_id: run.run_id,
      type: "run_started",
      timestamp: "2026-04-30T09:00:00+08:00",
      employee_id: "literature_researcher",
      stage: 1,
      payload: { message: "研究任务创建" }
    },
    {
      event_id: `${run.run_id}-evt-current`,
      run_id: run.run_id,
      type: run.status === "blocked" ? "approval_required" : "employee_status_changed",
      timestamp: run.updated_at,
      employee_id: run.active_employee_id,
      stage: run.current_stage,
      payload: { latest_output: run.latest_output }
    }
  ];
}

function ensureSeedData() {
  ensureDir(RUNS_DIR);
  for (const run of SEED_RUNS) {
    const dir = path.join(RUNS_DIR, run.run_id);
    if (fs.existsSync(path.join(dir, "task_status.json"))) continue;
    ensureDir(dir);
    writeJson(path.join(dir, "manifest.json"), {
      run_id: run.run_id,
      topic: run.topic,
      created_at: "2026-04-30T09:00:00+08:00",
      mode: "auto",
      source: "seed"
    });
    writeJson(path.join(dir, "task_status.json"), run);
    writeJson(path.join(dir, "employees.json"), EMPLOYEES.map((employee) => employeeState(run, employee)));
    const artifacts = ARTIFACTS.filter(([runId]) => runId === run.run_id).map(([runId, id, employeeId, title, type, stage, status, relativePath, content]) => {
      const filePath = path.join(dir, relativePath);
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, content);
      return {
        artifact_id: id,
        run_id: runId,
        employee_id: employeeId,
        title,
        type,
        stage,
        status,
        path: relativePath,
        content_type: type === "jsonl" ? "json" : type,
        created_at: run.updated_at,
        updated_at: run.updated_at,
        upstream: []
      };
    });
    writeJson(path.join(dir, "artifacts_index.json"), artifacts);
    writeJson(path.join(dir, "burndown.json"), burndownFor(run));
    writeJson(path.join(dir, "timeline.json"), timelineFor(run));
    writeJson(path.join(dir, "guidance.json"), []);
  }
}

module.exports = { ensureSeedData, SEED_RUNS };
