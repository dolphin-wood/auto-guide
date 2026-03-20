import type { Guide } from './guide.js'

// --- Sidepanel → Server ---

export interface GenerateMessage {
  type: 'generate'
  data: { journeyDescription: string; startUrl?: string; tabId?: number }
}

export interface StopMessage {
  type: 'stop'
  data: { tabId?: number }
}

export interface UserFollowUpMessage {
  type: 'user_follow_up'
  data: { text: string; tabId?: number }
}

export type SidepanelToServerMessage = GenerateMessage | StopMessage | UserFollowUpMessage

// --- Server → Sidepanel ---

export interface AgentTextDeltaMessage {
  type: 'agent_text_delta'
  data: { text: string }
}

export interface AgentThinkStartMessage {
  type: 'agent_think_start'
  data: { id: string }
}

export interface AgentThinkProgressMessage {
  type: 'agent_think_progress'
  data: { id: string; text: string }
}

export interface AgentThinkFinishedMessage {
  type: 'agent_think_finished'
  data: { id: string; text: string }
}

export interface AgentToolUseMessage {
  type: 'agent_tool_use'
  data: { id: string; name: string; input: Record<string, unknown> }
}

export interface AgentToolResultMessage {
  type: 'agent_tool_result'
  data: {
    id: string
    toolUseId: string
    toolName: string
    result: string
    isError?: boolean
  }
}

export interface GuideCompleteMessage {
  type: 'guide_complete'
  data: { guide: Guide }
}

export interface GenerationFinishedMessage {
  type: 'generation_finished'
  data: Record<string, never>
}

export interface ErrorMessage {
  type: 'error'
  data: { message: string }
}

export type ServerToSidepanelMessage =
  | AgentTextDeltaMessage
  | AgentThinkStartMessage
  | AgentThinkProgressMessage
  | AgentThinkFinishedMessage
  | AgentToolUseMessage
  | AgentToolResultMessage
  | GuideCompleteMessage
  | GenerationFinishedMessage
  | ErrorMessage
