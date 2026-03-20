import { EventEmitter } from 'node:events'
import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk'
import type { Guide } from '@auto-guide/shared'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { logger } from '../logger.js'
import type { CDPRelay } from '../relay/cdp-relay.js'
import { ActionRecorder } from './action-recorder.js'
import { createBrowserMcpTools } from './browser-tools.js'
import { GUIDE_GENERATION_PROMPT } from './prompts.js'

type OrchestratorState = 'idle' | 'running'

export class AgentOrchestrator extends EventEmitter {
  private state: OrchestratorState = 'idle'
  private submittedGuide: Guide | null = null
  private abortController: AbortController | null = null
  private recorder = new ActionRecorder()
  private browser: Browser | null = null
  private page: Page | null = null
  private cdpEndpoint: string
  private relay: CDPRelay | undefined
  private toolNameMap = new Map<string, string>()
  private sessionId: string | null = null

  constructor(cdpEndpoint: string, relay?: CDPRelay) {
    super()
    this.cdpEndpoint = cdpEndpoint
    this.relay = relay
  }

  getState(): OrchestratorState {
    return this.state
  }

  hasGuideBeenSubmitted(): boolean {
    return this.submittedGuide !== null
  }

  markGuideSubmitted(guide: Guide): void {
    this.submittedGuide = guide
    this.emit('guide_complete', { guide })
  }

  getSubmittedGuide(): Guide | null {
    return this.submittedGuide
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.cleanup()
    this.state = 'idle'
    this.emit('generation_stopped')
  }

  startGeneration(journey: string, _startUrl: string): void {
    this.state = 'running'
    this.submittedGuide = null
    this.recorder.reset()
    this.toolNameMap.clear()
    this.abortController = new AbortController()

    this.runAgent(journey).catch((err) => {
      logger.error({ err }, 'Agent error')
      this.emit('message', { type: 'error', data: { message: String(err) } })
      this.cleanup()
      this.state = 'idle'
    })
  }

