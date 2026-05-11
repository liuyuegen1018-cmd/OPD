---
name: "theory-formalization"
description: "理论形式化子技能。支持假设生成、数学推导、定理证明、可检验推论。触发：理论推导、形式化、证明、数学建模。"
---

# Theory Formalization - 理论形式化

## 触发条件

- "理论推导"、"数学推导"、"形式化"
- "证明"、"定理"
- "假设"、"研究假设"
- "建立理论框架"
- 主协调器 `research-assistant` 调用

---

## 输入

从上一阶段获取：
- **研究空白清单** (Gap List)
- **研究问题陈述**
- **现有方法总结**

---

## 工作流程

### Step 1：问题重述

**将研究问题转化为数学优化问题**

模板：
```markdown
## 问题形式化

### 非形式化描述
{用自然语言描述研究问题}

### 符号定义
| 符号 | 含义 | 定义域 |
|------|------|--------|
| $\mathcal{X}$ | 输入空间 | ... |
| $\mathcal{Y}$ | 输出空间 | ... |
| $f_\theta$ | 模型/函数 | $\mathcal{X} \to \mathcal{Y}$ |
| ... | ... | ... |

### 形式化定义
**问题**：给定 {条件}，求解 {目标}

$$
\min_{\theta} \mathcal{L}(\theta) = \mathbb{E}_{(x,y) \sim \mathcal{D}} [\ell(f_\theta(x), y)]
$$

**约束条件**：
- {constraint_1}
- {constraint_2}
```

---

### Step 2：生成候选假设

**基于 Gap List，生成 2-3 个候选理论方向**

```markdown
## 候选理论方向

### 方向 A: {direction_name}

**核心假设**：
{hypothesis}

**理论依据**：
{theoretical_basis}

**预期贡献**：
- {contribution_1}
- {contribution_2}

**可行性评估**：
| 维度 | 评分 | 说明 |
|------|------|------|
| 新颖性 | ⭐⭐⭐⭐⭐ | ... |
| 可形式化 | ⭐⭐⭐⭐ | ... |
| 可验证性 | ⭐⭐⭐⭐⭐ | ... |

---

### 方向 B: ...
```

**决策**：用户选择一个方向深入

---

### Step 3：数学推导

**在 `02_theory/derivation/` 中详细记录推导过程**

#### 3.1 假设陈述

```markdown
## 假设

**假设 1 (H1)**: {assumption_1}

**假设 2 (H2)**: {assumption_2}

**合理性讨论**：
- H1 的合理性：{justification}
- H2 的合理性：{justification}
```

#### 3.2 定理与证明

```markdown
## 主要定理

### 定理 1: {theorem_name}

**陈述**：在假设 H1, H2 下，有：

$$
\text{令 } \theta^* = \arg\min_\theta \mathcal{L}(\theta), \text{ 则 } \{\text{结论}\}
$$

**证明**：

*Step 1*: {derivation_step_1}

$$
\{\text{推导过程}\}
$$

*Step 2*: {derivation_step_2}

$$
\{\text{推导过程}\}
$$

...

*证毕*。 ∎

---

### 引理 1: {lemma_name}

**陈述**：{lemma_statement}

**证明**：{proof}
```

#### 3.3 推论

```markdown
## 推论

### 推论 1: {corollary_name}

由定理 1 可直接推出：

$$
\{\text{推论内容}\}
$$

**实验验证方法**：
{how_to_verify_experimentally}
```

---

### Step 4：算法伪代码

```markdown
## 算法

### 算法 1: {algorithm_name}

**输入**: {inputs}
**输出**: {outputs}
**参数**: {hyperparameters}

```
1: 初始化 θ₀
2: for t = 1, 2, ..., T do
3:     计算梯度 g_t = ∇_θ L(θ_{t-1})
4:     更新参数 θ_t = θ_{t-1} - η g_t
5:     if 收敛条件满足 then
6:         break
7:     end if
8: end for
9: return θ_T
```

**复杂度分析**：
- 时间复杂度: O(?)
- 空间复杂度: O(?)
```

---

### Step 5：与现有工作对比

```markdown
## 与现有工作对比

| 方法 | 理论框架 | 假设 | 优点 | 局限 |
|------|----------|------|------|------|
| 方法 A | {framework} | {assumptions} | ... | ... |
| 方法 B | ... | ... | ... | ... |
| **本文方法** | {our_framework} | {our_assumptions} | ... | - |

**本文方法的理论优势**：
1. {advantage_1}
2. {advantage_2}
```

---

### Step 6：可检验推论清单

**输出**：`02_theory/testable_implications.md`

```markdown
# 可检验推论

## 推论 1: {implication_1}

**理论预测**：
{what_theory_predicts}

**实验验证方法**：
- 数据集：{dataset}
- 对比方法：{baselines}
- 评估指标：{metrics}
- 预期结果：{expected_result}

## 推论 2: ...

## 推论 3: ...
```

---

## 输出清单

| 产出物 | 路径 |
|--------|------|
| 初步思路 | `02_theory/drafts/` |
| 数学推导 | `02_theory/derivation/` |
| 最终理论 | `02_theory/theory_final.md` |
| 可检验推论 | `02_theory/testable_implications.md` |

---

## 数学符号规范

遵循 `research-assistant/references/math_notation.md`

常用符号：
- 集合：$\mathcal{X}, \mathcal{Y}, \mathcal{D}$
- 参数：$\theta, \phi, w$
- 函数：$f_\theta, \mathcal{L}, \ell$
- 分布：$P, p, \mathbb{E}$

---

## 推导原则

### 严谨性原则

1. **假设明确**：每个假设都要清晰陈述
2. **引用有据**：引用已有定理时标注来源
3. **步骤完整**：不跳过关键步骤
4. **边界清晰**：明确结论的适用范围

### 可读性原则

1. **直观解释**：每个公式配文字说明
2. **符号一致**：全文使用统一符号
3. **结构清晰**：分步标注
4. **图表辅助**：复杂推导配示意图

---

## 依赖技能

### 无必需依赖

本技能主要进行逻辑推理和数学推导，不依赖外部工具。

### 辅助工具
- `mermaid-diagrams` - 绘制理论框架图
- LaTeX 编辑器 - 公式排版（用户本地）

---

## 示例对话

**用户**：基于 Gap List，帮我推导一个统一的理论框架

**助手**：
> 收到 Gap List，共 3 个研究空白。
>
> **生成候选方向**：
>
> ### 方向 A：基于变分推理的统一框架
> - 假设：大小模型协作可建模为变分推断问题
> - 理论依据：VAE 理论、信息论
> - 新颖性：⭐⭐⭐⭐⭐
>
> ### 方向 B：基于博弈论的模型选择
> - 假设：大小模型协作是合作博弈
> - 理论依据：博弈论、机制设计
> - 新颖性：⭐⭐⭐⭐
>
> ### 方向 C：基于最优控制的调度理论
> - 假设：调度问题可建模为最优控制
> - 理论依据：控制理论、强化学习
> - 新颖性：⭐⭐⭐
>
> 请选择一个方向深入推导（输入 A/B/C）

---

## 更新日志

- **v1.0.0** (2026-03-26): 初始版本