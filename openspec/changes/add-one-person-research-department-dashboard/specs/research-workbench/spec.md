# 规格增量：一人科研部门工作台

## ADDED Requirements

### Requirement: 系统应提供一人科研部门工作台

系统 SHALL 提供一个前端工作台，将自动科研 pipeline 抽象为多个数字员工协作完成研究任务。

#### Scenario: 用户查看研究任务

- **WHEN** 用户打开工作台
- **THEN** 系统 SHALL 在每个子页面内以项目卡片展示多个研究任务、任务状态、当前阶段、进度和是否需要人工介入

#### Scenario: 用户展开项目详情

- **WHEN** 用户在任一子页面点击项目卡片
- **THEN** 系统 SHALL 在当前子页面内展开该项目对应详情，而不是切换全局项目上下文

#### Scenario: 用户理解数字员工职责

- **WHEN** 用户查看某个研究任务
- **THEN** 系统 SHALL 展示该任务下所有数字员工及其职责、当前状态、健康度和最近产出

### Requirement: 系统应提供项目燃尽图页面

系统 SHALL 提供项目燃尽图页面，用于以项目卡片展示多个项目的剩余工作量、完成趋势和风险状态，并在项目展开后显示数字员工燃尽拆解。

#### Scenario: 查看单个任务燃尽趋势

- **WHEN** 用户选择一个 run
- **THEN** 系统 SHALL 展示全局燃尽图和每个数字员工的燃尽图

#### Scenario: 按项目查看燃尽趋势

- **WHEN** 用户在项目燃尽图页面选择“按项目”视角
- **THEN** 系统 SHALL 展示项目燃尽图、项目剩余阶段点数和项目风险状态

#### Scenario: 数字员工发生阻塞

- **WHEN** 某个数字员工状态为 blocked 或 failed
- **THEN** 项目燃尽图页面 SHALL 显示阻塞原因、失败阶段、重试次数和最近更新时间

### Requirement: 系统应提供数字员工产出页面

系统 SHALL 提供数字员工产出页面，用于以项目卡片展示多个项目产出概况，并在项目展开后按数字员工浏览、筛选和预览后端 agent 生成的 artifacts。

#### Scenario: 按员工查看产出

- **WHEN** 用户选择 Literature Analyst
- **THEN** 系统 SHALL 展示该员工产生的文献检索、文献筛选、知识卡片等 artifacts

#### Scenario: 查看项目产出概况

- **WHEN** 用户进入产出页面
- **THEN** 系统 SHALL 以项目卡片展示每个项目的产出数量、验证状态和最近产出

#### Scenario: 预览产出内容

- **WHEN** 用户打开一个 artifact
- **THEN** 系统 SHALL 根据 artifact 类型展示 Markdown、JSON、YAML、log、图片或 PDF 预览

### Requirement: 系统应提供整体监控页面

系统 SHALL 提供整体监控页面，用于展示任务级和员工级运行状态。

#### Scenario: 查看所有任务状态

- **WHEN** 用户进入整体监控页面
- **THEN** 系统 SHALL 展示运行中、已完成、阻塞和失败任务数量，并展示所有项目的总览卡片

#### Scenario: 查看数字员工整体状态

- **WHEN** 用户进入整体监控页面
- **THEN** 系统 SHALL 以紧凑卡片网格展示全体数字员工当前在做什么，并展示当前项目、负责 stage、健康度和负载

#### Scenario: 监控页不展开项目详细信息

- **WHEN** 用户查看整体监控页面
- **THEN** 系统 SHALL 不展示单项目阶段看板、任务时间线、内容审查、修改或重新生成入口

### Requirement: 中间层应投影后端 agent 产物

系统 SHALL 提供 projector，将 agent-runner 输出的原始 artifacts 投影为前端稳定 JSON。

#### Scenario: stage 完成后生成前端状态

- **WHEN** agent-runner 完成一个 stage 并写入 stage artifacts
- **THEN** projector SHALL 更新 `task_status.json`、`employees.json`、`artifacts_index.json`、`burndown.json` 和 `timeline.json`

#### Scenario: 原始 artifacts 格式变化

- **WHEN** ResearchClaw 原始输出文件名或结构发生变化
- **THEN** 前端 SHALL 不直接依赖原始文件结构，而由 projector 适配并保持 API 契约稳定

### Requirement: 前端应通过 REST API 和 WebSocket 获取数据

前端 SHALL 通过中间层 REST API 获取初始数据，并通过 WebSocket 或轮询获取实时更新。

#### Scenario: 前端加载任务详情

- **WHEN** 前端请求 `GET /api/runs/{run_id}`
- **THEN** 中间层 SHALL 返回该任务的标准 `task_status` 数据

#### Scenario: 前端接收实时事件

- **WHEN** stage 状态或 artifact 状态变化
- **THEN** 中间层 SHALL 通过 WebSocket 广播对应事件，或提供可轮询的更新时间戳

### Requirement: 系统应在产出页提供上下文感知的审查和修改

系统 SHALL 只在数字员工产出页面提供审查/修改入口，让用户通过自然语言指导介入具体产出，并自动绑定项目、阶段、数字员工和 artifact 上下文。

#### Scenario: 监控页不提供内容修改入口

- **WHEN** 用户进入整体监控页面
- **THEN** 系统 SHALL 只展示项目概况和数字员工整体状态，不展示内容审查、修改或重新生成入口

#### Scenario: 项目燃尽图页不提供内容修改入口

- **WHEN** 用户进入项目燃尽图页面
- **THEN** 系统 SHALL 只展示项目燃尽和风险摘要，不展示内容审查、修改或重新生成入口

#### Scenario: 用户提交产出指导

- **WHEN** 用户输入指导内容并选择应用范围
- **THEN** 系统 SHALL 创建 guide 事件，保留用户原始文本，并记录 scope 为 current_artifact、current_stage、current_employee 或 project_preference

#### Scenario: 用户对产出添加批注

- **WHEN** 用户在产出预览旁提交指导
- **THEN** 系统 SHALL 将指导绑定到对应 artifact，并允许要求重新生成该产出

#### Scenario: 用户查看指导历史

- **WHEN** 用户打开产出页面中的项目展开详情
- **THEN** 系统 SHALL 展示该项目最近的 guide 和 regenerate 事件

### Requirement: 系统应使用 app 镜像和 agent-runner 镜像分离部署

系统 SHALL 将前端+中间层和科研执行 agent 分离为两个镜像。

#### Scenario: 创建研究任务

- **WHEN** 用户通过前端创建研究任务
- **THEN** app 镜像 SHALL 调度 agent-runner 镜像执行任务，并共享 `/data/runs` 数据卷

#### Scenario: agent 任务失败

- **WHEN** agent-runner 容器失败或任务中断
- **THEN** app 镜像 SHALL 保持可用，并在整体监控页展示任务失败状态和可恢复操作
