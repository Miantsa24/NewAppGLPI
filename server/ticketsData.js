// ── Données de la page Tickets (Phase 5 : liste + fiche détail) ───────────────
//
// Comme dashboardData.js : lecture EN DIRECT depuis GLPI (pas de cache local),
// dans une session v1 propre au Backoffice (pas de token OAuth2 disponible ici).

import * as glpi from './glpiV1Client.js'
import db        from './db.js'

// GLPI stocke type/statut/priorité sous forme de petits entiers (vérifié par un
// test réel pendant la Phase 2 : Incident=1, New=1, Medium=3...). On traduit ces
// codes en libellés lisibles ici, une fois pour toutes, pour ne pas avoir à le
// refaire dans chaque composant React.
const TICKET_TYPES = { 1: 'Incident', 2: 'Demande' }
// Le projet n'utilise que 3 statuts de ticket : Nouveau, En cours (attribué)
// et Clos — voir aussi TICKET_STATUSES dans importPipeline.js et COLUMN_DEFS
// dans KanbanPage.jsx (les 3 colonnes du Kanban correspondent 1:1 à ces statuts).
// Exporté pour dashboardData.js (répartition des tickets par statut).
export const TICKET_STATUSES = {
  1: 'Nouveau',
  2: 'En cours (attribué)',
  6: 'Clos'
}
const TICKET_PRIORITIES = {
  1: 'Très basse',
  2: 'Basse',
  3: 'Moyenne',
  4: 'Haute',
  5: 'Très haute',
  6: 'Majeure'
}

// "?? code" : si jamais GLPI renvoie un code qu'on n'a pas mappé (peu probable,
// mais possible avec des tickets créés autrement que par notre import), on
// affiche le code brut plutôt que de planter ou d'afficher "undefined".
// "typeId/statusId/priorityId" : codes bruts GLPI, en plus des libellés traduits
// — utilisés par la fiche détail Backoffice pour préremplir les <select> du
// formulaire de modification (les valeurs des <option> sont ces codes).
function describeTicket(ticket) {
  return {
    id:         ticket.id,
    name:       ticket.name,
    content:    ticket.content,
    type:       TICKET_TYPES[ticket.type]         ?? `(type ${ticket.type})`,
    status:     TICKET_STATUSES[ticket.status]    ?? `(statut ${ticket.status})`,
    priority:   TICKET_PRIORITIES[ticket.priority] ?? `(priorité ${ticket.priority})`,
    date:       ticket.date,
    typeId:     ticket.type,
    statusId:   ticket.status,
    priorityId: ticket.priority
  }
}

