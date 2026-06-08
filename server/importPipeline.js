// ── Pipeline d'import des 4 fichiers (3 CSV + 1 ZIP d'images) ─────────────────
//
// Vue d'ensemble du déroulé (dans cet ordre, car chaque étape dépend de la
// précédente — exactement l'ordre dans lequel on journalise les créations) :
//   1. Feuille 1 → crée les éléments (Computer/Monitor) + leurs données de
//      référence (Location, Manufacturer, State, Model, User) en "find-or-create"
//   2. ZIP       → associe chaque image à l'élément dont le NOM correspond
//      au nom du fichier (ex. "PC-ADM-001.png" → élément "PC-ADM-001")
//   3. Feuille 2 → crée les tickets, et les relie aux éléments listés dans
//      la colonne "Items" (tableau JSON de noms)
//   4. Feuille 3 → crée les coûts de ticket, reliés via Num_Ticket ↔ Ref_Ticket
//
// Toute la pipeline tourne dans UNE SEULE session GLPI v1 (ouverte au début,
// fermée à la fin dans un "finally" — donc même en cas d'erreur en cours de route).

import { parse } from 'csv-parse/sync'
import AdmZip    from 'adm-zip'
import path      from 'path'
import os        from 'os'
import fs        from 'fs'
import db        from './db.js'
import * as glpi from './glpiV1Client.js'

// ── Tables de correspondance texte CSV → codes numériques attendus par GLPI ───
// GLPI stocke type/statut/priorité des tickets sous forme de petits entiers
// (définis par des constantes PHP comme Ticket::INCIDENT_TYPE = 1). On a vérifié
// ces valeurs en créant un ticket de test et en relisant ses champs.
const TICKET_TYPES = { Incident: 1, Demande: 2, Request: 2 }
const TICKET_STATUSES = { New: 1, Processing: 2, Planned: 3, Pending: 4, Solved: 5, Closed: 6 }
const TICKET_PRIORITIES = { 'Very low': 1, Low: 2, Medium: 3, High: 4, 'Very high': 5, Major: 6 }

// "DD/MM/YYYY" + "HH:MM" → "YYYY-MM-DD HH:MM:SS" (format datetime attendu par GLPI)
function toGlpiDateTime(dateStr, timeStr) {
  const [day, month, year] = dateStr.split('/')
  return `${year}-${month}-${day} ${timeStr}:00`
}

// "8,7" (virgule décimale française) → 8.7 (nombre JS, attendu par GLPI en JSON)
function parseFrenchNumber(value) {
  return parseFloat(String(value).replace(',', '.'))
}

// ── Journalisation ─────────────────────────────────────────────────────────────
// Enregistre IMMÉDIATEMENT (synchrone, better-sqlite3) chaque création dans la
// table import_journal. Important : on journalise au fur et à mesure, pas à la
// fin — si le pipeline plante à mi-parcours, le journal contient quand même tout
// ce qui A été créé, et la Réinitialisation pourra nettoyer correctement.
function journalize(ctx, itemtype, id, label) {
  ctx.insertJournal.run(itemtype, id, label)
}

// ── Find-or-create générique pour les données de référence ────────────────────
// Beaucoup de champs GLPI sont des RÉFÉRENCES : un Computer ne stocke pas le
// texte "Dell", mais l'id d'une ligne de la table Manufacturer. On doit donc,
// pour chaque valeur texte du CSV, "trouver l'id existant ou créer une nouvelle
// ligne et retourner son id".
//
// "ctx.cache" : Map(itemtype → Map(nom → id)), construite UNE fois par type en
// listant tous les items existants — pour éviter de refaire un GET à chaque ligne
// du CSV (les CSV ne contiennent que des dizaines de lignes : un seul GET suffit).
async function findOrCreate(ctx, itemtype, name, extraFields = {}) {
  // GLPI représente "aucune référence" par l'id 0, PAS par NULL : ses colonnes
  // *_id sont déclarées NOT NULL avec 0 comme valeur par défaut. Une valeur CSV
  // vide (ex. la colonne "User" de PC-FORM-001) doit donc résoudre vers 0.
  if (!name) return 0

  if (!ctx.cache.has(itemtype)) {
    const existingItems = await glpi.listItems(ctx.sessionToken, itemtype)
    ctx.cache.set(itemtype, new Map(existingItems.map(item => [item.name, item.id])))
  }
  const byName = ctx.cache.get(itemtype)

  if (byName.has(name)) return byName.get(name)

  const id = await glpi.createItem(ctx.sessionToken, itemtype, { name, ...extraFields })
  byName.set(name, id)
  journalize(ctx, itemtype, id, name)
  return id
}

