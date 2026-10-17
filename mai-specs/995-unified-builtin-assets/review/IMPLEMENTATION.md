# 实现与验证记录

日期：2026-10-17。范围：统一内置资产的读取、来源标记、历史副本迁移和 runtime 刷新。

## 实现

- `src/assets.mjs` 为 Agent 与扩展资产提供统一来源解析；直接读取包内资产，历史受管副本只作为待备份输入。Skill 保留其别名和退役名称兼容规则。
- `src/store.mjs` 不再向个人资产生效目录复制内置内容；写入流程完整备份旧副本，并原子替换 runtime 的全部 assets，替换失败恢复旧目录。
- CLI / Web 共用装配和编辑限制；plan 与 apply 展示 assetMigrations，内置 Prompt / Agent / Hook 等正文拒绝保存。
- 项目定制保持现有 merge / replace / abort 规则；个人新增资产保持独立，项目运行规则仍由项目维护。

## 验证结果

- `npm run verify` 通过：唯一源检查、源码语法与空白检查、资源与文档校验、233/233 自动回归。
- `npm run test:web` 通过：内置 Skill / Prompt / Agent 来源与只读状态、个人新增、预览应用、冲突保留、取消工具及多视口检查。
- 完成 verify 后，通过 `npm exec --offline -- node scripts/release-check.mjs` 执行 release:check 的实际打包安装阶段，12 项通过。包括安装包直接 init 更新历史 Prompt、四工具适配、重复同步、个人资产升级隔离及卸载重装持久化。
- 实际包校验 SHA-256：`d8a5291d1c8595625f7b831a59282d42ee199e8962795b36bae82443f8ef2940`。该包仅用于本地验收，未发布；当前源码版本号仍为 0.0.11。
- 新增的发行验收脚本改动另经 `npm run lint` 通过；`git diff --check`、Feature 布局检查及受影响文档链接检查通过。
- 父课程仓库 `npm test`：1/1 通过。

本次测试全部使用隔离目录，未操作真实个人库与其他项目的 AI 资产。未新增独立模型对话评测，也未重新运行 Codex / Claude 客户端发现检查；本次验证范围为资产装配、编辑限制及分发行为。
