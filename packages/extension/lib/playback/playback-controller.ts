import picomatch from 'picomatch'

// Inline types to avoid cross-package dependency in extension
interface GuideSubstep {
  targetSelector: string | string[]
  hint: string
  triggersNavigation?: boolean
}

interface GuideStep {
  id: string
  instruction: string
  substeps: GuideSubstep[]
}

interface GuidePage {
  urlPattern: string
  title: string
  steps: GuideStep[]
}

interface Guide {
  id: string
  title: string
  description: string
  pages: GuidePage[]
}

interface PlaybackState {
  guideId: string
  currentPageIndex: number
  currentStepIndex: number
  currentSubstepIndex: number
  active: boolean
}

export class PlaybackController {
  private guide: Guide
  private pageIndex = 0
  private stepIndex = 0
  private substepIndex = 0

  constructor(guide: Guide) {
    this.guide = guide
  }

  getState(): PlaybackState {
    return {
      guideId: this.guide.id,
      currentPageIndex: this.pageIndex,
      currentStepIndex: this.stepIndex,
      currentSubstepIndex: this.substepIndex,
      active: true,
    }
  }

  getCurrentSubstep(): GuideSubstep | null {
    const page = this.guide.pages[this.pageIndex]
    if (!page) return null
    const step = page.steps[this.stepIndex]
    if (!step) return null
    return step.substeps[this.substepIndex] ?? null
  }

  next(): void {
    const page = this.guide.pages[this.pageIndex]
    if (!page) return

    const step = page.steps[this.stepIndex]
    if (!step) return

    // Try next substep within current step
    if (this.substepIndex < step.substeps.length - 1) {
      this.substepIndex++
      return
    }

    // Try next step within current page
    if (this.stepIndex < page.steps.length - 1) {
      this.stepIndex++
      this.substepIndex = 0
      return
    }

    // At last step of current page — do not cross page boundary
  }

  previous(): void {
    // If at substep > 0, go to substep 0 (step beginning)
    if (this.substepIndex > 0) {
      this.substepIndex = 0
      return
    }

    // If at substep 0, step > 0, go to previous step substep 0
    if (this.stepIndex > 0) {
      this.stepIndex--
      this.substepIndex = 0
      return
    }

    // At step 0 of current page — do nothing
  }

  onUrlChange(url: string): void {
    // Find the most specific matching page (longest pattern wins)
    let bestIndex = -1
    let bestLength = -1

    for (let i = 0; i < this.guide.pages.length; i++) {
      const page = this.guide.pages[i]!
      if (this.matchUrlPattern(url, page.urlPattern) && page.urlPattern.length > bestLength) {
        bestIndex = i
        bestLength = page.urlPattern.length
      }
    }

    if (bestIndex !== -1 && bestIndex !== this.pageIndex) {
      this.pageIndex = bestIndex
      this.stepIndex = 0
      this.substepIndex = 0
    }
  }

  private matchUrlPattern(url: string, pattern: string): boolean {
    return picomatch.isMatch(url, pattern)
  }
}
