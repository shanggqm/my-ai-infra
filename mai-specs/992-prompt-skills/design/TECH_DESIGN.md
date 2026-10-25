# 992：快捷工作流统一为 Skill

有效需求来源为 [BRIEF](../BRIEF.md) 的 AC-01 至 AC-05 和用户明确的丢弃授权。

## 实现决定

1. 将四个 Prompt 正文直接迁入同名 assets/skills 目录，补全标准元信息及显式调用配置；保留原阶段编排与仓库事实提炼规则。catalog 增加 workflow 分类，使用现有 Skill 读写、选择、装配及宿主适配。
2. 删除 Prompt 解析、导入、编辑、转接生成和专属冲突分支。扩展枚举跳过已停用的 prompts 目录，并拒绝重新导入该类型。
3. retired-prompts 只识别待丢弃路径，不解析旧清单或合并正文。项目识别旧源/入口后补入四个 Skill，强制刷新这四个旧转接文件；新格式后续定制仍按普通 Skill 策略处理。
4. 清理 .agents/prompts、旧嵌套源及原生 prompts 目录。Claude / Cursor commands 仅清理四个内置名与旧 Prompt 源可识别的同名入口；个人生成 Skill 仅在正文仍引用旧 Prompt 时移除，避免误删同名普通 Skill。
5. 项目清理复用现有 inspect、revision、backup、install、restore；整目录按摘要纳入预览，父目录链接阻塞，叶子链接只处理链接自身。个人库写入时直接丢弃停用目录，其他用户资产保持。
6. setup 复用同一清理识别与事务文件操作，在其安装作用域刷新快捷工作流。所有测试使用隔离目录，保留已有格式化 Hook 工作区修改。

## 文件与任务

- 资产与文档：assets/skills、catalog、manifest、README、docs/workflow-skills、阶段契约措辞，关联 AC-01 / AC-02。
- 装配与存储：src/assets、store、project、discovery、retired-prompts，关联 AC-02 / AC-03 / AC-04。
- 验证：workflow-skills、discovery、builtin-assets、flat-layout 等回归；check-web、release-check，关联 AC-01 至 AC-05。

宿主发现与模型执行分别取证。文件检查通过不代表真实模型执行通过。
