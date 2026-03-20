import { cn } from '@/lib/ui/utils'
import React from 'react'
import { Streamdown } from 'streamdown'

interface ChatMarkdownProps {
  children?: string | null
  className?: string
  isStreaming?: boolean
}

export function ChatMarkdown({ children, className, isStreaming }: ChatMarkdownProps) {
  if (!children) return null

  return (
    <div
      className={cn(
        'text-sm leading-5',
        '[&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1',
        '[&_pre]:bg-muted [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:p-2 [&_pre]:text-xs',
        '[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_a]:text-primary [&_a]:underline',
        '[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:text-muted-foreground [&_th]:pb-1 [&_th]:text-left [&_th]:font-medium',
        '[&_td]:py-0.5 [&_td]:pr-3',
        '[&_thead]:border-border [&_thead]:border-b',
        className,
      )}
    >
      <Streamdown isAnimating={isStreaming} controls={false}>
        {children}
      </Streamdown>
    </div>
  )
}
