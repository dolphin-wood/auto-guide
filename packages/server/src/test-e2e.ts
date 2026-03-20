import WebSocket from 'ws'

const WS_URL = 'ws://localhost:3100/sidepanel/ws'

async function main() {
  console.log(`Connecting to ${WS_URL}...`)
  const ws = new WebSocket(WS_URL)

  ws.on('open', () => {
    console.log('Connected to sidepanel WS')

    // Send generate message (like sidepanel does)
    const msg = {
      type: 'generate',
      data: {
        journeyDescription: '鹿児島から札幌への片道フライトを予約する',
        startUrl: 'https://www.google.com/travel/flights',
        tabId: 1,
      },
    }
    console.log(`Sending: ${JSON.stringify(msg)}`)
    ws.send(JSON.stringify(msg))
  })

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    const type = msg.type as string

    if (type === 'agent_text_delta') {
      process.stdout.write(msg.data.text)
    } else if (type === 'agent_tool_use') {
      console.log(`\n[tool] ${msg.data.name} ${JSON.stringify(msg.data.input).slice(0, 100)}`)
    } else if (type === 'agent_tool_result') {
      console.log(`[result] ${msg.data.result?.slice(0, 200)}`)
    } else if (type === 'agent_think_start') {
      process.stdout.write('\n[thinking...')
    } else if (type === 'agent_think_finished') {
      process.stdout.write('done]\n')
    } else if (type === 'guide_complete') {
      console.log(`\n[GUIDE COMPLETE] ${msg.data.guide.title}`)
    } else if (type === 'generation_finished') {
      console.log('\n[GENERATION FINISHED]')
      ws.close()
    } else if (type === 'error') {
      console.log(`\n[ERROR] ${msg.data.message}`)
      ws.close()
    } else {
      console.log(`\n[${type}] ${JSON.stringify(msg.data).slice(0, 100)}`)
    }
  })

  ws.on('close', () => {
    console.log('\nDisconnected.')
    process.exit(0)
  })

  ws.on('error', (err) => {
    console.error('WS error:', err.message)
    process.exit(1)
  })

  // Timeout after 3 minutes
  setTimeout(() => {
    console.log('\n[TIMEOUT] 3 min exceeded')
    ws.close()
    process.exit(1)
  }, 180000)
}

main().catch(console.error)
