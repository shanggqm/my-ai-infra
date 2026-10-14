# 个人长期记忆

`0.0.4` 新增个人记忆能力。用途是保留稳定、可执行的个人协作偏好，减少重复纠正。团队规范、项目事实、任务状态与完整对话仍由各自权威来源维护。

## 开始使用

从当前源码安装或运行工具，再对指定项目同步新增的 my-create-memory Skill。新项目 CLI 初始化默认包含全部 10 个 Skill；已有项目不会自动增加选择。

```bash
node bin/my-ai-infra.mjs init --project /path/to/repo --tools codex --yes
node bin/my-ai-infra.mjs web --project /path/to/repo
```

已有项目在 Web 的“项目配置”中保留原选择，勾选 my-create-memory，预览后应用。完成后可以说：“用 my-create-memory 记住，以后在这个项目做技术设计，先给满足当前验收的最小方案。”

setup 会在选中 my-create-memory 时安装全局入口，绑定指定个人库的稳定 runtime。支持工具和项目副本沿用当前资产分发机制；真实产品内的子任务调度取决于宿主能力，不保证任意自由对话自动提炼。

## 存储与项目身份

```text
~/.my-ai-infra/
├── memory.md
└── projects/
    └── <projectId>/
        ├── PROJECT.md
        └── memory.md
```

所有记忆正文是 Markdown，每个范围一个文件。全局文件只保存用户明确要求跨项目适用的偏好；项目中产生的偏好默认归当前项目。没有值得保存的内容就不生成文件；无 INDEX 和主题子目录。

首次保存项目记忆前运行 `memory bind --project PATH`。项目必须已初始化，命令给 `.my-ai-infra.json` 增加稳定 projectId，并在个人库登记 PROJECT.md。`plan` / `sync` 保留 ID；移动仓库目录后按 ID 找到原记忆。读取不更新绑定文件里的最后登记路径；再次 bind 可以更新它。主工作树已绑定时，其 worktree 可复用 ID；独立 fork 用 `--project-id new` 分离，原记忆保留。重新 clone 后如未携带 ID，使用 `--project-id <已有ID>` 显式重绑定，不凭 remote 或目录名自动合并。

支持 `--home` 和 `MY_AI_INFRA_HOME`。个人记忆不进入资产清单、runtime 包、项目同步或 npm 分发。MVP 无跨机器同步、向量库、常驻后台服务和会话历史扫描。

## 提炼与防膨胀

[my-create-memory](../assets/skills/my-create-memory/SKILL.md) 统一负责准入、提炼、去重、修订与写入：

- 宁缺毋滥：个人性、复用价值、可执行行为、用户依据四项同时成立才考虑保存。
- 用户明确长期表达直接 approved；有充分价值但长期意图未明确的推断进入 inbox；弱信号和临时要求跳过。用户沉默和一次失败不构成偏好。
- 同一决策点优先修订原条目；重复派发不追加来源、不刷新日期、不新增条目。不同措辞的语义去重由 Skill 判断，runtime 检查重复 ID、Key 和相同正文。
- Skill 每次最多新增 2 条，其中最多 1 条推断候选，无最低产量。此项属于行为约定；runtime 不读取完整会话，无法独立统计跨调用的会话新增数。
- 每个文件最多 30 条 approved、5 条 inbox、40 条总记录，最多 20000 字符；每条正文最多 800 字符。runtime 强制校验。达到上限先合并整理，无法有据精简就跳过，不自动淘汰旧偏好。

这些数量是 MVP 的保守工程上限，可依据真实使用和评测修订。人工确认、停用、删除均在同一文件中操作。MVP 不保留旧正文的历史副本；删除后不从缓存恢复。外部备份和宿主会话记录需在各自系统处理。

## 读取与解释

`memory recall --project PATH --scene design` 只读取全局和当前项目的 approved 条目；场景匹配后，同 Key 的项目偏好优先。默认 2400 字符预算，整条保留条件与边界，超预算条目返回排除原因。`--query TEXT` 仅排序，不能绕过项目、状态和场景过滤。

场景：feature、prd、design、design-review、test-plan、implement、code-review、delivery；all 用于跨场景协作偏好。当前明确要求、团队硬约束与宿主权限继续适用，记忆不能扩大操作授权。

## 管理与并发

Web“个人记忆”提供项目/全局切换、Markdown 编辑、候选确认、停用、删除与命中预览。切换项目或范围时保护未保存内容；保存校验 revision，拒绝覆盖其他会话的新修改。

CLI 支持 `memory get / recall / bind / put / save / delete`。完整格式和示例以 [Markdown 与命令契约](../assets/skills/my-create-memory/references/storage.md) 为准。字段顺序固定以便无第三方依赖解析；人工编辑需保留格式，格式错误会拒绝写入。

SDD 开始时读取当前场景偏好。出现明确长期表达、修订或高价值纠正时，按 [SDD 接入约定](../assets/skills/my-create-memory/references/sdd-integration.md) 委派独立子任务。主任务继续，子任务按锁与 revision 提交；子任务中的 SDD 只回传证据，不递归派发。没有新证据不启动抽取。宿主不支持并发时明确顺序降级，不能把任务启动当成保存完成，也不能声称会话关闭后仍在后台执行。

## 验证

`node --test test/memory.test.mjs` 覆盖只读、格式与上限、项目迁移、worktree、同步保留、并发冲突、重复、项目隔离、预算、CLI、Web 和自定义个人库。Skill 准入判断另用 [行为案例](../assets/skills/my-create-memory/evals/cases.md) 验证；代码检查不能证明语义提炼正确。
