interface Guide {
  id: string
  title: string
  description: string
  pages: Array<{
    urlPattern: string
    title: string
    steps: Array<{
      id: string
      instruction: string
      substeps: Array<{
        targetSelector: string
        hint: string
        triggersNavigation?: boolean
      }>
    }>
  }>
}

interface SavedGuide {
  guide: Guide
  createdAt: number
  lastUsedAt?: number
}

const STORAGE_KEY = 'auto_guide_saved_guides'

export async function saveGuide(guide: Guide): Promise<void> {
  const guides = await loadGuides()
  const existing = guides.findIndex((g) => g.guide.id === guide.id)
  const entry: SavedGuide = { guide, createdAt: Date.now() }

  if (existing >= 0) {
    guides[existing] = entry
  } else {
    guides.unshift(entry)
  }

  await browser.storage.local.set({ [STORAGE_KEY]: guides })
}

export async function loadGuides(): Promise<SavedGuide[]> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as SavedGuide[] | undefined) ?? []
}

export async function deleteGuide(guideId: string): Promise<void> {
  const guides = await loadGuides()
  const filtered = guides.filter((g) => g.guide.id !== guideId)
  await browser.storage.local.set({ [STORAGE_KEY]: filtered })
}

export async function markGuideUsed(guideId: string): Promise<void> {
  const guides = await loadGuides()
  const entry = guides.find((g) => g.guide.id === guideId)
  if (entry) {
    entry.lastUsedAt = Date.now()
    await browser.storage.local.set({ [STORAGE_KEY]: guides })
  }
}

export type { Guide, SavedGuide }
