# 设计文档：一人科研部门工作台

## 1. 总体架构

### 1.1 系统角色

系统分为五类角色。这里需要区分“人”“前端”“后端服务”“执行容器”和“可选 OpenClaw 入口”，避免把用户和 skill 混成同一个运行组件。

```text
用户
  通过浏览器使用工作台；也可以在 OpenClaw 对话里用自然语言发起研究任务。

浏览器前端
  展示三个页面：燃尽图、数字员工产出、整体监控。
  只通过 REST API 和 WebSocket 获取数据，不直接读取 run 目录。

app 后端
  提供 REST API、WebSocket、projector、artifact 读取、任务调度适配器。
  app 后端和浏览器前端可以打包在同一个 app 镜像中。

agent-runner 镜像
  包含后端科研 agent、AutoResearchClaw/ResearchClaw CLI、依赖环境和运行脚本。

OpenClaw Skill
  可选入口。它不是前端页面，也不是科研执行引擎。
  它负责把自然语言请求转换为 app 后端 API 调用，例如创建任务、查询状态、发送 guide。
```

### 1.2 运行时架构

主运行链路如下。用户在浏览器中操作前端，前端通过 app 后端获取数据；app 后端调度 agent-runner 执行科研任务；agent-runner 写入共享 run 目录；app 后端的 projector 把原始产物转换为前端稳定 JSON。

```text
┌──────────────────────────────────────────────────────────────┐
│ 用户                                                          │
│ - 浏览器中创建任务、查看三类页面、审批/指导任务                  │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼──────────────────────────────┐
│ 浏览器前端                                                     │
│ - 燃尽图                                                        │
│ - 数字员工产出                                                  │
│ - 整体监控                                                      │
│                                                              │
│ 数据获取：                                                     │
│ - REST: /api/runs, /api/runs/{id}/employees, /artifacts        │
│ - WS:   /ws/runs/{id}, /ws/runs                               │
└───────────────────────────────┬──────────────────────────────┘
                                │ REST / WebSocket
┌───────────────────────────────▼──────────────────────────────┐
│ app 后端（位于 autoresearch-app 镜像）                          │
│ - API Server：给前端提供稳定 JSON                               │
│ - WebSocket：推送 stage、员工、artifact 变化                     │
│ - Projector：把原始 artifacts 投影成前端模型                     │
│ - Runner Adapter：启动/恢复/暂停 agent-runner                   │
│ - Artifact Service：安全读取 Markdown/JSON/PDF/log/raw 文件     │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
                │ Docker API / Queue / CLI      │ 读取/写入投影 JSON
                │                               │
┌───────────────▼──────────────┐      ┌────────▼────────────────┐
│ agent-runner 容器             │      │ /data/runs/{run_id}/     │
│ - ResearchClaw CLI            │      │ - task_status.json       │
│ - 自动科研 pipeline            │      │ - employees.json         │
│ - 文献/实验/写作工具链         │      │ - artifacts_index.json   │
│                               │      │ - burndown.json          │
│ 写入：stage-xx 原始产物         │      │ - timeline.json          │
└───────────────┬──────────────┘      │ - stage-01/...           │
                │ 写入 artifacts       │ - stage-02/...           │
                └─────────────────────►└─────────────────────────┘
```

OpenClaw Skill 是旁路入口，不在浏览器主链路中：

```text
用户在 OpenClaw 中说“帮我研究 X”
  -> OpenClaw Skill 识别为科研任务
  -> POST /api/runs 创建 run
  -> GET /api/runs/{run_id} 查询进度
  -> 必要时 POST /api/runs/{run_id}/guide 或 /resume
  -> 最终把 app 后端返回的 summary/artifacts 摘要给用户
```

因此，“用户”和“OpenClaw Skill”不是同一层。用户是操作者；OpenClaw Skill 只是用户可以选择的一种自然语言控制入口。

### 1.2.1 前端如何获取数据

前端不直接访问 Docker、agent-runner 或 `/data/runs` 文件系统。所有数据都从 app 后端获取：

```text
整体监控页
  GET /api/runs
  GET /api/runs/{run_id}
  GET /api/runs/{run_id}/employees
  GET /api/runs/{run_id}/timeline
  WS  /ws/runs 或 /ws/runs/{run_id}

燃尽图
  GET /api/runs/{run_id}/burndown
  GET /api/runs/{run_id}/employees

数字员工产出
  GET /api/runs/{run_id}/artifacts
  GET /api/artifacts/{artifact_id}/content
  GET /api/artifacts/{artifact_id}/raw
```

