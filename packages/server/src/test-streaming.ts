import { resolve } from 'path'
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk'
import { config } from 'dotenv'
import { z } from 'zod'

config({ path: resolve(import.meta.dirname, '../../../.env') })

async function main() {
  const myTool = tool('say_hello', 'Returns hello', { name: z.string() }, async (args) => {
    return { content: [{ type: 'text' as const, text: `Hello, ${args.name}!` }] }
  })
  const server = createSdkMcpServer({ name: 'test', tools: [myTool] })

  console.log('=== Testing includePartialMessages: true ===\n')

  for await (const message of query({
    prompt: 'Say hello to "World" using the say_hello tool, then write a haiku about coding.',
    options: {
      tools: [],
      mcpServers: { test: server },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      model: 'claude-sonnet-4-6',
      includePartialMessages: true,
    },
  })) {
    const msg = message as Record<string, unknown>

    if ('result' in message) {
      console.log(`\n[RESULT] ${message.result}`)
      break
    }

    if (msg.type === 'stream_event') {
      const event = msg.event as Record<string, unknown>
      const eventType = event?.type as string
      if (eventType === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>
        process.stdout.write(
          delta?.type === 'text_delta'
            ? (delta.text as string)
            : delta?.type === 'thinking_delta'
              ? `[think:${(delta.thinking as string).slice(0, 30)}]`
              : `[${delta?.type}]`,
        )
      } else if (eventType === 'content_block_start' || eventType === 'content_block_stop') {
        console.log(`\n--- ${eventType} ---`)
      }
    } else {
      console.log(`[${msg.type}] keys=${Object.keys(msg).join(',')}`)
    }
  }
}

main().catch(console.error)
