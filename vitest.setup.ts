import { vi } from 'vitest'

Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

Object.defineProperty(globalThis, 'window', {
  value: {
    dispatchEvent: vi.fn(),
    CustomEvent: class CustomEvent {
      type: string
      detail: unknown
      constructor(type: string, opts?: { detail?: unknown }) {
        this.type = type
        this.detail = opts?.detail
      }
    },
    sessionStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  },
  writable: true,
})

class MockEventSource {
  url: string
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  private listeners: Record<string, Array<(e: { data: string }) => void>> = {}
  static instances: MockEventSource[] = []
  static lastInstance: MockEventSource | null = null

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
    MockEventSource.lastInstance = this
  }

  addEventListener(event: string, handler: (e: { data: string }) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  removeEventListener(event: string, handler: (e: { data: string }) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler)
    }
  }

  close() {}

  emit(event: string, data: unknown) {
    const handlers = this.listeners[event] || []
    for (const handler of handlers) {
      handler({ data: JSON.stringify(data) })
    }
  }

  static reset() {
    MockEventSource.instances = []
    MockEventSource.lastInstance = null
  }
}

Object.defineProperty(globalThis, 'EventSource', {
  value: MockEventSource,
  writable: true,
})

export { MockEventSource }