app 后端返回的数据来自两类来源：

```text
投影 JSON
  task_status.json
  employees.json
  artifacts_index.json
  burndown.json
  timeline.json

原始 artifact 文件
  stage-xx/*.md
  stage-xx/*.json
  stage-xx/*.yaml
  stage-xx/*.log
  stage-xx/*.pdf
  stage-xx/*.png
```

API 优先读取投影 JSON；只有用户打开某个 artifact 内容时，Artifact Service 才按 `artifacts_index.json` 中登记的安全相对路径读取原始文件。

### 1.2.2 后端如何获取 agent 产出

agent-runner 不主动调用前端。它只做三件事：

```text
1. 接收 run_id、topic、config 等启动参数。
2. 执行 ResearchClaw/OpenClaw 自动科研流程。
3. 持续写入 /data/runs/{run_id}/stage-xx/ 和 checkpoint/pipeline_summary。
```

app 后端通过 projector 获取 agent 产出：

```text
agent-runner 写入 stage-09/experiment_plan.yaml
  -> projector 扫描 stage_meta/checkpoint/artifacts
  -> 更新 artifacts_index.json
  -> 更新 employees.json 中 Experiment Engineer 的 last_output/status
  -> 更新 task_status.json 和 timeline.json
  -> WebSocket 推送 artifact_created / employee_status_changed
  -> 前端刷新页面
```

### 1.3 镜像边界

推荐使用两个镜像：

```text
autoresearch-app
  前端静态资源
  中间层 API
  WebSocket
  projector
  runner adapter

autoresearch-agent
  OpenClaw 或 ResearchClaw 执行环境
  Python/科研依赖
  文献检索、实验执行、论文生成工具
```

不建议把 agent 和 app 放在同一个镜像中，因为 agent 镜像依赖重、执行任务时间长、失败概率高，和 Web 服务生命周期不同。

### 1.4 数据交换方式

app 和 agent-runner 通过共享卷交换数据：

```text
/data/runs/
  {run_id}/
    manifest.json
    task_status.json
    employees.json
    artifacts_index.json
    burndown.json
    timeline.json
    stage-01/
    stage-02/
    ...
```

agent-runner 写原始 stage artifacts；app projector 读取原始 artifacts、checkpoint、stage metadata 后生成前端稳定 JSON。

## 2. 数字员工模型

### 2.1 设计原则

数字员工是产品层抽象，不是必须对应真实独立进程。一个数字员工代表一组科研职责、阶段范围和产出类型。

### 2.2 默认数字员工

| 数字员工 | 职责 | ResearchClaw stage |
| --- | --- | --- |
| Research Strategist | 选题、问题拆解、研究计划 | 1-2 |
| Literature Analyst | 检索策略、文献采集、文献筛选、知识卡片 | 3-6 |
| Hypothesis Designer | 综合分析、研究空白、假设生成 | 7-8 |
| Experiment Engineer | 实验设计、代码生成、资源计划、运行、修复 | 9-13 |
| Data Analyst | 结果分析、统计判断、继续/转向决策 | 14-15 |
| Paper Writer | 大纲、初稿、修订、论文结构 | 16-17, 19 |
| Peer Reviewer | 模拟同行评审、质量门控 | 18, 20 |
| Citation Auditor | 知识归档、导出、引用校验 | 21-23 |

### 2.3 员工状态

员工状态枚举：

```text
idle       空闲
queued     已分配但未开始
working    正在工作
blocked    阻塞，等待用户或依赖
failed     失败，需要重试或人工处理
done       当前任务范围完成
```

员工健康度枚举：

```text
good       正常
active     正在推进
warning    有重试、延迟或质量风险
critical   阶段失败或审批阻塞
unknown    数据不足
```

## 3. 前端页面设计

前端只包含用户要求的三部分：项目燃尽图、数字员工产出、整体监控。首屏建议默认进入整体监控。

从最终产品视角，页面应避免暴露技术实现细节，例如 `timeline.json`、`employees.json`、`GET /api/runs`、`projector` 等词汇。这些内容保留在设计文档和开发调试视图中；正式 UI 只展示用户可理解的项目、阶段、数字员工、产出、审批和风险。

### 3.0 全局页面框架

三页共用同一个工作台框架：左侧只保留产品名称和页面导航，右侧是主内容区。项目不放在全局左上角作为隐式上下文，而是放入每个子页面内部，以“项目卡片 + 展开详情”的方式展示。

