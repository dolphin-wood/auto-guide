import { markGuideUsed, saveGuide, type Guide } from '@/lib/guide/guide-storage'
import { Button } from '@/lib/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/ui/tabs'
import { Plus } from 'lucide-react'
import picomatch from 'picomatch'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChatView } from './components/chat/ChatView'
import { GuideList } from './components/guide/GuideList'
import { PlaybackView } from './components/playback/PlaybackView'
import { useChatMessages } from './hooks/use-chat-messages'
import { useWebSocket } from './hooks/use-websocket'

type ViewMode = 'tabs' | 'playback'

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('tabs')
  const [activeTab, setActiveTab] = useState('chat')
  const [isGenerating, setIsGenerating] = useState(false)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [substepIndex, setSubstepIndex] = useState(0)
  const sendOverlayRef = useRef<() => void>(() => {})
  const handleNextRef = useRef<() => void>(() => {})
  const handlePreviousRef = useRef<() => void>(() => {})

  const { messages, addUserMessage, addGuideCard, handleServerMessage, clearMessages } =
    useChatMessages()

  // Listen for messages from content script
  useEffect(() => {
    const listener = (message: { type: string }) => {
      if (message.type === 'content_ready' && viewMode === 'playback') {
        setTimeout(() => sendOverlayRef.current(), 1000)
      }
      if (message.type === 'overlay_next') handleNextRef.current()
      if (message.type === 'overlay_previous') handlePreviousRef.current()
      if (message.type === 'overlay_stop') stopPlayback()
    }
    browser.runtime.onMessage.addListener(listener)
    return () => browser.runtime.onMessage.removeListener(listener)
  }, [viewMode])

  const pendingGuideRef = useRef<Guide | null>(null)

  const onServerMessage = useCallback(
    (msg: Record<string, unknown>) => {
      handleServerMessage(msg)

      if (msg.type === 'guide_complete') {
        const data = msg.data as { guide: Guide }
        setGuide(data.guide)
        saveGuide(data.guide)
        pendingGuideRef.current = data.guide
      }
      if (msg.type === 'generation_finished') {
        setIsGenerating(false)
        // Add guide card after all text has been received
        if (pendingGuideRef.current) {
          addGuideCard(pendingGuideRef.current.title)
          pendingGuideRef.current = null
        }
      }
    },
    [handleServerMessage, addGuideCard],
  )

  const { send } = useWebSocket(onServerMessage)

  // tabId is passed via URL query param from background.ts (like Claude extension)
  const boundTabId = (() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('tabId')
    return id ? Number(id) : undefined
  })()

  async function getTabInfo(): Promise<{ tabId?: number; url?: string }> {
    if (boundTabId) {
      try {
        const tab = await browser.tabs.get(boundTabId)
        return { tabId: boundTabId, url: tab.url }
      } catch {
        // Tab may have been closed
      }
    }
    // Fallback
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab =
      tabs.find(
        (t) => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'),
      ) ?? tabs[0]
    return { tabId: tab?.id, url: tab?.url }
  }

  function handleSend(text: string) {
    addUserMessage(text)
    if (isGenerating) {
      getTabInfo().then(({ tabId }) => {
        send({ type: 'user_follow_up', data: { text, tabId } })
      })
    } else {
      setIsGenerating(true)
      getTabInfo().then(({ tabId, url }) => {
        send({ type: 'generate', data: { journeyDescription: text, startUrl: url, tabId } })
      })
    }
  }

  function handleStop() {
    getTabInfo().then(({ tabId }) => {
      send({ type: 'stop', data: { tabId } })
    })
    setIsGenerating(false)
  }

  function handleNewChat() {
    if (isGenerating) handleStop()
    clearMessages()
    setGuide(null)
    setActiveTab('chat')
  }

  function startPlayback(g: Guide) {
    setGuide(g)
    setViewMode('playback')
    setPageIndex(0)
    setStepIndex(0)
    setSubstepIndex(0)
    markGuideUsed(g.id)

    // Navigate to first page URL
    const firstPageUrl = g.pages[0]?.urlPattern?.replace(/\*.*$/, '') ?? ''
    if (firstPageUrl) {
      getTargetTabId().then((tabId) => {
        if (tabId) browser.tabs.update(tabId, { url: firstPageUrl })
      })
    }

    // Overlay will be sent via useEffect when state changes + content_ready listener
  }

  // Send overlay command whenever playback position changes
  useEffect(() => {
    if (viewMode === 'playback' && guide) {
      sendOverlayCommand()
    }
  }, [viewMode, guide, pageIndex, stepIndex, substepIndex])

  // Auto-switch page when URL changes during playback
  useEffect(() => {
    if (viewMode !== 'playback' || !guide) return

    const listener = (tabId: number, changeInfo: { url?: string }) => {
      if (!changeInfo.url) return
      // Only react to our bound tab (or active tab)
      if (boundTabId && tabId !== boundTabId) return

      const url = changeInfo.url
      const matchedIndex = guide.pages.findIndex((page) => picomatch.isMatch(url, page.urlPattern))
      if (matchedIndex >= 0 && matchedIndex !== pageIndex) {
        setPageIndex(matchedIndex)
        setStepIndex(0)
        setSubstepIndex(0)
      }
    }
    browser.tabs.onUpdated.addListener(listener)
    return () => browser.tabs.onUpdated.removeListener(listener)
  }, [viewMode, guide, pageIndex, boundTabId])

  function handleNext() {
    if (!guide) return
    const page = guide.pages[pageIndex]
    if (!page) return
    const step = page.steps[stepIndex]
    if (!step) return

    if (substepIndex < step.substeps.length - 1) {
      setSubstepIndex(substepIndex + 1)
    } else if (stepIndex < page.steps.length - 1) {
      setStepIndex(stepIndex + 1)
      setSubstepIndex(0)
    }
  }

  function handlePrevious() {
    if (substepIndex > 0) {
      setSubstepIndex(0)
    } else if (stepIndex > 0) {
      setStepIndex(stepIndex - 1)
      setSubstepIndex(0)
    }
  }

  function getTargetTabId(): Promise<number | undefined> {
    if (boundTabId) return Promise.resolve(boundTabId)
    return browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.id)
  }

  function stopPlayback() {
    setViewMode('tabs')
    getTargetTabId().then((tabId) => {
      if (tabId) browser.tabs.sendMessage(tabId, { type: 'hide_overlay' }).catch(() => {})
    })
  }

  function sendOverlayCommand() {
    if (!guide) return
    const substep = guide.pages[pageIndex]?.steps[stepIndex]?.substeps[substepIndex]
    if (!substep) return

    const totalSteps = guide.pages.reduce((s, p) => s + p.steps.length, 0)
    let globalStepIndex = 0
    for (let pi = 0; pi < pageIndex; pi++) {
      globalStepIndex += guide.pages[pi]!.steps.length
    }
    globalStepIndex += stepIndex
    getTargetTabId().then((tabId) => {
      if (tabId) {
        browser.tabs
          .sendMessage(tabId, {
            type: 'show_overlay',
            data: { substep, stepIndex: globalStepIndex, substepIndex, totalSteps },
          })
          .catch(() => {})
      }
    })
  }

  sendOverlayRef.current = sendOverlayCommand
  handleNextRef.current = handleNext
  handlePreviousRef.current = handlePrevious

  // --- Playback mode ---
  if (viewMode === 'playback' && guide) {
    return (
      <div className="flex h-screen flex-col">
        <PlaybackView
          guide={guide}
          currentPageIndex={pageIndex}
          currentStepIndex={stepIndex}
          currentSubstepIndex={substepIndex}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onStopPlayback={stopPlayback}
        />
      </div>
    )
  }

  // --- Tabs mode (Chat / Guides) ---
  return (
    <div className="flex h-screen flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-3 mt-2 flex items-center gap-2">
          <TabsList className="flex-1 shrink-0">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="guides">Guides</TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="icon-xs" onClick={handleNewChat} aria-label="New chat">
            <Plus className="size-4" />
          </Button>
        </div>

        <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col">
          <ChatView
            messages={messages}
            onSend={handleSend}
            isGenerating={isGenerating}
            onStop={handleStop}
            onOpenGuide={guide ? () => startPlayback(guide) : undefined}
          />
        </TabsContent>

        <TabsContent value="guides" className="mt-0 flex min-h-0 flex-1 flex-col">
          <GuideList onStartPlayback={startPlayback} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
