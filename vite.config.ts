import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

const isTest = Boolean(process.env.VITEST)

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    react(),
    // Electron's renderer crypto polyfill breaks Node `crypto` under Vitest.
    ...(isTest
      ? []
      : [
          electron({
            main: {
              entry: 'electron/main.ts',
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: {
                    external: ['ffmpeg-static', 'electron-updater', 'sharp', 'yazl'],
                    output: {
                      entryFileNames: 'main.js',
                    },
                  },
                },
              },
            },
            preload: {
              input: 'electron/preload.ts',
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: {
                    output: {
                      format: 'cjs',
                      entryFileNames: 'preload.cjs',
                      // Electron preloads are loaded as CJS; .mjs would break require().
                    },
                  },
                },
              },
            },
            renderer: {},
          }),
        ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
