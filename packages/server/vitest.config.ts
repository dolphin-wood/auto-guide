import { resolve } from 'path'
import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Load .env from project root
config({ path: resolve(__dirname, '../../.env') })

export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
})
