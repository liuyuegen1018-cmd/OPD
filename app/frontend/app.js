const state = {
  runs: [],
  employees: [],
  filters: {
    monitor: { status: "all", q: "" },
    burndown: { status: "all", q: "" },
    artifacts: { status: "all", q: "" }
  },
  selectedRunId: null,
  selectedEmployeeId: null,
  selectedArtifact: null,
  artifactEmployee: "all",
  burndown: null,
  artifacts: [],
  activity: [],
  schedule: [],
  employeeDrawerOpen: false
};

const TOTAL_STAGES = 5;

const researchFlow = [
  { title: "文献综述", owner: "文献研究员", stage: "Stage 1", start: 1, end: 1, employee_id: "literature_researcher" },
  { title: "理论建模", owner: "理论建模员", stage: "Stage 2", start: 2, end: 2, employee_id: "theory_modeler" },
  { title: "实验设计", owner: "实验设计员", stage: "Stage 3", start: 3, end: 3, employee_id: "experiment_designer" },
  { title: "论文写作", owner: "论文写作员", stage: "Stage 4", start: 4, end: 4, employee_id: "academic_writer" },
  { title: "学术评审", owner: "学术评审员", stage: "Stage 5", start: 5, end: 5, employee_id: "academic_reviewer" }
];

const employeeSkills = {
  literature_researcher: { employment: "核心员工", skills: ["文献检索", "相关性筛选", "证据整理", "研究空白"], desc: "擅长围绕研究主题建立可靠文献基础，并整理后续建模需要的证据链。" },
  theory_modeler: { employment: "核心员工", skills: ["理论框架", "假设形式化", "变量定义", "可验证性"], desc: "擅长把文献证据转成明确的研究假设、理论结构和可验证任务。" },
  experiment_designer: { employment: "关键岗位", skills: ["实验方案", "数据集选择", "指标设计", "baseline"], desc: "擅长把研究假设转成可执行实验计划，并定义评价指标和对照方案。" },
  academic_writer: { employment: "核心员工", skills: ["论文结构", "方法描述", "结果叙述", "草稿生成"], desc: "擅长把阶段产物组织成论文草稿，并保持论证链条完整。" },
  academic_reviewer: { employment: "专项员工", skills: ["质量审查", "审稿意见", "修改建议", "归档检查"], desc: "擅长从审稿人视角检查论文质量、实验充分性和最终归档一致性。" }
};

const statusLabels = [
  ["all", "全部"],
  ["running", "运行"],
  ["blocked", "阻塞"],
  ["queued", "排队"],
  ["done", "完成"],
  ["failed", "失败"]
];

