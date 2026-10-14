---
name: "my-create-worktree"
description: "为当前 Git 仓库创建独立 worktree 与开发分支，明确基线并在分支、目录或基线冲突时让用户选择。用于创建 Git 工作区、隔离分支或并行开发。"
compatibility: "需要已有提交的 Git 工作区、支持 worktree list --porcelain -z 的 Git，以及 Bash 3.2+；适用于任意项目技术栈。"
metadata:
  author: "andy"
  source: "assets/skills/my-create-worktree/SKILL.md"
---

# 创建 Git 工作区

为当前 Git 仓库创建独立分支与工作区。创建范围限于 Git 操作，各技术栈均按同一 Git 流程处理。

## 前置条件

- 目标为已有提交的 Git 工作区，Git 支持 `worktree list --porcelain -z`，Bash 版本为 3.2+。

## 工作流

### Step 1：读取上下文

- 读取目标项目 README、适用的 AGENTS 与工作区约定。

### Step 2：确定目标与基线

- 从用户请求确定目标仓库、分支名与可选目录名。命名遵循项目规范；信息足够时直接执行。
- 用户指定基线时使用该 ref；否则以调用工作区当前 HEAD 的提交为基线。在已有 worktree 内调用，也保持这个含义。primary checkout 仅用于确定新工作区的兄弟目录位置。
- 未提交修改不在 HEAD 中。用户要求携带未提交工作，或请求、项目约定和当前分支状态相互冲突时，先说明具体差异，让用户选择基线或携带方式。保留原工作区，未经选择不 stash、提交、重置或切换分支。

### Step 3：创建工作区

- 从目标仓库的工作区调用本 Skill 自带的 [创建脚本](scripts/create-worktree.sh)：

```bash
bash <本Skill所在目录>/scripts/create-worktree.sh --branch "codex/my-feature"
bash <本Skill所在目录>/scripts/create-worktree.sh --branch "codex/my-feature" --dir "project feature" --base "main"
```

- `--branch`：必填，目标本地分支名；默认创建新分支。
- `--dir`：可选，primary checkout 旁的单个目录名，支持空格；默认 `<仓库名>-worktree-<分支末段>`。
- `--base`：可选，起始分支、标签或提交；省略时固定调用工作区当前 HEAD。
- `--reuse-existing`：仅在用户明确选择复用已有分支后使用。省略 base 时复用该分支现有提交，显式 base 必须与之相同。

- 脚本先检查参数、分支、目标目录和基线，再通过 Git 创建工作区。

> 脚本不建立 `.env`、MCP、IDE 配置或依赖目录软链，不执行依赖安装、项目初始化、联网更新或编辑器启动命令。目标基线已经追踪的文件和链接由 Git 正常检出，保持原样。

### Step 4：处理冲突与错误

- 退出码 `2` 表示需要选择的冲突，退出码 `1` 表示参数或执行错误。
- 遇到冲突，说明冲突对象及影响，让用户选择；已有明确选择时按其执行。

> 不要自动改名、复用、删除、prune 或强制重试。

- **目标分支已存在**：用户可选择新分支名，或明确复用该分支后以 `--reuse-existing` 重试。
- **分支已在其他工作区检出**：用户可使用该工作区，或选择新分支。
- **已有分支与显式 base 不同**：用户可保留已有分支，或从指定 base 创建另一个分支；不移动已有分支来消除冲突。
- **目标路径或 Git 登记已存在**：用户可使用现有工作区、选择新目录或另行处理异常登记；脚本保留现场。
- **Git 创建失败**：报告原始错误并检查是否留下分支或目录，不声称完成，不自动进行破坏性清理。

### Step 5：收尾

- 成功后报告工作区绝对路径、分支和实际基线提交。
- 工作区创建成功只证明 Git 操作完成，不能写成项目已可构建或测试。

## 下一步

用户同时要求环境准备时：

- 在新工作区读取项目文档和配置，选择其真实工具与命令。
- Python、Go、JavaScript 项目可能采用不同的依赖和环境流程；不凭单个文件或本机工具是否安装决定。
- 命令或环境选择存在实质冲突时，让用户选择。
- 分别记录环境准备的执行与结果。安装失败不影响工作区已创建这一事实。
