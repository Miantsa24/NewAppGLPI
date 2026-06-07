import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // En développement, toutes les requêtes /api/* sont transmises à Express
    // → le navigateur croit parler au même serveur, pas de problème CORS
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
