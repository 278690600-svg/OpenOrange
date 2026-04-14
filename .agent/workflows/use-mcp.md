---
description: 如何使用 MCP (Model Context Protocol) 扩展功能
---

# MCP 服务器使用手册

本工作流指导您如何在 OpenOrangeAI 中配置和使用 MCP 服务器，包括数据库接入和网页自动化。

## 1. 进入 MCP 配置
1. 点击侧边栏底部的 **设置 (Settings)** 图标。
2. 切换到 **MCP** 标签页。
3. 您可以在 "My Servers" 中查看已安装的服务器，在 "Market" 中搜索新服务器。

## 2. 接入 Prisma/SQLite 数据库
我们已预置了 "Prisma DB (Current Project)"。
1. 在 MCP 列表中找到该服务器。
2. 确认其参数为 `npx -y @modelcontextprotocol/server-sqlite --db ./prisma/dev.db`。
3. 点击 **复选框** 启用它。
4. 点击 **CheckCircle2 (测试按钮)** 验证连接：
   - 绿色表示连接正常，并会列出发现的表操作工具。
   - 红色表示路径错误或数据库锁定。

## 3. 在对话中使用
MCP 工具是 **自动加载** 的，无需特殊触发词。
- **查询数据库**：直接问 "帮我看看数据库里有多少个聊天记录？"
- **搜索网页**：直接问 "搜索一下最新的 AI 新闻" (需启用 DuckDuckGo)。
- **网页自动化**：问 "访问 google.com 并截图" (需启用 Playwright)。

## 4. 故障排除
- **状态灯灰色/红色**：点击测试按钮查看错误。
- **记录不显示**：可能是由于应用运行模式（如 Turbopack 冲突）导致，请确保在 Webpack 模式下运行。
- **工具未触机**：在对话中通过 `@mcp` 被迫启用旧逻辑（虽然现在已不再需要，但可作为备选）。
