import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/naga3-mini-games/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        walking: resolve(__dirname, 'src/games/walking-demo/index.html'),
        snake: resolve(__dirname, 'src/games/snake/index.html'),
        jump: resolve(__dirname, 'src/games/jump/index.html'),
        'daruma-jump': resolve(__dirname, 'src/games/daruma-jump/index.html'),
        'hamster-racing': resolve(__dirname, 'src/games/hamster-racing/index.html'),
      },
    },
  },
})