function statusClass(status) {
  if (status === "done" || status === "good") return "good";
  if (status === "running" || status === "working" || status === "active") return "active";
  if (status === "blocked" || status === "failed" || status === "critical") return "critical";
  return "warning";
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function loadAll() {
  state.runs = await api("/api/runs");
  state.employees = await api("/api/employees");
  state.activity = await api("/api/employees/activity");
  state.schedule = await api("/api/schedule");
  if (!state.selectedRunId && state.runs[0]) state.selectedRunId = state.runs[0].run_id;
  await loadSelectedDetails();
  render();
}

async function loadSelectedDetails() {
  if (!state.selectedRunId) return;
  state.burndown = await api(`/api/runs/${state.selectedRunId}/burndown`);
  state.artifacts = await api(`/api/runs/${state.selectedRunId}/artifacts`);
  if (!state.selectedArtifact || !state.artifacts.some((item) => item.artifact_id === state.selectedArtifact.artifact_id)) {
    state.selectedArtifact = state.artifacts[0] || null;
    if (state.selectedArtifact) await loadArtifactContent(state.selectedArtifact);
  }
}

function filteredRuns(page) {
  const filter = state.filters[page];
  return state.runs.filter((run) => {
    const matchesStatus = filter.status === "all" || run.status === filter.status;
    const q = filter.q.trim().toLowerCase();
    const matchesQuery = !q || `${run.run_id} ${run.name || ""} ${run.topic || ""}`.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });
}

function renderProjectCards(page, id) {
  const root = document.getElementById(id);
  root.innerHTML = filteredRuns(page).map((run) => {
    const progress = run.progress_percent ?? Math.round((run.progress || 0) * 100);
    const footnote = page === "burndown"
      ? `${run.remaining} remaining · Stage ${run.current_stage}/${TOTAL_STAGES}`
      : page === "artifacts"
        ? `${run.artifact_count || 0} outputs · 最近 ${run.latest_output}`
        : `${run.active_employee_cn || run.active_employee_name} · 最近 ${run.latest_output}`;
    return `
      <article class="project-card ${run.run_id === state.selectedRunId ? "active" : ""}" data-run="${run.run_id}">
        <div class="project-row">
          <div class="project-card-title">${escapeHtml(run.name || run.run_id)}</div>
          <span class="status-pill ${statusClass(run.status)}">${escapeHtml(run.status)}</span>
        </div>
        <div class="project-card-topic">${escapeHtml(run.topic || "")}</div>
        <div class="project-progress"><span style="width:${progress}%"></span></div>
        <div class="project-card-footer"><span>${progress}%</span><span>${escapeHtml(footnote)}</span></div>
      </article>
    `;
  }).join("");
  root.querySelectorAll(".project-card").forEach((node) => {
    node.addEventListener("click", async () => {
      state.selectedRunId = node.dataset.run;
      state.selectedArtifact = null;
      state.artifactEmployee = "all";
      await loadSelectedDetails();
      render();
    });
  });
}

function renderMetrics() {
  document.getElementById("metricRunning").textContent = state.runs.filter((run) => run.status === "running").length;
  document.getElementById("metricEmployees").textContent = state.employees.length;
  document.getElementById("metricArtifacts").textContent = state.runs.reduce((sum, run) => sum + (run.artifact_count || 0), 0);
  document.getElementById("metricApprovals").textContent = state.runs.reduce((sum, run) => sum + (run.approvals || 0), 0);
  document.getElementById("metricRemaining").textContent = state.runs.reduce((sum, run) => sum + (run.remaining || 0), 0);
}

function renderEmployees() {
  if (!state.selectedEmployeeId && state.employees[0]) {
    const active = state.employees.find((emp) => emp.status === "working" || emp.status === "blocked");
    state.selectedEmployeeId = (active || state.employees[0]).id;
  }
  document.getElementById("employeeList").innerHTML = state.employees.map((emp) => `
    <article class="employee ${emp.id === state.selectedEmployeeId ? "active" : ""}" data-employee="${escapeHtml(emp.id)}">
      <div>
        <div class="employee-name">${escapeHtml(emp.cn)} · ${escapeHtml(emp.name)}</div>
        <div class="employee-task">当前：${escapeHtml(emp.current_action || emp.responsibility || "待分配")}</div>
        <div class="employee-meta">${escapeHtml(emp.active_run_name ? `当前项目：${emp.active_run_name}` : "当前项目：待分配")}<br>负责阶段：${escapeHtml(emp.stages || "")} · 已产出 ${emp.outputs || 0}</div>
      </div>
      <span class="status-pill ${statusClass(emp.health || emp.status)}">${escapeHtml(emp.status || "idle")}</span>
    </article>
  `).join("");
  document.querySelectorAll("#employeeList .employee").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedEmployeeId = node.dataset.employee;
      renderEmployees();
      openEmployeeDrawer();
    });
  });
  renderEmployeeWorkspace();
  renderEmployeeGantt();
}

function openEmployeeDrawer() {
  state.employeeDrawerOpen = true;
  document.getElementById("employeeDrawer")?.classList.add("open");
  document.getElementById("employeeDrawerBackdrop")?.classList.add("open");
}

function closeEmployeeDrawer() {
  state.employeeDrawerOpen = false;
  document.getElementById("employeeDrawer")?.classList.remove("open");
  document.getElementById("employeeDrawerBackdrop")?.classList.remove("open");
}

