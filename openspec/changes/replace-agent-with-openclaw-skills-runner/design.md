# 设计文档：OpenClaw 原生 agent + 科研 skills 后端

## 1. 当前代码现状

### 1.1 已存在的稳定边界

当前项目已经具备这些可复用边界：

```text
app/backend/server.js
  REST/WebSocket API，不需要因为 agent 替换而重写。

app/backend/runner.js
  当前默认启动 ResearchClaw。
  已支持 AGENT_RUNNER_CMD 自定义命令，这是替换后端 agent 的主要接入点。

app/backend/projector.js
  扫描 /data/runs/{run_id}，生成 task_status、employees、artifacts_index、timeline、burndown、schedule 等前端稳定数据。

app/backend/employees.js
  当前员工模型仍是 ResearchClaw 23 stage 的 8 员工映射，需要替换为 5 个 skill 对应员工。

docker-compose.yml
  已分离 app 服务和 agent 服务，符合“后端 agent 仍为 Docker 镜像”的要求。
```

### 1.2 当前需要替换的部分

```text
AutoResearchClaw/ResearchClaw pipeline
  替换为 OpenClaw 原生 agent + skills_keyan。

AutoResearchClaw/Dockerfile.agent
  新增或替换为 OpenClaw agent runner 镜像 Dockerfile。

scripts/run-agent-docker.sh
  新增 OpenClaw skills runner 版本，或通过 AGENT_RUNNER_CMD 指向新脚本。

app/backend/employees.js
  更新为 5 个新数字员工。

app/backend/projector.js
  增加对新 stage 目录和 node metadata 的解析。
```

## 2. 目标运行架构

```text
用户浏览器
  -> app 前端
    -> app 后端 API
      -> runner adapter
        -> AGENT_RUNNER_CMD
          -> scripts/run-openclaw-skills-agent.sh
            -> docker run autoresearch-openclaw-agent:local
              -> scripts/openclaw-skill-pipeline.sh
                -> openclaw 原生 agent
                -> skills_keyan/*
              -> /data/runs/{run_id}/stage-xx/*
      -> projector
        -> /data/runs/{run_id}/task_status.json
        -> /data/runs/{run_id}/employees.json
        -> /data/runs/{run_id}/artifacts_index.json
        -> /data/runs/{run_id}/timeline.json
        -> /data/runs/{run_id}/schedule.json
```

## 3. agent-runner 镜像设计

### 3.1 镜像职责

`autoresearch-openclaw-agent:local` SHALL 包含：

- OpenClaw CLI 和运行时依赖。
- OpenClaw workspace。
- `/workspace/skills_keyan` 科研 skills。
- 节点触发脚本。
- 写入 `/data/runs/{run_id}` 的权限。

### 3.2 workspace skills 加载方式

推荐在容器内使用 OpenClaw workspace 目录：

```text
/workspace/openclaw-workspace/
  skills/
    literature-review/SKILL.md
    theory-formalization/SKILL.md
    experiment-design/SKILL.md
    academic-writing/SKILL.md
    paper-review/SKILL.md
```

也可以通过 OpenClaw 配置加载额外 skill 目录：

```json5
{
  "skills": {
    "load": {
      "extraDirs": ["/workspace/skills_keyan"]
    }
  },
  "agents": {
    "defaults": {
      "skills": [
        "literature-review",
        "theory-formalization",
        "experiment-design",
        "academic-writing",
        "paper-review"
      ]
    }
  }
}
```

## 4. 节点式 skill 触发设计

### 4.0 可参考实现：linclaw-script-executor

`/home/cxs/lyg/1/0506/linclaw/plugins/linclaw-script-executor` 已经实现了可参考的“脚本/工作流节点触发 skill”能力，核心点包括：

```text
Gateway API
  scripts.run
  scripts.run_skill

Workflow node
  type: "skill"
  skillName: "..."
  input: {...}
  extraSystemPrompt: "..."

执行机制
  skillName -> /{normalized_skill_command} prompt
  subagent.run(...)
  subagent.waitForRun(...)
  subagent.getSessionMessages(...)
  fallback: runEmbeddedPiAgent(...)
```