// ── Étape 1 : Feuille 1 — éléments (Computer / Monitor) ────────────────────────
async function importAssets(ctx, csvText, log) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true })

  for (const row of rows) {
    // Quatre données de référence à résoudre AVANT de pouvoir créer l'élément
    // (l'élément a besoin de leurs id, donc elles doivent exister en premier).
    const locationId     = await findOrCreate(ctx, 'Location', row.Location)
    const manufacturerId = await findOrCreate(ctx, 'Manufacturer', row.Manufacturer)
    const stateId        = await findOrCreate(ctx, 'State', row.Status)
    const userId         = await findOrCreate(ctx, 'User', row.User)

    // "Item_Type" du CSV vaut déjà "Computer" ou "Monitor" — ce sont les noms
    // GLPI exacts des types. Mais leur table de modèles diffère selon le type
    // (ComputerModel vs MonitorModel), d'où ce petit aiguillage.
    const itemtype   = row.Item_Type
    const modelType  = itemtype === 'Monitor' ? 'MonitorModel'    : 'ComputerModel'
    const modelField = itemtype === 'Monitor' ? 'monitormodels_id' : 'computermodels_id'
    const modelId    = await findOrCreate(ctx, modelType, row.Model)

    const itemId = await glpi.createItem(ctx.sessionToken, itemtype, {
      name:             row.Name,
      locations_id:     locationId,
      manufacturers_id: manufacturerId,
      states_id:        stateId,
      users_id:         userId,
      serial:           row.Inventory_Number,
      [modelField]:     modelId
    })
    journalize(ctx, itemtype, itemId, row.Name)

    // Mémorisé pour les étapes suivantes : association des images (étape 2) et
    // des tickets (étape 3) — toutes deux référencent les éléments PAR NOM.
    ctx.assetsByName.set(row.Name, { itemtype, id: itemId })
    log.push(`${itemtype} "${row.Name}" créé (id ${itemId})`)
  }
}

// ── Étape 2 : ZIP — association des images aux éléments ────────────────────────
// Règle de correspondance : le nom du fichier SANS extension doit être identique
// au nom d'un élément créé à l'étape 1 (ex. "PC-ADM-001.png" → élément "PC-ADM-001").
async function importImages(ctx, zipBuffer, log) {
  const zip = new AdmZip(zipBuffer)

  // Dossier temporaire : l'API v1 lit le fichier depuis le DISQUE (fs.createReadStream),
  // alors que le ZIP est en mémoire — il faut donc extraire chaque image avant upload.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newapp-import-'))

  try {
    for (const entry of zip.getEntries()) {
      // "__MACOSX/" : dossier de métadonnées ajouté par macOS lors de la
      // compression — à ignorer, ce n'est pas une vraie image.
      if (entry.isDirectory || entry.entryName.startsWith('__MACOSX')) continue

      const fileName  = path.basename(entry.entryName)        // "PC-ADM-001.png"
      const assetName = path.parse(fileName).name             // "PC-ADM-001"
      const asset     = ctx.assetsByName.get(assetName)

      if (!asset) {
        log.push(`Image "${fileName}" ignorée : aucun élément nommé "${assetName}"`)
        continue
      }

      // maintainEntryPath=false : extrait directement dans tmpDir, sans recréer
      // le sous-dossier "images/" du ZIP. overwrite=true : écrase si déjà présent.
      zip.extractEntryTo(entry, tmpDir, false, true)
      const filePath = path.join(tmpDir, fileName)

      const documentId = await glpi.uploadDocument(ctx.sessionToken, { filePath, fileName })
      journalize(ctx, 'Document', documentId, fileName)

      const linkId = await glpi.linkDocumentToItem(ctx.sessionToken, {
        documentId, itemtype: asset.itemtype, itemId: asset.id
      })
      journalize(ctx, 'Document_Item', linkId, `${fileName} → ${assetName}`)

      log.push(`Image "${fileName}" associée à "${assetName}"`)
    }
  } finally {
    // Nettoyage du dossier temporaire, qu'il y ait eu une erreur ou non —
    // on ne veut pas accumuler des images orphelines sur le disque serveur.
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ── Étape 3 : Feuille 2 — tickets + association aux éléments ──────────────────
async function importTickets(ctx, csvText, log) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true })

  for (const row of rows) {
    const ticketId = await glpi.createItem(ctx.sessionToken, 'Ticket', {
      name:     row.Titre,
      content:  row.Description,
      type:     TICKET_TYPES[row.Type]         ?? 1,  // valeur par défaut : Incident
      status:   TICKET_STATUSES[row.Status]    ?? 1,  // valeur par défaut : Nouveau
      priority: TICKET_PRIORITIES[row.Priority] ?? 3, // valeur par défaut : Moyenne
      date:     toGlpiDateTime(row.Date, row.Heure)
    })
    journalize(ctx, 'Ticket', ticketId, row.Titre)
    ctx.ticketsByRef.set(row.Ref_Ticket, ticketId)
    log.push(`Ticket "${row.Titre}" créé (id ${ticketId})`)

    // La colonne "Items" est une chaîne JSON, ex. : ["PC-ADM-001","MN-FORM-002"]
    // → on la décode, puis on relie chaque élément trouvé via Item_Ticket
    //   (table de liaison : exactement le même principe que Document_Item).
    const itemNames = JSON.parse(row.Items)
    for (const name of itemNames) {
      const asset = ctx.assetsByName.get(name)
      if (!asset) {
        log.push(`Association ignorée : aucun élément nommé "${name}" (ticket "${row.Titre}")`)
        continue
      }
      const linkId = await glpi.createItem(ctx.sessionToken, 'Item_Ticket', {
        tickets_id: ticketId,
        itemtype:   asset.itemtype,
        items_id:   asset.id
      })
      journalize(ctx, 'Item_Ticket', linkId, `${name} → ticket "${row.Titre}"`)
    }
  }
}

