import { cn } from '@/lib/ui/utils'
import { BookOpen, Terminal } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, ThinkingMessage, ToolUseMessage } from '../../hooks/use-chat-messages'
import { ChatMarkdown } from './ChatMarkdown'

interface MessageCardProps {
  message: ChatMessage
  onOpenGuide?: () => void
}

export function MessageCard({ message, onOpenGuide }: MessageCardProps) {
  switch (message.type) {
    case 'user':
      return (
        <div className="flex w-full flex-col items-end px-3">
          <div className="border-primary/30 bg-primary/5 max-w-[80%] rounded-lg border p-2 text-sm leading-5 wrap-break-word whitespace-pre-wrap">
            {message.text}
          </div>
        </div>
      )

    case 'assistant_text':
      if (!message.text.trim()) return null
      return (
        <div className="flex max-w-full flex-col items-start px-3">
          <ChatMarkdown>{message.text}</ChatMarkdown>
        </div>
      )

    case 'thinking':
      return <ThinkingCard message={message} />

    case 'tool_use':
      return <ToolUseCard message={message} />

    case 'error':
      return (
        <div className="flex max-w-full flex-col items-start px-3">
          <span className="text-sm">
            <span className="text-muted-foreground font-medium">Error</span>{' '}
            <span className="text-destructive">{message.text}</span>
          </span>
        </div>
      )

    case 'guide_card':
      return (
        <div className="flex max-w-full flex-col items-start px-3">
          <button
            onClick={onOpenGuide}
            className="border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <BookOpen className="size-4 shrink-0" />
            <span className="flex-1 text-left">{message.guideTitle}</span>
            <span className="text-primary/60 text-xs">ガイドを表示</span>
          </button>
        </div>
      )
  }
}

// --- Thinking: "Thought for Xs" with collapsible ---
function ThinkingCard({ message }: { message: ThinkingMessage }) {
  const [expanded, setExpanded] = useState(!message.finished)
  const headerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (message.finished) {
      const timer = setTimeout(() => setExpanded(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [message.finished])

  const thoughtTime = message.finishedAt
    ? ((message.finishedAt - message.startedAt) / 1000).toFixed(1)
    : ((Date.now() - message.startedAt) / 1000).toFixed(0)

  const handleToggle = useCallback(() => {
    if (!message.text) return
    const header = headerRef.current
    if (!header) {
      setExpanded(!expanded)
      return
    }
    const rectBefore = header.getBoundingClientRect()
    setExpanded(!expanded)
    requestAnimationFrame(() => {
      const rectAfter = header.getBoundingClientRect()
      const delta = rectAfter.top - rectBefore.top
      if (delta !== 0) {
        let sc: HTMLElement | null = header.parentElement
        while (sc) {
          const s = getComputedStyle(sc)
          if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
            sc.scrollBy(0, delta)
            break
          }
          sc = sc.parentElement
        }
      }
    })
  }, [expanded, message.text])

  return (
    <div className="flex max-w-full flex-col items-start px-3">
      <div className="w-full">
        <button ref={headerRef} onClick={handleToggle} className="w-full text-left">
          <header className="flex items-center gap-1 text-sm leading-4">
            {message.finished ? (
              <span className="group text-muted-foreground flex cursor-pointer items-center gap-1">
                <span className="group-hover:text-foreground">Thought for {thoughtTime}s</span>
                {message.text && <CaretIcon expanded={expanded} />}
              </span>
            ) : (
              <span className="text-muted-foreground flex animate-pulse items-center gap-1">
                <span>Thinking...</span>
              </span>
            )}
          </header>
        </button>
        {expanded && message.text && (
          <ExpandedContent>
            <ChatMarkdown className="text-muted-foreground/70" isStreaming={!message.finished}>
              {message.text}
            </ChatMarkdown>
          </ExpandedContent>
        )}
      </div>
    </div>
  )
}

// --- Tool use: collapsible with result ---
function ToolUseCard({ message }: { message: ToolUseMessage }) {
  const [expanded, setExpanded] = useState(false)
  const displayName = message.toolName.replace('mcp__browser__', '')
  const summary = summarizeInput(message.toolInput)
  const hasContent = Object.keys(message.toolInput).length > 0 || message.toolResult

  return (
    <div className="flex max-w-full flex-col items-start px-3">
      <div className="w-full">
        <button
          type="button"
          onClick={() => hasContent && setExpanded(!expanded)}
          disabled={!hasContent}
          className="w-full text-left"
        >
          <header className="flex items-center gap-1 text-sm leading-4">
            <span
              className={cn(
                'group flex min-w-0 items-center gap-1.5',
                hasContent ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'text-muted-foreground shrink-0 font-medium',
                  hasContent && 'group-hover:text-foreground',
                )}
              >
                {displayName}
              </span>
              {message.toolError && (
                <span className="text-destructive shrink-0 text-xs">Failed</span>
              )}
              {summary && (
                <span className="text-muted-foreground/50 truncate text-xs">{summary}</span>
              )}
              {hasContent && <CaretIcon expanded={expanded} />}
            </span>
          </header>
        </button>
        {expanded && (
          <ExpandedContent>
            {Object.keys(message.toolInput).length > 0 && (
              <pre className="text-muted-foreground/70 text-sm leading-5 break-all whitespace-pre-wrap">
                {JSON.stringify(message.toolInput, null, 2)}
              </pre>
            )}
            {message.toolResult && (
              <div className="text-muted-foreground/50 text-sm leading-5 whitespace-pre-wrap">
                {message.toolResult}
              </div>
            )}
          </ExpandedContent>
        )}
      </div>
    </div>
  )
}

// --- Shared components ---
function ExpandedContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border ml-1.5 max-w-full space-y-2 overflow-x-auto border-l py-2 pl-2">
      {children}
    </div>
  )
}

function CaretIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={cn(
        'text-muted-foreground size-4 shrink-0 transition-all duration-300',
        'opacity-0 group-hover:opacity-100',
        expanded && 'rotate-0 opacity-100',
        !expanded && '-rotate-90',
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function summarizeInput(input: Record<string, unknown>): string {
  if (input.description) return String(input.description)
  if (input.url) return String(input.url)
  if (input.ref) {
    const parts = [`ref=${input.ref}`]
    if (input.guide_target_ref) parts.push(`guide=${input.guide_target_ref}`)
    if (input.value) parts.push(`"${String(input.value).slice(0, 20)}"`)
    return parts.join(' ')
  }
  if (input.pattern) return String(input.pattern)
  if (input.path) return String(input.path).split('/').pop() ?? ''
  return ''
}