其中 `src/workflow/nodes/skill.ts` 的 `executeSkillTask` 和 `buildSkillPrompt` 可以直接作为本项目节点触发器的设计参考；`src/workflow/executor.ts`、`src/workflow/state.ts` 可以作为节点状态、暂停、恢复、节点输出持久化的参考。

关键结论：

- 该插件证明“节点化触发 skill”是可实现的。
- 更准确的实现方式不是直接执行 `SKILL.md` 文件，而是通过 Gateway/API 或 subagent 运行一个规范化 skill command。
- 对本项目而言，优先参考 `scripts.run_skill` 的 API 形态和 workflow `skill` 节点模型，而不是自行拼接 `openclaw infer model run`。

### 4.1 节点定义

首版采用 5 个可见员工节点。节点不是 ResearchClaw stage，而是产品化科研任务节点。固定流程由不可见脚本编排器控制，不单独作为“科研主管”员工展示。

| node_id | 数字员工 | skill | 输入 | 输出目录 |
| --- | --- | --- | --- | --- |
| `node-01-literature` | 文献研究员 | `literature-review` | topic、project config | `stage-01-literature/` |
| `node-02-theory` | 理论建模员 | `theory-formalization` | literature review、gap list | `stage-02-theory/` |
| `node-03-experiment` | 实验设计员 | `experiment-design` | theory、hypotheses | `stage-03-experiment/` |
| `node-04-writing` | 论文写作员 | `academic-writing` | literature、theory、experiment | `stage-04-writing/` |
| `node-05-review` | 学术评审员 | `paper-review` | paper draft、artifacts | `stage-05-review/` |

### 4.2 节点触发脚本

新增脚本建议：

```text
scripts/run-openclaw-agent-docker.sh
  app 后端通过 AGENT_RUNNER_CMD 调用。

scripts/openclaw-skill-pipeline.sh
  容器内入口。负责按节点执行、恢复、重试、写状态。

scripts/openclaw-skill-node.sh
  单节点执行器。接收 run_id、node_id、skill、input、output_dir。
  内部优先调用 scripts.run_skill 或 workflow skill node。
```

调用关系：

```text
runner.js
  -> AGENT_RUNNER_CMD run_id topic run_dir
    -> scripts/run-openclaw-agent-docker.sh
      -> docker run autoresearch-openclaw-agent:local
        -> scripts/openclaw-skill-pipeline.sh --run-id ... --topic ... --output ...
          -> scripts/openclaw-skill-node.sh --skill literature-review ...
```

### 4.3 OpenClaw / LinClaw skill 调用原则

OpenClaw 原生 CLI 中 `openclaw skills list/info/check` 用于确认 skill 可见性；真正节点执行优先通过 `linclaw-script-executor` 风格的 `scripts.run_skill` 或 workflow `skill` 节点触发。

节点执行器 SHALL 在每次执行前运行：

```bash
openclaw skills check --json
openclaw skills info literature-review --json
```

节点执行器 SHOULD 采用与 `linclaw-script-executor` 一致的调用语义：

```json
{
  "skillName": "literature-review",
  "input": {
    "run_id": "{run_id}",
    "node_id": "node-02-literature",
    "input_dir": "{input_dir}",
    "output_dir": "{output_dir}",
    "expected_outputs": ["literature_review.md", "gap_list.md"]
  },
  "extraSystemPrompt": "你是文献研究员。必须将结果写入 output_dir，并生成 node_result.json。"
}
```

节点执行器传给 skill 的输入 SHOULD 使用稳定模板：

```text
你是自动科研 pipeline 的 {employee_cn}。
本节点必须使用 OpenClaw skill: {skill_name}。
输入目录：{input_dir}
输出目录：{output_dir}
请读取上游 artifacts，完成本节点任务，并严格写入以下文件：
{expected_outputs}
完成后写入 node_result.json。
```

具体落地可选两种路径：

