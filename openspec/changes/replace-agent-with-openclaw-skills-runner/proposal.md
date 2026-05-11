# 变更提案：将后端科研 agent 替换为 OpenClaw 原生 agent + 科研 skills

## 背景

当前 `/home/cxs/下载/AutoResearch` 已经形成“前端 + app 中间层 + agent-runner Docker 镜像 + `/data/runs` 投影数据”的产品框架。现有中间层代码中，`app/backend/runner.js` 默认通过 `researchclaw run` 启动 `AutoResearchClaw/ResearchClaw`，同时保留了 `AGENT_RUNNER_CMD` 自定义命令入口。

现在需要将后端自动科研 agent 从 `AutoResearchClaw/ResearchClaw` pipeline 更换为 OpenClaw 原生 agent，并使用 `/home/cxs/下载/AutoResearch/skills_keyan` 下的科研 skills：

- `literature-review`
- `theory-formalization`
- `experiment-design`
- `academic-writing`
- `paper-review`

后端 agent 仍以 Docker 镜像存在；前端、app 中间层、REST/WebSocket API、`/data/runs` 数据契约原则上保持不变。

## 目标

1. 将 agent-runner 镜像职责从运行 `researchclaw` 改为运行 OpenClaw 原生 agent。
2. 将 `skills_keyan` 作为 OpenClaw workspace skills 加载进 agent-runner 镜像。
3. 新增脚本化节点触发器，通过 OpenClaw 原生 skill 能力定点触发具体 skill。
4. 保持 app 中间层和前端的数据获取方式不变，继续通过 `/data/runs/{run_id}` 下的投影 JSON 和 artifacts 展示项目、员工、排班、甘特图、产出和审批。
5. 更新数字员工模型，使员工数量和职责匹配新的 skill 化科研流程。

## 非目标

1. 不重写前端页面和 API 结构。
2. 不把 OpenClaw agent 直接嵌入 app 镜像；agent 仍在独立 Docker 镜像运行。
3. 不要求第一版实现 OpenClaw 多 agent 并行协作；首版采用“单 OpenClaw 原生 agent + 节点脚本触发 skills”的稳定路径。
4. 不要求复用 ResearchClaw 23 stage 语义；新的 stage 可按科研 skill 节点重新定义，但需要投影到既有前端数据模型。

## 方案概述

运行链路调整为：

```text
浏览器前端
  -> app 后端 API/WebSocket
    -> Runner Adapter
      -> scripts/run-openclaw-skills-agent.sh
        -> agent-runner Docker 镜像
          -> OpenClaw 原生 agent
            -> 节点脚本按顺序触发 skills_keyan 中的具体 skill
              -> 写入 /data/runs/{run_id}/stage-xx artifacts
    -> projector 投影为 task_status / employees / artifacts / schedule / burndown / timeline
```

新的后端 agent 不再依赖 ResearchClaw 内部 pipeline 是否能完整跑通，而是把科研流程拆成明确的 skill 节点。每个节点通过脚本传入标准上下文、读取上游 artifacts、调用 OpenClaw agent 使用指定 skill 完成任务，并把输出写回固定目录。

可参考实现：`/home/cxs/lyg/1/0506/linclaw/plugins/linclaw-script-executor` 已提供 `scripts.run_skill` 和 workflow `skill` 节点能力。该插件通过 subagent/embedded agent 执行规范化 skill command，可作为本变更的直接工程参考。

## 新数字员工模型

数字员工不再按 ResearchClaw 23 stage 拆分为 8 个员工，而是按 `skills_keyan` 的 5 个 skill 拆分为 5 个可见员工。固定流程编排、节点触发、状态写入、失败恢复和人工审批等待由不可见的脚本编排器负责，不作为前端数字员工展示。

| 数字员工 | 后端执行来源 | 核心职责 | 主要产出 |
| --- | --- | --- | --- |
| 文献研究员 | `literature-review` skill | 文献检索、论文筛选、结构化摘要、Gap 识别 | `literature_review.md`、`paper_cards/*.md`、`gap_list.md` |
| 理论建模员 | `theory-formalization` skill | 研究问题形式化、理论假设、推导、可检验推论 | `theory_final.md`、`hypotheses.md`、`testable_implications.md` |
| 实验设计员 | `experiment-design` skill | 实验目标、数据集、baseline、指标、消融设计 | `experiment_plan.md`、`metrics_contract.json`、`ablation_plan.md` |
| 论文写作员 | `academic-writing` skill | 摘要、引言、相关工作、方法、实验、结论、投稿材料 | `paper_draft.md`、`paper.tex`、`references.bib` |
| 学术评审员 | `paper-review` skill | 论文质量评审、逻辑一致性检查、实验支撑度检查、修改建议 | `review_report.md`、`revision_requests.md` |

## 成功标准

1. app 后端创建 run 后，可以通过 Docker agent-runner 启动 OpenClaw skill 化科研流程。
2. `skills_keyan` 中的每个 skill 可以被脚本定点触发，并将输出写入约定 stage 目录。
3. projector 可以识别新 stage/artifact 结构，并生成前端可消费的稳定 JSON。
4. 前端无需知道后端从 ResearchClaw 切换为 OpenClaw skills，仍能展示项目管理、员工排班、部门产出和审批状态。
5. 失败节点可以被记录为 blocked/failed，并允许后续 resume/retry 从指定节点继续。
