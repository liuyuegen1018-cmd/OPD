---
name: "academic-writing"
description: "学术写作子技能。支持论文撰写、LaTeX模板、BibTeX管理、图表生成、投稿准备。触发：论文写作、投稿、LaTeX、参考文献。"
---

# Academic Writing - 学术写作

## 触发条件

- "论文写作"、"写论文"、"撰写论文"
- "投稿准备"、"投稿"
- "LaTeX"、"参考文献"、"BibTeX"
- "生成图表"、"论文图表"
- 主协调器 `research-assistant` 调用

---

## 输入

从前面阶段获取：
- **理论框架** (`02_theory/theory_final.md`)
- **实验结果** (`03_experiment/results/`)
- **分析报告** (`04_analysis/`)
- **项目配置** (目标会议、期刊)

---

## 论文结构

### 顶会标准结构

```
1. Abstract           (摘要)
2. Introduction       (引言)
3. Related Work       (相关工作)
4. Method / Approach  (方法)
5. Experiments        (实验)
6. Analysis           (分析/消融)
7. Discussion         (讨论)
8. Conclusion         (结论)
9. References         (参考文献)
10. Appendix          (附录，可选)
```

---

## 写作流程

### Step 1：确定投稿目标

**从 PROJECT.md 获取目标会议**

**会议信息确认**：
```markdown
## 投稿目标

- **会议**: {venue} (NeurIPS / ICLR / ICML / ACL / CVPR ...)
- **截稿日期**: {deadline}
- **页数限制**: {page_limit}
- **模板**: {template} (LaTeX / Word)
- **投稿类型**: {type} (Long paper / Short paper / Workshop)
```

---

### Step 2：撰写摘要 (Abstract)

**摘要模板**：

```markdown
## Abstract

{背景介绍，1-2 句}

{现有方法的局限，1-2 句}

{本文提出的方法，2-3 句}

{核心创新点，2-3 句}

{主要实验结果，1-2 句}

{贡献总结，1 句}
```

**写作要点**：
- 字数：150-300 词
- 独立完整
- 突出创新
- 包含关键结果

---

### Step 3：撰写引言 (Introduction)

**引言结构**：

```markdown
## 1. Introduction

### 段落 1：研究背景与动机
{为什么这个问题重要？实际意义？}

### 段落 2：现有方法及其局限
{现有方法有哪些？为什么不够好？}

### 段落 3：本文方法概述
{我们提出了什么？核心思想？}

### 段落 4：主要贡献
本文的主要贡献如下：
1. **理论贡献**: {contribution_1}
2. **方法贡献**: {contribution_2}
3. **实验贡献**: {contribution_3}

### 段落 5：论文结构
{各章节内容概述}
```

**写作原则**：
- 问题驱动
- 逐步聚焦
- 贡献清晰

---

### Step 4：撰写相关工作 (Related Work)

**相关工作结构**：

```markdown
## 2. Related Work

### 2.1 {category_1}
{该类别的方法概述，对比分析}

### 2.2 {category_2}
{...}

### 2.3 与本文的关系
{本文与现有工作的区别与创新}
```

**写作原则**：
- 分类清晰
- 引用关键工作
- 明确区分

---

### Step 5：撰写方法 (Method)

**方法结构**：

```markdown
## 3. Method

### 3.1 Problem Formulation
{问题形式化，符号定义}

### 3.2 Overview
{方法概述，整体框架图}

### 3.3 {component_1}
{核心组件详细说明}

### 3.4 {component_2}
{...}

### 3.5 Theoretical Analysis
{理论分析，定理，证明（可放 Appendix）}

### 3.6 Algorithm
{算法伪代码}
```

**数学公式规范**：
- 符号一致
- 公式编号
- 关键公式有解释

---

### Step 6：撰写实验 (Experiments)

**实验结构**：

```markdown
## 4. Experiments

### 4.1 Experimental Setup
- **数据集**: {datasets}
- **基线**: {baselines}
- **指标**: {metrics}
- **实现细节**: {implementation_details}

### 4.2 Main Results
{主实验结果表格与分析}

### 4.3 Ablation Studies
{消融实验结果与分析}

### 4.4 Analysis
{分析实验结果}
```

