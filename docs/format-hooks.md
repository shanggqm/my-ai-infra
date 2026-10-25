# 复用项目格式化脚本

`mai init` / `mai sync` 检测项目根目录已有的格式化配置。检测到配置时安装内置 `my-format` Hook，并为所选工具合并原生注册。在主 Agent 一轮任务结束时，Hook 重新检测配置，尝试执行项目已有的格式化脚本。`plan`、`doctor` 和初始化过程均不执行格式化。

没有根目录配置时跳过此资产；有配置但没有脚本时，安装后的 Hook 正常退出。不会创建 Prettier、Ruff 等格式化配置，不添加 package scripts，不安装格式化器，也不向项目规则注入格式化正文。配置和脚本新增后可运行 `mai sync`；已安装的 Hook 会在下一次事件中重新检测脚本。

## 检测范围

只检查目标项目根目录，不向父目录查找，不扫描 monorepo 子项目，不加载或执行 JS / TS 格式化配置。配置文件与入口脚本必须是项目内普通文件，目录和文件软链接均跳过。

| 工具或语言 | 识别依据 |
|---|---|
| Prettier | `.prettierrc` 及常见 JSON / YAML / TOML / JS / TS 变体、`prettier.config.*`、`package.json` 的 `prettier` 字段 |
| Biome | `biome.json`、`biome.jsonc` |
| Python | `ruff.toml`、`.ruff.toml`、`.style.yapf`；`pyproject.toml` 中 Black / Ruff / YAPF / autopep8 节；`setup.cfg` 的 YAPF / autopep8 节 |
| Rust | `rustfmt.toml`、`.rustfmt.toml` |
| C / C++ | `.clang-format`、`_clang-format` |
| JVM | `.scalafmt.conf`；`pom.xml` 的 Spotless / fmt / formatter 插件；Gradle 的 Spotless / google-java-format 插件声明 |
| Go | `.golangci.yml` / `.golangci.yaml` 的 `formatters` 节 |
| Swift / Lua / dprint | `.swiftformat`、`stylua.toml` / `.stylua.toml`、`dprint.json` 等常见变体 |
| 通用 | `.editorconfig` |

这是候选配置检测，不代表配置内容有效，也不代表项目安装了对应格式化器。仅有 `go.mod`、`Cargo.toml`、普通 `pyproject.toml` 或 lint 配置不触发安装。

## 执行入口

按以下顺序选择一个入口，脚本保持仓库定义的参数和格式化范围；全仓格式化脚本也可能修改已有未提交文件。不会自行添加文件参数或改写脚本。

1. `package.json` 的 `scripts.format`、`scripts.fmt`、`scripts["format:write"]`。根据 `packageManager` 或 pnpm / Yarn / Bun 锁文件选择包管理器，缺省 npm；使用 `run <脚本名>`。
2. `scripts/format.mjs`、`scripts/format.js`、`scripts/format.cjs`、`scripts/format.sh`、`scripts/format.py`、`scripts/fmt.mjs`、`scripts/fmt.sh`、`format.sh`、`fmt.sh`。
3. GNUmakefile / makefile / Makefile 中显式定义的无参数 `format` / `fmt` 目标。
4. justfile / Justfile / .justfile 中显式定义的无参数 `format` / `fmt` recipe。

`format:check`、lint、test 不作为回退。通过固定名称识别入口，不运行 Make / Just 来枚举任务。找不到包管理器、Bash、Python、Make 或 Just 时跳过。Hook 自身不调用下载或安装命令，并禁用 Corepack 联网、为 npm 设置离线模式；仓库脚本本身的行为由项目维护者负责。

脚本以项目根目录为工作目录。注册命令引用安装时的项目绝对路径，支持从子目录启动宿主；移动或复制项目后执行 `mai sync` 更新注册。

## 宿主注册与诊断

| 工具 | 配置文件 | 事件 |
|---|---|---|
| Codex | `.codex/hooks.json` | `Stop` |
| Claude Code | `.claude/settings.json` | `Stop` |
| Cursor | `.cursor/hooks.json` | `stop` |
| GitHub Copilot | `.github/hooks/my-ai-infra-format.json` | `Stop` |

配置适配只增删 `my-format` 的注册，保留其他设置和 Hook；JSON 文件发生变更时使用两空格缩进。重复同步不追加重复条目。JSON / 结构 / 版本不支持、配置为链接、受管 Hook 被用户修改时保留现场并报告未完成，`replace` 也不覆盖这些共享配置。JSONC 共享配置需要用户先整理成标准 JSON 才能自动合并。

格式化配置被移除后，运行 `sync` 撤回本资产的注册；其他 Hook 和设置保留。取消工具沿用现有工具目录归档规则，GitHub 下仅撤回本 Hook 的注册与脚本链接。

CLI 的 `formatting` 显示 `no-config`、`no-script` 或 `ready`，附检测依据和命令来源。`discovery` 同时检查脚本与注册文件。`ready` 仅表示装配就绪，`hostVerified` 保持 `false`；宿主开关、信任、权限和版本仍决定实际执行。Codex 需要在 `/hooks` 中审核并信任新 Hook。`setup` 不安装此项目专用 Hook。

事件契约参考：[Codex](https://learn.chatgpt.com/docs/hooks)、[Claude Code](https://code.claude.com/docs/en/hooks#stop)、[Cursor](https://cursor.com/docs/hooks#stop)、[Copilot](https://docs.github.com/en/copilot/reference/hooks-reference)。适配使用当前公开的命令 Hook 格式，实际产品内调度需分别验收。

## 运行与恢复

脚本执行最多 20 秒，原生 Hook 超时为 30 秒；失败或超时输出诊断并正常结束，不请求模型继续。脚本 stdout 不会被解释为宿主 Hook 指令。宿主显式报告的规划模式（`permission_mode: plan`）、递归调用、已续跑的 Stop、已知子任务、Cursor 错误/取消事件均跳过。

同一项目通过 `.my-ai-infra/format.lock` 防止多个宿主同时格式化，正常结束和失败均释放锁。宿主强制终止进程可能遗留锁，后续 Hook 会跳过；确认没有格式化进程后再手动移除该目录。Hook 不建立后台服务。

验收使用隔离临时项目：`node --test test/format-hook.test.mjs`。测试覆盖真实安装后脚本执行、四种注册、配置保留、重复同步、预览过期、缺入口、链接边界、并发和超时；安装包验收另外执行 `npm run release:check`。
