import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Project root directory (one level up from client)
const projectRoot = resolve(__dirname, '..');

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()], // Keep the array syntax
    build: {
        outDir: resolve(projectRoot, 'data/public/dist'),
        assetsDir: 'assets',
        sourcemap: true,
        minify: false, // Disable minification for better debugging
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            '@/components': resolve(__dirname, './src/components'),
            '@/lib': resolve(__dirname, './src/lib'),
            'hls.js': resolve(__dirname, '../node_modules/hls.js/dist/hls.min.js'),
        },
    },
    server: {
        port: 3000,
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
            '/wss': {
                target: 'ws://localhost:4000',
                ws: true,
            },
        },
    },
    // Force use of esbuild for TypeScript compilation
    esbuild: {
        logOverride: { 'this-is-undefined-in-esm': 'silent' }
    },
    // Skip TypeScript type checking if SKIP_TS_CHECK is set
    typescript: {
        typeCheck: process.env.SKIP_TS_CHECK !== 'true'
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'es2020'
        }
    }
});
