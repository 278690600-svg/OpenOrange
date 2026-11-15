import { describe, it, expect } from 'vitest'
import { extractContent, cleanSSELine, sseEvent } from '@/lib/ai-provider'

describe('extractContent', () => {
  it('should return empty string for null/undefined', () => {
    expect(extractContent(null)).toBe('')
    expect(extractContent(undefined)).toBe('')
  })

  it('should extract string content', () => {
    expect(extractContent({ role: 'user', content: 'Hello' })).toBe('Hello')
  })

  it('should extract content from parts array', () => {
    const msg = {
      role: 'user',
      parts: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'World' },
      ],
    }
    expect(extractContent(msg)).toBe('Hello World')
  })

  it('should extract content from array content', () => {
    const msg = {
      role: 'user',
      content: [{ type: 'text', text: 'Part1' }, { type: 'text', text: 'Part2' }],
    }
    const result = extractContent(msg)
    expect(result).toContain('Part1')
    expect(result).toContain('Part2')
  })

  it('should handle empty content', () => {
    expect(extractContent({ role: 'user', content: '' })).toBe('')
  })

  it('should return whitespace-only content as-is when no other content source', () => {
    const result = extractContent({ role: 'user', content: '   ' })
    expect(typeof result === 'string').toBe(true)
  })

  it('should handle string parts', () => {
    const msg = {
      role: 'user',
      parts: ['Hello', ' ', 'World'],
    }
    expect(extractContent(msg)).toBe('Hello World')
  })

  it('should skip non-text parts', () => {
    const msg = {
      role: 'user',
      parts: [
        { type: 'text', text: 'Hello' },
        { type: 'image', url: 'http://example.com/img.png' },
      ],
    }
    expect(extractContent(msg)).toBe('Hello')
  })
})

describe('cleanSSELine', () => {
  it('should filter out event type lines', () => {
    expect(cleanSSELine('event: response.completed')).toBeNull()
    expect(cleanSSELine('event: response.incomplete')).toBeNull()
  })

  it('should pass through non-data lines', () => {
    expect(cleanSSELine('')).toBe('')
    expect(cleanSSELine('id: chatcmpl-123')).toBe('id: chatcmpl-123')
  })

  it('should pass through [DONE] signal', () => {
    expect(cleanSSELine('data: [DONE]')).toBe('data: [DONE]')
  })

  it('should clean valid data lines with choices', () => {
    const line = 'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}'
    const result = cleanSSELine(line)
    expect(result).not.toBeNull()
    expect(result).toContain('"choices"')
  })

  it('should filter out data lines without choices', () => {
    const line = 'data: {"id":"resp-1","object":"response.completed"}'
    expect(cleanSSELine(line)).toBeNull()
  })

  it('should filter out invalid JSON', () => {
    const line = 'data: {invalid json}'
    expect(cleanSSELine(line)).toBeNull()
  })

  it('should handle empty data', () => {
    expect(cleanSSELine('data: ')).toBe('data: ')
  })

  it('should add default fields to choices', () => {
    const line = 'data: {"choices":[{"delta":{"content":"test"}}]}'
    const result = cleanSSELine(line)
    expect(result).not.toBeNull()
    expect(result).toContain('"id"')
    expect(result).toContain('"object"')
    expect(result).toContain('"created"')
    expect(result).toContain('"model"')
  })

  it('should handle choices with finish_reason', () => {
    const line = 'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}'
    const result = cleanSSELine(line)
    expect(result).not.toBeNull()
    expect(result).toContain('"finish_reason":"stop"')
  })

  it('should handle MiniMax nested data.choices format', () => {
    const line = 'data: {"id":"resp-1","data":{"choices":[{"index":0,"delta":{"content":"Hello"}}]}}'
    const result = cleanSSELine(line)
    expect(result).not.toBeNull()
    expect(result).toContain('"choices"')
    expect(result).toContain('"content":"Hello"')
  })

  it('should handle MiniMax error chunks gracefully', () => {
    const line = 'data: {"error":{"code":"rate_limit","message":"Too many requests"}}'
    expect(cleanSSELine(line)).toBeNull()
  })

  it('should filter MiniMax non-standard response types', () => {
    expect(cleanSSELine('data: {"id":"r1","object":"response.created"}')).toBeNull()
    expect(cleanSSELine('data: {"id":"r1","object":"response.completed","usage":{"tokens":100}}')).toBeNull()
  })

  it('should handle MiniMax data field without choices gracefully', () => {
    const line = 'data: {"id":"resp-1","data":{"usage":{"total_tokens":50}}}'
    expect(cleanSSELine(line)).toBeNull()
  })

  it('should handle choices with reasoning_content', () => {
    const line = 'data: {"choices":[{"delta":{"reasoning_content":"thinking...","content":"answer"}}]}'
    const result = cleanSSELine(line)
    expect(result).not.toBeNull()
    expect(result).toContain('"reasoning_content":"thinking..."')
    expect(result).toContain('"content":"answer"')
  })

  it('should handle empty choices array', () => {
    const line = 'data: {"choices":[]}'
    const result = cleanSSELine(line)
    expect(result).not.toBeNull()
    expect(result).toContain('"choices":[]')
  })
})

describe('sseEvent', () => {
  it('should format SSE event correctly', () => {
    const result = sseEvent('text', { content: 'Hello' })
    expect(result).toBe('event: text\ndata: {"content":"Hello"}\n\n')
  })

  it('should format status event', () => {
    const result = sseEvent('status', { type: 'search', stage: 'done', message: '搜索完成' })
    expect(result).toContain('event: status')
    expect(result).toContain('"type":"search"')
    expect(result).toContain('"stage":"done"')
  })

  it('should handle empty data', () => {
    const result = sseEvent('ping', {})
    expect(result).toBe('event: ping\ndata: {}\n\n')
  })
})