**表格规范**：
- 最佳结果加粗
- 标准差/置信区间
- 表注清晰

---

### Step 7：撰写讨论与结论

**讨论结构**：

```markdown
## 5. Discussion

### 5.1 主要发现
{实验揭示了什么？}

### 5.2 局限性
{方法有哪些局限？诚实说明}

### 5.3 未来工作
{可以如何改进？}

## 6. Conclusion

{总结论文贡献，2-3 段}
```

---

### Step 8：参考文献管理

**BibTeX 格式**：

```bibtex
@inproceedings{author2024title,
  title={Title of the Paper},
  author={Author, First and Author, Second},
  booktitle={Proceedings of the Conference},
  year={2024}
}

@article{author2024journal,
  title={Title of the Article},
  author={Author, First},
  journal={Journal Name},
  year={2024}
}
```

**管理方式**：
- 存储位置：`05_output/manuscript/references.bib`
- 引用工具：各论文摘要卡片中的 BibTeX

---

### Step 9：图表制作

#### 论文图表规范

| 类型 | 工具 | 格式 |
|------|------|------|
| 架构图 | `mermaid-diagrams` / draw.io | PDF/SVG |
| 实验曲线 | Matplotlib / seaborn | PDF |
| 结果表格 | LaTeX table | - |
| 示意图 | PowerPoint / Figma | PDF/PNG |

**图表要求**：
- 矢量格式优先 (PDF/SVG)
- 字号可读
- 颜色区分度
- 图注完整

---

## 输出清单

| 产出物 | 路径 |
|--------|------|
| 论文主文档 | `05_output/manuscript/main.tex` 或 `main.docx` |
| 参考文献 | `05_output/manuscript/references.bib` |
| 图表 | `05_output/manuscript/figures/` |
| 补充材料 | `05_output/manuscript/appendix/` |
| 中文报告 | `05_output/final_report_zh.md` |

---

## LaTeX 模板

### 会议模板

| 会议 | 模板 |
|------|------|
| NeurIPS | `\documentclass{neurips_2024}` |
| ICLR | `\documentclass{iclr2024_conference}` |
| ICML | `\documentclass{icml2024}` |
| ACL | `\documentclass{acl}` |

### 常用宏包

```latex
\usepackage{amsmath, amssymb, amsthm}  % 数学
\usepackage{graphicx}                   % 图片
\usepackage{booktabs}                   % 表格
\usepackage{algorithm, algorithmic}     % 算法
\usepackage{hyperref}                   % 链接
```

---

## 投稿检查清单

### 内容检查

- [ ] 标题准确反映内容
- [ ] 摘要独立完整
- [ ] 贡献清晰列出
- [ ] 方法可复现
- [ ] 实验充分
- [ ] 引用完整

### 格式检查

- [ ] 符合会议模板
- [ ] 页数限制
- [ ] 图表清晰
- [ ] 参考文献格式
- [ ] 匿名性（如需要）

### 语言检查

- [ ] 语法正确
- [ ] 表达清晰
- [ ] 术语一致
- [ ] 无拼写错误

---

## 依赖技能

### 推荐
- `docx` - Word 文档处理
- `mermaid-diagrams` - 流程图
- `pdf` - PDF 处理

---

## 示例对话

**用户**：帮我撰写论文

**助手**：
> 开始论文撰写...
>
> **投稿信息确认**：
> - 目标会议：NeurIPS 2026
> - 页数限制：9 页正文 + 无限附录
> - 模板：LaTeX neurips_2024
>
> **论文结构**：
> 1. Abstract
> 2. Introduction
> 3. Related Work
> 4. Method
> 5. Experiments
> 6. Discussion
> 7. Conclusion
>
> 我将从 Abstract 开始撰写。以下是摘要草稿：
>
> > {摘要内容}
>
> 请审阅并提出修改意见，或输入"继续"进入下一部分。

---

## 更新日志

- **v1.0.0** (2026-03-26): 初始版本