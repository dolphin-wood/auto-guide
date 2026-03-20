import type { ActionRecord, ActionType } from '@auto-guide/shared'

interface RecordInput {
  action: ActionType
  ref?: string
  description?: string
  computedSelector?: string
  postSelector?: string
  guideTargetRef?: string
  guideTargetSelector?: string
  params?: Record<string, string>
  url: string
}

export class ActionRecorder {
  private log: ActionRecord[] = []

  record(input: RecordInput): void {
    this.log.push({
      ...input,
      timestamp: Date.now(),
    })
  }

  getActionLog(): ActionRecord[] {
    return [...this.log]
  }

  reset(): void {
    this.log = []
  }
}
