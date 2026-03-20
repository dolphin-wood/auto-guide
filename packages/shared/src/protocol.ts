export interface RPCRequest {
  id: number
  method: string
  params?: Record<string, unknown>
}

export interface RPCResponse {
  id: number
  result?: unknown
  error?: string
}

export interface RPCEvent {
  method: string
  params: Record<string, unknown>
}

export type RPCMessage = RPCRequest | RPCResponse | RPCEvent

export function isRPCRequest(msg: unknown): msg is RPCRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    typeof (msg as RPCRequest).id === 'number' &&
    'method' in msg &&
    typeof (msg as RPCRequest).method === 'string'
  )
}

export function isRPCResponse(msg: unknown): msg is RPCResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    typeof (msg as RPCResponse).id === 'number' &&
    !('method' in msg)
  )
}

export function isRPCEvent(msg: unknown): msg is RPCEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'method' in msg &&
    typeof (msg as RPCEvent).method === 'string' &&
    !('id' in msg)
  )
}

export interface ForwardCDPCommandParams {
  sessionId: string
  cdpMethod: string
  cdpParams?: Record<string, unknown>
}

export interface TargetInfo {
  targetId: string
  type: 'page' | 'background_page' | 'service_worker' | 'browser' | 'other'
  title: string
  url: string
  attached: boolean
  browserContextId?: string
}
