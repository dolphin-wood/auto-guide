import { Button } from '@/lib/ui/button'
import { cn } from '@/lib/ui/utils'
import { Check, ChevronRight, FileText } from 'lucide-react'
import React, { useEffect, useRef } from 'react'

interface GuideSubstep {
  hint: string
}

interface GuideStep {
  id: string
  instruction: string
  substeps: GuideSubstep[]
}

interface GuidePage {
  title: string
  urlPattern: string
  steps: GuideStep[]
}

interface Guide {
  title: string
  description: string
  pages: GuidePage[]
}

interface PlaybackViewProps {
  guide: Guide
  currentPageIndex: number
  currentStepIndex: number
  currentSubstepIndex: number
  onNext: () => void
  onPrevious: () => void
  onStopPlayback: () => void
}

export function PlaybackView({
  guide,
  currentPageIndex,
  currentStepIndex,
  currentSubstepIndex,
  onNext,
  onPrevious,
  onStopPlayback,
}: PlaybackViewProps) {
  const currentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentPageIndex, currentStepIndex, currentSubstepIndex])

  let globalIndex = 0
  for (let pi = 0; pi < currentPageIndex; pi++) {
    globalIndex += guide.pages[pi]!.steps.length
  }
  globalIndex += currentStepIndex
  const totalSteps = guide.pages.reduce((s, p) => s + p.steps.length, 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold">{guide.title}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{guide.description}</p>
        </div>

        {/* Pages > Steps > Substeps */}
        <div className="space-y-5">
          {guide.pages.map((page, pi) => {
            const isPageCurrent = pi === currentPageIndex
            const isPagePast = pi < currentPageIndex

            return (
              <div key={pi}>
                {/* Page header */}
                <div className="mb-2 flex items-center gap-1.5">
                  <FileText
                    className={cn(
                      'size-3 shrink-0',
                      isPageCurrent
                        ? 'text-primary'
                        : isPagePast
                          ? 'text-muted-foreground/60'
                          : 'text-muted-foreground/50',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[11px] font-medium tracking-wider uppercase',
                      isPageCurrent
                        ? 'text-primary'
                        : isPagePast
                          ? 'text-muted-foreground/60'
                          : 'text-muted-foreground/50',
                    )}
                  >
                    {page.title}
                  </span>
                </div>

                {/* Steps */}
                <div className="space-y-1">
                  {page.steps.map((step, si) => {
                    const isCurrent = pi === currentPageIndex && si === currentStepIndex
                    const isPast =
                      pi < currentPageIndex || (pi === currentPageIndex && si < currentStepIndex)
                    const isFuture = !isCurrent && !isPast

                    return (
                      <div key={step.id} ref={isCurrent ? currentRef : undefined}>
                        {/* Step row */}
                        <div className="flex items-start gap-2.5 py-1">
                          {/* Step indicator */}
                          <div
                            className={cn(
                              'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full',
                              isPast && 'bg-primary',
                              isCurrent && 'bg-primary ring-primary/20 ring-2',
                              isFuture && 'bg-muted-foreground/20',
                            )}
                          >
                            {isPast && (
                              <Check className="text-primary-foreground size-2.5" strokeWidth={3} />
                            )}
                          </div>

                          <p
                            className={cn(
                              'flex-1 text-sm leading-5',
                              isCurrent && 'text-foreground font-medium',
                              isPast &&
                                'text-muted-foreground decoration-muted-foreground/30 line-through',
                              isFuture && 'text-muted-foreground/50',
                            )}
                          >
                            {step.instruction}
                          </p>
                        </div>

                        {/* Substeps */}
                        {step.substeps.length > 0 && (
                          <div className="ml-6.5 space-y-0.5 pb-1">
                            {step.substeps.map((sub, ssi) => {
                              const isSubCurrent = isCurrent && ssi === currentSubstepIndex
                              const isSubPast = isPast || (isCurrent && ssi < currentSubstepIndex)

                              return (
                                <div key={ssi} className="flex items-start gap-1.5 py-0.5">
                                  {isSubCurrent ? (
                                    <ChevronRight className="text-primary mt-0.5 size-3 shrink-0" />
                                  ) : (
                                    <span
                                      className={cn(
                                        'mt-1.5 size-1 shrink-0 rounded-full',
                                        isSubPast ? 'bg-primary/40' : 'bg-muted-foreground/20',
                                      )}
                                    />
                                  )}
                                  <p
                                    className={cn(
                                      'text-xs leading-4',
                                      isSubCurrent && 'text-foreground font-medium',
                                      isSubPast &&
                                        'text-muted-foreground/50 decoration-muted-foreground/20 line-through',
                                      !isSubCurrent && !isSubPast && 'text-muted-foreground/40',
                                    )}
                                  >
                                    {sub.hint}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="border-border flex items-center gap-2 border-t p-3">
        <span className="text-muted-foreground flex-1 text-xs">
          {globalIndex + 1} / {totalSteps}
        </span>
        <Button variant="outline" size="sm" onClick={onPrevious}>
          Back
        </Button>
        <Button size="sm" onClick={onNext}>
          Next
        </Button>
        <Button variant="destructive" size="sm" onClick={onStopPlayback}>
          Stop
        </Button>
      </div>
    </div>
  )
}
