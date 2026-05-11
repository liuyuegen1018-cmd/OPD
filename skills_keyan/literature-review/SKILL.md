---
name: "literature-review"
description: "文献调研子技能。支持论文搜索、下载、结构化摘要、综述撰写、Gap识别。触发：文献调研、搜索论文、综述、arXiv。"
---

# Literature Review - 文献调研

## 触发条件

- "文献调研"、"搜索论文"、"找论文"
- "综述"、"文献综述"
- "arXiv 搜索"
- 主协调器 `research-assistant` 调用

---

## 工作流程

### Step 1：确认搜索范围

**从 PROJECT.md 提取**：
- 关键词列表
- 目标会议/期刊
- 时间范围（默认：近 1-2 年）
- 研究领域限制

**如未提供，询问用户**：
```
请提供以下信息：
1. 研究关键词（多个用逗号分隔）
2. 目标会议/期刊（如 NeurIPS, ICLR）
3. 时间范围（如 2025 年至今）
```

---

### Step 2：执行文献搜索

**搜索策略**：

| 来源 | 工具 | 优先级 |
|------|------|--------|
| arXiv | `multi-search-engine` + site:arxiv.org | 高 |
| Google Scholar | `web_search` / `multi-search-engine` | 高 |
| Semantic Scholar | `web_fetch` | 中 |
| 顶会论文集 | GitHub / 会议官网 | 中 |

**搜索语句构造**：
```
site:arxiv.org {keyword1} {keyword2}
site:openreview.net {keyword} (ICLR/NeurIPS)
"{exact_phrase}" filetype:pdf
```

**输出**：候选论文列表（标题、链接、arXiv ID）

---

### Step 3：筛选与下载

**筛选标准**：
- 标题相关性
- 摘要匹配度
- 引用量（可选）
- 会议级别

**下载方式**：
- arXiv PDF：直接下载
- 会议论文：通过官网或 Sci-Hub（需用户确认）

**存储位置**：`{project_dir}/01_literature/papers/`

---

### Step 4：生成结构化摘要

**为每篇论文生成摘要卡片**：

```markdown
# 论文摘要卡片

## 基本信息
- **标题**: {title}
- **作者**: {authors}
- **会议/期刊**: {venue} {year}
- **arXiv**: {arxiv_id}
- **链接**: {url}

## 核心内容

### 研究问题
{research_question}

### 核心方法
{core_method}

**数学形式化**:
{mathematical_formulation}

### 关键结果
| 数据集 | 基线 | 本文方法 | 提升 |
|--------|------|----------|------|
| ... | ... | ... | ... |

### 创新点
1. {innovation_1}
2. {innovation_2}

### 局限性
1. {limitation_1}
2. {limitation_2}

### 未解决问题
1. {open_problem_1}
2. {open_problem_2}

## 与本项目关系
- **可借鉴**: {borrowable}
- **需超越**: {to_improve}
- **引用优先级**: 必须/推荐/可选

---
*阅读状态*: {status} | *日期*: {date}
```

**存储位置**：`{project_dir}/01_literature/summaries/{arxiv_id}.md`

---

### Step 5：撰写综述报告

**输出文件**：`{project_dir}/01_literature/literature_review.md`

**综述结构**：

```markdown
# 文献综述

## 1. 引言
- 研究背景
- 综述范围与结构

## 2. 问题定义
- 核心研究问题的演变
- 形式化定义

## 3. 方法分类

### 3.1 类别 A
- 方法概述
- 代表工作
- 对比分析

### 3.2 类别 B
- ...

## 4. 方法对比

| 方法 | 核心思想 | 优势 | 劣势 | 适用场景 |
|------|----------|------|------|----------|
| ... | ... | ... | ... | ... |

## 5. 研究空白 (Gap List)

### Gap 1: {gap_title}
- **描述**: {description}
- **现有方法局限**: {limitations}
- **潜在解决方向**: {potential_directions}

### Gap 2: ...

## 6. 总结与展望
- 主要发现
- 对本研究的启示

## 参考文献
{bibtex_entries}
```

---

## Gap List 识别方法

### 识别维度

| 维度 | 问题示例 |
|------|----------|
| **理论空白** | 现有方法缺乏理论支撑？数学框架不统一？ |
| **方法空白** | 某类问题未被有效解决？启发式方法可形式化？ |
| **实验空白** | 缺乏公平比较？评估指标不全面？ |
| **应用空白** | 某场景未探索？跨领域迁移？ |

### Gap 优先级

- 🔴 高优先级：理论空白 + 方法空白
- 🟡 中优先级：实验空白
- 🟢 低优先级：应用空白

---

## 输出清单

完成文献调研后，输出：

| 产出物 | 路径 |
|--------|------|
| 论文 PDF | `01_literature/papers/` |
| 摘要卡片 | `01_literature/summaries/` |
| 阅读笔记 | `01_literature/notes/` |
| 综述报告 | `01_literature/literature_review.md` |
| Gap List | 综述报告第 5 节 |
| BibTeX | `01_literature/references.bib` |

---

## 依赖技能

### 必需
- 搜索能力：`multi-search-engine` 或 `web_search` 或 `tavily`
- PDF 解析：`pdf` 或 `summarize`

### 推荐
- `browser` - 浏览器自动化（付费论文下载）
- `obsidian` - 笔记管理

---

## 示例对话

**用户**：帮我调研"大模型知识蒸馏"相关论文

**助手**：
> 收到。开始文献调研...
>
> **搜索范围确认**：
> - 关键词：knowledge distillation, large language model, model compression
> - 目标会议：NeurIPS, ICLR, ICML, ACL, EMNLP
> - 时间范围：2025 年至今
>
> 正在搜索 arXiv 和 Google Scholar...
>
> **找到 47 篇相关论文**，按相关性排序前 10：
> 1. [2501.xxxxx] Efficient Knowledge Distillation for LLMs
> 2. [2412.xxxxx] Distilling Reasoning from Large to Small Models
> ...
>
> 请选择要深入分析的论文（输入序号，或"全部"）

---

## 更新日志

- **v1.0.0** (2026-03-26): 初始版本