function employeeMetric(emp, salt, min, max) {
  const seed = String(emp.id || emp.name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return min + ((seed + salt + (emp.outputs || 0) * 7) % (max - min + 1));
}

function employeeLoad(emp) {
  if (typeof emp.load === "number") return Math.round(emp.load * 100);
  if (emp.status === "working") return 78;
  if (emp.status === "blocked") return 66;
  if (emp.status === "queued") return 32;
  if (emp.status === "done") return 18;
  return 10;
}

function heatLevel(emp, index) {
  const seed = String(emp.id || emp.name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const value = (seed + index * 7 + Math.floor(index / 5) * (emp.outputs || 1) + employeeLoad(emp)) % 11;
  if (value > 8) return 4;
  if (value > 6) return 3;
  if (value > 4) return 2;
  if (value > 2) return 1;
  return 0;
}

function renderEmployeeWorkspace() {
  const emp = state.employees.find((item) => item.id === state.selectedEmployeeId) || state.employees[0];
  if (!emp) return;
  const activity = state.activity.find((item) => item.employee_id === emp.id);
  const activeRun = emp.active_run_name || currentRun()?.name || "待分配";
  const activeDays = activity?.active_days_30w ?? employeeMetric(emp, 11, 3, 30);
  const triggers = activity?.trigger_count ?? employeeMetric(emp, 23, 2, 89);
  const load = activity?.load_percent ?? employeeLoad(emp);
  const profile = employeeSkills[emp.id] || { employment: "数字员工", skills: [emp.responsibility || "科研任务"], desc: emp.responsibility || "负责自动科研流程中的指定阶段。" };
  const onboardDays = employeeMetric(emp, 41, 57, 180);
  const projectsDone = Math.max(0, state.runs.filter((run) => run.status === "done" || (run.current_stage || 0) > Number(String(emp.stages || "").match(/\d+/)?.[0] || 99)).length);
  document.getElementById("employeeFocus").innerHTML = `
    <div class="profile-head">
      <div class="avatar-card" aria-hidden="true"></div>
      <div>
        <div class="profile-name">${escapeHtml(emp.cn)} ${escapeHtml(emp.name)}</div>
        <div class="profile-meta">
          ${escapeHtml(emp.status || "idle")} · 负责 Stage ${escapeHtml(emp.stages || "")}<br>
          ${escapeHtml(activeRun === "待分配" ? "当前无绑定项目，等待排班" : `正在推进：${activeRun}`)}
        </div>
      </div>
    </div>
    <div class="employee-task">当前：${escapeHtml(emp.current_action || emp.responsibility || "待分配")}</div>
    <div class="profile-stats">
      <div class="profile-stat"><div class="profile-stat-value">${onboardDays}</div><div class="profile-stat-label">入职天数</div></div>
      <div class="profile-stat"><div class="profile-stat-value">${projectsDone}</div><div class="profile-stat-label">累计完成项目</div></div>
      <div class="profile-stat"><div class="profile-stat-value">${activeDays}</div><div class="profile-stat-label">近 30 周活跃日</div></div>
      <div class="profile-stat"><div class="profile-stat-value">${triggers}</div><div class="profile-stat-label">触发器响应</div></div>
      <div class="profile-stat"><div class="profile-stat-value">${emp.outputs || 0}</div><div class="profile-stat-label">当前产出</div></div>
      <div class="profile-stat"><div class="profile-stat-value">${load}%</div><div class="profile-stat-label">排班负载</div></div>
    </div>
    <div class="personnel-info">
      <div class="personnel-row"><span>员工类型</span><strong>${escapeHtml(profile.employment)}</strong></div>
      <div class="personnel-row"><span>当前负载</span><strong>${load}%</strong></div>
      <div class="personnel-row"><span>触发器响应</span><strong>${triggers} 次</strong></div>
      <div class="personnel-row"><span>负责阶段</span><strong>Stage ${escapeHtml(emp.stages || "")}</strong></div>
    </div>
    <div class="skills">
      <div class="employee-name">核心技能</div>
      <div class="skill-tags">${profile.skills.map((skill) => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join("")}</div>
      <div class="skill-desc">${escapeHtml(profile.desc)}</div>
    </div>
  `;
  const heatmap = activity?.heatmap || Array.from({ length: 210 }, (_, index) => ({ index, level: heatLevel(emp, index) }));
  document.getElementById("employeeHeatmap").innerHTML = heatmap.map((cell, index) => {
    const level = cell.level || 0;
    return `<span class="heat-cell ${level ? `l${level}` : ""}" title="week ${Math.floor(index / 7) + 1}, day ${index % 7 + 1}"></span>`;
  }).join("");
}

function ganttPlanFor(emp, index) {
  const activeRun = state.runs.find((run) => run.active_employee_id === emp.id);
  if (activeRun) {
    return {
      project: activeRun.name || activeRun.run_id,
      task: `Stage ${activeRun.current_stage}/${TOTAL_STAGES} · ${activeRun.current_phase || emp.stages || ""}`,
      start: Math.min(10, Math.max(0, index % 5)),
      span: emp.status === "blocked" ? 4 : emp.status === "working" ? 6 : 3,
      color: emp.status === "blocked" ? "amber" : "cyan"
    };
  }
  const queuedRun = state.runs.find((run) => run.status === "queued");
  return {
    project: queuedRun ? (queuedRun.name || queuedRun.run_id) : "等待项目交接",
    task: emp.status === "done" ? "已完成，等待新项目" : `Stage ${emp.stages || "-"} · 待排期`,
    start: Math.min(12, 2 + index),
    span: emp.status === "idle" ? 2 : 3,
    color: emp.status === "done" ? "green" : ""
  };
}

function renderEmployeeGantt() {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, "0")}`;
  });
  const rows = state.employees.map((emp, index) => {
    const scheduled = state.schedule.find((item) => item.employee_id === emp.id);
    const scheduledRunId = scheduled?.run_id;
    const activeRun = currentRun();
    const item = scheduled
      ? {
        project: scheduled.project || scheduled.run_name || "等待项目交接",
        task: scheduled.task || `Stage ${emp.stages || "-"} · 待排期`,
        start: scheduled.start_offset || 0,
        span: scheduled.duration_days || 2,
        color: `${scheduled.color || ""} ${scheduledRunId && scheduledRunId !== activeRun?.run_id ? "muted" : ""} ${scheduled.run_status === "blocked" ? "blocked" : ""}`
      }
      : ganttPlanFor(emp, index);
    return `
      <div class="gantt-row">
        <div class="gantt-name">
          <div class="gantt-employee">${escapeHtml(emp.cn)}</div>
          <div class="gantt-task">${escapeHtml(item.task)}</div>
        </div>
        <div class="gantt-track">
          ${days.map(() => "<span></span>").join("")}
          <div class="gantt-bar ${item.color}" style="left: calc(${item.start} * (100% / 14) + 6px); width: calc(${item.span} * (100% / 14) - 12px);">${escapeHtml(item.project)}</div>
        </div>
      </div>
    `;
  }).join("");
  document.getElementById("employeeGantt").innerHTML = `
    <div class="gantt-header">
      <div class="gantt-cell">数字员工 / 排期</div>
      ${days.map((day) => `<div class="gantt-cell">${day}</div>`).join("")}
    </div>
    ${rows}
  `;
}

function renderResearchFlow() {
  const run = currentRun();
  const currentStage = Number(run?.current_stage || 1);
  const root = document.getElementById("researchFlow");
  if (!root) return;
  root.innerHTML = researchFlow.map((step, index) => {
    const active = currentStage >= step.start && currentStage <= step.end;
    const done = currentStage > step.end || run?.status === "done";
    const stateText = active ? "运行中" : done ? "完成" : "等待";
    return `
      <div class="flow-step ${active ? "active" : ""}">
        <div class="flow-index">${index + 1}</div>
        <div class="flow-title">${escapeHtml(step.title)}</div>
        <div class="flow-owner">负责人：${escapeHtml(step.owner)}</div>
        <div class="flow-stage">${escapeHtml(step.stage)} · ${stateText}</div>
      </div>
    `;
  }).join("");
}

function renderScheduleCompact() {
  const root = document.getElementById("scheduleCompact");
  if (!root) return;
  const run = currentRun();
  const currentItems = state.schedule.filter((item) => item.run_id === run?.run_id || item.run_name === run?.name);
  const busyEmployees = new Set(state.schedule.map((item) => item.employee_id));
  const blockedProjects = state.runs.filter((item) => item.status === "blocked").length;
  const nextHandoff = currentItems.slice().sort((a, b) => (a.start_offset || 0) - (b.start_offset || 0))[0];
  const busiest = state.employees.slice().sort((a, b) => employeeLoad(b) - employeeLoad(a))[0];
  root.innerHTML = `
    <div class="schedule-card">
      <div class="schedule-label">当前项目占用</div>
      <div class="schedule-value">${currentItems.length || 1} 名员工 · ${escapeHtml(run?.active_employee_cn || run?.active_employee_name || "-")} 主责</div>
    </div>
    <div class="schedule-card">
      <div class="schedule-label">下一交接</div>
      <div class="schedule-value">${escapeHtml(nextHandoff?.task || `Stage ${run?.current_stage || "-"}/${TOTAL_STAGES}`)}</div>
    </div>
    <div class="schedule-card">
      <div class="schedule-label">部门负载</div>
      <div class="schedule-value">${busyEmployees.size}/${state.employees.length} 人已排班 · 最高 ${escapeHtml(busiest?.cn || "-")} ${employeeLoad(busiest || {})}%</div>
    </div>
    <div class="schedule-card">
      <div class="schedule-label">排期风险</div>
      <div class="schedule-value">${blockedProjects} 个阻塞项目 · ${state.employees.filter((emp) => emp.blocked_reason || emp.retry_count).length} 条员工风险</div>
    </div>
  `;
}

function renderProjectOverview() {
  const root = document.getElementById("projectOverview");
  const run = currentRun();
  if (!root || !run) return;
  const next = researchFlow.find((step) => step.start > Number(run.current_stage || 1));
  root.innerHTML = `
    <div class="overview-item">
      <div class="overview-label">当前项目</div>
      <div class="overview-value">${escapeHtml(run.name || run.run_id)}<br><span class="employee-task">${escapeHtml(run.topic || "")}</span></div>
    </div>
    <div class="overview-item">
      <div class="overview-label">当前阶段</div>
      <div class="overview-value">Stage ${run.current_stage || 1}/${TOTAL_STAGES}</div>
    </div>
    <div class="overview-item">
      <div class="overview-label">当前负责人</div>
      <div class="overview-value">${escapeHtml(run.active_employee_cn || run.active_employee_name || "-")}</div>
    </div>
    <div class="overview-item">
      <div class="overview-label">下一交接</div>
      <div class="overview-value">${escapeHtml(next?.owner || "无后续交接")}</div>
    </div>
    <div class="overview-item">
      <div class="overview-label">最近产出</div>
      <div class="overview-value">${escapeHtml(run.latest_output || "等待产出")}</div>
    </div>
  `;
}

function renderProjectGantt() {
  const root = document.getElementById("projectGantt");
  const run = currentRun();
  if (!root || !run) return;
  const weeks = Array.from({ length: TOTAL_STAGES }, (_, index) => `S${index + 1}`);
  const currentStage = Number(run.current_stage || 1);
  const rows = researchFlow.map((item) => {
    const isDone = currentStage > item.end || run.status === "done";
    const isActive = currentStage >= item.start && currentStage <= item.end;
    const isBlocked = isActive && run.status === "blocked";
    const barClass = isDone ? "green" : isActive ? `cyan ${isBlocked ? "blocked" : ""}` : "muted";
    const start = item.start - 1;
    const span = item.end - item.start + 1;
    return `
      <div class="gantt-row" style="grid-template-columns: 170px repeat(${TOTAL_STAGES}, minmax(120px, 1fr)); min-width: 780px;">
        <div class="gantt-name">
          <div class="gantt-employee">${escapeHtml(item.title)}</div>
          <div class="gantt-task">${escapeHtml(item.owner)}</div>
        </div>
        <div class="gantt-track" style="grid-template-columns: repeat(${TOTAL_STAGES}, minmax(120px, 1fr));">
          ${weeks.map(() => "<span></span>").join("")}
          <div class="gantt-bar ${barClass}" style="left: calc(${start} * (100% / ${TOTAL_STAGES}) + 6px); width: calc(${span} * (100% / ${TOTAL_STAGES}) - 12px);">${escapeHtml(isActive ? `${item.title} · 当前` : item.title)}</div>
        </div>
      </div>
    `;
  }).join("");
  root.innerHTML = `
    <div class="gantt-header" style="grid-template-columns: 170px repeat(${TOTAL_STAGES}, minmax(120px, 1fr)); min-width: 780px;">
      <div class="gantt-cell">阶段 / 负责人</div>
      ${weeks.map((day) => `<div class="gantt-cell">${day}</div>`).join("")}
    </div>
    ${rows}
  `;
}

function renderBurndown() {
  const run = currentRun();
  if (!run) return;
  renderScheduleCompact();
  renderProjectOverview();
  renderProjectGantt();
  document.getElementById("burnDetailTitle").textContent = `${run.name || run.run_id}阶段计划`;
  document.getElementById("remainingPill").textContent = `${run.remaining || state.burndown?.remaining_points || 0} remaining`;
  const risky = state.employees.filter((emp) => ["critical", "warning"].includes(emp.health) || emp.retry_count || emp.blocked_reason);
  const riskList = document.querySelector("#burndown .risk-list");
  if (!riskList) return;
  riskList.innerHTML = (risky.length ? risky : state.employees.slice(0, 2)).map((emp) => `
    <div class="risk-item">
      <div class="risk-title">${escapeHtml(emp.blocked_reason ? "高 · 阻塞" : emp.retry_count ? "中 · 重试" : "低 · 等待")}</div>
      <div class="risk-meta">${escapeHtml(emp.cn || emp.name)} / Stage ${escapeHtml(emp.current_stage || emp.stages || "-")}<br>${escapeHtml(emp.blocked_reason || emp.current_action || "暂无阻塞，持续观察负载变化。")}</div>
    </div>
  `).join("");
}

function renderArtifactFilters() {
  const counts = new Map();
  for (const artifact of state.artifacts) counts.set(artifact.employee_id, (counts.get(artifact.employee_id) || 0) + 1);
  const items = [{ id: "all", cn: "全部员工", name: "All Employees", outputs: state.artifacts.length }, ...state.employees.map((emp) => ({ ...emp, outputs: counts.get(emp.id) || 0 }))];
  document.getElementById("employeeFilter").innerHTML = items.map((item) => `
    <div class="filter-item ${item.id === state.artifactEmployee ? "active" : ""}" data-employee="${item.id}">
      <div class="employee-name">${escapeHtml(item.cn)} </div>
      <div class="employee-task">${escapeHtml(item.name)} · ${item.outputs} outputs</div>
    </div>
  `).join("");
  document.querySelectorAll("#employeeFilter .filter-item").forEach((node) => {
    node.addEventListener("click", () => {
      state.artifactEmployee = node.dataset.employee;
      renderArtifacts();
    });
  });
}

function renderArtifacts() {
  const rows = state.artifactEmployee === "all" ? state.artifacts : state.artifacts.filter((artifact) => artifact.employee_id === state.artifactEmployee);
  document.getElementById("artifactGrid").innerHTML = rows.map((artifact) => `
    <article class="artifact" data-artifact="${artifact.artifact_id}">
      <div>
        <div class="artifact-title">${escapeHtml(artifact.title)}</div>
        <div class="artifact-meta">${escapeHtml(employeeName(artifact.employee_id))} · stage-${String(artifact.stage).padStart(2, "0")}<br>${escapeHtml(artifact.path)}</div>
      </div>
      <span class="status-pill ${statusClass(artifact.status)}">${escapeHtml(artifact.type)}</span>
    </article>
  `).join("");
  document.querySelectorAll("#artifactGrid .artifact").forEach((node) => {
    node.addEventListener("click", async () => {
      const artifact = state.artifacts.find((item) => item.artifact_id === node.dataset.artifact);
      state.selectedArtifact = artifact;
      await loadArtifactContent(artifact);
    });
  });
}

async function loadArtifactContent(artifact) {
  if (!artifact) return;
  const data = await api(`/api/artifacts/${encodeURIComponent(artifact.artifact_id)}/content`);
  document.getElementById("artifactGuidanceContext").textContent = `当前上下文：${currentRun()?.name || artifact.run_id} · Stage ${artifact.stage} · ${employeeName(artifact.employee_id)} · ${artifact.path}`;
  document.getElementById("preview").textContent = data.content || `该文件使用 raw 打开：${data.raw_url}`;
}

function lineChart(values, ideal = [], width = 640, height = 280) {
  const max = Math.max(1, ...values, ...ideal);
  const min = Math.min(0, ...values, ...ideal);
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 50) + 25;
    const y = height - 25 - ((value - min) / (max - min || 1)) * (height - 50);
    return `${x},${y}`;
  }).join(" ");
  const idealCoords = ideal.map((value, index) => {
    const x = ideal.length === 1 ? width / 2 : (index / (ideal.length - 1)) * (width - 50) + 25;
    const y = height - 25 - ((value - min) / (max - min || 1)) * (height - 50);
    return `${x},${y}`;
  }).join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="趋势图">
    ${idealCoords ? `<polyline points="${idealCoords}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 6"></polyline>` : ""}
    <polyline points="${coords}" fill="none" stroke="#2f6fed" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
  </svg>`;
}

