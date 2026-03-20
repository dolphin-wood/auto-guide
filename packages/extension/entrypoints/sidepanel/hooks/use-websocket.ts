import { useCallback, useEffect, useRef } from 'react'
import { SidepanelWSClient } from '../lib/ws-client'

const WS_URL = 'ws://localhost:3100/sidepanel/ws'

type ServerMessage = Record<string, unknown>

export function useWebSocket(onMessage: (msg: ServerMessage) => void) {
  const clientRef = useRef<SidepanelWSClient | null>(null)

  useEffect(() => {
    const client = new SidepanelWSClient(WS_URL, onMessage)
    clientRef.current = client
    client.connect()

    return () => {
      client.disconnect()
      clientRef.current = null
    }
  }, [onMessage])

  const send = useCallback((message: Record<string, unknown>) => {
    clientRef.current?.send(message)
  }, [])

  return { send }
}
