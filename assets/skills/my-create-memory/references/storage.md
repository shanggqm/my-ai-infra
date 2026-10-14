# Markdown 与命令契约

从本 Skill 目录调用 `node scripts/my-ai-infra.mjs`。下面用 `my-ai-infra` 简写。所有命令可携带 `--home PATH`，默认读取 `MY_AI_INFRA_HOME` 或 `~/.my-ai-infra`；使用自定义库时子任务始终传入同一路径。

- 全局：`<home>/memory.md`。
- 项目：`<home>/projects/<projectId>/memory.md`，旁边的 `PROJECT.md` 记录绑定。
- 项目 ID 在 `.my-ai-infra.json` 中持久保存，sync 保留它。移动目录后沿用 ID；worktree 可以读取主工作树绑定。独立 fork 使用 `memory bind --project PATH --project-id new`。已有项目显式重绑定使用已存在的 ID。
- 不创建 INDEX、preferences、inbox 子目录，不向项目内分发个人记忆。状态在条目中维护。

## 读取与写入

```bash
my-ai-infra memory get --project /path/to/repo
my-ai-infra memory get --scope global
my-ai-infra memory recall --project /path/to/repo --scene design
my-ai-infra memory bind --project /path/to/repo
my-ai-infra memory put --project /path/to/repo --file /tmp/entry.md --revision <get返回的revision>
my-ai-infra memory save --scope global --file /tmp/memory.md --revision <get返回的revision>
my-ai-infra memory delete pref-example --project /path/to/repo --revision <get返回的revision>
```

`get` 返回 content、entries、revision，未建立文件时 revision 为 `missing`。`put` 接收含一个条目的 Markdown 文档，按 ID / Key 修订或新增；`save` 用于人工全文件编辑；`delete` 按 ID 彻底移除条目。全局写入加 `--scope global`。命令输入输出协议可以是结构化数据，磁盘记忆始终为 Markdown。

无新记忆时不调用 bind 或写入。读取不会创建个人目录。独立会话写入使用锁与摘要校验；更新冲突必须重新读取并合并。MVP 不保存包含旧正文的备份或索引副本；删除后工具不会从历史恢复它。外部系统备份、终端和宿主会话记录不在工具的删除范围内。

## 格式

保留以下标题和字段顺序；多条记录在同一个文档中重复二级标题与字段。正文允许普通 Markdown 和三级标题，不使用一级、二级标题。标题最多 80 字符；Source 和 Evidence 各最多 300 字符；正文最多 800 字符。

```markdown
# 个人偏好记忆

## 先给出满足当前需求的最小方案

- ID: pref-minimal-design
- Key: architecture.complexity
- Scenes: design, design-review
- Status: approved
- Basis: explicit
- Source: 用户当前消息；仅在可用时填写真实会话或消息标识
- Evidence: 以后做方案先给最小可行方案。
- Updated: 2026-10-14

先给出满足当前验收的最小方案。新增抽象或中间件时说明当前必要性。
已明确的容量、可靠性和团队约束仍需满足。
```

- ID：稳定条目标识；Key：稳定决策点，均使用小写字母、数字、点或连字符。不得为重复内容改 Key 新增。
- Scenes：`all, feature, prd, design, design-review, test-plan, implement, code-review, delivery` 的非空子集。仅真正跨场景的协作偏好用 all。
- Status：`inbox` 候选、`approved` 生效、`deprecated` 停用。
- Basis：`explicit` 用户明确表达长期偏好、`inferred` 从纠正推断、`confirmed` 用户确认候选。inferred 不能 approved。字段声明由调用者负责提供真实证据，校验器无法证明用户原话真实性。
- Source：来源定位；没有消息 ID 时注明当前用户消息，不能编造。
- Evidence：最小用户原话；不得把模型总结包装成用户原话。

读取时只从全局与当前项目获取 approved 条目，匹配场景，同 Key 的项目偏好优先。`--query TEXT` 只调整相关条目排序，不绕过范围过滤。默认预算 2400 字符，超出时整条排除并解释，不截断边界。宿主仍需根据本次要求和团队规则判断适用性。
