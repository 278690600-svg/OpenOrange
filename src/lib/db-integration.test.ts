import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import prisma from '@/lib/db'

describe('Database Schema - Message Model', () => {
  let chatId: string

  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.message.deleteMany()
    await prisma.chat.deleteMany()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.message.deleteMany()
    await prisma.chat.deleteMany()
    const chat = await prisma.chat.create({
      data: { title: 'Test Chat' },
    })
    chatId = chat.id
  })

  it('should create a user message', async () => {
    const msg = await prisma.message.create({
      data: { chatId, role: 'user', content: 'Hello' },
    })
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
    expect(msg.citations).toBe('[]')
    expect(msg.searchSteps).toBe('[]')
  })

  it('should create an assistant message with citations', async () => {
    const citations = JSON.stringify([
      { title: 'Source 1', url: 'https://example.com' },
    ])
    const msg = await prisma.message.create({
      data: { chatId, role: 'assistant', content: 'Based on [1]...', citations },
    })
    expect(msg.role).toBe('assistant')
    const parsed = JSON.parse(msg.citations)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('Source 1')
  })

  it('should create an assistant message with searchSteps', async () => {
    const searchSteps = JSON.stringify([
      { type: 'search', stage: 'searching', message: 'Searching...' },
      { type: 'search', stage: 'done', message: 'Done' },
    ])
    const msg = await prisma.message.create({
      data: { chatId, role: 'assistant', content: 'Results...', searchSteps },
    })
    const parsed = JSON.parse(msg.searchSteps)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].type).toBe('search')
  })

  it('should update message content', async () => {
    const msg = await prisma.message.create({
      data: { chatId, role: 'assistant', content: 'Hello' },
    })
    const updated = await prisma.message.update({
      where: { id: msg.id },
      data: { content: 'Hello! How can I help?' },
    })
    expect(updated.content).toBe('Hello! How can I help?')
  })

  it('should update message citations', async () => {
    const msg = await prisma.message.create({
      data: { chatId, role: 'assistant', content: 'Result' },
    })
    const citations = JSON.stringify([
      { title: 'Wikipedia', url: 'https://wikipedia.org' },
      { title: 'GitHub', url: 'https://github.com' },
    ])
    const updated = await prisma.message.update({
      where: { id: msg.id },
      data: { citations },
    })
    const parsed = JSON.parse(updated.citations)
    expect(parsed).toHaveLength(2)
  })

  it('should cascade delete messages when chat is deleted', async () => {
    await prisma.message.create({
      data: { chatId, role: 'user', content: 'Test' },
    })
    await prisma.message.create({
      data: { chatId, role: 'assistant', content: 'Response' },
    })

    const beforeDelete = await prisma.message.count({ where: { chatId } })
    expect(beforeDelete).toBe(2)

    await prisma.chat.delete({ where: { id: chatId } })

    const afterDelete = await prisma.message.count({ where: { chatId } })
    expect(afterDelete).toBe(0)
  })

  it('should retrieve messages in order', async () => {
    await prisma.message.create({ data: { chatId, role: 'user', content: 'First' } })
    await prisma.message.create({ data: { chatId, role: 'assistant', content: 'Second' } })
    await prisma.message.create({ data: { chatId, role: 'user', content: 'Third' } })

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
    })
    expect(messages).toHaveLength(3)
    expect(messages[0].content).toBe('First')
    expect(messages[1].content).toBe('Second')
    expect(messages[2].content).toBe('Third')
  })

  it('should handle empty content', async () => {
    const msg = await prisma.message.create({
      data: { chatId, role: 'assistant', content: '' },
    })
    expect(msg.content).toBe('')
  })

  it('should handle large content', async () => {
    const largeContent = 'A'.repeat(10000)
    const msg = await prisma.message.create({
      data: { chatId, role: 'assistant', content: largeContent },
    })
    expect(msg.content).toHaveLength(10000)
  })
})

