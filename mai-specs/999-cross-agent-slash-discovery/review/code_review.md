# 999 代码评审与复评

[简报](../BRIEF.md) · [PRD](../spec/PRD.md) · [设计](../design/TECH_DESIGN.md) · [证据](../test/EVIDENCE.json)

## 范围与基线

HEAD 为 f4861bf017bf6dc793c658cfc7c34c16d90ac4e4。本次审查当前工作区，已读取 staged/unstaged/untracked 状态；既有 0.0.8 改动保留。以任务开始时的隔离文件快照作为 Feature 增量基线，审查 assets/project/store/conflicts、discovery、terminal、测试及发布检查。新增文件内容已纳入，文件 SHA-256 见证据。未创建提交或更改父仓库。

## 结论

源码实现复评通过；交付验收仍有宿主证据阻塞。当前未发现范围内尚未修复的实现缺陷。此结论限定于代码、自动化检查及已实测宿主，不代表四工具全部验收完成。

## 发现与修正

| 级别 | 触发与影响 | 位置与修正 | 复评证据 |
|---|---|---|---|
| Warning，原阻塞 | Cursor 同时扫描 Claude commands 和共享 Skill，同名 Prompt 出现两次 | assets.promptTargets/addExtensions 统一 Skill 格式，Claude 链接共享入口；迁移 commands | Cursor 菜单实测三个 Prompt 各一次，只读 Probe 调用通过 |
| Warning，原阻塞 | 本地存在不同内容的生成入口，merge 保留后仍移除旧命令，失去原可用入口 | conflicts.resolveConflicts 对 requires 入口冲突标 skip，并传播到适配链接/旧入口移除；保留候选 | discovery.test 同名文件、阻塞正文、替换重试测试通过 |
| Warning，已修正 | 旧清单式 Prompt 正文名包含 # 或括号，Markdown 引用被截断 | assets.renderPromptSkill 按路径段编码特殊字符 | 特殊文件名引用测试通过 |
| Warning，交付阻塞 | Claude 实际调用未登录；Copilot Chat 环境不可用 | 保持待验，不更改验收条件 | Claude 返回 Not logged in；VS Code 扩展清单仅 copilot-labs |

## 验收映射

- AC-01：统一 Prompt Skill、已有 Skill/Agent 原生适配；ChatGPT/Codex 和 Cursor 发现及只读调用通过，Claude 发现通过，剩余宿主调用待验。
- AC-02：唯一正文、相对路径、资源文件名、移动与定制回归；Cursor/Codex Probe 实际加载正文通过。
- AC-03/06：项目及全局受管旧入口迁移、候选备份、父链接保护、冲突跳过与失败回滚；现有与新增测试通过。
- AC-04：既有 cwd/--project/中文空格路径测试、最终包 init/sync/doctor 通过。
- AC-05：discovery 清单涵盖四工具与资产类型，ready/needs-sync/configuration-required/unsupported、hostVerified=false；终端中文状态通过。
- AC-07：隔离源码副本运行 release:check（包含 verify），212 项测试通过；最终安装包由真实 Codex 与 Claude 初始化接口验证，详情见证据。

## 限制与下一步

需完成 Claude 登录后的只读调用和 VS Code Copilot 的菜单/调用验证；保持需求 review，禁止标记 done。新增或修改的 Hook/MCP 仅表示配置文件已装配，实际事件/服务器注册仍需宿主设置。当前全局发布包仍为原 0.0.8，本次源码未发布。
