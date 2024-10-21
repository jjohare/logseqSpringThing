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
    },
    target: 'esnext',
    minify: 'terser',
    sourcemap: true,
  },
  publicDir: path.resolve(__dirname, 'data/public/assets'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'data/public/js'),
      'vue': 'vue/dist/vue.esm-bundler.js',
      'three': 'three',
      'three/examples/jsm/misc/GPUComputationRenderer': 'three/examples/jsm/misc/GPUComputationRenderer.js'
    },
    extensions: ['.js', '.json', '.vue']
  },
  server: {
    open: true,
    port: 3000
  },
  optimizeDeps: {
    include: ['three', 'vue'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  esbuild: {
    target: 'esnext'
  }
});
