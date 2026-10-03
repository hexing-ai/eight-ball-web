import { defineConfig } from 'vite';
export default defineConfig(({mode})=>({
  root: 'web', base: './',
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify(process.env.VITE_DEMO ?? (mode==='demo'?'true':'false')) },
  build: { outDir: '../web-dist', emptyOutDir: true, target: 'es2022' },
  server: {
    host: '127.0.0.1', port: Number(process.env.DEV_PORT ?? 5188), strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:2567',
      '/matchmake': 'http://127.0.0.1:2567',
      '/socket': { target: 'ws://127.0.0.1:2567', ws: true, rewrite: p => p.replace(/^\/socket/, '') },
    },
  },
}));
