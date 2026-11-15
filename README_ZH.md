<div align="center">

# 🍊 OpenOrangeAI

**轻量化、本地优先的 AI 对话与 Office 办公生产力套件**

*一款旨在对标 Open WebUI 与 Microsoft Office 的本地优先 AI 工作台。让用户在单一界面完成智能对话、文档写作、表格分析、PPT 演示与格式转换。*

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README_ZH.md">简体中文</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-核心功能矩阵">功能矩阵</a> •
  <a href="#-开源协议与商业授权">协议与授权</a>
</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/278690600-svg/ClosedUI/pulls)

</div>

---

## 🌟 为什么选择 OpenOrangeAI？

很多现有的 AI 聊天工具只能“聊”，无法直接落地办公产出；而传统的 Office 软件繁重笨拙、缺乏 AI 深度融合。

**OpenOrangeAI** 专为追求极致效率与隐私安全的个人、开发者与研究人员打造：

- 🔒 **100% 本地优先与隐私安全**：对话历史、文档、表格、知识库完全存储在本地 SQLite 中，无需担心数据泄露。
- ⚡ **开箱即用，轻量极速**：基于 Next.js + React 19 全栈构建，单个 Docker 容器即拉即用，超低资源占用。
- 📑 **全套内置 Office 生产力引擎**：无需安装庞大的外部 Office 软件，在浏览器中即可完成 Word、Excel、PPT 的全套编辑与真实文件导出。
- 🔌 **原生 MCP 插件扩展**：全面支持 Model Context Protocol，无缝连接本地文件、数据库与第三方 API。
- 🤖 **全模型生态支持**：零配置接入本地 Ollama、LM Studio，或一键连接 DeepSeek、OpenAI、Claude、Gemini 等云端大模型。

---

## 🆚 功能特性对比

| 核心能力 | OpenOrangeAI | Open WebUI | LibreOffice / MS Office | 传统 Web 聊天 |
| :--- | :---: | :---: | :---: | :---: |
| **本地优先 (Local-First & 离线)** | ✅ | ✅ | ✅ (无 AI) | ❌ |
| **智能文档编辑器 (TipTap + AI)** | ✅ | ❌ | ⚠️ 需昂贵 Copilot | ❌ |
| **电子表格 + 公式引擎 (AG-Grid)** | ✅ | ❌ | ✅ (传统) | ❌ |
| **演示文稿 + 导出真实 PPTX** | ✅ | ❌ | ✅ (传统) | ❌ |
| **多格式批量转换中心 (9种格式)** | ✅ | ❌ | ⚠️ 需手动另存为 | ❌ |
| **客户端多语言 OCR 识别** | ✅ | ❌ | ❌ | ❌ |
| **数据库直连分析 (SQL 自然语言)** | ✅ | ❌ | ❌ | ❌ |
| **MCP (Model Context Protocol)** | ✅ | ⚠️ 基础 | ❌ | ❌ |
| **PWA 桌面级客户端安装** | ✅ | ⚠️ 基础 | ❌ | ❌ |

---

## ✨ 核心功能亮点

### 1. 📝 智能文档编辑器 (Document Editor)
- 基于 **TipTap** 的现代化富文本编辑体验。
- **AI 协同写作**：一键进行续写、润色、摘要、扩写、精简与多语言互译。
- **专业格式支持**：表格、代码块高亮、数学公式 (KaTeX)、引用、待办任务清单。
- **多格式导入与导出**：一键导入 `.docx`，导出为 `.docx`、`.html`、`.md`、`.pdf`。

### 2. 📊 电子表格与数据分析 (Spreadsheet)
- 集成 **AG-Grid** 高性能表格核心与 **HyperFormula** 公式计算引擎。
- 支持列排序、高级条件筛选、动态行列管理与实时公式计算。
- **AI 智能数据洞察**：自然语言提问，AI 自动分析数据趋势并生成可视化图表（柱状图/折线图/饼图）。
- 完整支持 `.xlsx`、`.csv`、`.json` 的双向导入导出与格式转换。

