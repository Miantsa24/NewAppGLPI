// ── Pipeline d'import des 4 fichiers (3 CSV + 1 ZIP d'images) ─────────────────
//
// Vue d'ensemble du déroulé (dans cet ordre, car chaque étape dépend de la
// précédente — exactement l'ordre dans lequel on journalise les créations) :
//   1. Feuille 1 → crée les éléments (n'importe quel type d'asset GLPI) +
//      leurs données de référence (Location, Manufacturer, State, Model,
//      User) en "find-or-create"
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
import sharp     from 'sharp'
import path      from 'path'
import os        from 'os'
import fs        from 'fs'
import db        from './db.js'
import * as glpi   from './glpiV1Client.js'
import * as glpiV2 from './glpiV2Client.js'

// Correspondance extension de fichier → format détecté par sharp (sniffing du
// contenu réel, indépendant de l'extension). Sert à repérer les fichiers
// renommés (ex. un .jpg renommé en .png) — voir importImages.
const FORMAT_BY_EXTENSION = {
  jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif',
  webp: 'webp', tif: 'tiff', tiff: 'tiff', bmp: 'bmp'
}

// ── Tables de correspondance texte CSV → codes numériques attendus par GLPI ───
// GLPI stocke type/statut/priorité des tickets sous forme de petits entiers
// (définis par des constantes PHP comme Ticket::INCIDENT_TYPE = 1). On a vérifié
// ces valeurs en créant un ticket de test et en relisant ses champs.
const TICKET_TYPES = { Incident: 1, Demande: 2, Request: 2 }
const TICKET_STATUSES = {
  New: 1, Processing: 2, 'In Progress': 2, Planned: 3,
  Pending: 4, Solved: 5, Resolved: 5, Closed: 6
}
const TICKET_PRIORITIES = {
  'Very low': 1, Low: 2, Medium: 3, High: 4, 'Very high': 5, Major: 6, Critical: 6
}

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

// ── Étape 1 : Feuille 1 — éléments (TOUS les types d'assets GLPI) ──────────────
// "Item_Type" peut désormais être n'importe quel itemtype GLPI valide (Computer,
// Monitor, Phone, NetworkEquipment, Printer, Rack, Software...), pas seulement
// les quelques types ayant une page dédiée dans l'UI.
async function importAssets(ctx, csvText, log) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true })

  for (const row of rows) {
    const itemtype = row.Item_Type
    if (!itemtype) {
      log.push(`Ligne ignorée : colonne "Item_Type" vide (élément "${row.Name}").`)
      continue
    }

    // Quatre données de référence à résoudre AVANT de pouvoir créer l'élément
    // (l'élément a besoin de leurs id, donc elles doivent exister en premier).
    const locationId     = await findOrCreate(ctx, 'Location', row.Location)
    const manufacturerId = await findOrCreate(ctx, 'Manufacturer', row.Manufacturer)
    const stateId        = await findOrCreate(ctx, 'State', row.Status)
    const userId         = await findOrCreate(ctx, 'User', row.User)

    const fields = {
      name:             row.Name,
      locations_id:     locationId,
      manufacturers_id: manufacturerId,
      states_id:        stateId,
      users_id:         userId,
      serial:           row.Inventory_Number
    }

    // La plupart des types GLPI suivent la convention "<Type>Model" /
    // "<type>models_id" (ComputerModel/computermodels_id, PhoneModel/
    // phonemodels_id...), mais certains types n'ont PAS de table de modèles
    // (ex. Software). Si la résolution échoue, on crée l'élément sans modèle
    // plutôt que d'abandonner toute la ligne.
    if (row.Model) {
      const modelType  = `${itemtype}Model`
      const modelField = `${itemtype.toLowerCase()}models_id`
      try {
        fields[modelField] = await findOrCreate(ctx, modelType, row.Model)
      } catch {
        log.push(`Modèle "${row.Model}" ignoré pour "${row.Name}" : "${modelType}" n'existe pas dans GLPI.`)
      }
    }

    let itemId
    let viaV2 = false
    try {
      itemId = await glpi.createItem(ctx.sessionToken, itemtype, fields)
    } catch (err) {
      if (!glpiV2.isUnsupportedInV1(err)) {
        const detail = err.response?.data?.[1] ?? err.message
        log.push(`Élément "${row.Name}" (${itemtype}) ignoré : ${detail}`)
        continue
      }

      // Repli v2 : itemtype absent de la v1 (ex. "Socket"), exposé en v2 sous
      // "/Assets/<Type>" — format de champs différent (objets imbriqués { id }
      // plutôt que des clés plates "*_id"). Seuls "name" et "location" ont un
      // équivalent direct dans le schéma v2 de ces types.
      try {
        const v2Fields = { name: fields.name }
        if (locationId) v2Fields.location = { id: locationId }
        itemId = await glpiV2.createItem(itemtype, v2Fields)
        viaV2 = true
        log.push(`${itemtype} "${row.Name}" créé via l'API v2 (id ${itemId}).`)
      } catch (err2) {
        const detail = err2.response?.data?.title ?? err2.message
        log.push(`Élément "${row.Name}" (${itemtype}) ignoré : ${detail}`)
        continue
      }
    }
    journalize(ctx, itemtype, itemId, row.Name)

    // Mémorisé pour les étapes suivantes : association des images (étape 2) et
    // des tickets (étape 3) — toutes deux référencent les éléments PAR NOM.
    // "viaV2" : itemtype absent de la v1 (ex. "Socket") — voir importTickets,
    // qui doit éviter de créer un Item_Ticket vers un tel élément (la v1
    // plante avec une erreur 500 non gérée plutôt qu'un refus propre).
    ctx.assetsByName.set(row.Name, { itemtype, id: itemId, viaV2 })
    log.push(`${itemtype} "${row.Name}" créé (id ${itemId})`)
  }
}

