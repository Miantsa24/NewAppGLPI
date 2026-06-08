import 'dotenv/config'

import express from 'express'
import cors    from 'cors'
import axios   from 'axios'
import multer  from 'multer'
import db      from './db.js'
import { runImport, resetImportedData } from './importPipeline.js'
import { getDashboardStats } from './dashboardData.js'
import { listTickets, getTicketDetail } from './ticketsData.js'
import { createTicketWithItems } from './ticketCreation.js'

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

// ── Import des 4 fichiers (Backoffice, Phase 2) ────────────────────────────────
// "multer" est un middleware Express qui sait lire un corps "multipart/form-data"
// (le format utilisé par <input type="file">) et le transformer en objets JS
// exploitables : req.files (tableaux de Buffer en mémoire) + req.body (champs texte).
// storage: memoryStorage() → les fichiers restent en RAM (req.file.buffer), jamais
// écrits sur le disque par multer lui-même : pratique pour des petits fichiers
// qu'on va de toute façon traiter immédiatement (parser le CSV, lire le ZIP).
const upload = multer({ storage: multer.memoryStorage() })

// upload.fields([...]) : on attend PLUSIEURS champs de fichiers nommés, chacun
// avec au plus 1 fichier (maxCount: 1) — un champ par fichier attendu du formulaire.
app.post('/api/backoffice/import',
  upload.fields([
    { name: 'feuille1', maxCount: 1 },
    { name: 'feuille2', maxCount: 1 },
    { name: 'feuille3', maxCount: 1 },
    { name: 'images',   maxCount: 1 }
  ]),
  async (req, res) => {
    const files = req.files

    // Vérifie que les 4 fichiers attendus sont bien arrivés avant de lancer quoi que ce soit.
    const missing = ['feuille1', 'feuille2', 'feuille3', 'images'].filter(key => !files?.[key]?.[0])
    if (missing.length > 0) {
      return res.status(400).json({ ok: false, error: `Fichier(s) manquant(s) : ${missing.join(', ')}` })
    }

    try {
      // .buffer : contenu brut en mémoire (Buffer Node.js).
      // .toString('utf-8') : les CSV sont du texte → on les convertit en chaînes
      // pour les passer au parseur csv-parse. Le ZIP, lui, reste en Buffer binaire
      // (AdmZip sait lire directement un Buffer, pas besoin de le convertir).
      const result = await runImport({
        feuille1Csv: files.feuille1[0].buffer.toString('utf-8'),
        feuille2Csv: files.feuille2[0].buffer.toString('utf-8'),
        feuille3Csv: files.feuille3[0].buffer.toString('utf-8'),
        zipBuffer:   files.images[0].buffer
      })
      console.log(`[import] Terminé : ${result.log.length} opérations journalisées`)
      res.json(result)
    } catch (err) {
      const glpiError = err.response?.data ?? err.message
      console.error('[import] Erreur :', JSON.stringify(glpiError, null, 2))
      res.status(500).json({ ok: false, error: glpiError })
    }
  }
)

// ── Dashboard Backoffice (Phase 4) ─────────────────────────────────────────────
// Simple GET : aucun paramètre, on renvoie l'état actuel des comptages, lus
// EN DIRECT depuis GLPI (voir dashboardData.js pour le détail et la justification).
app.get('/api/backoffice/dashboard', async (req, res) => {
  try {
    const stats = await getDashboardStats()
    res.json({ ok: true, stats })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[dashboard] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Réinitialisation des données (Backoffice, Phase 3) ─────────────────────────
// Supprime de GLPI tout ce que le dernier import a créé (via le journal SQLite),
// dans l'ordre inverse de création (LIFO — voir resetImportedData), puis vide
// le journal. Pas de paramètres : l'opération porte sur "tout ce que le journal
// connaît", pas sur une sélection — d'où un simple POST sans corps.
app.post('/api/backoffice/reset', async (req, res) => {
  try {
    const result = await resetImportedData()
    console.log(`[reset] Terminé : ${result.log.length} opérations`)
    res.json(result)
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[reset] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Page Tickets : liste (Phase 5) ─────────────────────────────────────────────
// GET simple, sans paramètre : on renvoie tous les tickets, triés du plus
// récent au plus ancien, avec leurs codes type/statut/priorité déjà traduits
// en libellés lisibles (voir ticketsData.js — describeTicket).
app.get('/api/backoffice/tickets', async (req, res) => {
  try {
    const tickets = await listTickets()
    res.json({ ok: true, tickets })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[tickets] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Page Tickets : fiche détail (Phase 5) ──────────────────────────────────────
// ":id" dans le chemin → req.params.id (toujours une chaîne ; on la transmet
// telle quelle à GLPI, qui sait l'interpréter comme un identifiant numérique).
app.get('/api/backoffice/tickets/:id', async (req, res) => {
  try {
    const ticket = await getTicketDetail(req.params.id)
    res.json({ ok: true, ticket })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[tickets/:id] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
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

// ── Création de ticket avec association d'éléments (FrontOffice, Phase 7) ──────
// "Authorization" est exigé : c'est le token de l'utilisateur GLPI connecté,
// transmis tel quel à l'API v2 pour que le ticket lui soit correctement attribué
// (voir ticketCreation.js pour le détail de l'orchestration v2 + v1).
app.post('/api/frontoffice/tickets', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Token manquant' })

  const { name, content, type, urgency, items } = req.body
  if (!name || !content) {
    return res.status(400).json({ ok: false, error: 'name et content sont requis' })
  }

  try {
    const ticketId = await createTicketWithItems({
      accessToken: authHeader,
      name,
      content,
      type:    Number(type)    || 1,
      urgency: Number(urgency) || 3,
      items:   Array.isArray(items) ? items : []
    })
    console.log(`[frontoffice/tickets] Ticket #${ticketId} créé avec ${items?.length ?? 0} association(s)`)
    res.json({ ok: true, ticketId })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[frontoffice/tickets] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Démarrage ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Serveur Express démarré sur http://localhost:${PORT}`)
  console.log(`  GLPI_BASE_URL = ${process.env.GLPI_BASE_URL}`)
})
