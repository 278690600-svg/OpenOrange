# OpenOrangeAI 贡献指南 (Contributing Guide)

感谢您对 OpenOrangeAI 项目的关注与支持！我们欢迎来自社区的各种贡献，包括但不限于提交 Bug 报告、提出新功能需求、完善文档以及提交代码。

---

## 🛠️ 本地开发环境准备

1. **环境依赖**：
   - Node.js 18+ 或 20+
   - npm 或 pnpm
   - Git

2. **克隆并安装**：
   ```bash
   git clone https://github.com/278690600-svg/OpenOrange.git
   cd OpenOrange
   npm install
   ```

3. **数据库初始化**：
   ```bash
   npx prisma db push
   ```

4. **启动开发服务**：
   ```bash
   npm run dev
   ```

---

## 🧪 测试与质量规范

在提交代码前，请确保通过以下检查：

```bash
# 运行单元测试
npm test

# 检查代码规范与类型
npm run lint
```

---

## 🔀 分支与提交规范 (Git Flow)

1. 从 `main` 分支切出您的开发分支：
   - 特性分支：`feature/your-feature-name`
   - 修复分支：`fix/your-bug-fix`
   - 文档分支：`docs/your-doc-change`
2. 提交信息规范（推荐 Conventional Commits）：
   - `feat: 添加 PPT 导出新主题`
   - `fix: 修复表格公式解析异常`
   - `docs: 更新部署文档`
3. 发起 Pull Request 时请填写完整的 PR 模板并关联相应的 Issue。
