import type { Guide } from '@auto-guide/shared'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateGuide(guide: Guide): ValidationResult {
  const errors: string[] = []

  if (guide.pages.length === 0) {
    errors.push('Guide must have at least one page')
  }

  for (let pi = 0; pi < guide.pages.length; pi++) {
    const page = guide.pages[pi]!

    if (!page.title) {
      errors.push(`Page ${pi} must have a non-empty title`)
    }

    if (page.steps.length === 0) {
      errors.push(`Page ${pi} ("${page.title}") must have at least one step`)
    }

    for (let si = 0; si < page.steps.length; si++) {
      const step = page.steps[si]!

      if (step.substeps.length === 0) {
        errors.push(
          `Step ${si} ("${step.instruction}") in page ${pi} must have at least one substep`,
        )
      }

      for (let ssi = 0; ssi < step.substeps.length; ssi++) {
        const substep = step.substeps[ssi]!

        const selectors = Array.isArray(substep.targetSelector)
          ? substep.targetSelector
          : [substep.targetSelector]
        if (selectors.length === 0 || selectors.some((s) => !s)) {
          errors.push(
            `Substep ${ssi} in step ${si}, page ${pi} must have a non-empty targetSelector`,
          )
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
