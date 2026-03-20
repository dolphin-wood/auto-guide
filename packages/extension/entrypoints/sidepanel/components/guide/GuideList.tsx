import { deleteGuide, loadGuides, type Guide, type SavedGuide } from '@/lib/guide/guide-storage'
import { Button } from '@/lib/ui/button'
import { cn } from '@/lib/ui/utils'
import { FileText, Play, Trash2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'

interface GuideListProps {
  onStartPlayback: (guide: Guide) => void
}

export function GuideList({ onStartPlayback }: GuideListProps) {
  const [guides, setGuides] = useState<SavedGuide[]>([])

  useEffect(() => {
    loadGuides().then(setGuides)
  }, [])

  async function handleDelete(guideId: string) {
    await deleteGuide(guideId)
    setGuides((prev) => prev.filter((g) => g.guide.id !== guideId))
  }

  if (guides.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <FileText className="text-muted-foreground/30 size-8" />
        <p className="text-sm">No saved guides</p>
        <p className="text-xs">Generate a guide from the Chat tab</p>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-3">
      {guides.map((saved) => {
        const totalSteps = saved.guide.pages.reduce((s, p) => s + p.steps.length, 0)
        const date = new Date(saved.createdAt)

        return (
          <div
            key={saved.guide.id}
            className="group border-border hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{saved.guide.title}</p>
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                {saved.guide.description}
              </p>
              <div className="text-muted-foreground/60 mt-1.5 flex items-center gap-2 text-[11px]">
                <span>{saved.guide.pages.length} pages</span>
                <span>·</span>
                <span>{totalSteps} steps</span>
                <span>·</span>
                <span>{date.toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onStartPlayback(saved.guide)}
                aria-label="Start playback"
              >
                <Play className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleDelete(saved.guide.id)}
                aria-label="Delete guide"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