function renderStatusTabs() {
  const tabMap = {
    monitorStatusTabs: "monitor",
    burndownStatusTabs: "burndown",
    artifactStatusTabs: "artifacts"
  };
  Object.entries(tabMap).forEach(([id, page]) => {
    const root = document.getElementById(id);
    if (!root) return;
    root.innerHTML = statusLabels.map(([status, label]) => `<button class="${state.filters[page].status === status ? "active" : ""}" data-status="${status}">${label}</button>`).join("");
    root.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.filters[page].status = button.dataset.status;
        render();
      });
    });
  });
}

function render() {
  renderMetrics();
  renderStatusTabs();
  renderProjectCards("monitor", "monitorProjectCards");
  renderProjectCards("burndown", "burndownProjectCards");
  renderProjectCards("artifacts", "artifactProjectCards");
  renderResearchFlow();
  renderEmployees();
  renderBurndown();
  renderArtifactFilters();
  renderArtifacts();
}

function currentRun() {
  return state.runs.find((run) => run.run_id === state.selectedRunId);
}

function employeeName(id) {
  const employee = state.employees.find((item) => item.id === id);
  return employee ? `${employee.cn} · ${employee.name}` : id;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

document.querySelectorAll(".nav button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.view).classList.add("active");
    updatePageHeader(button.dataset.view);
    if (button.dataset.view !== "monitor") closeEmployeeDrawer();
  });
});

