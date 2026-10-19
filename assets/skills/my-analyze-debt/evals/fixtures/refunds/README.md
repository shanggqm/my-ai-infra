# Refund sample

这是用于行为评测的构造项目，所有政策和标识均为演示数据。

当前政策见 [POLICY.md](POLICY.md)。`app.mjs`、`support.mjs` 分别服务零售 App 和客服；`enterprise.mjs` 服务企业合同。它们只计算是否可退款，不产生资金副作用。`schema.json` 是客户端模型唯一维护源，`generated/` 文件由该源生成。

本地检查使用 Node.js 22+，无依赖安装：

```bash
node --test refund.test.mjs
```

此项目没有提供部署环境、事故记录、负责人或团队交接资料。
