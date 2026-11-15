<div align="center">

# 🍊 OpenOrangeAI

**Lightweight, Local-First AI Chat & Office Productivity Suite**

*A modern, privacy-first alternative to Open WebUI & Microsoft Office. Create documents, analyze spreadsheets, build presentations, and convert file formats — powered by local LLMs or cloud providers in a single intuitive interface.*

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README_ZH.md">简体中文</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-feature-matrix">Features</a> •
  <a href="#-license--commercial">License</a>
</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/278690600-svg/ClosedUI/pulls)

</div>

---

## 🌟 Why OpenOrangeAI?

Most AI chat interfaces only let you "chat", requiring you to switch between multiple heavy office programs to get real work done.

**OpenOrangeAI** brings everything into one unified, local-first workspace designed for developers, researchers, and professionals:

- 🔒 **100% Local-First & Privacy Guaranteed**: All chat history, documents, sheets, and vector indexes remain on your local SQLite database.
- ⚡ **Lightweight & Blazing Fast**: Built on Next.js & React 19, ready to run in a single lightweight Docker container with minimal memory overhead.
- 📑 **Full-Fledged Office Suite**: Edit Rich Text Docs (Word alternative), analyze spreadsheets with formulas (Excel alternative), and generate slides (PowerPoint alternative) with real `.pptx` export.
- 🔌 **Native Model Context Protocol (MCP)**: Seamlessly extend model capabilities with custom MCP servers for local tools, file systems, and databases.
- 🤖 **Universal LLM Compatibility**: Zero-config connection to local Ollama / LM Studio or cloud models (DeepSeek, OpenAI, Claude, Gemini).

---

## 🆚 Feature Matrix

| Feature | OpenOrangeAI | Open WebUI | LibreOffice / MS Office | Traditional Web Chat |
| :--- | :---: | :---: | :---: | :---: |
| **Local-First & Offline Ready** | ✅ | ✅ | ✅ (No AI) | ❌ |
| **Rich Document Editor (TipTap + AI)** | ✅ | ❌ | ⚠️ Expensive Copilot | ❌ |
| **Spreadsheets + Formula Engine (AG-Grid)** | ✅ | ❌ | ✅ (Traditional) | ❌ |
| **Presentations + Native PPTX Export** | ✅ | ❌ | ✅ (Traditional) | ❌ |
| **Batch Conversion Center (9 formats)** | ✅ | ❌ | ⚠️ Manual save-as | ❌ |
| **Client-Side Multi-Language OCR** | ✅ | ❌ | ❌ | ❌ |
| **Direct Database Analytics (Text-to-SQL)** | ✅ | ❌ | ❌ | ❌ |
| **Native MCP Protocol Support** | ✅ | ⚠️ Basic | ❌ | ❌ |
| **PWA Desktop Installation** | ✅ | ⚠️ Basic | ❌ | ❌ |

---

## ✨ Key Features

### 1. 📝 Smart Document Editor (TipTap Core)
- Modern rich text editing with markdown shortcuts and formatted blocks.
- **AI-Assisted Writing**: Autocomplete, summarize, improve, expand, translate, and rephrase text.
- **Format Support**: Tables, syntax-highlighted code blocks, KaTeX math formulas, task lists.
- **Import & Export**: Import `.docx`, export directly to `.docx`, `.html`, `.md`, and `.pdf`.

### 2. 📊 Spreadsheet & Data Analysis (AG-Grid + HyperFormula)
- Powered by **AG-Grid** and the **HyperFormula** calculation engine.
- Column sorting, filtering, row management, cell formatting, and real-time formula computation.
- **AI Data Insights**: Ask questions in natural language to analyze trends and generate charts (Bar, Line, Pie via Recharts).
- Bi-directional import/export for `.xlsx`, `.csv`, and `.json`.

### 3. 🎨 Presentation Builder (Slide Deck Generator)
- Built-in **6 professional slide layouts** and **5 modern theme palettes**.
- Generate slide decks directly from chat outlines or prompt templates.
- Export to **authentic, editable `.pptx` files** powered by `pptxgenjs`.

### 4. 🔄 File Conversion Hub
- Batch convert between `DOCX`, `XLSX`, `PPTX`, `PDF`, `HTML`, `MD`, `TXT`, `CSV`, and `JSON`.
- Drag-and-drop batch processing with instant downloads.

### 5. 🔍 Client-Side OCR Engine
- Built-in **Tesseract.js** OCR supporting 12+ languages (English, Chinese, Japanese, Korean, Spanish, French, German, etc.).
- Side-by-side preview, text cleaner, confidence score, and one-click copy/export.

### 6. 🗄️ Direct Database Analytics
- Connect directly to **PostgreSQL**, **MySQL**, **SQLite**, **SQL Server**, and **MongoDB**.
- Text-to-SQL generation, secure query execution, and automatic report visualization.

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

Ensure [Docker](https://www.docker.com/) and Docker Compose are installed.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/278690600-svg/ClosedUI.git
   cd ClosedUI
   ```

2. **Start the stack** (includes OpenOrangeAI + Ollama):
   ```bash
   docker compose up -d
   ```

3. Open your browser and navigate to `http://localhost:3000`.

---

### Option 2: Local Development (Node.js)

**Requirements**:
- Node.js 18+ or 20+
- (Optional) [Ollama](https://ollama.com/) running locally for offline models.

**Steps**:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize SQLite database schema**:
   ```bash
   npx prisma db push
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. Visit `http://localhost:3000` in your browser.

---

## ⚙️ Configuration

Copy `.env.example` to `.env` to configure your environment:

```env
# Local SQLite database path
DATABASE_URL="file:./dev.db"

# Local Ollama endpoint (default)
OLLAMA_BASE_URL="http://localhost:11434"

# (Optional) Cloud LLM API Keys
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1"

# (Optional) MCP Server URL
# MCP_SERVER_URL="http://localhost:3001"
```

---

## 🗺️ Roadmap

- [x] Multi-turn streaming chat & task queue management
- [x] TipTap rich-text document editor & Word export
- [x] AG-Grid spreadsheet & HyperFormula calculation engine
- [x] Slide presentation creator & native PPTX export
- [x] 9-format batch conversion hub
- [x] Multi-language client-side OCR processor
- [x] Multi-database direct connection & SQL assistant
- [x] PWA offline and desktop installation support
- [ ] Real-time collaborative editing
- [ ] MCP Plugin Community Hub
- [ ] Mobile-optimized layout enhancements

---

## 🤝 Contributing

Contributions are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License & Commercial

- **Open Source**: This project is licensed under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE)**. Free for personal, non-commercial, and open-source derived use.
- **Commercial License**: If you or your organization wish to use OpenOrangeAI for closed-source commercial distribution, OEM re-branding, or to waive AGPL copyleft obligations, please obtain a **[Commercial License]**.
- Business Inquiries: `278690600@qq.com`

---

<div align="center">
  Give a ⭐ <b>Star</b> if this project helped you!
</div>