describe('Database Schema - Chat Model', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.message.deleteMany()
    await prisma.chat.deleteMany()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.message.deleteMany()
    await prisma.chat.deleteMany()
  })

  it('should create a chat with default values', async () => {
    const chat = await prisma.chat.create({
      data: { title: 'New Chat' },
    })
    expect(chat.title).toBe('New Chat')
    expect(chat.id).toBeTruthy()
    expect(chat.createdAt).toBeInstanceOf(Date)
    expect(chat.selectedPromptId).toBeNull()
  })

  it('should create a chat with selectedPromptId', async () => {
    const chat = await prisma.chat.create({
      data: { title: 'Chat with Prompt', selectedPromptId: 'prompt-1' },
    })
    expect(chat.selectedPromptId).toBe('prompt-1')
  })

  it('should update chat title', async () => {
    const chat = await prisma.chat.create({ data: { title: 'Old Title' } })
    const updated = await prisma.chat.update({
      where: { id: chat.id },
      data: { title: 'New Title' },
    })
    expect(updated.title).toBe('New Title')
  })

  it('should list chats with message count', async () => {
    const chat = await prisma.chat.create({ data: { title: 'Chat 1' } })
    await prisma.message.create({ data: { chatId: chat.id, role: 'user', content: 'Hi' } })
    await prisma.message.create({ data: { chatId: chat.id, role: 'assistant', content: 'Hello' } })

    const chatWithMessages = await prisma.chat.findUnique({
      where: { id: chat.id },
      include: { messages: true },
    })
    expect(chatWithMessages?.messages).toHaveLength(2)
  })
})

describe('Database Schema - InferenceTask Model', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.inferenceTask.deleteMany()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.inferenceTask.deleteMany()
  })

  it('should create an inference task', async () => {
    const task = await prisma.inferenceTask.create({
      data: {
        model: 'openai::gpt-4',
        provider: 'openai',
        status: 'queued',
        input: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      },
    })
    expect(task.status).toBe('queued')
    expect(task.model).toBe('openai::gpt-4')
  })

  it('should update task status', async () => {
    const task = await prisma.inferenceTask.create({
      data: { model: 'ollama::llama3', status: 'queued' },
    })
    const updated = await prisma.inferenceTask.update({
      where: { id: task.id },
      data: { status: 'running', startedAt: new Date() },
    })
    expect(updated.status).toBe('running')
    expect(updated.startedAt).toBeInstanceOf(Date)
  })

  it('should complete a task', async () => {
    const task = await prisma.inferenceTask.create({
      data: { model: 'ollama::llama3', status: 'running' },
    })
    const updated = await prisma.inferenceTask.update({
      where: { id: task.id },
      data: {
        status: 'completed',
        result: 'Hello! How can I help?',
        completedAt: new Date(),
      },
    })
    expect(updated.status).toBe('completed')
    expect(updated.result).toBe('Hello! How can I help?')
  })

  it('should fail a task with error', async () => {
    const task = await prisma.inferenceTask.create({
      data: { model: 'ollama::llama3', status: 'running' },
    })
    const updated = await prisma.inferenceTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        error: 'Connection refused',
        completedAt: new Date(),
      },
    })
    expect(updated.status).toBe('failed')
    expect(updated.error).toBe('Connection refused')
  })
})

describe('Database Schema - Settings Model', () => {
  beforeAll(async () => {
    await prisma.$connect()
    await prisma.settings.deleteMany()
  })

  afterAll(async () => {
    await prisma.settings.deleteMany()
    await prisma.$disconnect()
  })

  it('should have default settings', async () => {
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    })
    expect(settings.ollamaUrl).toBe('http://127.0.0.1:11434')
    expect(settings.lmstudioUrl).toBe('http://127.0.0.1:1234')
    expect(settings.defaultModel).toBeTruthy()
    expect(settings.apiTemperature).toBe(0.7)
    expect(settings.apiTopP).toBe(0.9)
    expect(settings.apiMaxTokens).toBe(2048)
    expect(settings.apiContextSize).toBe(8192)
  })

  it('should update settings', async () => {
    await prisma.settings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    })
    const updated = await prisma.settings.update({
      where: { id: 'default' },
      data: { openaiKey: 'sk-test-key', defaultModel: 'gpt-4' },
    })
    expect(updated.openaiKey).toBe('sk-test-key')
    expect(updated.defaultModel).toBe('gpt-4')
  })
})
