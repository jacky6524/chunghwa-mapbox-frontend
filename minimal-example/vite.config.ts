import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 讓 build 出來的 dist/ 可以放在任何子路徑(或離線包)底下。
export default defineConfig({
    base: './',
    plugins: [react()],
});
