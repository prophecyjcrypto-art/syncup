import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devResultsAllowed } from './src/lib/devPreview'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { port: 5173 },
  define: {
    __SYNCUP_DEV_RESULTS__: JSON.stringify(devResultsAllowed(command === 'serve', process.env.VERCEL_ENV)),
  },
}))
