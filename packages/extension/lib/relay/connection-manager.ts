interface RPCRequest {
  id: number
  method: string
  params?: Record<string, unknown>
}

interface RPCResponse {
  id: number
  result?: unknown
  error?: string
}

interface RPCEvent {
  method: string
  params: Record<string, unknown>
}

type RPCHandler = (request: RPCRequest) => Promise<unknown>

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const RPC_TIMEOUT = 30_000
const PING_INTERVAL = 5_000
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

export class ConnectionManager {
  private ws: WebSocket | null = null
  private url: string
  private rpcHandler: RPCHandler
  private pendingRequests = new Map<number, PendingRequest>()
  private nextId = 1
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempt = 0
  private shouldReconnect = true

  constructor(url: string, rpcHandler: RPCHandler) {
    this.url = url
    this.rpcHandler = rpcHandler
  }

  connect(): void {
    this.shouldReconnect = true
    this.createConnection()
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.cleanup()
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    const request: RPCRequest = { id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC timeout: ${method} (id=${id})`))
      }, RPC_TIMEOUT)

      this.pendingRequests.set(id, { resolve, reject, timer })
      this.send(request)
    })
  }

  sendEvent(method: string, params: Record<string, unknown>): void {
    const event: RPCEvent = { method, params }
    this.send(event)
  }

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('[connection-manager] Connected to relay server')
        this.reconnectAttempt = 0
        this.startPing()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string)
      }

      this.ws.onclose = (event) => {
        console.log(`[connection-manager] Disconnected (code=${event.code})`)
        this.stopPing()

        if (this.shouldReconnect && event.code !== 1000) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        console.error('[connection-manager] WebSocket error:', error)
      }
    } catch (error) {
      console.error('[connection-manager] Failed to create WebSocket:', error)
      if (this.shouldReconnect) {
        this.scheduleReconnect()
      }
    }
  }

  private async handleMessage(data: string): Promise<void> {
    let msg: unknown
    try {
      msg = JSON.parse(data)
    } catch {
      console.error('[connection-manager] Invalid JSON:', data)
      return
    }

    const message = msg as Record<string, unknown>

    // RPC Response (has id, no method)
    if ('id' in message && typeof message.id === 'number' && !('method' in message)) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error as string))
        } else {
          pending.resolve(message.result)
        }
      }
      return
    }

    // RPC Request (has id and method)
    if ('id' in message && typeof message.id === 'number' && 'method' in message) {
      const request = message as RPCRequest
      try {
        const result = await this.rpcHandler(request)
        this.send({ id: request.id, result } as RPCResponse)
      } catch (error) {
        this.send({
          id: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        } as RPCResponse)
      }
    }
  }

  private send(data: RPCRequest | RPCResponse | RPCEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.sendEvent('ping', {})
    }, PING_INTERVAL)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]!
    console.log(
      `[connection-manager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})`,
    )
    setTimeout(() => {
      this.reconnectAttempt++
      this.createConnection()
    }, delay)
  }

  private cleanup(): void {
    this.stopPing()
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Connection closed'))
      this.pendingRequests.delete(id)
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close(1000)
      this.ws = null
    }
  }
}