项目展示采用“页面内项目卡片 + 展开详情”的方案：

- 左侧只负责页面导航：整体监控、项目燃尽图、数字员工产出。
- 每个子页面顶部都有项目搜索、状态筛选和项目卡片。
- 用户点击某个项目卡片后，只在当前子页面内展开该项目详情。
- 不要求用户理解“当前项目 / 全部项目”这类隐式全局状态。
- 这种结构更符合最终用户心智：先看所有项目，再点开一个项目看该页面相关详情。

```text
┌──────────────────────────────┬──────────────────────────────────────────────────────┐
│ 左侧导航                      │ 顶部：科研工作台标题 + 创建任务/协作操作                 │
│                              ├──────────────────────────────────────────────────────┤
│ 一人科研部门                  │ 顶部指标：运行中 / 员工 / 产出 / 审批 / 剩余阶段点数       │
│ - 整体监控                    ├──────────────────────────────────────────────────────┤
│ - 项目燃尽图                  │ 当前子页面内容：                                      │
│ - 数字员工产出                │ ┌ 搜索项目 / 状态筛选 ┐                               │
│                              │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│                              │ │ 项目卡片 A    │ │ 项目卡片 B    │ │ 项目卡片 C    │ │
│                              │ └──────────────┘ └──────────────┘ └──────────────┘ │
│                              │                                                      │
│                              │ 点击项目卡片后，在当前页面内展开项目详情               │
└──────────────────────────────┴──────────────────────────────────────────────────────┘
```

全局框架的数据绑定：

```text
顶部指标
  GET /api/runs

每个页面的项目卡片
  GET /api/runs
  支持 status/search 参数：GET /api/runs?status=running&q=graph

实时刷新
  WS /ws/runs
  WS /ws/runs/{run_id}
```

静态原型位置：

```text
/home/cxs/下载/AutoResearch/prototypes/research-workbench/index.html
```

### 3.1 页面一：项目燃尽图

#### 目标

展示每个项目的工作燃尽、剩余工作量和风险。默认先呈现项目燃尽卡片；用户点击某个项目后，页面展开该项目的大燃尽图、8 个数字员工燃尽拆解和风险摘要。

#### 页面线框图

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 项目燃尽图                                                                          │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 搜索项目 / 状态筛选                                                                  │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 项目燃尽卡片                                                                         │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │ GNN 药物发现  │ │ 多模态综述    │ │ 强化学习效率  │ │ 代码评审基准  │               │
│ │ remaining 14 │ │ remaining 18 │ │ remaining 23 │ │ remaining 0  │               │
│ │ sparkline    │ │ sparkline    │ │ sparkline    │ │ sparkline    │               │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘               │
├────────────────────────────────────────────────────────────────┬───────────────────┤
│ 展开项目：项目总燃尽图                                           │ 风险摘要           │
│ 剩余阶段点数                                                     │ retry / blocked    │
├────────────────────────────────────────────────────────────────┴───────────────────┤
│ 展开项目：8 个数字员工燃尽拆解                                                       │
└────────────────────────────────────────────────────────────────────────────────────┘
```

#### 核心模块

1. 项目搜索和状态筛选
   - 搜索项目名、topic、run_id
   - 筛选全部、运行、阻塞、完成、失败

2. 项目燃尽卡片
   - 项目名
   - 状态
   - 当前阶段
   - 剩余阶段点数
   - 小型燃尽图

3. 展开项目总燃尽图
   - 该项目剩余点数随时间变化
   - 实际燃尽线
   - 理想燃尽线

4. 数字员工燃尽拆解
   - 展示该项目内 8 个数字员工的剩余阶段点数

5. 风险摘要
   - 项目阻塞
   - retry_count
   - blocked_since
   - failed_stage
   - estimated_finish_at

6. 全局燃尽图
   - 所有员工剩余点数总和
   - 实际燃尽线
   - 理想燃尽线

#### 数据来源

```text
GET /api/runs/{run_id}/burndown
GET /api/runs/{run_id}/employees
GET /api/runs/{run_id}/timeline
```

#### 前端状态

页面需要支持：

- 按项目搜索和状态筛选。
- 点击项目卡片展开该项目详情。
- 鼠标悬停查看某个时间点对应 stage、artifact、状态变化。
- 对 blocked/failed 员工给出醒目标识。

#### 数据绑定

```text
全局燃尽图
  burndown.total_points
  burndown.remaining_points
  burndown.series[]

