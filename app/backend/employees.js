const EMPLOYEES = [
  {
    id: "literature_researcher",
    name: "Literature Researcher",
    cn: "文献研究员",
    stages: "1",
    stageRange: [1, 1],
    skill: "literature-review",
    responsibility: "文献检索、证据整理、研究空白归纳"
  },
  {
    id: "theory_modeler",
    name: "Theory Modeler",
    cn: "理论建模员",
    stages: "2",
    stageRange: [2, 2],
    skill: "theory-formalization",
    responsibility: "理论框架、研究假设、可验证问题形式化"
  },
  {
    id: "experiment_designer",
    name: "Experiment Designer",
    cn: "实验设计员",
    stages: "3",
    stageRange: [3, 3],
    skill: "experiment-design",
    responsibility: "实验方案、数据集、指标、基线与验证路径"
  },
  {
    id: "experiment_executor",
    name: "Experiment Executor",
    cn: "实验执行员",
    stages: "4",
    stageRange: [4, 4],
    skill: "experiment-execution",
    responsibility: "实验运行、日志整理、结果汇总与复现报告"
  },
  {
    id: "academic_writer",
    name: "Academic Writer",
    cn: "论文写作员",
    stages: "5",
    stageRange: [5, 5],
    skill: "academic-writing",
    responsibility: "论文结构、方法叙述、结果表达与草稿生成"
  },
  {
    id: "academic_reviewer",
    name: "Academic Reviewer",
    cn: "学术评审员",
    stages: "6",
    stageRange: [6, 6],
    skill: "paper-review",
    responsibility: "质量审查、审稿意见、修改建议与归档检查"
  }
];

function employeeForStage(stage) {
  const normalized = Number(stage) || 1;
  if (normalized <= EMPLOYEES[0].stageRange[0]) return EMPLOYEES[0];
  const found = EMPLOYEES.find((employee) => {
    const [start, end] = employee.stageRange;
    return normalized >= start && normalized <= end;
  });
  if (found) return found;
  return EMPLOYEES[EMPLOYEES.length - 1];
}

module.exports = { EMPLOYEES, employeeForStage };
