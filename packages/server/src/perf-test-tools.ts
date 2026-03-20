import { resolve } from 'path'
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk'
import { config } from 'dotenv'
import { z } from 'zod'

config({ path: resolve(import.meta.dirname, '../../../.env') })

async function testWithTools() {
  console.log('=== Agent SDK with MCP tool ===')

  let toolCallCount = 0
  const myTool = tool(
    'say_hello',
    'Returns a greeting message',
    { name: z.string() },
    async (args) => {
      toolCallCount++
      console.log(`[tool] say_hello called with name=${args.name} (${Date.now()})`)
      return { content: [{ type: 'text' as const, text: `Hello, ${args.name}!` }] }
    },
  )

  const server = createSdkMcpServer({ name: 'test', tools: [myTool] })

  const t0 = Date.now()
  let turnCount = 0

  for await (const message of query({
    prompt: 'Call the say_hello tool with name="World", then stop.',
    options: {
      tools: [],
      mcpServers: { test: server },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      model: 'claude-sonnet-4-6',
    },
  })) {
    turnCount++
    const elapsed = Date.now() - t0
    const msgType =
      'result' in message ? 'result' : ((message as Record<string, unknown>).type as string)
    console.log(`[${elapsed}ms] Turn ${turnCount}: ${msgType}`)

    if ('result' in message) {
      console.log(`\nResult: ${message.result}`)
      break
    }
  }

  const total = Date.now() - t0
  console.log(`\nTotal: ${total}ms, ${turnCount} turns, ${toolCallCount} tool calls`)
}

testWithTools().catch(console.error)
