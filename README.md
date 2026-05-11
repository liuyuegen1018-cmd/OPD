# AutoResearch Workbench

一人科研部门工作台实现，包含：

- `app/backend`：REST API、WebSocket、projector、runner adapter、artifact service。
- `app/frontend`：三页前端：整体监控、项目燃尽图、数字员工产出。
- `AutoResearchClaw`：实际自动科研后端项目。
- `runs`：app 与 agent-runner 共享的 run/artifact 数据目录。

## 本地运行

```bash
cd /home/cxs/下载/AutoResearch/app
npm install
npm start
```

打开：

```text
http://localhost:8787
```

## Docker 运行

```bash
cd /home/cxs/下载/AutoResearch
docker compose up --build app
```

## 后端 agent 对接

默认 runner 会尝试在 `AutoResearchClaw` 目录中执行：

```bash
python3 -m researchclaw run --topic "<topic>" --output "<runs/run_id>" --config "<config>" --auto-approve --skip-preflight
```

也可以用环境变量覆盖：

```bash
AGENT_RUNNER_CMD="/path/to/custom-runner"
RESEARCHCLAW_HOME="/home/cxs/下载/AutoResearch/AutoResearchClaw"
RESEARCHCLAW_CONFIG="/home/cxs/下载/AutoResearch/AutoResearchClaw/config.researchclaw.example.yaml"
RUNS_DIR="/home/cxs/下载/AutoResearch/runs"
```

### LinClaw 串行 skill runner

如果 LinClaw 容器已经启动，并且 OpenClaw workspace 挂载在
`/home/cxs/lyg/1/0427/linclaw/runtime/openclaw-home/workspace`，可以让 app backend 通过容器执行 5 个科研 skill。

```bash
cd /home/cxs/下载/AutoResearch/app
APP_PORT=8797 \
RUNS_DIR=/home/cxs/lyg/1/0427/linclaw/runtime/openclaw-home/workspace/autoresearch/runs \
AGENT_BACKEND=linclaw-skills \
LINCLAW_CONTAINER=funny_cerf \
LINCLAW_WORKSPACE_HOST=/home/cxs/lyg/1/0427/linclaw/runtime/openclaw-home/workspace \
LINCLAW_WORKSPACE_CONTAINER=/home/node/.openclaw/workspace \
SEED_DEMO_DATA=false \
npm start
```

`scripts/linclaw-skill-pipeline.js` 会串行调用容器内 `openclaw agent`，agent 仍然输出到 workspace 根目录的
`01_literature`、`02_theory`、`03_experiment`、`04_paper`、`05_review`。每个阶段完成后，脚本会复制归档到：

```text
workspace/autoresearch/projects/<run_id>/
workspace/autoresearch/runs/<run_id>/
```

脚本使用 `workspace/autoresearch/pipeline.lock` 防止多个项目并发运行。
