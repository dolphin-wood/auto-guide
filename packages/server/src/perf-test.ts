/**
 * Performance test: measures Agent SDK query() overhead vs raw Anthropic API.
 */
import { resolve } from 'path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'

config({ path: resolve(import.meta.dirname, '../../../.env') })

async function testRawAPI() {
  console.log('=== Raw Anthropic API ===')
  const client = new Anthropic()
  const t0 = Date.now()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
  })
  const t1 = Date.now()
  console.log(`Time: ${t1 - t0}ms`)
  console.log(`Response: ${response.content[0]?.type === 'text' ? response.content[0].text : ''}`)
}

async function testAgentSDK() {
  console.log('\n=== Agent SDK query() ===')
  const t0 = Date.now()
  let firstMessageTime = 0
  let resultTime = 0

  for await (const message of query({
    prompt: 'Say "hello" and nothing else. Do not use any tools.',
    options: {
      tools: [],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      model: 'claude-sonnet-4-6',
    },
  })) {
    if (!firstMessageTime) firstMessageTime = Date.now()
    if ('result' in message) {
      resultTime = Date.now()
      console.log(`Result: ${message.result}`)
    }
  }

  console.log(`Time to first message: ${firstMessageTime - t0}ms`)
  console.log(`Total time: ${resultTime - t0}ms`)
}

async function main() {
  await testRawAPI()
  await testAgentSDK()
}

main().catch(console.error)
