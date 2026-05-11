# 实施任务

## 1. 项目骨架

- [x] 创建 `app/backend`、`app/frontend`、`runs` 目录。
- [x] 添加 `app/Dockerfile`，打包前端静态资源和中间层 API。
- [x] 添加根目录 `docker-compose.yml`，定义 `app` 和 `agent` 服务。
- [x] 添加 `AutoResearchClaw/Dockerfile.agent`，构建完整 AutoResearchClaw agent-runner 镜像。
- [x] 添加 `scripts/run-agent-docker.sh`，支持通过 `AGENT_RUNNER_CMD` 调用 Docker agent。
- [x] 定义环境变量：`RUNS_DIR`、`AGENT_IMAGE`、`APP_PORT`。

## 2. 后端中间层

- [x] 实现数据模型：Run、Employee、Artifact、Burndown、TimelineEvent。
- [x] 实现员工映射模块，维护 stage 到数字员工的映射。
- [x] 实现 projector，将 run 目录投影为前端 JSON。
- [x] projector 已对接 AutoResearchClaw 实际输出：`stage-xx/decision.json`、`checkpoint.json`、`hitl/*`、`runner_state.json`。
- [x] projector 自动扫描 run 目录变化，并通过 WebSocket 广播 `projector_updated`。
- [x] 实现 storage，提供安全的 run/artifact 路径访问。
- [x] 实现 runner，支持启动 AutoResearchClaw 本地 CLI，并预留 `AGENT_RUNNER_CMD` 自定义命令覆盖。
- [x] 实现 REST API：`/api/runs`、`/api/runs/{run_id}`、`/api/runs/{run_id}/employees`、`/api/runs/{run_id}/artifacts`、`/api/runs/{run_id}/burndown`。
- [x] 实现 artifact 内容 API：`/api/artifacts/{artifact_id}/content`、`/api/artifacts/{artifact_id}/raw`。
- [x] 实现人工协作 API：approve、reject、guide、resume、pause、retry。
- [x] 人工协作 API 已连接 ResearchClaw HITL CLI：`approve`、`reject`、`guide`、`run --resume`。
- [x] 实现 WebSocket 事件推送或首版轮询兼容接口。

## 3. 前端

- [x] 实现整体监控页面：任务指标、项目概况卡片、全体数字员工状态面板。
- [x] 实现项目燃尽图页面：项目总燃尽图、员工燃尽拆解、风险摘要。
- [x] 实现数字员工产出页面：员工分组、artifact 列表、内容预览、raw 打开。
- [x] 实现任务创建入口：topic、mode、auto approve、experiment mode。
- [x] 实现 blocked/failed/approval required 的视觉状态。
- [x] 实现 API client 和 WebSocket client。
- [x] 数字员工热力图和甘特排班表已使用后端 `/api/employees/activity`、`/api/schedule` 真实投影数据。

## 4. OpenClaw Skill 集成

- [x] 创建 `researchclaw-orchestrator` skill，调用 app API 创建任务和查询状态。
- [x] 创建阶段职责 skill：literature、experiment、writing、review。
- [x] 在 skill 中明确：业务执行由 app/agent-runner 完成，skill 只负责入口、编排和汇报。

## 5. 验证

- [x] 使用模拟 run 目录验证 projector 输出。
- [x] 使用静态 JSON 验证三个页面渲染。
- [ ] 使用本地 agent-runner 镜像和真实 LLM/API 配置验证任务创建到 artifact 展示闭环。
- [x] 构建 `autoresearch-agent:local`，并验证容器内 `researchclaw doctor`：GLM-5、sandbox python、matplotlib 可用。
- [x] 验证路径穿越防护：artifact API 不能读取 `/data/runs` 外文件。
- [x] 验证长任务状态刷新：stage 变化后整体监控页能更新。