燃尽图矩阵
  项目卡片读取 runs[].remaining、runs[].progress、runs[].status
  展开详情读取 burndown.employees[]
  burndown.employees[]
  employees[].status
  employees[].health

风险摘要
  employees[].retry_count
  employees[].blocked_reason
  employees[].current_stage
  timeline[] 中的 stage_failed / approval_required / retry_started
```

### 3.2 页面二：数字员工产出

#### 目标

把后端 agent 生成的 artifacts 变成可浏览、可筛选、可预览的科研产出库。

#### 页面线框图

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 数字员工产出                                                                        │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 搜索项目 / 状态筛选                                                                  │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 项目产出卡片                                                                         │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │ GNN 药物发现  │ │ 多模态综述    │ │ 强化学习效率  │ │ 代码评审基准  │               │
│ │ 21 outputs   │ │ 9 outputs    │ │ 0 outputs    │ │ 34 outputs   │               │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘               │
├──────────────────────┬─────────────────────────────────────────────────────────────┤
│ 展开项目：员工筛选      │ 展开项目：产出库 + 预览                                      │
│ 文献分析师 / 实验工程师  │ cards / preview / trace                                     │
└──────────────────────┴─────────────────────────────────────────────────────────────┘
```

#### 核心模块

1. 项目搜索和状态筛选
   - 搜索项目名、topic、run_id
   - 筛选全部、运行、阻塞、完成、失败

2. 项目产出卡片
   - 项目名
   - 状态
   - 总产出数
   - 已验证数
   - 草稿数
   - 最近产出

3. 展开项目后的员工分组导航
   - Research Strategist
   - Literature Analyst
   - Hypothesis Designer
   - Experiment Engineer
   - Data Analyst
   - Paper Writer
   - Peer Reviewer
   - Citation Auditor

4. 展开项目后的产出列表
   - 标题
   - 类型
   - 所属项目
   - 来源员工
   - 来源 stage
   - 状态
   - 创建时间
   - 更新时间
   - 上游依赖

5. 产出预览区
   - Markdown 预览
   - JSON/YAML 结构化展示
   - log 文本查看
   - PDF 嵌入预览
   - 图片/图表预览

6. 产出追溯
   - artifact 所属项目
   - artifact 所属 run
   - artifact 所属 stage
   - 生成该 artifact 的员工
   - 上游输入 artifact
   - 后续消费 artifact

#### 数据来源

```text
GET /api/runs/{run_id}/artifacts
GET /api/artifacts/{artifact_id}
GET /api/artifacts/{artifact_id}/content
```

#### Artifact 状态

```text
draft       初稿
generated   已生成
verified    已校验
reviewed    已评审
failed      生成失败或校验失败
archived    已归档
```

#### 数据绑定

```text
员工筛选
  employees[].id
  employees[].display_name
  artifacts_index 按 employee_id 聚合计数

产出列表
  artifacts_index[].project_id
  artifacts_index[].project_name
  artifacts_index[].title
  artifacts_index[].type
  artifacts_index[].stage
  artifacts_index[].status
  artifacts_index[].path

产出预览
  GET /api/artifacts/{artifact_id}/content
  GET /api/artifacts/{artifact_id}/raw

产出追溯
  artifacts_index[].run_id
  artifacts_index[].employee_id
  artifacts_index[].stage
  timeline[] 中 artifact_created 事件
```

### 3.3 页面三：整体监控

#### 目标

展示当前所有项目的概况，以及全体数字员工的整体状况。该页面只用于监控，不展开项目阶段看板、任务时间线或内容修改入口。

#### 页面线框图

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 整体监控                                                                            │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 顶部指标                                                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ │ 运行中 3 │ │ 员工 8   │ │ 产出 21  │ │ 审批 1   │ │ 剩余 14  │                 │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘                 │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 搜索项目 / 状态筛选                                                                  │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 项目总览卡片                                                                         │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │ GNN 药物发现  │ │ 多模态综述    │ │ 强化学习效率  │ │ 代码评审基准  │               │
│ │ running 39%  │ │ blocked 22%  │ │ queued 0%    │ │ done 100%    │               │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘               │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 数字员工整体状况                                                                    │
│ ┌──────────────────────────────────────┐ ┌──────────────────────────────────────┐ │
│ │ 文献分析师 · done                     │ │ 实验工程师 · working                 │ │
│ │ stage: 6 · knowledge cards            │ │ stage: 9 · experiment design         │ │
│ └──────────────────────────────────────┘ └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────┘
```

#### 核心模块

1. 顶部指标
   - 当前运行任务数
   - 已完成任务数
   - 阻塞任务数
   - 失败任务数
   - 今日生成 artifact 数
   - 今日运行时长/成本/token 预留字段

2. 项目总览卡片
   - 所有 run 的状态、进度、当前员工和最近产出
   - 卡片只表达项目概况，不在整体监控页展开阶段看板或任务时间线

3. 数字员工整体状况
   - 以紧凑卡片网格展示全体数字员工，桌面端建议每行 2-3 个员工
   - 每张卡片优先展示“当前在做什么”，并补充当前项目、负责 stage、健康度和负载
   - 员工状态按跨项目维度汇总，不限定在某一个被选中的项目内

#### 数据来源

```text
GET /api/runs
GET /api/employees
WS  /ws/runs
```

#### 数据绑定

```text
顶部指标
  GET /api/runs
  task_status.summary
  artifacts_index.length
  employees[].status