function updatePageHeader(view) {
  const title = document.getElementById("pageTitle");
  const subtitle = document.getElementById("pageSubtitle");
  const actions = document.getElementById("pageActions");
  if (view === "burndown") {
    title.textContent = "项目进展";
    subtitle.textContent = "先看部门级员工排班，再选择项目查看阶段计划、负责人和风险。";
    actions.innerHTML = `
      <button class="btn" id="refreshBtn">刷新</button>
      <button class="btn" id="pauseRunBtn">暂停当前项目</button>
      <button class="btn primary" id="retryRunBtn">重新运行阶段</button>
    `;
    bindActionButtons();
  } else if (view === "artifacts") {
    title.textContent = "部门产出";
    subtitle.textContent = "按项目和数字员工查看科研产出，并在产出页完成审查、修改和指导。";
    actions.innerHTML = `
      <button class="btn primary" id="topGuideBtn">提交指导</button>
      <button class="btn" id="topRegenBtn">要求重新生成</button>
    `;
    bindActionButtons();
  } else {
    title.textContent = "部门概况";
    subtitle.textContent = "从部门视角查看运行任务、数字员工状态和自动科研流程。";
    actions.innerHTML = `
      <button class="btn" id="refreshBtn">刷新</button>
      <button class="btn primary" id="newRunBtn">新建研究任务</button>
    `;
    bindActionButtons();
  }
}

