import { cn } from '@/lib/ui/utils'
import React from 'react'

export function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 px-3 py-1', className)}>
      <span className="bg-muted-foreground/40 size-1.5 animate-[loading-dot_1.2s_ease-in-out_infinite] rounded-full" />
      <span className="bg-muted-foreground/40 size-1.5 animate-[loading-dot_1.2s_ease-in-out_infinite_0.2s] rounded-full" />
      <span className="bg-muted-foreground/40 size-1.5 animate-[loading-dot_1.2s_ease-in-out_infinite_0.4s] rounded-full" />
    </div>
  )
}
