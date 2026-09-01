import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src/player'],
      outDir: 'dist/lib/types',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    outDir: 'dist/lib',
    lib: {
      entry: path.resolve(__dirname, 'src/player/index.ts'),
      name: 'SecurePlayer',
      formats: ['es', 'umd'],
      fileName: (format) => `secure-player.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
        },
        exports: 'named',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'secure-player.css';
          return assetInfo.name || '';
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep security audit logs active
        drop_debugger: true,
        pure_funcs: [],
        passes: 3,
        unsafe: true,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false, // Strip comments from production build
      },
    },
    sourcemap: false, // Disable sourcemaps to protect source logic
  },
});
