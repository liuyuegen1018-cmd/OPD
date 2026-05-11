#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const NODES = [
  {
    id: "node-01-literature",
    stage: 1,
    dir: "stage-01-literature",
    phase: "literature_review",
    employee_id: "literature_researcher",
    employee_cn: "文献研究员",
    skill: "literature-review",
    title: "文献综述",
    output: "literature_review.md"
  },
  {
    id: "node-02-theory",
    stage: 2,
    dir: "stage-02-theory",
    phase: "theory_formalization",
    employee_id: "theory_modeler",
    employee_cn: "理论建模员",
    skill: "theory-formalization",
    title: "理论形式化",
    output: "theory_formalization.md"
  },
  {
    id: "node-03-experiment",
    stage: 3,
    dir: "stage-03-experiment",
    phase: "experiment_design",
    employee_id: "experiment_designer",
    employee_cn: "实验设计员",
    skill: "experiment-design",
    title: "实验设计",
    output: "experiment_design.md"
  },
  {
    id: "node-04-writing",
    stage: 4,
    dir: "stage-04-writing",
    phase: "academic_writing",
    employee_id: "academic_writer",
    employee_cn: "论文写作员",
    skill: "academic-writing",
    title: "论文写作",
    output: "paper_draft.md"
  },
  {
    id: "node-05-review",
    stage: 5,
    dir: "stage-05-review",
    phase: "paper_review",
    employee_id: "academic_reviewer",
    employee_cn: "学术评审员",
    skill: "paper-review",
    title: "学术评审",
    output: "review_report.md"
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
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function appendJsonl(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function skillCommandName(skill) {
  return `/${skill.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32)}`;
}

function buildSkillPrompt(node, input) {
  return `${skillCommandName(node.skill)} ${JSON.stringify(input, null, 2)}`;
}

function latestArtifacts(runDir, currentStage) {
  const artifacts = [];
  for (const node of NODES) {
    if (node.stage >= currentStage) continue;
    const filePath = path.join(runDir, node.dir, node.output);
    if (fs.existsSync(filePath)) {
      artifacts.push({
        stage: node.stage,
        skill: node.skill,
        path: path.relative(runDir, filePath).split(path.sep).join("/")
      });
    }
  }
  return artifacts;
}

function fallbackContent(topic, node, priorArtifacts) {
  const evidence = priorArtifacts.length
    ? priorArtifacts.map((item) => `- Stage ${item.stage}: ${item.path}`).join("\n")
    : "- 新项目启动，暂无上游产物。";
  return [
    `# ${node.title}`,
    "",
    `研究主题：${topic}`,
    "",
    `执行员工：${node.employee_cn}`,
    `触发 Skill：${node.skill}`,
    "",
    "## 上游输入",
    evidence,
    "",
    "## 节点产出",
    `本文件由 ${node.id} 生成，用于承接自动科研固定流程中的 ${node.title} 环节。`,
    "在未配置真实 OpenClaw skill 执行命令时，runner 会生成结构化占位产物，确保中间层、前端和 Docker 编排可以完整联调。",
    "",
    "## 后续交接",
    node.stage < NODES.length
      ? `交接给 Stage ${node.stage + 1}，继续读取本阶段产物。`
      : "流程完成，等待人工查看、下载或归档。"
  ].join("\n");
}

function runExternalSkill(node, input, outputDir) {
  const command = process.env.OPENCLAW_RUN_SKILL_CMD
    || `node ${path.resolve(__dirname, "openclaw-run-skill.js")}`;
  const result = spawnSync(command, [], {
    cwd: process.env.OPENCLAW_HOME || process.cwd(),
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      SKILL_NAME: node.skill,
      SKILL_COMMAND: skillCommandName(node.skill),
      SKILL_INPUT_JSON: JSON.stringify(input),
      SKILL_OUTPUT_DIR: outputDir,
      SKILL_OUTPUT_FILE: path.join(outputDir, node.output),
      OPENCLAW_SKILLS_DIR: process.env.OPENCLAW_SKILLS_DIR || process.env.SKILLS_DIR || path.resolve(__dirname, "../skills_keyan")
    },
    timeout: Number(process.env.OPENCLAW_SKILL_TIMEOUT_MS || 600000)
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function sleep(ms) {
  const duration = Math.max(0, Number(ms) || 0);
  if (!duration) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration);
}

function useDemoMode() {
  return process.env.PIPELINE_MODE === "demo" || process.env.DEMO_PIPELINE === "true";
}

function updateRunStatus(runDir, runId, topic, node, status) {
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
    latest_output: status === "queued" ? "等待启动" : `${node.dir}/${node.output}`,
    needs_approval: false,
    approvals: 0,
    remaining: status === "done" ? 0 : Math.max(0, NODES.length - node.stage + 1),
    updated_at: nowIso()
  });
}

function runNode(runDir, runId, topic, node) {
  const outputDir = path.join(runDir, node.dir);
  ensureDir(outputDir);
  const input = {
    run_id: runId,
    topic,
    node_id: node.id,
    stage: node.stage,
    employee_id: node.employee_id,
    skill: node.skill,
    prior_artifacts: latestArtifacts(runDir, node.stage)
  };
  const startedAt = nowIso();
  writeJson(path.join(outputDir, "node_meta.json"), {
    ...node,
    run_id: runId,
    status: "running",
    started_at: startedAt
  });
  fs.writeFileSync(path.join(outputDir, "skill_prompt.txt"), buildSkillPrompt(node, input), "utf8");
  updateRunStatus(runDir, runId, topic, node, "running");
  appendJsonl(path.join(runDir, "timeline.jsonl"), {
    event_id: `${runId}-${node.id}-started`,
    run_id: runId,
    type: "stage_started",
    timestamp: startedAt,
    employee_id: node.employee_id,
    stage: node.stage,
    payload: { skill: node.skill }
  });

  const artifactPath = path.join(outputDir, node.output);
  if (useDemoMode()) {
    sleep(process.env.DEMO_STAGE_DELAY_MS || 8000);
    fs.writeFileSync(artifactPath, fallbackContent(topic, node, input.prior_artifacts), "utf8");
    fs.writeFileSync(path.join(outputDir, "skill.stdout.log"), `demo output written to ${artifactPath}\n`, "utf8");
    fs.writeFileSync(path.join(outputDir, "skill.stderr.log"), "", "utf8");
  } else {
    const external = runExternalSkill(node, input, outputDir);
    fs.writeFileSync(path.join(outputDir, "skill.stdout.log"), external.stdout, "utf8");
    fs.writeFileSync(path.join(outputDir, "skill.stderr.log"), external.stderr, "utf8");
    if (!external.ok) {
      const failedAt = nowIso();
      writeJson(path.join(outputDir, "node_result.json"), {
        node_id: node.id,
        skill: node.skill,
        status: "failed",
        completed_at: failedAt,
        error: external.stderr || `skill command exited with ${external.status}`
      });
      writeJson(path.join(outputDir, "decision.json"), {
        status: "failed",
        ts: failedAt,
        node_id: node.id,
        skill: node.skill
      });
      throw new Error(`${node.id} failed: ${external.stderr || external.status}`);
    }
    if (external.stdout.trim()) {
      fs.writeFileSync(artifactPath, external.stdout, "utf8");
    } else if (process.env.ALLOW_FAKE_SKILL_OUTPUT === "true") {
      fs.writeFileSync(artifactPath, fallbackContent(topic, node, input.prior_artifacts), "utf8");
    } else if (!fs.existsSync(artifactPath)) {
      throw new Error(`${node.id} produced no artifact. Set ALLOW_FAKE_SKILL_OUTPUT=true only for UI integration tests.`);
    }
  }
  const completedAt = nowIso();
  const nextStage = node.stage < NODES.length ? node.stage + 1 : null;
  writeJson(path.join(outputDir, "node_result.json"), {
    node_id: node.id,
    skill: node.skill,
    status: "done",
    artifact: `${node.dir}/${node.output}`,
    next_stage: nextStage,
    summary: `${node.title} 已完成`,
    completed_at: completedAt
  });
  writeJson(path.join(outputDir, "decision.json"), {
    status: "done",
    ts: completedAt,
    node_id: node.id,
    skill: node.skill,
    next_stage: nextStage,
    summary: `${node.title} 已完成`
  });
  appendJsonl(path.join(runDir, "timeline.jsonl"), {
    event_id: `${runId}-${node.id}-completed`,
    run_id: runId,
    type: "stage_completed",
    timestamp: completedAt,
    employee_id: node.employee_id,
    stage: node.stage,
    payload: { skill: node.skill, artifact: `${node.dir}/${node.output}` }
  });
}

function main() {
  const [runId, topicArg, runDirArg, ...flags] = process.argv.slice(2);
  if (!runId || !topicArg || !runDirArg) {
    console.error("Usage: openclaw-skill-pipeline.js <runId> <topic> <runDir> [--resume] [--to-stage N]");
    process.exit(2);
  }
  const topic = topicArg;
  const runDir = path.resolve(runDirArg);
  ensureDir(runDir);
  const toStageIndex = flags.indexOf("--to-stage");
  const toStage = toStageIndex >= 0 ? Number(flags[toStageIndex + 1]) : NODES.length;
  const targetStage = Number.isFinite(toStage) && toStage > 0 ? Math.min(NODES.length, toStage) : NODES.length;

  writeJson(path.join(runDir, "runner_state.json"), {
    status: "running",
    mode: "openclaw-skills",
    pipeline_mode: useDemoMode() ? "demo" : "real",
    action: flags.includes("--resume") ? "resume" : "run",
    run_id: runId,
    started_at: nowIso(),
    updated_at: nowIso()
  });

  try {
    for (const node of NODES.filter((item) => item.stage <= targetStage)) {
      const resultPath = path.join(runDir, node.dir, "node_result.json");
      const existing = readJson(resultPath, null);
      if (flags.includes("--resume") && existing?.status === "done") continue;
      runNode(runDir, runId, topic, node);
    }
    const finalNode = NODES[Math.min(targetStage, NODES.length) - 1];
    updateRunStatus(runDir, runId, topic, finalNode, targetStage >= NODES.length ? "done" : "running");
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
      backend: "openclaw-skills",
      pipeline_mode: useDemoMode() ? "demo" : "real",
      skills: NODES.map((node) => node.skill),
      updated_at: nowIso()
    });
    writeJson(path.join(runDir, "runner_state.json"), {
      status: "done",
      mode: "openclaw-skills",
      pipeline_mode: useDemoMode() ? "demo" : "real",
      action: flags.includes("--resume") ? "resume" : "run",
      run_id: runId,
      updated_at: nowIso()
    });
  } catch (error) {
    writeJson(path.join(runDir, "pipeline_summary.json"), {
      run_id: runId,
      final_status: "failed",
      error: error.message,
      backend: "openclaw-skills",
      pipeline_mode: useDemoMode() ? "demo" : "real",
      updated_at: nowIso()
    });
    writeJson(path.join(runDir, "runner_state.json"), {
      status: "failed",
      mode: "openclaw-skills",
      pipeline_mode: useDemoMode() ? "demo" : "real",
      error: error.message,
      updated_at: nowIso()
    });
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

main();
