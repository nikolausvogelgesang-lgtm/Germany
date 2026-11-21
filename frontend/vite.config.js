import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'

const proxy = {'/api': 'http://127.0.0.1:3001'}
export default defineConfig({
  plugins: [react()],
  server: {strictPort:true, proxy, fs:{allow:['.', fileURLToPath(new URL('../shared', import.meta.url))]}},
  preview: {proxy},
})
