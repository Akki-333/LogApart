import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Component tests run in a simulated DOM. See src/test.
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false
  }
})