  private async runAgent(journey: string): Promise<void> {
    // Connect Playwright through CDP relay if not already connected
    if (!this.page) {
      if (this.relay) {
        this.relay.setTargetTab({ url: journey })
      }
      logger.info({ endpoint: this.cdpEndpoint }, 'Connecting to CDP relay')
      this.browser = await chromium.connectOverCDP(this.cdpEndpoint)

      let retries = 0
      while (retries < 10) {
        const contexts = this.browser.contexts()
        if (contexts.length > 0 && contexts[0]!.pages().length > 0) {
          this.page = contexts[0]!.pages()[0]!
          break
        }
        await new Promise((r) => setTimeout(r, 500))
        retries++
      }
      if (!this.page) {
        throw new Error('No browser page available after connecting to CDP relay')
      }
      logger.info({ url: this.page.url() }, 'Connected to page')
    }

    const mcpTools = createBrowserMcpTools({
      getPage: () => this.page,
      recorder: this.recorder,
      onGuideSubmitted: (guide) => this.markGuideSubmitted(guide),
    })

    const mcpServer = createSdkMcpServer({ name: 'browser', tools: mcpTools })

    const prompt = `${GUIDE_GENERATION_PROMPT}\n\nUser journey: ${journey}`

    let thinkingId: string | null = null
    let hasReceivedStreamEvents = false

    for await (const message of query({
      prompt,
      options: {
        tools: ['Read', 'Grep', 'Glob'],
        mcpServers: { browser: mcpServer },
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        model: 'claude-opus-4-6',
        includePartialMessages: true,
        abortController: this.abortController ?? undefined,
        ...(this.sessionId ? { resume: this.sessionId } : {}),
      },
    })) {
      // ResultMessage — agent finished (don't re-emit text, already streamed)
      if ('result' in message) {
        this.state = 'idle'
        this.emit('message', { type: 'generation_finished', data: {} })
        continue
      }

      const msg = message as Record<string, unknown>
      if (msg.type === 'stream_event') {
        const evt = msg.event as Record<string, unknown>
        logger.debug(
          { msgType: msg.type, eventType: evt?.type, keys: Object.keys(evt ?? {}) },
          'stream_event',
        )
      } else {
        logger.debug({ type: msg.type }, 'Agent message')
      }

      // StreamEvent — real-time streaming deltas
      if (msg.type === 'stream_event' || (msg.event && typeof msg.event === 'object')) {
        hasReceivedStreamEvents = true
        const event = (msg.event ?? msg) as Record<string, unknown>
        const eventType = event.type as string

        if (eventType === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown>
          if (delta?.type === 'text_delta') {
            this.emit('message', { type: 'agent_text_delta', data: { text: delta.text as string } })
          } else if (delta?.type === 'thinking_delta') {
            if (!thinkingId) {
              thinkingId = `think-${Date.now()}`
              this.emit('message', { type: 'agent_think_start', data: { id: thinkingId } })
            }
            this.emit('message', {
              type: 'agent_think_progress',
              data: { id: thinkingId, text: delta.thinking as string },
            })
          }
        } else if (eventType === 'content_block_stop') {
          if (thinkingId) {
            this.emit('message', {
              type: 'agent_think_finished',
              data: { id: thinkingId, text: '' },
            })
            thinkingId = null
          }
        }
        continue
      }

      // AssistantMessage — complete content blocks
      if (msg.type === 'assistant') {
        const assistantMsg = msg.message as
          | {
              content?: Array<{
                type: string
                text?: string
                thinking?: string
                name?: string
                input?: unknown
                id?: string
              }>
            }
          | undefined
        if (assistantMsg?.content) {
          for (const block of assistantMsg.content) {
            // Emit text/thinking only if no stream_events delivered them
            if (!hasReceivedStreamEvents) {
              if (block.type === 'text' && block.text) {
                this.emit('message', { type: 'agent_text_delta', data: { text: block.text } })
              } else if (block.type === 'thinking' && block.thinking) {
                const tid = `think-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                this.emit('message', { type: 'agent_think_start', data: { id: tid } })
                this.emit('message', {
                  type: 'agent_think_progress',
                  data: { id: tid, text: block.thinking },
                })
                this.emit('message', {
                  type: 'agent_think_finished',
                  data: { id: tid, text: block.thinking },
                })
              }
            }
            if (block.type === 'tool_use' && block.name && block.id) {
              this.toolNameMap.set(block.id, block.name)
              this.emit('message', {
                type: 'agent_tool_use',
                data: { id: block.id, name: block.name, input: block.input ?? {} },
              })
            }
          }
        }
        continue
      }

      // UserMessage — contains tool results
      if (msg.type === 'user') {
        const userMsg = msg.message as
          | {
              content?: Array<{
                type: string
                tool_use_id?: string
                content?: string | Array<unknown>
                is_error?: boolean
              }>
            }
          | string
          | undefined
        if (typeof userMsg === 'object' && userMsg?.content) {
          for (const block of userMsg.content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const toolName = this.toolNameMap.get(block.tool_use_id) ?? 'unknown'
              const resultText =
                typeof block.content === 'string'
                  ? block.content
                  : JSON.stringify(block.content ?? '')
              this.emit('message', {
                type: 'agent_tool_result',
                data: {
                  id: `result-${block.tool_use_id}`,
                  toolUseId: block.tool_use_id,
                  toolName,
                  result: resultText.slice(0, 500),
                  isError: block.is_error,
                },
              })
            }
          }
        }
        continue
      }

      // SystemMessage — capture session ID for resume
      if (msg.type === 'system') {
        const subtype = msg.subtype as string
        if (subtype === 'init') {
          this.sessionId = (msg as { session_id?: string }).session_id ?? null
          logger.info({ sessionId: this.sessionId }, 'Agent session started')
        }
        continue
      }

      // Rate limit
      if (msg.type === 'rate_limit_event') {
        logger.warn({ info: msg.rate_limit_info }, 'Rate limit event')
        continue
      }
    }
  }

  private cleanup(): void {
    this.browser?.close().catch(() => {})
    this.browser = null
    this.page = null
    this.sessionId = null
  }
}
