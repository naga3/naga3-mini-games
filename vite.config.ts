import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/naga3-mini-games/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        walking: resolve(__dirname, 'src/games/walking-demo/index.html'),
      },
    },
  },
})