```text
路径 A：直接复用 linclaw-script-executor
  app/runner -> docker agent -> gateway method scripts.run_skill
  优点：已有 run_skill、workflow、pause/resume、node output。
  风险：需要 agent-runner 内启动或连接 LinClaw/OpenClaw Gateway。

路径 B：抽取其 skill node 设计，自建轻量脚本
  app/runner -> docker agent -> openclaw-skill-node.sh
  openclaw-skill-node.sh 内部按 /skill_command prompt 调用 headless agent。
  优点：依赖更轻，和当前 app 更容易集成。
  风险：需要自己实现状态、恢复和输出持久化。
```

建议首版采用路径 B 的轻量实现，但严格参考 `linclaw-script-executor` 的 `scripts.run_skill` 参数、skill command 规范化、sessionKey/idempotencyKey、节点输出模型。若后续希望能力更完整，再引入完整插件。

## 5. run 目录与数据契约

### 5.1 原始节点输出

每个节点 SHALL 写入：

```text
/data/runs/{run_id}/stage-01-literature/
  node_meta.json
  node_result.json
  artifacts...
```

`node_meta.json`：

```json
{
  "node_id": "node-01-literature",
  "employee_id": "literature_researcher",
  "skill": "literature-review",
  "status": "running|done|blocked|failed",
  "started_at": "ISO-8601",
  "finished_at": "ISO-8601",
  "inputs": ["manifest.json"],
  "outputs": ["literature_review.md", "gap_list.md"]
}
```

`node_result.json`：

```json
{
  "status": "done",
  "summary": "完成文献检索和 Gap 识别",
  "quality_gate": "pass|needs_review|fail",
  "next_node": "node-02-theory",
  "approval_required": false,
  "artifacts": [
    {
      "title": "Literature Review",
      "path": "stage-01-literature/literature_review.md",
      "type": "markdown"
    }
  ]
}
```

### 5.2 app projector 输出保持不变

前端仍消费：

```text
task_status.json
employees.json
artifacts_index.json
timeline.json
burndown.json
schedule.json
activity.json
```

projector 需要新增适配：

- 识别 `stage-*-*/node_meta.json`。
- 使用 `employee_id` 映射员工状态。
- 使用 `node_result.artifacts` 或文件扫描生成 `artifacts_index.json`。
- 将节点状态转换为项目状态。
- 将节点起止时间写入 `schedule.json`，供员工排班页展示员工-项目-任务。
- 将节点预计/实际时间写入甘特图数据。

## 6. 新员工模型

`app/backend/employees.js` 应改为：

```text
literature_researcher
  文献研究员：文献调研、综述、Gap 识别

theory_modeler
  理论建模员：理论形式化、假设、推导

experiment_designer
  实验设计员：实验方案、数据集、baseline、指标

academic_writer
  论文写作员：论文草稿、LaTeX、参考文献

academic_reviewer
  学术评审员：同行评审、质量门控、修改建议
```

## 7. 人工审批与恢复

关键节点默认支持人工审批：

- `node-01-literature` 完成后可等待用户确认研究方向和 Gap 选择。
- `node-03-experiment` 完成后可等待用户确认实验方案。
- `node-05-review` 若质量门控失败，则进入 blocked。

审批状态写入：

```text
/data/runs/{run_id}/approval_requests.json
/data/runs/{run_id}/hitl/waiting.json
```

app 后端现有 approve/reject/guide/resume API 保持路径不变，但底层命令从 ResearchClaw HITL CLI 改为 OpenClaw skills runner 的控制文件或恢复脚本。

## 8. 兼容策略

首版可同时保留 ResearchClaw runner 和 OpenClaw skills runner：

```text
AGENT_BACKEND=researchclaw
  使用现有逻辑。

AGENT_BACKEND=openclaw-skills
  使用新脚本。
```

但产品默认目标应切换为：

```text
AGENT_BACKEND=openclaw-skills
AGENT_RUNNER_CMD=/workspace/scripts/run-openclaw-agent-docker.sh
```

这样 app 和前端不需要同时理解两套后端，只通过 projector 适配输出。
