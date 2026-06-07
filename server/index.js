import 'dotenv/config'

import express from 'express'
import cors    from 'cors'
import axios   from 'axios'
import db      from './db.js'

const app  = express()
const PORT = process.env.PORT || 3001

// ── Middlewares globaux ────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', db: 'connected' })
})

// ── Authentification Backoffice : code unique (pas de login classique) ────────
// Le frontend envoie le code saisi ; on le compare au code attendu côté serveur.
// Pas de token ni de session complexe : juste un "oui/non" — la protection réelle
// se fait ensuite côté frontend (ProtectedRoute) en mémorisant ce "oui".
app.post('/api/backoffice/login', (req, res) => {
  const { code } = req.body

  if (!code) {
    return res.status(400).json({ ok: false, error: 'Code requis' })
  }

  if (code === process.env.BACKOFFICE_CODE) {
    res.json({ ok: true })
  } else {
    res.status(401).json({ ok: false, error: 'Code incorrect' })
  }
})

// ── Authentification : Password Grant ─────────────────────────────────────────
// L'utilisateur entre ses credentials GLPI dans le formulaire NewApp.
// Express les transmet à GLPI via OAuth2 "password grant" (grant_type=password).
// GLPI vérifie les credentials et retourne un access_token si valides.
// Avantage : pas de redirection, pas de code temporaire, réponse immédiate.
// Notre client OAuth2 GLPI supporte ce grant ("mot de passe" dans la config).
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'username et password requis' })
  }

  try {
    const response = await axios.post(
      `${process.env.GLPI_BASE_URL}/api.php/token`,
      // Corps en application/x-www-form-urlencoded : format standard OAuth2
      new URLSearchParams({
        grant_type:    'password',          // credentials directs, pas de code intermédiaire
        username,                           // nom d'utilisateur GLPI
        password,                           // mot de passe GLPI
        client_id:     process.env.GLPI_CLIENT_ID,
        client_secret: process.env.GLPI_CLIENT_SECRET,
        scope:         'user api email status graphql inventory' // tous les scopes du client
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    // GLPI répond : { access_token, token_type: "Bearer", expires_in, ... }
    console.log('[auth/login] Authentification réussie pour:', username)
    res.json(response.data)
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[auth/login] Erreur GLPI:', JSON.stringify(glpiError))
    res.status(401).json({ error: glpiError })
  }
})

// ── Proxy GLPI API ─────────────────────────────────────────────────────────────
app.use('/api/glpi', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Token manquant' })

  const targetUrl = `${process.env.GLPI_API_URL}${req.path}`
  console.log(`[proxy] ${req.method} ${targetUrl}`)

  // Accept: application/json → indique à GLPI qu'on attend du JSON en réponse
  // Content-Type uniquement sur les requêtes avec corps (POST, PUT, PATCH)
  const headers = { Authorization: authHeader, Accept: 'application/json' }
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    headers['Content-Type'] = 'application/json'
  }

  try {
    const glpiResponse = await axios({
      method:  req.method,
      url:     targetUrl,
      headers,
      data:   req.body,
      params: req.query
    })
    res.json(glpiResponse.data)
  } catch (err) {
    const status = err.response?.status ?? 500
    const body   = err.response?.data   ?? { error: err.message }
    // Log formaté pour voir le corps COMPLET de l'erreur GLPI (utile pour diagnostiquer)
    console.error(`[proxy] Erreur ${status} sur ${targetUrl}:`, JSON.stringify(body, null, 2))
    res.status(status).json(body)
  }
})

// ── Démarrage ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Serveur Express démarré sur http://localhost:${PORT}`)
  console.log(`  GLPI_BASE_URL = ${process.env.GLPI_BASE_URL}`)
})
