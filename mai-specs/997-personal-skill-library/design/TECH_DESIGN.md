# 内置与个人 Skill 分离

状态：已实现，自动化验收通过。需求见 [BRIEF](../BRIEF.md)，验收见 [测试计划](../test/TEST_PLAN.md)。

## 数据与来源

catalog 统一输出 name、category、origin、readOnly 及 legacyCopies。内置清单决定保留名称与别名，包 assets/skills 提供完整内置源。个人目录只提供 personal；SKILL.md 自报 origin 无效。项目安装不再合并包与个人目录的文件集合。

不另建个人注册表；动态发现目录。默认库按 --home、MY_AI_INFRA_HOME、~/.my-ai-infra 解析。运行时副本是工具管理的派生发行资源。

## 写入与迁移

asset import 校验完整 UTF-8 文本目录，在锁内检查同名，暂存后整体 rename；失败清理暂存。saveAsset 拒绝所有内置名称及别名，个人正文保留 revision 检查和备份。HTTP 复用相同服务端约束。

bundle-state 中有历史 SKILL.md 摘要的内置目录属于迁移候选。只读预览返回候选，写入时整个目录原样移入唯一备份，保留正文、附属文件与路径。无可信记录的同名目录一律报冲突并保留。稳定 runtime 以整目录更新内置 Skill，失败恢复旧目录，内容未变化不重复生成备份。

## 装配与界面

CLI / Web 均从动态 catalog 生成未配置时的默认选择。默认文件的 allSkills: true 记录自动发现模式，工具偏好修改保留此模式；显式 Skill 清单与项目配置优先，--skills 可覆盖；sync 保留项目选择。Web 列表与项目选择显示来源，内置正文只读、保存禁用，旧副本显示迁移提示；CLI JSON、终端与 Web 应用结果提供备份路径。

## 范围

其他资产类型沿用现有规则。第一版复用导入入口，不增加 contribute 或三方合并，不自动更新其他项目，不提供卸载时的个人库清理。