项目总览卡片
  GET /api/runs
  runs[].run_id
  runs[].topic
  runs[].status
  runs[].current_stage
  runs[].active_employee_id
  runs[].progress
  runs[].latest_output

数字员工整体状况
  GET /api/employees
  employees[]
  employees[].active_run_id
  employees[].current_stage
  employees[].current_action
  employees[].health
  employees[].load
```

### 3.4 交互指导设计

用户交互指导只放在“数字员工产出”页面。整体监控页只展示状态，燃尽图页只展示项目和员工负载风险；内容审查、修改、重新生成、批注和指导都在产出页完成。这样可以避免用户在多个页面做修改决策，降低操作分散和上下文混乱。

指导采用“上下文自动绑定 + 自然语言指导 + 应用范围选择 + 指导历史”的模式。目标是让用户只输入“怎么改”，系统自动绑定“改哪个项目、哪个阶段、哪个数字员工、哪个产出”。

#### 指导入口

```text
数字员工产出页
  产出预览旁的“产出指导/批注”面板。
  用于对某个 artifact 提出修改要求或要求重新生成。
```

#### 指导面板线框图

```text
┌────────────────────────────────────────────────────────────────────┐
│ 产出指导 / 批注                                                     │
│ 当前上下文：GNN 药物发现 · Stage 9 实验设计 · 实验工程师 · plan.yaml │
├────────────────────────────────────────────────────────────────────┤
│ 指导内容                                                            │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ 补充 GIN 和 GraphMVP baseline，并把主指标改为 scaffold AUROC。  │ │
│ └────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────┤
│ 应用范围：[当前阶段] [当前员工] [后续阶段] [项目偏好]                │
├────────────────────────────────────────────────────────────────────┤
│ [提交产出指导] [要求重新生成]                                        │
├────────────────────────────────────────────────────────────────────┤
│ 指导历史                                                            │
│ 15:42 要求实验工程师补充强 baseline，应用范围：当前阶段。            │
└────────────────────────────────────────────────────────────────────┘
```

#### 指导上下文

每条指导事件必须自动带上上下文：

```json
{
  "run_id": "rc-20260430-151200",
  "stage": 9,
  "stage_name": "experiment_design",
  "employee_id": "experiment_engineer",
  "artifact_id": "stage-09/experiment_plan.yaml",
  "action": "guide",
  "scope": "current_stage",
  "message": "补充 GIN 和 GraphMVP baseline，并把主指标改为 scaffold AUROC。",
  "priority": "normal"
}
```

#### 应用范围

```text
current_stage
  只影响当前阶段重试或继续执行。

current_employee
  影响当前数字员工后续相关动作，例如实验工程师的后续代码生成和实验运行。

future_stages
  作为后续阶段的项目级指导注入，例如写作阶段需要强调某个 baseline。

project_preference
  作为项目偏好保存，后续恢复、重试和新阶段都可读取。
```

## 4. 中间层设计

### 4.1 模块划分

建议目录：

```text
/home/cxs/下载/AutoResearch/app/
  backend/
    api.py
    models.py
    projector.py
    employees.py
    runner.py
    storage.py
    events.py
  frontend/
    src/
    package.json
  Dockerfile
