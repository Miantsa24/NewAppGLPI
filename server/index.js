import 'dotenv/config'

import express from 'express'
import cors    from 'cors'
import axios   from 'axios'
import multer  from 'multer'
import db      from './db.js'
import { runImport, resetImportedData } from './importPipeline.js'
import { getDashboardStats } from './dashboardData.js'
import { listTickets, getTicketDetail, listTicketsForKanban, listTicketCosts, updateTicket, deleteTicket } from './ticketsData.js'
import { listElements, getElementDetail, getElementImage } from './elementsData.js'
import { getKanbanSettings, updateKanbanSettings, getKanbanHistory } from './kanbanSettings.js'
import { createTicketWithItems, addTicketCost } from './ticketCreation.js'
import * as glpiV1 from './glpiV1Client.js'
import { ASSET_TYPES } from '../shared/assetTypes.js'

const app  = express()
const PORT = process.env.PORT || 3001

// Itemtypes affichables/créables depuis le FrontOffice — alignés sur ASSET_TYPES
// (shared/assetTypes.js), la source unique des types d'assets affichés dans NewApp.
const VALID_ITEMTYPES = ASSET_TYPES.map(({ itemtype }) => itemtype)

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

// ── Protection serveur des opérations Backoffice sensibles ────────────────────
// /api/backoffice/login ne renvoie qu'un "oui/non" : la véritable porte d'entrée,
// côté frontend, est ProtectedRoute (sessionStorage). Mais rien n'empêchait un
// appel direct (sans passer par l'UI) vers les opérations qui ÉCRIVENT dans GLPI
// ou suppriment des données — ce middleware exige le même code unique, renvoyé
// par le client dans l'en-tête "X-Backoffice-Code", pour ces routes précises.
function requireBackofficeCode(req, res, next) {
  const code = req.get('X-Backoffice-Code')
  if (!code || code !== process.env.BACKOFFICE_CODE) {
    return res.status(401).json({ ok: false, error: 'Code backoffice requis ou invalide' })
  }
  next()
}

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
  requireBackofficeCode,
  upload.fields([
    { name: 'feuille1', maxCount: 1 },
    { name: 'feuille2', maxCount: 1 },
    { name: 'feuille3', maxCount: 1 },
    { name: 'images',   maxCount: 1 }
  ]),
  async (req, res) => {
    const files = req.files

    // Seule la feuille 1 (éléments) est obligatoire — feuille 2 (tickets),
    // feuille 3 (coûts) et le ZIP d'images sont optionnels (voir importPipeline.js).
    const missing = ['feuille1'].filter(key => !files?.[key]?.[0])
    if (missing.length > 0) {
      return res.status(400).json({ ok: false, error: `Fichier(s) manquant(s) : ${missing.join(', ')}` })
    }

    // SSE : on stream la progression en temps réel au lieu d'attendre la fin.
    // Le client lit avec fetch() + ReadableStream (voir ImportPage.jsx).
    res.writeHead(200, {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'X-Accel-Buffering': 'no'   // désactive le buffering nginx si présent
    })

    function emit(data) { res.write(`data: ${JSON.stringify(data)}\n\n`) }

    try {
      const result = await runImport({
        feuille1Csv: files.feuille1[0].buffer.toString('utf-8'),
        feuille2Csv: files.feuille2?.[0]?.buffer?.toString('utf-8'),
        feuille3Csv: files.feuille3?.[0]?.buffer?.toString('utf-8'),
        zipBuffer:   files.images?.[0]?.buffer,
        onProgress:  emit
      })
      console.log(`[import] Terminé : ${result.log.length} opérations journalisées`)
      emit({ type: 'done', ok: true, log: result.log })
    } catch (err) {
      const glpiError = err.response?.data ?? err.message
      console.error('[import] Erreur :', JSON.stringify(glpiError, null, 2))
      emit({ type: 'done', ok: false, error: glpiError })
    } finally {
      res.end()
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
app.post('/api/backoffice/reset', requireBackofficeCode, async (req, res) => {
  // Même pattern SSE que l'import — le client voit la suppression item par item.
  res.writeHead(200, {
    'Content-Type':    'text/event-stream',
    'Cache-Control':   'no-cache',
    'X-Accel-Buffering': 'no'
  })

  function emit(data) { res.write(`data: ${JSON.stringify(data)}\n\n`) }

  try {
    const result = await resetImportedData({ onProgress: emit })
    console.log(`[reset] Terminé : ${result.log.length} opérations`)
    emit({ type: 'done', ok: true, log: result.log })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[reset] Erreur :', JSON.stringify(glpiError, null, 2))
    emit({ type: 'done', ok: false, error: glpiError })
  } finally {
    res.end()
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

// ── Page Tickets : modification (Backoffice uniquement) ────────────────────────
// "fields" : { name, content, type, status, priority } — mêmes codes que ceux
// renvoyés par describeTicket (typeId/statusId/priorityId).
app.put('/api/backoffice/tickets/:id', requireBackofficeCode, async (req, res) => {
  try {
    const { name, content, type, status, priority } = req.body
    if (!name) return res.status(400).json({ ok: false, error: 'name est requis' })

    await updateTicket(req.params.id, {
      name,
      content:  content ?? '',
      type:     parseInt(type, 10),
      status:   parseInt(status, 10),
      priority: parseInt(priority, 10)
    })
    res.json({ ok: true })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[tickets/:id PUT] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Page Tickets : suppression (Backoffice uniquement) ──────────────────────────
app.delete('/api/backoffice/tickets/:id', requireBackofficeCode, async (req, res) => {
  try {
    await deleteTicket(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[tickets/:id DELETE] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Backoffice : liste de tous les coûts (toutes tickets confondus) ───────────
app.get('/api/backoffice/costs', async (req, res) => {
  try {
    const costs = await listTicketCosts()
    res.json({ ok: true, costs })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[costs GET] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Backoffice : ajout d'un coût à un ticket existant ──────────────────────────
app.post('/api/backoffice/costs', requireBackofficeCode, async (req, res) => {
  try {
    const { ticketId, name, actiontime, costTime, costFixed } = req.body
    if (!ticketId) return res.status(400).json({ ok: false, error: 'ticketId est requis' })
    if (!name)     return res.status(400).json({ ok: false, error: 'name est requis' })

    const id = await addTicketCost({
      ticketId,
      name,
      actiontime: parseInt(actiontime, 10) || 0,
      cost_time:  parseFloat(costTime) || 0,
      cost_fixed: parseFloat(costFixed) || 0
    })
    res.json({ ok: true, id })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[costs] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Pages Éléments (Backoffice) : liste + fiche détail ─────────────────────────
// ":itemtype" couvre les types d'"assets" affichés par ce projet (voir
// shared/assetTypes.js : Computer, Monitor, Phone) — un seul couple de routes
// générique, comme la recherche FrontOffice (ElementsPage) qui traite déjà ces
// types de façon uniforme (voir elementsData.js pour le détail).
app.get('/api/backoffice/elements/:itemtype', async (req, res) => {
  try {
    const elements = await listElements(req.params.itemtype)
    res.json({ ok: true, elements })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[elements] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

app.get('/api/backoffice/elements/:itemtype/:id', async (req, res) => {
  try {
    const element = await getElementDetail(req.params.itemtype, req.params.id)
    res.json({ ok: true, element })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[elements/:id] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Image associée à un élément (import ZIP) ───────────────────────────────────
// Sert de proxy vers le Document GLPI lié à l'élément — le frontend peut
// l'utiliser directement comme src="" d'une <img>. 404 si aucune image n'est
// associée (le frontend affiche alors un visuel de remplacement via onError).
app.get('/api/backoffice/elements/:itemtype/:id/image', async (req, res) => {
  try {
    const image = await getElementImage(req.params.itemtype, req.params.id)
    if (!image) return res.status(404).end()
    res.set('Content-Type', image.contentType ?? 'application/octet-stream')
    res.send(Buffer.from(image.data))
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[elements/:id/image] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(404).end()
  }
})

// ── Paramètres Kanban ─────────────────────────────────────────────────────────
// GET : accessible par le FrontOffice ET le Backoffice (pas de garde) — les
// paramètres (couleurs, labels) ne sont pas sensibles, tout le monde peut les lire.
// PUT : réservé au Backoffice dans la pratique (le formulaire n'existe que là),
// mais on n'ajoute pas de garde technique ici pour rester cohérent avec le reste
// des routes backoffice (la protection est assurée par le frontend ProtectedRoute).
app.get('/api/kanban/settings', (req, res) => {
  try {
    const settings = getKanbanSettings()
    res.json({ ok: true, settings })
  } catch (err) {
    console.error('[kanban/settings GET] Erreur :', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.put('/api/backoffice/kanban/settings', requireBackofficeCode, (req, res) => {
  try {
    const settings = updateKanbanSettings(req.body)
    res.json({ ok: true, settings })
  } catch (err) {
    console.error('[kanban/settings PUT] Erreur :', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/api/backoffice/kanban/history', (req, res) => {
  try {
    const history = getKanbanHistory()
    res.json({ ok: true, history })
  } catch (err) {
    console.error('[kanban/history] Erreur :', err.message)
    res.status(500).json({ ok: false, error: err.message })
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

// ── Kanban FrontOffice : changement de statut d'un ticket (Phase 11) ──────────
// On passe par v1 (session serveur) plutôt que par le proxy v2 pour deux raisons :
//   1. Le proxy v2 filtre les tickets selon le token de l'utilisateur connecté —
//      il peut ne pas avoir le droit de modifier des tickets créés par l'import.
//   2. Pour "Clos" (statut 6), GLPI exige une solution ; en v1, createItem
//      sur ITILSolution enregistre la solution et résout le ticket. On force
//      ensuite le statut à 6 — le projet n'utilise QUE 3 statuts (Nouveau,
//      En cours/attribué, Clos), pas d'étape intermédiaire "Résolu" visible.
// Body : { status: 1|2|6, solution?: "..." }  (solution requis quand status === 6)
app.patch('/api/frontoffice/kanban-tickets/:id/status', async (req, res) => {
  const ticketId = req.params.id
  const { status, solution } = req.body

  if (!status) return res.status(400).json({ ok: false, error: 'status requis' })

  const sessionToken = await glpiV1.openSession()
  try {
    if (status === 6) {
      // Créer une ITILSolution en v1 (résout le ticket et enregistre la solution),
      // puis forcer explicitement le statut à "Clos" (6).
      await glpiV1.createItem(sessionToken, 'ITILSolution', {
        itemtype: 'Ticket',
        items_id: Number(ticketId),
        content:  solution || '(résolu)'
      })
      await glpiV1.updateItem(sessionToken, 'Ticket', ticketId, { status: 6 })
    } else {
      // Changement simple de statut (ex. Nouveau ↔ In progress)
      await glpiV1.updateItem(sessionToken, 'Ticket', ticketId, { status })
    }
    res.json({ ok: true })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[kanban status] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  } finally {
    await glpiV1.closeSession(sessionToken)
  }
})

// ── Kanban FrontOffice : liste de tous les tickets (Phase 11) ─────────────────
// Utilise une session v1 (credentials serveur) pour récupérer TOUS les tickets,
// peu importe qui les a créés — contrairement au proxy v2 qui filtre les tickets
// selon les droits de l'utilisateur connecté et ne retourne que les siens.
// Renvoie { id, name, status } avec "status" en entier brut GLPI (pas traduit).
app.get('/api/frontoffice/kanban-tickets', async (req, res) => {
  try {
    const tickets = await listTicketsForKanban()
    res.json({ ok: true, tickets })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[kanban-tickets] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})

// ── Find-or-create d'une donnée de référence (Location, State, Manufacturer,
// User, <Itemtype>Model) pour la création d'élément FrontOffice ci-dessous.
// Même principe que findOrCreate() dans importPipeline.js : un Computer ne
// stocke pas le texte "Dell" mais l'id d'une ligne Manufacturer. La nouvelle
// ligne créée est journalisée pour que la réinitialisation puisse la supprimer.
async function findOrCreateRef(sessionToken, itemtype, name) {
  if (!name) return 0
  const existingItems = await glpiV1.listItems(sessionToken, itemtype)
  const found = existingItems.find(item => item.name === name)
  if (found) return found.id

  const id = await glpiV1.createItem(sessionToken, itemtype, { name })
  db.prepare('INSERT INTO import_journal (glpi_itemtype, glpi_id, label) VALUES (?, ?, ?)').run(itemtype, id, name)
  return id
}

// ── Création d'élément FrontOffice (session v1 serveur, journalisé) ───────────
// Pas de token utilisateur requis — on utilise la session v1 (credentials serveur).
// L'élément est ajouté à import_journal pour que la réinitialisation le supprime.
// Champs alignés sur les colonnes du CSV d'import (voir importPipeline.js) :
// Name, Status, Location, Manufacturer, Item_Type (= itemtype, fixé par la page),
// Model, Inventory_Number, User.
app.post('/api/frontoffice/elements', async (req, res) => {
  const { itemtype, name, status, location, manufacturer, model, inventoryNumber, user } = req.body

  if (!VALID_ITEMTYPES.includes(itemtype)) {
    return res.status(400).json({ ok: false, error: `itemtype invalide : ${itemtype}` })
  }
  if (!name) {
    return res.status(400).json({ ok: false, error: 'name est requis' })
  }

  const sessionToken = await glpiV1.openSession()
  try {
    const fields = { name }
    if (inventoryNumber) fields.serial = inventoryNumber

    const [locationId, manufacturerId, stateId, userId] = await Promise.all([
      findOrCreateRef(sessionToken, 'Location', location),
      findOrCreateRef(sessionToken, 'Manufacturer', manufacturer),
      findOrCreateRef(sessionToken, 'State', status),
      findOrCreateRef(sessionToken, 'User', user)
    ])
    if (locationId)     fields.locations_id     = locationId
    if (manufacturerId) fields.manufacturers_id = manufacturerId
    if (stateId)        fields.states_id        = stateId
    if (userId)         fields.users_id         = userId

    // Convention "<Type>Model" / "<type>models_id" (voir importPipeline.js) —
    // certains types n'ont pas de table de modèles : on ignore alors le champ
    // plutôt que de faire échouer toute la création.
    if (model) {
      const modelType  = `${itemtype}Model`
      const modelField = `${itemtype.toLowerCase()}models_id`
      try {
        fields[modelField] = await findOrCreateRef(sessionToken, modelType, model)
      } catch {
        console.warn(`[frontoffice/elements POST] Modèle "${model}" ignoré : "${modelType}" n'existe pas dans GLPI.`)
      }
    }

    const id = await glpiV1.createItem(sessionToken, itemtype, fields)
    db.prepare('INSERT INTO import_journal (glpi_itemtype, glpi_id, label) VALUES (?, ?, ?)').run(itemtype, id, name)

    console.log(`[frontoffice/elements POST] ${itemtype} "${name}" créé (id ${id})`)
    res.json({ ok: true, id, name })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[frontoffice/elements POST] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  } finally {
    await glpiV1.closeSession(sessionToken)
  }
})

// ── Création de ticket avec association d'éléments (FrontOffice) ───────────────
// Session v1 serveur (pas de token utilisateur) — ticket + associations journalisés.
app.post('/api/frontoffice/tickets', async (req, res) => {
  const { name, content, type, urgency, items } = req.body
  if (!name || !content) {
    return res.status(400).json({ ok: false, error: 'name et content sont requis' })
  }

  try {
    const ticketId = await createTicketWithItems({
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

// ── Recherche d'éléments FrontOffice (session v1 serveur) ─────────────────────
// Pourquoi v1 et pas le proxy v2 ?
// La recherche FrontOffice ne nécessite plus de login utilisateur. Le proxy v2
// exige un Bearer token OAuth → erreur 400 sans login. On utilise une session v1
// (credentials serveur) qui ne dépend d'aucun token côté client.
//
// Fonctionnement : on récupère TOUS les items du type demandé + les tables de
// référence (Location, State, Manufacturer), on résout les IDs en noms, puis on
// filtre en JS côté serveur — plus simple et plus fiable que du RSQL.
app.get('/api/frontoffice/elements', async (req, res) => {
  const { itemtype = 'Computer', name, location, status, manufacturer } = req.query

  if (!VALID_ITEMTYPES.includes(itemtype)) {
    return res.status(400).json({ ok: false, error: `itemtype invalide : ${itemtype}` })
  }

  const sessionToken = await glpiV1.openSession()
  try {
    // "<Itemtype>Model" / "<itemtype>models_id" : même convention que l'import
    // (voir importPipeline.js) — Computer/Monitor/Phone ont chacun leur table
    // de modèles (ComputerModel, MonitorModel, PhoneModel).
    const modelType  = `${itemtype}Model`
    const modelField = `${itemtype.toLowerCase()}models_id`

    // On parallélise les appels GLPI pour minimiser le temps d'attente total.
    const [items, locations, states, manufacturers, models, users] = await Promise.all([
      glpiV1.listItems(sessionToken, itemtype),
      glpiV1.listItems(sessionToken, 'Location'),
      glpiV1.listItems(sessionToken, 'State'),
      glpiV1.listItems(sessionToken, 'Manufacturer'),
      glpiV1.listItems(sessionToken, modelType),
      glpiV1.listItems(sessionToken, 'User')
    ])

    // Tables de correspondance id → nom, pour résoudre les champs *_id de la v1.
    const locationById     = new Map(locations.map(x => [x.id, x.name]))
    const stateById        = new Map(states.map(x => [x.id, x.name]))
    const manufacturerById = new Map(manufacturers.map(x => [x.id, x.name]))
    const modelById        = new Map(models.map(x => [x.id, x.name]))
    const userById         = new Map(users.map(x => [x.id, x.name]))

    const results = items
      // Résolution des IDs en noms + format v2-compatible attendu par le frontend.
      .map(item => ({
        id:           item.id,
        name:         item.name   ?? '',
        serial:       item.serial ?? null,
        location:     { name: locationById.get(item.locations_id)     ?? null },
        status:       { name: stateById.get(item.states_id)           ?? null },
        manufacturer: { name: manufacturerById.get(item.manufacturers_id) ?? null },
        model:        { name: modelById.get(item[modelField])         ?? null },
        user:         { name: userById.get(item.users_id)             ?? null }
      }))
      // Filtrage côté serveur : chaque paramètre est optionnel.
      // Nom : recherche "contient" (insensible à la casse).
      // Autres : correspondance exacte (valeur choisie dans une liste déroulante).
      .filter(item => {
        if (name         && !item.name.toLowerCase().includes(name.toLowerCase())) return false
        if (location     && item.location.name     !== location)     return false
        if (status       && item.status.name       !== status)       return false
        if (manufacturer && item.manufacturer.name !== manufacturer) return false
        return true
      })

    res.json({ ok: true, items: results })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[frontoffice/elements] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  } finally {
    await glpiV1.closeSession(sessionToken)
  }
})

// ── Données de référence pour la recherche FrontOffice ────────────────────────
// Retourne les listes d'emplacements, statuts et fabricants EXISTANTS dans GLPI
// (via session v1 serveur, sans token utilisateur) — pour peupler les listes
// déroulantes de la page de recherche du FrontOffice.
app.get('/api/frontoffice/search-refs', async (req, res) => {
  const sessionToken = await glpiV1.openSession()
  try {
    const [locations, states, manufacturers] = await Promise.all([
      glpiV1.listItems(sessionToken, 'Location'),
      glpiV1.listItems(sessionToken, 'State'),
      glpiV1.listItems(sessionToken, 'Manufacturer')
    ])
    res.json({
      ok:            true,
      locations:     locations.map(x => x.name).filter(Boolean).sort(),
      states:        states.map(x => x.name).filter(Boolean).sort(),
      manufacturers: manufacturers.map(x => x.name).filter(Boolean).sort()
    })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[search-refs] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  } finally {
    await glpiV1.closeSession(sessionToken)
  }
})

// ── Démarrage ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Serveur Express démarré sur http://localhost:${PORT}`)
  console.log(`  GLPI_BASE_URL = ${process.env.GLPI_BASE_URL}`)
})
