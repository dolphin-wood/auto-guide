import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk'
import { config } from 'dotenv'
import { z } from 'zod'

config({ path: resolve(import.meta.dirname, '../../../.env') })

async function main() {
  // Valid 1x1 red PNG
  const testImageBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

  // MCP image format: { type: "image", data: base64, mimeType: "image/..." }
  const imageTool = tool('get_image', 'Returns a test image', {}, async () => {
    return {
      content: [
        { type: 'text', text: 'Here is a test image:' },
        { type: 'image', data: testImageBase64, mimeType: 'image/png' },
      ],
    } as never
  })

  const textOnlyTool = tool('get_text', 'Returns text only', {}, async () => {
    return {
      content: [{ type: 'text' as const, text: 'Just text, no image.' }],
    }
  })

  const server = createSdkMcpServer({ name: 'test', tools: [imageTool, textOnlyTool] })

  console.log('=== Testing MCP tool with image content block ===\n')

  try {
    for await (const message of query({
      prompt: 'Call the get_image tool, then describe what you received.',
      options: {
        tools: [],
        mcpServers: { test: server },
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        model: 'claude-sonnet-4-6',
        maxTurns: 5,
      },
    })) {
      const msg = message as Record<string, unknown>

      if ('result' in message) {
        console.log(`\n[RESULT] ${message.result}`)
        break
      }

      if (msg.type === 'assistant') {
        console.log(`[assistant] keys=${Object.keys(msg).join(',')}`)
      }
    }
  } catch (err) {
    console.error('Query failed:', err)
  }

  console.log('\nDone.')
}

main().catch(console.error)