// ── Étape 2 : ZIP — association des images aux éléments (optionnelle) ─────────
// Règle de correspondance : le nom du fichier SANS extension doit être identique
// au nom d'un élément créé à l'étape 1 (ex. "PC-ADM-001.png" → élément "PC-ADM-001").
//
// Certains fichiers du ZIP sont en réalité un autre format que leur extension
// ne l'indique (ex. un JPEG renommé en .png lors de la préparation du jeu de
// données) : GLPI refuse alors le contenu. On détecte ce cas avec sharp (qui
// lit le format réel depuis les octets, pas l'extension) et on reconvertit en
// JPEG avant l'upload — le nom de base reste identique, donc l'association à
// l'élément (par nom) continue de fonctionner.
async function importImages(ctx, zipBuffer, log) {
  if (!zipBuffer) {
    log.push('Aucun fichier ZIP fourni : étape d\'association des images ignorée.')
    return
  }

  const zip = new AdmZip(zipBuffer)

  // Dossier temporaire : l'API v1 lit le fichier depuis le DISQUE (fs.createReadStream).
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newapp-import-'))

  try {
    for (const entry of zip.getEntries()) {
      // "__MACOSX/" : dossier de métadonnées ajouté par macOS lors de la
      // compression — à ignorer, ce n'est pas une vraie image.
      if (entry.isDirectory || entry.entryName.startsWith('__MACOSX')) continue

      const originalName = path.basename(entry.entryName)     // "PC-ADM-001.png"
      const assetName     = path.parse(originalName).name      // "PC-ADM-001"
      const asset         = ctx.assetsByName.get(assetName)

      if (!asset) {
        log.push(`Image "${originalName}" ignorée : aucun élément nommé "${assetName}"`)
        continue
      }

      let fileName    = originalName
      let fileContent = entry.getData()

      // Vérifie que le format réel (sniffé par sharp) correspond à l'extension
      // déclarée. Si le fichier est illisible ou que le format diffère, on le
      // reconvertit en JPEG.
      const declaredExt = path.extname(originalName).slice(1).toLowerCase()
      const declaredFormat = FORMAT_BY_EXTENSION[declaredExt] ?? declaredExt

      try {
        const metadata = await sharp(fileContent).metadata()
        if (metadata.format !== declaredFormat) {
          fileContent = await sharp(fileContent).jpeg().toBuffer()
          fileName    = `${assetName}.jpg`
          log.push(`Image "${originalName}" : format réel "${metadata.format}" ≠ extension ".${declaredExt}" — convertie en JPEG.`)
        }
      } catch (err) {
        log.push(`Image "${originalName}" ignorée : fichier image illisible (${err.message})`)
        continue
      }

      const filePath = path.join(tmpDir, fileName)
      fs.writeFileSync(filePath, fileContent)

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

// ── Étape 3 : Feuille 2 — tickets + association aux éléments (optionnelle) ────
async function importTickets(ctx, csvText, log) {
  if (!csvText) {
    log.push('Aucun fichier "Feuille 2" fourni : import des tickets ignoré.')
    return
  }

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
      if (asset.viaV2) {
        // L'API v1 ne reconnaît pas cet itemtype (ex. "Socket") : Item_Ticket
        // (CommonItilObject_Item::prepareInputForAdd) plante avec une erreur 500
        // au lieu d'un refus propre dans ce cas — on évite l'appel.
        log.push(`Association ignorée : "${name}" (${asset.itemtype}) n'est pas liable à un ticket via l'API v1 (ticket "${row.Titre}")`)
        continue
      }
      // GLPI refuse via l'API la création d'un Item_Ticket sur un ticket "Closed"
      // (droits insuffisants, cf. CommonItilObject_Item::canCreateItem) — sans ce
      // try/catch, une seule association refusée faisait échouer TOUT l'import
      // (et les 99 tickets suivants n'étaient jamais créés).
      try {
        const linkId = await glpi.createItem(ctx.sessionToken, 'Item_Ticket', {
          tickets_id: ticketId,
          itemtype:   asset.itemtype,
          items_id:   asset.id
        })
        journalize(ctx, 'Item_Ticket', linkId, `${name} → ticket "${row.Titre}"`)
      } catch (err) {
        const detail = err.response?.data?.[1] ?? err.message
        log.push(`Association ignorée : "${name}" → ticket "${row.Titre}" : ${detail}`)
      }
    }
  }
}

// ── Étape 4 : Feuille 3 — coûts de ticket (optionnelle) ────────────────────────
async function importTicketCosts(ctx, csvText, log) {
  if (!csvText) {
    log.push('Aucun fichier "Feuille 3" fourni : import des coûts ignoré.')
    return
  }

  // Les coûts référencent des tickets créés par la feuille 2 — sans elle,
  // il n'y a aucun ticket auquel les rattacher.
  if (ctx.ticketsByRef.size === 0) {
    log.push('Feuille 3 ignorée : aucun ticket importé (feuille 2 absente ou vide).')
    return
  }

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
// "onProgress" : callback appelé après chaque suppression — permet au serveur
// d'émettre un événement SSE avec la progression réelle (i/total) vers le client.
export async function resetImportedData({ onProgress } = {}) {
  const log = []
  const sessionToken = await glpi.openSession()

  try {
    const rows = db.prepare('SELECT glpi_itemtype, glpi_id, label FROM import_journal ORDER BY id DESC').all()

    if (rows.length === 0) {
      log.push('Aucune donnée importée à supprimer (le journal est vide).')
      return { ok: true, log }
    }

    const total = rows.length
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // On émet AVANT la suppression : l'utilisateur voit "Suppression X/total"
      // pendant que l'appel GLPI est en cours — l'UX est plus réactive.
      onProgress?.({
        type:    'progress',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        label:   `Suppression ${i + 1}/${total} — ${row.glpi_itemtype} « ${row.label} »`
      })
      try {
        await glpi.deleteItem(sessionToken, row.glpi_itemtype, row.glpi_id)
        log.push(`Supprimé : ${row.glpi_itemtype} "${row.label}" (id ${row.glpi_id})`)
      } catch (err) {
        if (!glpiV2.isUnsupportedInV1(err)) {
          const detail = err.response?.data?.[1] ?? err.message
          log.push(`Échec suppression ${row.glpi_itemtype} "${row.label}" (id ${row.glpi_id}) : ${detail}`)
          continue
        }

        // Repli v2 : itemtype créé via le repli v2 à l'import (ex. "Socket"),
        // donc supprimable uniquement via "/Assets/<Type>" en v2.
        try {
          await glpiV2.deleteItem(row.glpi_itemtype, row.glpi_id)
          log.push(`Supprimé via l'API v2 : ${row.glpi_itemtype} "${row.label}" (id ${row.glpi_id})`)
        } catch (err2) {
          const detail = err2.response?.data?.title ?? err2.message
          log.push(`Échec suppression ${row.glpi_itemtype} "${row.label}" (id ${row.glpi_id}) : ${detail}`)
        }
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
// "onProgress" : callback optionnel appelé avant chaque étape (percent = début
// de l'étape). Permet au serveur de streamer la progression SSE sans avoir à
// changer l'interface de chaque fonction interne.
export async function runImport({ feuille1Csv, feuille2Csv, feuille3Csv, zipBuffer, onProgress }) {
  const log = []
  const sessionToken = await glpi.openSession()

  const ctx = {
    sessionToken,
    cache:         new Map(),
    assetsByName:  new Map(),
    ticketsByRef:  new Map(),
    insertJournal: db.prepare('INSERT INTO import_journal (glpi_itemtype, glpi_id, label) VALUES (?, ?, ?)')
  }

  try {
    onProgress?.({ type: 'progress', percent: 5,  label: 'Import des éléments (feuille 1)…' })
    await importAssets(ctx, feuille1Csv, log)

    onProgress?.({ type: 'progress', percent: 30, label: 'Association des images (ZIP)…' })
    await importImages(ctx, zipBuffer, log)

    onProgress?.({ type: 'progress', percent: 55, label: 'Import des tickets (feuille 2)…' })
    await importTickets(ctx, feuille2Csv, log)

    onProgress?.({ type: 'progress', percent: 80, label: 'Import des coûts (feuille 3)…' })
    await importTicketCosts(ctx, feuille3Csv, log)

    onProgress?.({ type: 'progress', percent: 100, label: 'Import terminé !' })

    return { ok: true, log }
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