// ── Liste minimale pour le Kanban ─────────────────────────────────────────────
// Renvoie TOUS les tickets (session v1 serveur, pas de filtre par utilisateur)
// avec uniquement { id, name, status } — "status" EST un entier brut GLPI (1-6),
// pas un libellé traduit, car le Kanban a besoin du code numérique pour ranger
// chaque ticket dans la bonne colonne (columnKeyFor dans KanbanPage.jsx).
// Différence avec listTickets() : pas de tri, pas de traduction, données minimales.
export async function listTicketsForKanban() {
  const sessionToken = await glpi.openSession()
  try {
    const tickets = await glpi.listItems(sessionToken, 'Ticket')
    return tickets.map(t => ({ id: t.id, name: t.name, status: t.status }))
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Liste des tickets ──────────────────────────────────────────────────────────
// Renvoie une version "résumée" de chaque ticket — suffisant pour un tableau
// récapitulatif (la fiche détail ira chercher le reste à la demande).
export async function listTickets() {
  const sessionToken = await glpi.openSession()
  try {
    const tickets = await glpi.listItems(sessionToken, 'Ticket')
    // Tri du plus récent au plus ancien : ordre naturel pour une liste de suivi.
    return tickets
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(describeTicket)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Liste des coûts PAR ÉLÉMENT ASSOCIÉ ────────────────────────────────────────
// Pour la page "Ajouter un coût" : une ligne par (ticket, élément associé) —
// avec son type d'élément (pour le filtre), le coût fixe importé (TicketCost
// GLPI) et le "nouveau coût fixe" saisi lors de la clôture via le Kanban
// (table SQLite ticket_costs, voir db.js).
//
// Si un ticket est lié à PLUSIEURS éléments, son coût (importé ET nouveau) est
// réparti à parts égales entre eux (ex. 1000 Ar / 2 éléments → 500 Ar chacun) —
// indispensable pour que les totaux par type (et le total général) ne comptent
// pas deux fois le même coût de ticket.
//
// Tous les appels GLPI sont globaux (un seul appel par itemtype, pas un appel
// par ticket/élément) — même principe que listTicketsForKanban/dashboardData :
// avec ~0.5s par appel GLPI, un appel par ticket rendrait la page inutilisable.
export async function listCostsByAsset() {
  const sessionToken = await glpi.openSession()
  try {
    const [tickets, itemTickets, ticketCosts] = await Promise.all([
      glpi.listItems(sessionToken, 'Ticket'),
      glpi.listItems(sessionToken, 'Item_Ticket'),
      glpi.listItems(sessionToken, 'TicketCost')
    ])

    // Associations regroupées par ticket : { tickets_id → [{itemtype, id}, ...] }
    const itemsByTicket = new Map()
    for (const link of itemTickets) {
      const list = itemsByTicket.get(link.tickets_id) ?? []
      list.push({ itemtype: link.itemtype, id: link.items_id })
      itemsByTicket.set(link.tickets_id, list)
    }

    // Noms des éléments associés : un appel global PAR TYPE rencontré (pas un
    // appel par élément) — même principe que listElements().
    const distinctTypes = [...new Set(itemTickets.map(link => link.itemtype))]
    const itemListsByType = await Promise.all(
      distinctTypes.map(itemtype => glpi.listItems(sessionToken, itemtype))
    )
    const nameByTypeAndId = new Map(
      distinctTypes.map((itemtype, i) => [itemtype, new Map(itemListsByType[i].map(it => [it.id, it.name]))])
    )

    // Coût importé : pour chaque TicketCost (GLPI), cost_time est un TARIF
    // HORAIRE (pas un montant) — le coût lié au temps passé est donc
    // cost_time × actiontime(secondes) / 3600, auquel s'ajoute cost_fixed.
    // Somme par ticket (un ticket peut avoir plusieurs lignes TicketCost).
    const importedCostByTicket = new Map()
    for (const cost of ticketCosts) {
      const amount = Number(cost.cost_time ?? 0) * Number(cost.actiontime ?? 0) / 3600 + Number(cost.cost_fixed ?? 0)
      importedCostByTicket.set(
        cost.tickets_id,
        (importedCostByTicket.get(cost.tickets_id) ?? 0) + amount
      )
    }

    // Nouveau coût : même logique que les coûts importés — pour chaque ligne
    // ticket_costs (SQLite), cost_time × actiontime/3600 + cost_fixed, sommé
    // par ticket.
    const newCostByTicket = new Map()
    const reopenCostByTicket = new Map()
    for (const row of db.prepare('SELECT ticket_id, actiontime, cost_time, cost_fixed, type FROM ticket_costs').all()) {
      const amount = Number(row.cost_time ?? 0) * Number(row.actiontime ?? 0) / 3600 + Number(row.cost_fixed ?? 0)
      const target = row.type === 'reouverture' ? reopenCostByTicket : newCostByTicket
      target.set(row.ticket_id, (target.get(row.ticket_id) ?? 0) + amount)
    }

    const ticketNameById = new Map(tickets.map(t => [t.id, t.name]))

    const rows = []
    for (const [ticketId, items] of itemsByTicket) {
      const costImportedPerItem = (importedCostByTicket.get(ticketId) ?? 0) / items.length
      const costNewPerItem      = (newCostByTicket.get(ticketId) ?? 0) / items.length
      const costReopeningPerItem = (reopenCostByTicket.get(ticketId) ?? 0) / items.length

      for (const item of items) {
        rows.push({
          ticketId,
          ticketName:   ticketNameById.get(ticketId) ?? `Ticket #${ticketId}`,
          itemtype:     item.itemtype,
          assetId:      item.id,
          assetName:    nameByTypeAndId.get(item.itemtype)?.get(item.id) ?? `#${item.id}`,
          costImported: costImportedPerItem,
          costNew:      costNewPerItem,
          costReopening: costReopeningPerItem 
        })
      }
    }

    return rows.sort((a, b) => b.ticketId - a.ticketId)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Fiche détail d'un ticket ───────────────────────────────────────────────────
// En plus des champs du ticket lui-même, on rapatrie :
//   - les ÉLÉMENTS associés (table de liaison Item_Ticket → on résout chaque
//     id en nom lisible, ex. "PC-ADM-001" plutôt que "Computer #19")
//   - les COÛTS associés (TicketCost)
export async function getTicketDetail(ticketId) {
  const sessionToken = await glpi.openSession()
  try {
    const ticket = await glpi.getItem(sessionToken, 'Ticket', ticketId)

    // "itemLinks" et "costs" sont indépendants : récupérés en parallèle pour ne
    // pas payer deux fois le coût fixe (~0.5s) d'un appel GLPI.
    const [itemLinks, costs] = await Promise.all([
      glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'Item_Ticket'),
      glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'TicketCost')
    ])

    // Résolution des éléments associés EN PARALLÈLE (Promise.all) plutôt qu'un
    // par un : un ticket avec plusieurs éléments associés attendait auparavant
    // ~0.5s PAR élément, l'un après l'autre.
    const items = await Promise.all(itemLinks.map(async link => {
      try {
        const item = await glpi.getItem(sessionToken, link.itemtype, link.items_id)
        return { itemtype: link.itemtype, id: link.items_id, name: item.name }
      } catch {
        // L'élément a pu être supprimé depuis (ex. réinitialisation partielle) :
        // on l'affiche quand même, avec un nom de repli, plutôt que de faire
        // planter toute la fiche pour une seule association orpheline.
        return { itemtype: link.itemtype, id: link.items_id, name: '(élément introuvable)' }
      }
    }))

    return {
      ...describeTicket(ticket),
      items,
      costs: costs.map(c => ({
        name:       c.name,
        actiontime: c.actiontime,
        cost_time:  c.cost_time,
        cost_fixed: c.cost_fixed
      }))
    }
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Modification d'un ticket ──────────────────────────────────────────────────
// "fields" : { name, content, type, status, priority } — codes bruts (cf.
// TICKET_TYPES/STATUSES/PRIORITIES), tels qu'envoyés par le formulaire de la
// fiche détail Backoffice. GLPI accepte la mise à jour directe de "status" et
// "priority" sans étape supplémentaire (déjà constaté à l'import : un ticket
// peut être créé directement avec status:6 sans ITILSolution).
export async function updateTicket(ticketId, fields) {
  const sessionToken = await glpi.openSession()
  try {
    await glpi.updateItem(sessionToken, 'Ticket', ticketId, fields)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Suppression d'un ticket ───────────────────────────────────────────────────
// On référence d'abord les sous-éléments (Item_Ticket, TicketCost) AVANT de
// supprimer le ticket : un force_purge sur Ticket les fait disparaître en
// cascade côté GLPI, donc on ne pourrait plus les lister après coup. On
// nettoie ensuite le journal (import_journal) pour ces 3 itemtypes — sinon
// la page Reset tenterait plus tard de re-supprimer des éléments déjà partis.
export async function deleteTicket(ticketId) {
  const sessionToken = await glpi.openSession()
  try {
    const itemLinks = await glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'Item_Ticket')
    const costs     = await glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'TicketCost')

    await glpi.deleteItem(sessionToken, 'Ticket', ticketId)

    const deleteJournalEntry = db.prepare(
      'DELETE FROM import_journal WHERE glpi_itemtype = ? AND glpi_id = ?'
    )
    deleteJournalEntry.run('Ticket', Number(ticketId))
    for (const link of itemLinks) deleteJournalEntry.run('Item_Ticket', link.id)
    for (const cost of costs)     deleteJournalEntry.run('TicketCost', cost.id)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
