import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Auto Guide',
    description: 'AI-powered automatic guide generation',
    permissions: ['tabs', 'debugger', 'sidePanel', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Open Auto Guide',
    },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      delete (manifest as Record<string, unknown>).side_panel
    },
  },
})
