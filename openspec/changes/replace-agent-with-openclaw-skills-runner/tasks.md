# 实施任务

## 1. agent-runner 镜像

- [ ] 新增 `Dockerfile.openclaw-agent` 或等价 agent 镜像构建文件。
- [ ] 在镜像中安装/构建 OpenClaw CLI。
- [ ] 将 `skills_keyan` 复制或挂载到 OpenClaw workspace skills 目录。
- [ ] 添加 OpenClaw 配置，确保 5 个科研 skill 可被 agent 加载。
- [ ] 在容器内验证 `openclaw skills check --json` 可以看到 `skills_keyan`。

## 2. 脚本化节点触发

- [ ] 新增 `scripts/run-openclaw-agent-docker.sh`，供 app 后端通过 `AGENT_RUNNER_CMD` 调用。
- [ ] 新增容器内 `scripts/openclaw-skill-pipeline.sh`，负责顺序执行科研节点。
- [ ] 新增 `scripts/openclaw-skill-node.sh`，封装单节点 OpenClaw skill 调用。
- [ ] 评估并选择复用方式：完整引入 `linclaw-script-executor`，或抽取其 `scripts.run_skill` / workflow `skill` 节点设计。
- [ ] 若复用完整插件，验证 agent-runner 容器内可调用 Gateway method `scripts.run_skill`。
- [ ] 若采用轻量实现，参考 `linclaw-script-executor/src/workflow/nodes/skill.ts` 实现 skill command 规范化、sessionKey、idempotencyKey 和 timeout。
- [ ] 为每个节点定义 prompt 模板、输入文件清单、输出文件清单。
- [ ] 每个节点写入 `node_meta.json` 和 `node_result.json`。
- [ ] 支持 `--from-node`、`--to-node`、`--resume`、`--retry-node`。

## 3. 中间层 runner adapter

- [ ] 修改 `app/backend/runner.js`，新增 `AGENT_BACKEND=openclaw-skills` 分支。
- [ ] 保留 `AGENT_RUNNER_CMD` 覆盖能力。
- [ ] 将 create/resume/retry/pause/approve/reject/guide 映射到 OpenClaw skills runner 控制脚本或控制文件。
- [ ] runner_state.json 记录 backend、node_id、skill、pid、logs、exit_code。

## 4. 数字员工模型

- [ ] 更新 `app/backend/employees.js` 为 5 个新员工，与 `skills_keyan` 五个 skill 一一对应。
- [ ] 更新员工职责、stage/node 范围和前端显示字段。
- [ ] 更新 seed/mock 数据，使部门概况、项目管理、部门产出页面与新员工一致。

## 5. projector 适配

- [ ] 支持扫描 `stage-*-*/node_meta.json` 和 `node_result.json`。
- [ ] 从节点 metadata 生成 `task_status.json`。
- [ ] 从节点 metadata 和 artifacts 生成 `employees.json`。
- [ ] 从节点 artifacts 生成 `artifacts_index.json`。
- [ ] 从节点起止时间生成 `schedule.json` 和项目甘特图需要的计划/实际时间。
- [ ] 将 approval_required、blocked、failed 状态投影到 timeline 和前端状态。

## 6. Docker Compose 与配置

- [ ] 更新 `docker-compose.yml`，新增或替换 agent 服务镜像为 `autoresearch-openclaw-agent:local`。
- [ ] 增加环境变量：`AGENT_BACKEND`、`OPENCLAW_HOME`、`OPENCLAW_WORKSPACE`、`OPENCLAW_MODEL`。
- [ ] 保持 app 服务和 agent 服务共享 `./runs:/data/runs`。
- [ ] 保持前端和 app 镜像不合并 agent 依赖。

## 7. 验证

- [ ] 单节点验证：每个 skill 节点可独立执行并写入预期 artifacts。
- [ ] 全流程 smoke：从新建研究项目到至少完成文献、理论、实验设计、写作、评审节点。
- [ ] projector 验证：新节点输出可被投影为前端稳定 JSON。
- [ ] 前端验证：部门概况、项目管理、员工排班、部门产出均可展示新数据。
- [ ] 恢复验证：中断后可从指定节点 resume。
- [ ] 失败验证：skill 节点失败后展示 blocked/failed，并支持人工审批或重试。
