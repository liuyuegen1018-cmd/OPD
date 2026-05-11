# 规格增量：OpenClaw skills 后端科研 agent

## ADDED Requirements

### Requirement: 系统应支持 OpenClaw skills 作为后端科研 agent

系统 SHALL 支持以 OpenClaw 原生 agent 和 workspace skills 作为自动科研执行后端，并保持前端和 app API 不变。

#### Scenario: 创建研究项目

- **WHEN** 用户通过前端创建研究项目
- **THEN** app 后端 SHALL 创建 run 目录和初始投影 JSON
- **AND** runner adapter SHALL 启动 OpenClaw skills agent-runner Docker 容器
- **AND** agent-runner SHALL 写入 `/data/runs/{run_id}` 下的节点 artifacts

#### Scenario: app 不关心具体 skill 执行细节

- **WHEN** 后端 agent 从 ResearchClaw 替换为 OpenClaw skills
- **THEN** 前端 SHALL 继续通过原 REST/WebSocket API 获取数据
- **AND** app 后端 SHALL 通过 projector 适配新的 artifacts 结构

### Requirement: 系统应通过脚本定点触发科研 skill 节点

系统 SHALL 使用脚本化节点执行器定点触发指定 OpenClaw skill，而不是依赖自然语言自由漂移。

#### Scenario: 使用 run_skill 风格调用 skill

- **WHEN** 节点执行器需要触发某个 skill
- **THEN** 系统 SHOULD 采用 `scripts.run_skill` 风格的调用参数：`skillName`、`input`、`extraSystemPrompt`、`timeoutMs`
- **AND** 系统 SHALL 为每次节点执行设置稳定的 sessionKey 或 idempotencyKey
- **AND** 系统 SHALL 将 skill 返回文本转换为节点 artifacts 或 `node_result.json`

#### Scenario: 执行文献节点

- **WHEN** pipeline 进入 `node-01-literature`
- **THEN** 节点执行器 SHALL 显式要求 OpenClaw agent 使用 `literature-review` skill
- **AND** 输出 SHALL 写入 `stage-01-literature/`
- **AND** 节点 SHALL 写入 `node_meta.json` 和 `node_result.json`

#### Scenario: 执行理论节点

- **WHEN** pipeline 进入 `node-02-theory`
- **THEN** 节点执行器 SHALL 显式要求 OpenClaw agent 使用 `theory-formalization` skill
- **AND** 输入 SHALL 包含文献综述和 Gap List

#### Scenario: 执行实验设计节点

- **WHEN** pipeline 进入 `node-03-experiment`
- **THEN** 节点执行器 SHALL 显式要求 OpenClaw agent 使用 `experiment-design` skill
- **AND** 输出 SHALL 包含实验方案、baseline、数据集和评估指标

#### Scenario: 执行写作节点

- **WHEN** pipeline 进入 `node-04-writing`
- **THEN** 节点执行器 SHALL 显式要求 OpenClaw agent 使用 `academic-writing` skill
- **AND** 输出 SHALL 包含论文草稿或 LaTeX/BibTeX 文件

#### Scenario: 执行评审节点

- **WHEN** pipeline 进入 `node-05-review`
- **THEN** 节点执行器 SHALL 显式要求 OpenClaw agent 使用 `paper-review` skill
- **AND** 输出 SHALL 包含评审报告和修改建议

### Requirement: 系统应提供新的数字员工模型

系统 SHALL 将数字员工模型更新为 OpenClaw skills 后端对应的职责集合。

#### Scenario: 展示部门概况

- **WHEN** 用户进入部门概况
- **THEN** 系统 SHALL 展示 5 个数字员工：文献研究员、理论建模员、实验设计员、论文写作员、学术评审员
- **AND** 每个员工 SHALL 显示当前任务、当前项目、负载、状态和最近产出

#### Scenario: 展示部门产出

- **WHEN** 用户查看某个项目产出
- **THEN** 系统 SHALL 按新员工职责标注 artifact 的生成员工

### Requirement: 系统应保持 run 数据契约稳定

系统 SHALL 保持前端消费的投影 JSON 文件和 API 契约稳定。

#### Scenario: OpenClaw 节点完成

- **WHEN** 某个 OpenClaw skill 节点完成
- **THEN** projector SHALL 更新 `task_status.json`
- **AND** projector SHALL 更新 `employees.json`
- **AND** projector SHALL 更新 `artifacts_index.json`
- **AND** projector SHALL 更新 `timeline.json`

#### Scenario: 节点写入新 artifact

- **WHEN** 节点目录出现新的 Markdown、JSON、YAML、PDF、图片、代码或表格文件
- **THEN** projector SHALL 将其纳入 `artifacts_index.json`
- **AND** artifact SHALL 包含 run_id、employee_id、title、type、stage/node、path、status、updated_at

### Requirement: 系统应支持节点级恢复、重试和人工审批

系统 SHALL 支持 OpenClaw skills pipeline 的节点级恢复、重试和人工审批。

#### Scenario: 节点失败

- **WHEN** 某个 skill 节点失败
- **THEN** runner SHALL 写入 failed 状态和日志路径
- **AND** projector SHALL 将项目状态投影为 failed 或 blocked
- **AND** 前端 SHALL 展示风险和可重试入口

#### Scenario: 关键节点等待审批

- **WHEN** 项目计划、实验方案或论文评审节点需要人工确认
- **THEN** agent-runner SHALL 写入 approval request
- **AND** app 后端 SHALL 通过既有审批 API 处理 approve/reject/guide

#### Scenario: 从指定节点恢复

- **WHEN** 用户触发 resume 或 retry
- **THEN** runner SHALL 能够从指定 node_id 继续执行
- **AND** 已完成节点 artifacts SHALL 保持不变

### Requirement: 系统应保持 Docker 部署边界不变

系统 SHALL 继续使用 app 镜像和 agent-runner 镜像分离部署。

#### Scenario: 构建系统

- **WHEN** 用户构建系统
- **THEN** app 镜像 SHALL 只包含前端和中间层
- **AND** OpenClaw、科研 skills、模型运行依赖 SHALL 位于 agent-runner 镜像

#### Scenario: 共享数据

- **WHEN** agent-runner 执行科研节点
- **THEN** agent-runner SHALL 只通过 `/data/runs` 与 app 后端交换数据
- **AND** agent-runner SHALL 不直接调用前端