const searchMap = {
  monitorProjectSearch: "monitor",
  burndownProjectSearch: "burndown",
  artifactProjectSearch: "artifacts"
};
Object.entries(searchMap).forEach(([id, page]) => {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("input", () => {
    state.filters[page].q = input.value;
    render();
  });
});

function bindActionButtons() {
  const refresh = document.getElementById("refreshBtn");
  if (refresh) refresh.onclick = () => loadAll();
  const newRun = document.getElementById("newRunBtn");
  if (newRun) newRun.onclick = () => document.getElementById("runModal")?.classList.add("active");
  const pause = document.getElementById("pauseRunBtn");
  if (pause) pause.onclick = async () => {
    if (!state.selectedRunId) return;
    await api(`/api/runs/${encodeURIComponent(state.selectedRunId)}/pause`, {
      method: "POST",
      body: JSON.stringify({ message: "用户从项目进展页暂停当前项目" })
    });
    await loadAll();
  };
  const retry = document.getElementById("retryRunBtn");
  if (retry) retry.onclick = async () => {
    if (!state.selectedRunId) return;
    await api(`/api/runs/${encodeURIComponent(state.selectedRunId)}/retry`, {
      method: "POST",
      body: JSON.stringify({ message: "用户从项目进展页重新运行阶段" })
    });
    await loadAll();
  };
  const topGuide = document.getElementById("topGuideBtn");
  if (topGuide) topGuide.onclick = () => document.getElementById("guideBtn")?.click();
  const topRegen = document.getElementById("topRegenBtn");
  if (topRegen) topRegen.onclick = () => document.getElementById("regenBtn")?.click();
}

