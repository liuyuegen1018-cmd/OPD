# 变更提案：一人科研部门工作台

## 背景

当前规划中的自动科研系统由 OpenClaw 作为自然语言入口和外部编排层，AutoResearchClaw/ResearchClaw 作为自动科研 pipeline 后端。用户希望以“一人科研部门”的产品概念组织体验：一个研究者管理多个“数字员工”，每个数字员工承担科研 pipeline 中的一组职责。

为支持该体验，需要在 `/home/cxs/下载/AutoResearch` 中新增一个中间层和前端工作台：

- 后端科研 agent 以独立 Docker 镜像运行，负责执行自动科研任务并写入 artifacts。
- 前端和中间层打包为一个 app 镜像，负责调度任务、投影状态、提供 REST/WebSocket API、渲染三类页面。
- OpenClaw skill/CLI 脚本作为可选编排入口，调用中间层 API 或统一控制脚本。

## 目标

1. 设计一个“一人科研部门”前端工作台，包含三个子页面：
   - 项目燃尽图
   - 数字员工产出
   - 整体监控
2. 设计前端如何获取后端科研 agent 产出的内容。
3. 定义 app 镜像、agent-runner 镜像、共享数据卷和 API/WebSocket 交互边界。
4. 定义 ResearchClaw pipeline stage 到数字员工的映射模型。
5. 定义稳定 JSON 数据契约，避免前端直接解析零散 Markdown、日志和阶段目录。

## 非目标

1. 不在本变更中重写 AutoResearchClaw/ResearchClaw 的 23 阶段 pipeline。
2. 不把科研执行逻辑迁移到前端或 OpenClaw skill 文本中。
3. 不要求首版实现复杂权限、多租户、计费或大规模队列系统。
4. 不要求首版实现每个 stage 的完整人工审批 UI，但 API 设计应预留 approve/reject/guide/resume 能力。

## 方案概述

系统采用“浏览器前端 + app 后端 + agent-runner + 共享数据卷”的结构。OpenClaw Skill 是可选自然语言入口，不是主运行链路中的前端或后端。

```text
用户浏览器
  -> 浏览器前端（三个页面）
    -> app 后端 API/WebSocket
      -> agent-runner 镜像执行科研任务
        -> /data/runs/{run_id}/ stage artifacts
      -> projector 生成前端稳定 JSON
    -> 前端通过 API/WebSocket 获取状态和产出

可选旁路：
用户在 OpenClaw 对话
  -> OpenClaw Skill
    -> 调用 app 后端 API 创建任务、查询状态、发送指导
```

关键点：

- app 镜像负责对前端暴露稳定 API。
- agent-runner 镜像只负责执行科研任务和写产物。
- 两个镜像通过共享 volume `/data/runs` 交换任务状态和 artifacts。
- projector 将原始 pipeline 输出投影为 `task_status.json`、`employees.json`、`artifacts_index.json`、`burndown.json`、`timeline.json`。
- 前端三个页面只消费中间层 API，不直接扫描 run 目录。

## 成功标准

1. 前端可以展示所有研究任务、每个任务当前阶段、阻塞状态和数字员工当前正在做什么。
2. 前端可以按数字员工浏览产物，并预览 Markdown/JSON/log/PDF 等 artifact。
3. 前端可以展示每个数字员工的燃尽数据，包括剩余阶段、完成趋势、重试和阻塞。
4. 中间层可以从 run 目录投影出稳定 JSON，即使 agent 后端实现演进，前端接口仍保持稳定。
5. Docker 部署边界清晰：app 镜像和 agent-runner 镜像可独立构建、升级和扩缩容。