### 3. 🎨 智能演示文稿制作 (Presentation)
- 内置 **6 种专业幻灯片布局**（封面、双栏、重点引用、图文卡片等）与 **5 种精美主题配色**。
- AI 一键根据主题大纲生成完整演示文稿。
- 基于 `pptxgenjs` 导出**原生真实 `.pptx` 文件**，可直接在 PowerPoint / Keynote 中二次编辑。

### 4. 🔄 多格式转换中心 (Conversion Center)
- 支持 `DOCX`、`XLSX`、`PPTX`、`PDF`、`HTML`、`MD`、`TXT`、`CSV`、`JSON` 等常见格式。
- 拖拽式交互，支持多文件并发批量互转与一键打包下载。

### 5. 🔍 客户端 OCR 文字识别
- 基于 **Tesseract.js** 纯前端与服务端双引擎，支持中、英、日、韩等 12+ 种常用语言。
- 图片与识别文本双栏对照预览、文本清洗、置信度分析与一键复制导出。

### 6. 🗄️ 数据库直连与智能分析
- 支持安全直连 **PostgreSQL**、**MySQL**、**SQLite**、**SQL Server** 与 **MongoDB**。
- 自然语言转 SQL 查询、执行并自动生成可视化图表报表。

---

## 🚀 快速开始

### 方式一：Docker Compose 一键运行（推荐）

确保您的机器已安装 [Docker](https://www.docker.com/) 和 Docker Compose。

1. **克隆仓库**：
   ```bash
   git clone https://github.com/278690600-svg/ClosedUI.git
   cd ClosedUI
   ```

2. **一键启动**（包含 OpenOrangeAI 和本地 Ollama）：
   ```bash
   docker compose up -d
   ```

3. 打开浏览器访问：`http://localhost:3000`

---

### 方式二：本地源码运行 (Node.js)

**环境要求**：
- Node.js 18+ 或 20+
- （可选）本地已运行的 [Ollama](https://ollama.com/)

**步骤**：

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **初始化本地数据库**：
   ```bash
   npx prisma db push
   ```

3. **启动开发服务器**：
   ```bash
   npm run dev
   ```

4. 打开浏览器访问：`http://localhost:3000`

---

## ⚙️ 环境变量配置

复制 `.env.example` 为 `.env` 进行自定义配置：

```env
# 本地 SQLite 数据库存储路径
DATABASE_URL="file:./dev.db"

# 本地 Ollama 服务地址 (默认)
OLLAMA_BASE_URL="http://localhost:11434"

# （可选）云端模型服务配置
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1"

# （可选）MCP 服务器端点
# MCP_SERVER_URL="http://localhost:3001"
```

---

## 🗺️ 产品路线图 (Roadmap)

- [x] 核心多轮流式对话与上下文任务管理
- [x] TipTap 智能文档编辑器与 Word 导出
- [x] AG-Grid 电子表格与 HyperFormula 公式引擎
- [x] 幻灯片在线制作与原生 PPTX 导出
- [x] 9 种主流格式批量互转中心
- [x] 多语言客户端离线 OCR
- [x] 多数据库直连与自然语言数据分析
- [x] PWA 桌面端离线支持
- [ ] 协同编辑与多租户权限系统
- [ ] 更多 MCP 社区插件一键安装市场
- [ ] 移动端专属 UI 交互优化

---

## 🤝 参与贡献

欢迎任何形式的贡献！
1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

详情请查看 [贡献指南 (Contributing)](./CONTRIBUTING.md)。

---

## 📄 开源协议与商业授权 (License & Commercial)

- **开源协议**：本项目开源版本遵循 **[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE)** 许可证。个人、非商业使用及开源衍生项目完全免费。
- **商业授权**：如果您或您的企业希望将 OpenOrangeAI 用于闭源商业分发、去除品牌标识、或者规避 AGPL 协议的开源传染义务，请联系获取 **[商业授权许可证 (Commercial License)]**。
- 商务联系邮箱：`278690600@qq.com`

---

<div align="center">
  如果这个项目对您有所启发或帮助，欢迎在 GitHub 上点一个 ⭐ <b>Star</b> 支持作者！
</div>
