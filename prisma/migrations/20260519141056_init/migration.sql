-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "selectedPromptId" TEXT
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId" TEXT NOT NULL,
    CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "ollamaUrl" TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
    "lmstudioUrl" TEXT NOT NULL DEFAULT 'http://127.0.0.1:1234',
    "openaiKey" TEXT NOT NULL DEFAULT '',
    "anthropicKey" TEXT NOT NULL DEFAULT '',
    "googleKey" TEXT NOT NULL DEFAULT '',
    "deepseekKey" TEXT NOT NULL DEFAULT '',
    "minimaxKey" TEXT NOT NULL DEFAULT '',
    "groqKey" TEXT NOT NULL DEFAULT '',
    "mistralKey" TEXT NOT NULL DEFAULT '',
    "zhipuKey" TEXT NOT NULL DEFAULT '',
    "lingyiKey" TEXT NOT NULL DEFAULT '',
    "openrouterKey" TEXT NOT NULL DEFAULT '',
    "nvidiaKey" TEXT NOT NULL DEFAULT '',
    "defaultModel" TEXT NOT NULL DEFAULT 'llama3',
    "searchEngine" TEXT NOT NULL DEFAULT 'duckduckgo',
    "searchKey" TEXT NOT NULL DEFAULT '',
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "hybridSearchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "localGgufEnabled" BOOLEAN NOT NULL DEFAULT false,
    "localGgufContextSize" INTEGER NOT NULL DEFAULT 4096,
    "localGgufTemperature" REAL NOT NULL DEFAULT 0.7,
    "localGgufTopP" REAL NOT NULL DEFAULT 0.95,
    "localGgufRepeatPenalty" REAL NOT NULL DEFAULT 1.1,
    "localGgufMaxTokens" INTEGER NOT NULL DEFAULT 1024,
    "apiTemperature" REAL NOT NULL DEFAULT 0.7,
    "apiTopP" REAL NOT NULL DEFAULT 0.9,
    "apiMaxTokens" INTEGER NOT NULL DEFAULT 2048,
    "apiContextSize" INTEGER NOT NULL DEFAULT 8192,
    "theme" TEXT NOT NULL DEFAULT 'zinc',
    "mcpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mcpAutoLoad" BOOLEAN NOT NULL DEFAULT false,
    "enabledModels" TEXT NOT NULL DEFAULT '[]',
    "maxConcurrentChats" INTEGER NOT NULL DEFAULT 3
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "path" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    "stats" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastError" TEXT NOT NULL DEFAULT '',
    "lastIndexedAt" DATETIME,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "sourceUri" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "embedding" TEXT,
    CONSTRAINT "KnowledgeChunk_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'stdio',
    "command" TEXT,
    "args" TEXT,
    "url" TEXT,
    "env" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "path" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastError" TEXT NOT NULL DEFAULT '',
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT DEFAULT 'Sparkles',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InferenceTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "abortSignalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);
