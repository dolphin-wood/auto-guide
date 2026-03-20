import { ArrowDown } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../hooks/use-chat-messages'
import { ChatInput } from './ChatInput'
import { LoadingIndicator } from './LoadingIndicator'
import { MessageCard } from './MessageCard'

interface ChatViewProps {
  messages: ChatMessage[]
  onSend: (text: string) => void
  isGenerating: boolean
  onStop: () => void
  onOpenGuide?: () => void
}

export function ChatView({ messages, onSend, isGenerating, onStop, onOpenGuide }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const contentRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 2147483647 })
      })
    }
  }, [messages, autoScroll])

  // Auto-scroll when content height changes (streaming animation)
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTo({ top: 2147483647 })
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [autoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    setAutoScroll(isNearBottom)
  }, [])

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: 2147483647, behavior: 'smooth' })
    setAutoScroll(true)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col overflow-auto text-sm leading-5"
      >
        <div ref={contentRef} className="flex flex-col gap-3 p-3">
          {messages.length === 0 && (
            <div className="text-muted-foreground flex flex-1 items-center justify-center px-6 text-center">
              Describe a user journey to generate a guide
            </div>
          )}
          {messages.map((msg) => (
            <MessageCard key={msg.id} message={msg} onOpenGuide={onOpenGuide} />
          ))}
          {isGenerating && <LoadingIndicator />}
        </div>
      </div>

      {/* Scroll to bottom button — anchored above ChatInput */}
      <div className="relative">
        {!autoScroll && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="border-border bg-card hover:bg-accent absolute -top-10 left-1/2 -translate-x-1/2 rounded-full border p-1.5 shadow-md transition-colors"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="text-muted-foreground size-4" />
          </button>
        )}
      </div>

      <ChatInput
        onSend={onSend}
        onStop={onStop}
        isGenerating={isGenerating}
        placeholder={isGenerating ? 'Send a follow-up message...' : 'Describe a user journey...'}
      />
    </div>
  )
}
