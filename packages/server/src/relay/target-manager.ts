import type { TargetInfo } from '@auto-guide/shared'

export class TargetManager {
  private targetsBySession = new Map<string, TargetInfo>()
  private sessionByTarget = new Map<string, string>()

  addTarget(sessionId: string, target: TargetInfo): void {
    this.targetsBySession.set(sessionId, target)
    this.sessionByTarget.set(target.targetId, sessionId)
  }

  getTargetBySessionId(sessionId: string): TargetInfo | undefined {
    return this.targetsBySession.get(sessionId)
  }

  getSessionIdByTargetId(targetId: string): string | undefined {
    return this.sessionByTarget.get(targetId)
  }

  removeBySessionId(sessionId: string): void {
    const target = this.targetsBySession.get(sessionId)
    if (target) {
      this.sessionByTarget.delete(target.targetId)
    }
    this.targetsBySession.delete(sessionId)
  }

  getAllTargets(): TargetInfo[] {
    return [...this.targetsBySession.values()]
  }

  getFirstSessionId(): string | undefined {
    const first = this.targetsBySession.keys().next()
    return first.done ? undefined : first.value
  }

  updateTarget(targetId: string, updates: Partial<TargetInfo>): void {
    const sessionId = this.sessionByTarget.get(targetId)
    if (!sessionId) return
    const target = this.targetsBySession.get(sessionId)
    if (!target) return
    this.targetsBySession.set(sessionId, { ...target, ...updates })
  }
}
