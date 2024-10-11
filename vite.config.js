import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createHtmlPlugin } from 'vite-plugin-html';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'data/public'),
  plugins: [
    vue(),
    createHtmlPlugin(),
  ],
  build: {
    outDir: path.resolve(__dirname, 'data/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'data/public/index.html'),
      },
      output: {
        globals: {
          'three': 'THREE'
        }
      }
    }
  },
  publicDir: path.resolve(__dirname, 'data/public/assets'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'data/public/js'),
      'vue': 'vue/dist/vue.esm-bundler.js'
    },
    extensions: ['.js', '.json', '.vue'] // Add explicit extensions to resolve
  },
  server: {
    open: true,
    port: 3000
  },
  optimizeDeps: {
    include: ['three', 'vue'],
  }
});