```

### 4.2 projector

projector 是关键模块，负责把原始后端 agent 输出转换为前端稳定模型。

输入：

```text
/data/runs/{run_id}/checkpoint.json
/data/runs/{run_id}/runner_state.json
/data/runs/{run_id}/hitl/waiting.json
/data/runs/{run_id}/hitl/interventions.jsonl
/data/runs/{run_id}/stage-xx/decision.json
/data/runs/{run_id}/stage-xx/*
```

输出：

```text
/data/runs/{run_id}/task_status.json
/data/runs/{run_id}/employees.json
/data/runs/{run_id}/artifacts_index.json
/data/runs/{run_id}/burndown.json
/data/runs/{run_id}/timeline.json
/data/runs/{run_id}/activity.json
/data/runs/{run_id}/schedule.json
```

projector 触发方式：

- API 查询时懒加载投影。
- app 后端定时扫描 run 目录，发现 AutoResearchClaw 原始产物变化后增量投影。
- WebSocket 广播 `projector_updated`，前端收到后刷新任务、员工、产出和排班数据。

扫描只关注原始输入文件，排除 projector 自己生成的 `task_status.json`、`employees.json`、`artifacts_index.json`、`burndown.json`、`timeline.json`、`activity.json`、`schedule.json` 和日志文件，避免投影文件反复触发自身。

### 4.3 runner adapter

runner adapter 负责从 app 调度 agent-runner，并把用户指导写回 AutoResearchClaw。

当前实现支持两条路径：

1. 本地 ResearchClaw CLI
   - `POST /api/runs` 后启动 `python -m researchclaw run --topic ... --output ... --config ...`
   - 运行目录为 `/data/runs/{run_id}`，日志写入 `logs/agent.stdout.log` 和 `logs/agent.stderr.log`
   - 状态写入 `runner_state.json`

2. 自定义 runner 命令
   - 通过 `AGENT_RUNNER_CMD` 覆盖默认启动命令
   - 中间层传入 `RUN_ID`、`TOPIC` 和 run 目录，便于后续替换为 Docker、队列或远程 worker

HITL 控制点已脚本化为 app API：

- `POST /api/runs/{run_id}/approve` -> `python -m researchclaw approve <run_dir> --message ...`
- `POST /api/runs/{run_id}/reject` -> `python -m researchclaw reject <run_dir> --reason ...`
- `POST /api/runs/{run_id}/guide` -> `python -m researchclaw guide <run_dir> --stage ... --message ...`
- `POST /api/runs/{run_id}/resume` 和 `POST /api/runs/{run_id}/retry` -> `python -m researchclaw run --resume ...`
- `POST /api/runs/{run_id}/pause` -> 写入 `hitl/response.json` 和 `runner_state.json`

生产化可以把本地 CLI 替换为 Docker API 或队列 worker，但前端和 OpenClaw skill 不需要变化。

当前仓库提供两种 runner 启动方式：

- 本地 CLI：默认走 `AutoResearchClaw/.venv/bin/python -m researchclaw ...`，适合开发调试。
- Docker agent：`AutoResearchClaw/Dockerfile.agent` 构建 `autoresearch-agent:local`，预装 Python 3.11、ResearchClaw、torch CPU、matplotlib、scipy、scikit-learn、pandas、seaborn 等科研依赖；通过 `scripts/run-agent-docker.sh` 可由 `AGENT_RUNNER_CMD` 调用。

Docker agent 使用 `config.glm5.docker.yaml`，其中 sandbox Python 固定为 `/usr/local/bin/python`，避免运行时临时安装 PyTorch 或找不到 `.venv/bin/python`。

## 5. 前后端交互设计

### 5.1 REST API

#### 创建任务

```http
POST /api/runs
Content-Type: application/json

{
  "topic": "Graph neural networks for drug discovery",
  "mode": "full-auto",
  "auto_approve": true,
  "experiment_mode": "sandbox",
  "config_overrides": {}
}
```

响应：

```json
{
  "run_id": "rc-20260430-151200",
  "status": "queued",
  "topic": "Graph neural networks for drug discovery",
  "created_at": "2026-04-30T15:12:00+08:00"
}
```

#### 查询任务列表

```http
GET /api/runs?status=running
GET /api/runs?status=blocked&q=multimodal
```

响应：

```json
[
  {
    "run_id": "rc-20260430-151200",
    "topic": "Graph neural networks for drug discovery",
    "status": "running",
    "current_stage": 9,
    "current_phase": "experiment",
    "progress": 0.39,
    "active_employee_id": "experiment_engineer",
    "active_employee_name": "Experiment Engineer",
    "latest_output": "stage-09/experiment_plan.yaml",
    "needs_approval": false,
    "updated_at": "2026-04-30T15:42:00+08:00"
  }
]
```

#### 查询任务详情

```http
GET /api/runs/{run_id}
```

响应使用 `task_status.json` 数据结构。

#### 查询员工状态

```http
GET /api/runs/{run_id}/employees
```

响应使用 `employees.json` 数据结构。

#### 查询产出

```http
GET /api/runs/{run_id}/artifacts?employee_id=literature_analyst
```

该接口用于项目产出详情展开区。响应使用 `artifacts_index.json` 数据结构。

#### 查询产出内容

```http
GET /api/artifacts/{artifact_id}/content
```

响应：

```json
{
  "artifact_id": "artifact-001",
  "content_type": "markdown",
  "encoding": "utf-8",
  "content": "# Literature Shortlist\n..."
}
```

大文件或 PDF 使用 stream/download URL：

```http
GET /api/artifacts/{artifact_id}/raw
```

#### 查询燃尽数据

```http
GET /api/runs/{run_id}/burndown
```

该接口用于项目燃尽详情展开区。响应使用 `burndown.json` 数据结构。

#### 产出审查与修改

```http
POST /api/artifacts/{artifact_id}/guide
POST /api/artifacts/{artifact_id}/regenerate
```

示例：

```json
{
  "run_id": "rc-20260430-151200",
  "stage": 9,
  "stage_name": "experiment_design",
  "employee_id": "experiment_engineer",
  "artifact_id": "stage-09/experiment_plan.yaml",
  "action": "guide",
  "scope": "current_artifact",
  "message": "这个实验计划缺少强 baseline，请加入 GIN、GraphMVP，并补充 scaffold split 设置。",
  "priority": "normal"
}
```

产出审查和修改只在“数字员工产出”页面触发。所有 `guide` 和 `regenerate` 事件都应写入指导历史和审计事件，并保留用户原始自然语言，供 agent 在后续 prompt 中使用。

### 5.2 WebSocket

整体监控页使用 WebSocket 获取实时事件：

```text
WS /ws/runs/{run_id}
WS /ws/runs
```

事件格式：

```json
{
  "event_id": "evt-001",
  "run_id": "rc-20260430-151200",
  "type": "stage_completed",
  "timestamp": "2026-04-30T15:42:00+08:00",
  "employee_id": "literature_analyst",
  "stage": 6,
  "payload": {
    "artifact_ids": ["artifact-011", "artifact-012"]
  }
}
```

事件类型：

```text
run_created
run_started
run_completed
run_failed
stage_started
stage_completed
stage_failed
employee_status_changed
artifact_created
approval_required
approval_resolved
retry_started
projector_updated
```

## 6. JSON 数据契约

### 6.1 task_status.json

```json
{
  "run_id": "rc-20260430-151200",
  "topic": "Graph neural networks for drug discovery",
  "status": "running",
  "current_stage": 9,
  "current_stage_name": "experiment_design",
  "current_phase": "experiment",
  "progress": 0.39,
  "started_at": "2026-04-30T15:12:00+08:00",
  "updated_at": "2026-04-30T15:42:00+08:00",
  "finished_at": null,
  "blocked": false,
  "needs_approval": false,
  "active_employee_id": "experiment_engineer",
  "summary": {
    "stages_total": 23,
    "stages_done": 8,
    "stages_failed": 0,
    "artifacts_count": 21
  }
}
```

### 6.2 employees.json

```json
[
  {
    "id": "experiment_engineer",
    "name": "Experiment Engineer",
    "display_name": "实验工程师",
    "status": "working",
    "health": "active",
    "stage_range": [9, 13],
    "current_stage": 9,
    "current_task": "Designing experiment protocol",
    "completed_stages": 0,
    "total_stages": 5,
    "retry_count": 1,
    "blocked_reason": null,
    "last_output": "stage-09/experiment_plan.yaml",
    "updated_at": "2026-04-30T15:42:00+08:00"
  }
]
```

### 6.3 artifacts_index.json

```json
[
  {
    "id": "artifact-001",
    "run_id": "rc-20260430-151200",
    "title": "Literature Shortlist",
    "employee_id": "literature_analyst",
    "employee_name": "Literature Analyst",
    "type": "markdown",
    "stage": 5,
    "path": "stage-05/shortlist.md",
    "status": "verified",
    "size_bytes": 18420,
    "created_at": "2026-04-30T15:30:00+08:00",
    "updated_at": "2026-04-30T15:30:00+08:00",
    "preview_available": true,
    "raw_available": true
  }
]
```

### 6.4 burndown.json

```json
{
  "run_id": "rc-20260430-151200",
  "total_points": 23,
  "remaining_points": 14,
  "series": [
    {
      "time": "2026-04-30T15:12:00+08:00",
      "remaining": 23
    },
    {
      "time": "2026-04-30T15:42:00+08:00",
      "remaining": 14
    }
  ],
  "employees": [
    {
      "employee_id": "experiment_engineer",
      "points_total": 5,
      "points_remaining": [
        {
          "time": "2026-04-30T15:12:00+08:00",
          "remaining": 5
        },
        {
          "time": "2026-04-30T15:42:00+08:00",
          "remaining": 5
        }
      ]
    }
  ]
}
```

### 6.5 timeline.json

```json
[
  {
    "id": "evt-001",
    "run_id": "rc-20260430-151200",
    "type": "stage_started",
    "employee_id": "experiment_engineer",
    "stage": 9,
    "title": "Experiment design started",
    "timestamp": "2026-04-30T15:42:00+08:00",
    "artifact_ids": []
  }
]
```

## 7. OpenClaw Skill 关系

OpenClaw skill 可以作为用户入口和编排说明，但不应承载科研业务状态机。

推荐 skill 层次：

```text
researchclaw-orchestrator
  识别科研任务，调用 app API 创建 run，监控进度，向用户汇报。

researchclaw-literature
  面向文献产出的审查说明，可调用 artifact guide/regenerate。

researchclaw-experiment
  面向实验计划、代码、日志和结果产出的审查说明，可调用 artifact guide/regenerate。

researchclaw-writing
  面向论文写作和修订阶段的人机协作说明。

researchclaw-review
  面向质量门控、同行评审和引用校验阶段的人机协作说明。
```

skill 调用方式：

```text
OpenClaw skill
  -> POST /api/runs
  -> GET /api/runs/{run_id}
  -> POST /api/runs/{run_id}/guide
  -> POST /api/runs/{run_id}/resume
```

## 8. 部署方案

### 8.1 docker-compose

```yaml
services:
  app:
    image: autoresearch-app:latest
    build:
      context: ./app
    ports:
      - "8080:8080"
    volumes:
      - ./runs:/data/runs
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - RUNS_DIR=/data/runs
      - AGENT_IMAGE=autoresearch-agent:latest
      - RESEARCHCLAW_CONFIG=/workspace/AutoResearchClaw/config.glm5.local.yaml
      - GLM_API_KEY=${GLM_API_KEY:-EMPTY}

  agent:
    image: autoresearch-agent:latest
    build:
      context: ./AutoResearchClaw
      dockerfile: Dockerfile.agent
    profiles: ["runner"]
    volumes:
      - ./runs:/data/runs
    environment:
      - GLM_API_KEY=${GLM_API_KEY:-EMPTY}
```

当前本地默认模型配置为 OpenAI-compatible GLM-5：

```yaml
llm:
  provider: "openai-compatible"
  base_url: "http://172.16.151.31:8022/v1"
  wire_api: "chat_completions"
  api_key_env: "GLM_API_KEY"
  api_key: "EMPTY"
  primary_model: "glm-5"
  fallback_models: []
```

### 8.2 安全边界

- app 默认只读 artifacts，只有 runner adapter 可以创建 agent 容器。
- artifact raw API 必须限制路径在 `/data/runs` 内，防止路径穿越。
- artifact guide/regenerate API 应写入审计事件。
- 如果挂载 Docker socket，需要把部署环境视为受信任环境；生产环境可替换为队列 worker。

## 9. MVP 实施顺序

1. 建立 app 后端骨架和 run 目录模型。
2. 实现 projector：从已有 ResearchClaw artifacts 生成五类 JSON。
3. 实现 REST API：runs、employees、artifacts、burndown、timeline。
4. 实现前端三页静态布局和 API 对接。
5. 实现 agent-runner 调度：先用 docker run 或本地 CLI。
6. 实现 WebSocket：先轮询投影变化，再升级为事件推送。
7. 实现 OpenClaw orchestrator skill：创建任务、查询状态、汇报结果。

## 10. 风险与取舍

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| agent 输出格式变化 | 前端解析失败 | 由 projector 适配原始输出，前端只依赖稳定 JSON |
| Docker socket 权限过高 | 部署安全风险 | MVP 本地可信环境使用，生产改 queue/worker |
| 长任务失败或中断 | 用户看不到准确状态 | checkpoint + heartbeat + timeline |
| artifact 很大 | API 响应慢 | content API 限制大小，大文件走 raw stream |
| 23 阶段太细 | 用户理解成本高 | 前端按 8 个数字员工聚合展示 |
