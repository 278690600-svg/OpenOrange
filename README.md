# ClosedUI

A full-stack, local-first chat application designed to be a lightweight alternative to Open WebUI. Talk to local LLMs (via Ollama) or cloud providers (via OpenAI) seamlessly.

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Optional: [Ollama](https://ollama.com/) running locally for offline models.

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Initialize and push the Prisma database schema (uses local SQLite by default):
   ```bash
   npx prisma db push
   ```

### Running Locally

To run the app in development mode:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app in your browser.

### Docker Deployment

To build and run ClosedUI as a standalone Docker container:

```bash
docker build -t closedui .
docker run -p 3000:3000 closedui
```
Then visit `http://localhost:3000`.

### Configuration
Click the **Settings** button in the sidebar to configure:
- **Ollama URL** (Defaults to `http://127.0.0.1:11434`)
- **OpenAI API Key** (Optional)
- **Default Model** (Defaults to `llama3`)
