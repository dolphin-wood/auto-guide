import type { WSContext } from 'hono/ws'
import { logger } from '../logger.js'

export function handleExtensionConnection(ws: WSContext): void {
  logger.info('Extension WS connected')
  ws.send(JSON.stringify({ type: 'connected' }))
}
