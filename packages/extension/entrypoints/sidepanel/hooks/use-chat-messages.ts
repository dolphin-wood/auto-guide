import { useCallback, useRef, useState } from 'react'

export interface UserMessage {
  id: string
  type: 'user'
  text: string
}

export interface AssistantTextMessage {
  id: string
  type: 'assistant_text'
  text: string
}

export interface ThinkingMessage {
  id: string
  type: 'thinking'
  text: string
  startedAt: number
  finishedAt?: number
  finished: boolean
}

export interface ToolUseMessage {
  id: string
  type: 'tool_use'
  toolName: string
  toolInput: Record<string, unknown>
  toolResult?: string
  toolError?: boolean
}

export interface ErrorMessage {
  id: string
  type: 'error'
  text: string
}

export interface GuideCardMessage {
  id: string
  type: 'guide_card'
  guideTitle: string
}

export type ChatMessage =
  | UserMessage
  | AssistantTextMessage
  | ThinkingMessage
  | ToolUseMessage
  | ErrorMessage
  | GuideCardMessage

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const nextId = useRef(0)

  const addUserMessage = useCallback((text: string) => {
    const id = `user-${nextId.current++}`
    const msg: UserMessage = { id, type: 'user', text }
    setMessages((prev) => [...prev, msg])
    return id
  }, [])

  const handleServerMessage = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as string
    const data = msg.data as Record<string, unknown>

    switch (type) {
      case 'agent_text_delta': {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.type === 'assistant_text') {
            const updated: AssistantTextMessage = {
              ...last,
              text: last.text + (data.text as string),
            }
            return [...prev.slice(0, -1), updated]
          }
          const id = `text-${nextId.current++}`
          const newMsg: AssistantTextMessage = {
            id,
            type: 'assistant_text',
            text: data.text as string,
          }
          return [...prev, newMsg]
        })
        break
      }

      case 'agent_think_start': {
        const newMsg: ThinkingMessage = {
          id: data.id as string,
          type: 'thinking',
          text: '',
          startedAt: Date.now(),
          finished: false,
        }
        setMessages((prev) => [...prev, newMsg])
        break
      }

      case 'agent_think_progress': {
        const thinkId = data.id as string
        setMessages((prev) =>
          prev.map(
            (m): ChatMessage =>
              m.type === 'thinking' && m.id === thinkId
                ? { ...m, text: m.text + (data.text as string) }
                : m,
          ),
        )
        break
      }

      case 'agent_think_finished': {
        const finishId = data.id as string
        setMessages((prev) =>
          prev.map(
            (m): ChatMessage =>
              m.type === 'thinking' && m.id === finishId
                ? { ...m, finished: true, finishedAt: Date.now() }
                : m,
          ),
        )
        break
      }

      case 'agent_tool_use': {
        const newMsg: ToolUseMessage = {
          id: data.id as string,
          type: 'tool_use',
          toolName: data.name as string,
          toolInput: (data.input as Record<string, unknown>) ?? {},
        }
        setMessages((prev) => [...prev, newMsg])
        break
      }

      case 'agent_tool_result': {
        const toolUseId = data.toolUseId as string
        const resultText = data.result as string
        const isError = data.isError as boolean | undefined
        setMessages((prev) =>
          prev.map(
            (m): ChatMessage =>
              m.type === 'tool_use' && m.id === toolUseId
                ? { ...m, toolResult: resultText, toolError: isError }
                : m,
          ),
        )
        break
      }

      case 'error': {
        const newMsg: ErrorMessage = {
          id: `error-${nextId.current++}`,
          type: 'error',
          text: data.message as string,
        }
        setMessages((prev) => [...prev, newMsg])
        break
      }

      // guide_complete is handled externally — guide card added on generation_finished
    }
  }, [])

  const addGuideCard = useCallback((guideTitle: string) => {
    const id = `guide-${nextId.current++}`
    const msg: GuideCardMessage = { id, type: 'guide_card', guideTitle }
    setMessages((prev) => [...prev, msg])
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, addUserMessage, addGuideCard, handleServerMessage, clearMessages }
}