document.getElementById("refreshBtn")?.addEventListener("click", loadAll);
document.getElementById("newRunBtn")?.addEventListener("click", () => document.getElementById("runModal")?.classList.add("active"));
document.getElementById("cancelRunBtn")?.addEventListener("click", () => document.getElementById("runModal")?.classList.remove("active"));
document.getElementById("createRunBtn")?.addEventListener("click", async () => {
  const topic = document.getElementById("topicInput")?.value.trim();
  if (!topic) return;
  const created = await api("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      topic,
      mode: document.getElementById("modeInput")?.value || "full-auto",
      auto_approve: document.getElementById("autoApproveInput")?.checked ?? true
    })
  });
  state.selectedRunId = created.run_id;
  document.getElementById("runModal")?.classList.remove("active");
  await loadAll();
});

document.getElementById("guideBtn")?.addEventListener("click", async () => {
  if (!state.selectedArtifact) return;
  const message = document.getElementById("guideText")?.value.trim() || document.querySelector(".guide-input")?.value.trim();
  if (!message) return;
  await api(`/api/artifacts/${encodeURIComponent(state.selectedArtifact.artifact_id)}/guide`, {
    method: "POST",
    body: JSON.stringify({ message, scope: "current_artifact" })
  });
  if (document.getElementById("guideText")) document.getElementById("guideText").value = "";
  if (document.querySelector(".guide-input")) document.querySelector(".guide-input").value = "";
  await loadAll();
});
document.getElementById("regenBtn")?.addEventListener("click", async () => {
  if (!state.selectedArtifact) return;
  await api(`/api/artifacts/${encodeURIComponent(state.selectedArtifact.artifact_id)}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ message: document.getElementById("guideText")?.value.trim() || document.querySelector(".guide-input")?.value.trim() || "" })
  });
});
document.getElementById("rawBtn")?.addEventListener("click", () => {
  if (state.selectedArtifact) window.open(`/api/artifacts/${encodeURIComponent(state.selectedArtifact.artifact_id)}/raw`, "_blank");
});
document.getElementById("employeeDrawerClose")?.addEventListener("click", closeEmployeeDrawer);
document.getElementById("employeeDrawerBackdrop")?.addEventListener("click", closeEmployeeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.employeeDrawerOpen) closeEmployeeDrawer();
});

try {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/runs`);
  ws.addEventListener("message", () => loadAll());
} catch (error) {
  console.warn("WebSocket unavailable", error);
}

updatePageHeader("monitor");
bindActionButtons();
loadAll().catch((error) => {
  document.getElementById("preview").textContent = error.message;
  console.error(error);
});
