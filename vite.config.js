const path = require('path');
const { defineConfig } = require('vite');

module.exports = defineConfig({
  root: path.join(__dirname, 'client'),
  server: {
    port: 5173,
    proxy: {
      '/moods': 'http://localhost:3000',
      '/songs': 'http://localhost:3000',
      '/watchlist': 'http://localhost:3000',
      '/history': 'http://localhost:3000',
      '/undo': 'http://localhost:3000',
      '/preview': 'http://localhost:3000',
    },
  },
  build: {
    outDir: path.join(__dirname, 'client', 'dist'),
    emptyOutDir: true,
  },
});