// ── Étape 4 : Feuille 3 — coûts de ticket ──────────────────────────────────────
async function importTicketCosts(ctx, csvText, log) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true })

  for (const row of rows) {
    const ticketId = ctx.ticketsByRef.get(row.Num_Ticket)
    if (!ticketId) {
      log.push(`Coût ignoré : aucun ticket pour la référence "${row.Num_Ticket}"`)
      continue
    }

    const costId = await glpi.createItem(ctx.sessionToken, 'TicketCost', {
      tickets_id: ticketId,
      name:       'Coût importé',
      actiontime: parseInt(row.Duration_second, 10) || 0,
      cost_time:  parseFrenchNumber(row.Time_Cost),
      cost_fixed: parseFrenchNumber(row.Fixed_Cost)
    })
    journalize(ctx, 'TicketCost', costId, `Coût du ticket #${row.Num_Ticket}`)
    log.push(`Coût ajouté au ticket #${row.Num_Ticket} (TicketCost id ${costId})`)
  }
}

// ── Réinitialisation : supprime tout ce que le journal a enregistré ───────────
// Principe (déjà validé manuellement pendant les tests de l'import) :
//   - On relit le journal du PLUS RÉCENT au PLUS ANCIEN (ORDER BY id DESC).
//   - "id" reflète l'ordre de CRÉATION : un Computer est créé APRÈS la Location
//     qu'il référence (il a besoin de son id). En supprimant du plus récent au
//     plus ancien (LIFO — "Last In, First Out"), on supprime donc TOUJOURS un
//     item AVANT ce dont il dépend : aucune contrainte de clé étrangère ne peut
//     jamais être violée. C'est la même logique que "défaire" une pile d'actions.
//   - Une fois tout supprimé côté GLPI, on vide le journal : NewApp "oublie"
//     l'import, prêt pour un nouveau cycle import → vérification → réinitialisation.
export async function resetImportedData() {
  const log = []
  const sessionToken = await glpi.openSession()

  try {
    const rows = db.prepare('SELECT glpi_itemtype, glpi_id, label FROM import_journal ORDER BY id DESC').all()

    if (rows.length === 0) {
      log.push('Aucune donnée importée à supprimer (le journal est vide).')
      return { ok: true, log }
    }

    for (const row of rows) {
      try {
        await glpi.deleteItem(sessionToken, row.glpi_itemtype, row.glpi_id)
        log.push(`Supprimé : ${row.glpi_itemtype} "${row.label}" (id ${row.glpi_id})`)
      } catch (err) {
        // On NE STOPPE PAS la boucle sur une erreur isolée (ex. l'item a déjà
        // été supprimé manuellement dans GLPI entre-temps) : on note l'échec
        // et on continue, pour nettoyer le maximum possible.
        const detail = err.response?.data?.[1] ?? err.message
        log.push(`Échec suppression ${row.glpi_itemtype} "${row.label}" (id ${row.glpi_id}) : ${detail}`)
      }
    }

    db.prepare('DELETE FROM import_journal').run()
    log.push(`Journal vidé (${rows.length} entrées retirées du suivi).`)

    return { ok: true, log }
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Point d'entrée : orchestre les 4 étapes dans une session v1 unique ────────
// Reçoit le contenu BRUT des 3 CSV (texte) et le ZIP (Buffer binaire).
// Retourne { ok, log } : "log" est un tableau de messages, affiché tel quel
// côté frontend comme écran de résultat (succès/erreurs).
export async function runImport({ feuille1Csv, feuille2Csv, feuille3Csv, zipBuffer }) {
  const log = []
  const sessionToken = await glpi.openSession()

  const ctx = {
    sessionToken,
    cache:         new Map(),  // données de référence : Map(itemtype → Map(nom → id))
    assetsByName:  new Map(),  // Map(nom d'élément → { itemtype, id })
    ticketsByRef:  new Map(),  // Map(Ref_Ticket → id GLPI du ticket)
    insertJournal: db.prepare('INSERT INTO import_journal (glpi_itemtype, glpi_id, label) VALUES (?, ?, ?)')
  }

  try {
    await importAssets(ctx, feuille1Csv, log)
    await importImages(ctx, zipBuffer, log)
    await importTickets(ctx, feuille2Csv, log)
    await importTicketCosts(ctx, feuille3Csv, log)

    return { ok: true, log }
  } finally {
    // Toujours fermer la session, même si une étape a levé une exception —
    // sinon l'erreur remonterait avant la fermeture et laisserait une session ouverte.
    await glpi.closeSession(sessionToken)
  }
}
