type MessageHandler = (message: Record<string, unknown>) => void

const HEARTBEAT_INTERVAL = 5_000
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]

export class SidepanelWSClient {
  private ws: WebSocket | null = null
  private url: string
  private onMessage: MessageHandler
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempt = 0
  private shouldReconnect = true

  constructor(url: string, onMessage: MessageHandler) {
    this.url = url
    this.onMessage = onMessage
  }

  connect(): void {
    this.shouldReconnect = true
    this.createConnection()
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.cleanup()
  }

  send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private createConnection(): void {
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.reconnectAttempt = 0
      this.startHeartbeat()
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as Record<string, unknown>
        this.onMessage(message)
      } catch {
        console.error('[ws-client] Invalid JSON')
      }
    }

    this.ws.onclose = (event) => {
      this.stopHeartbeat()
      if (this.shouldReconnect && event.code !== 1000) {
        this.scheduleReconnect()
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat' })
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]!
    setTimeout(() => {
      this.reconnectAttempt++
      this.createConnection()
    }, delay)
  }

  private cleanup(): void {
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close(1000)
      this.ws = null
    }
  }
}
