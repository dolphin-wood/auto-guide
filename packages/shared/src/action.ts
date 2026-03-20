export type ActionType = 'click' | 'fill' | 'select' | 'compute'

export interface ActionRecord {
  action: ActionType
  ref?: string
  description?: string
  computedSelector?: string
  postSelector?: string
  guideTargetRef?: string
  guideTargetSelector?: string
  params?: Record<string, string>
  url: string
  timestamp: number
}
