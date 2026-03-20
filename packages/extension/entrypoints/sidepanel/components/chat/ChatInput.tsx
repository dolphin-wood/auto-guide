import { Button } from '@/lib/ui/button'
import { ArrowUp, Square } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  placeholder?: string
  isGenerating?: boolean
}

export function ChatInput({
  onSend,
  onStop,
  placeholder = 'Describe a user journey...',
  isGenerating,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '0'
    ta.style.height = `${Math.min(ta.scrollHeight, 174)}px`
  }, [text])

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <footer className="m-3">
      <div className="border-border bg-card focus-within:border-primary flex flex-col gap-2 rounded-2xl border p-3 shadow-sm">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          className="placeholder:text-muted-foreground max-h-43.5 min-h-0 flex-1 resize-none overflow-y-auto rounded-none border-none bg-transparent p-0.5 text-sm leading-5 shadow-none outline-none"
        />
        <div className="flex items-center justify-end">
          {isGenerating ? (
            <Button
              variant="destructive"
              size="icon-xs"
              onClick={onStop}
              aria-label="Stop"
              className="rounded-lg"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-xs"
              disabled={!text.trim()}
              onClick={handleSubmit}
              aria-label="Send"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg"
            >
              <ArrowUp className="size-3.5" strokeWidth={2.5} />
            </Button>
          )}
        </div>
      </div>
    </footer>
  )
}
