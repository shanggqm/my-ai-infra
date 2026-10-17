# 999 方案评审

[简报](../BRIEF.md) · [PRD](../spec/PRD.md) · [方案](../design/TECH_DESIGN.md)

## 范围与依据

本次检查 project.plan/apply/doctor、assets.addExtensions/parsePrompt、store.setup、conflicts.resolveConflicts、现有 prompts/flat-layout 测试及四宿主官方资料。基线见方案；未调用真实业务模型。

## 首轮发现与修正

- Warning / 阻塞：仅新增 Codex wrapper、保留 Cursor/Copilot 旧命令可能形成同名多入口。已修订为共享 Skill + Claude command，移除受管旧入口，回归验证。
- Warning / 阻塞：入口存在无法证明正文可读，正文父目录被跳过时需要依赖传播。方案已增加依赖跳过及旧入口保护。
- Warning / 阻塞：global setup 当前保留旧记录，迁移必须显式处理旧 Prompt 别名，且校验完整后再写入。已加入 T1。
- Warning / 非实现阻塞：四宿主实际菜单/调用证据尚未取得，影响整体交付验收，不能由文件测试替代。

## 复评结论

可进入实现。AC-01/02/03/06 → T1/T3；AC-04 → 既有 CLI/打包回归与 T3；AC-05 → T2/T4；AC-07 → T3/T4。核心设计缺口已补齐，实施中核对冲突与依赖语义。此结论为方案评审建议；宿主验收条件继续保留。

## 实测后复评

Cursor 3.24.18 实测发现 Claude commands 和共享 Skill 同名重复。实现前候选“共享 Skill + Claude command”已被运行证据否定；方案现统一 Skill 格式，Claude 链接同一 SKILL.md。实测菜单去重、只读 Probe 返回预期标识，修订满足原范围。进入代码复评，保留尚未完成的 Claude 登录/Copilot 宿主验收。
