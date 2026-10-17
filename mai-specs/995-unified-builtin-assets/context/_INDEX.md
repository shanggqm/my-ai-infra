# 上下文索引

- 用户报告：0.0.11 初始化未使用发行包中的最新 my-init-repo-memory.md。
- 排查证据：包内、全局 npm 安装与 runtime 的 Prompt 相同；旧个人库 assets/prompts 副本优先于包内容，init 默认不更新该副本。
- 用户决策：Prompt、Agent、Skill、Hook 等全部内置资产，在 init 中沿用一致的覆盖逻辑。
- 实现边界与验收见 [BRIEF](../BRIEF.md)；测试均使用隔离目录。
