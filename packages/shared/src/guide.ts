export interface Guide {
  id: string
  title: string
  description: string
  pages: GuidePage[]
}

export interface GuidePage {
  urlPattern: string
  title: string
  steps: GuideStep[]
}

export interface GuideStep {
  id: string
  instruction: string
  substeps: GuideSubstep[]
}

export interface GuideSubstep {
  targetSelector: string | string[]
  hint: string
  triggersNavigation?: boolean
}

export interface PlaybackState {
  guideId: string
  currentPageIndex: number
  currentStepIndex: number
  currentSubstepIndex: number
  active: boolean
}
