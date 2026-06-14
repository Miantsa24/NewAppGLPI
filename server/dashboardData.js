// ── Données du Dashboard Backoffice (Phase 4) ─────────────────────────────────
//
// Principe (cohérent avec la décision d'architecture du J-1) : on lit TOUJOURS
// EN DIRECT depuis GLPI — jamais de cache local — pour que toute modification
// faite dans GLPI (ajout, suppression, modification d'un statut...) soit
// immédiatement reflétée dans NewApp, sans mécanisme de synchronisation.
//
// Ce module ouvre sa PROPRE session v1 (comme importPipeline) car le Backoffice
// n'a pas de token OAuth2 GLPI (authentification par code unique uniquement).

import * as glpi from './glpiV1Client.js'
import { ASSET_TYPES } from '../shared/assetTypes.js'
import { TICKET_STATUSES, listCostsByAsset } from './ticketsData.js'

// Codes numériques du champ "type" d'un Ticket dans GLPI (vérifiés par un test
// réel : voir docs internes — Ticket::INCIDENT_TYPE = 1, Ticket::DEMAND_TYPE = 2).
const TICKET_TYPE_LABELS = { 1: 'Incidents', 2: 'Demandes' }

export async function getDashboardStats() {
  const sessionToken = await glpi.openSession()

  try {
    // ── Comptage des éléments par type ────────────────────────────────────────
    // countItems ne rapatrie qu'un en-tête (Content-Range), pas la liste entière :
    // léger même si GLPI contenait des milliers d'items. En parallèle (Promise.all).
    const elements = await Promise.all(ASSET_TYPES.map(async ({ itemtype, label }) => ({
      itemtype, label, count: await glpi.countItems(sessionToken, itemtype)
    })))
    const totalElements = elements.reduce((sum, e) => sum + e.count, 0)

    // ── Comptage des tickets par type ─────────────────────────────────────────
    // Ici on récupère la liste complète (les volumes de tickets sont petits pour
    // ce projet) et on regroupe par "type" côté JavaScript — plus simple que
    // d'apprendre la syntaxe de recherche avancée de GLPI pour un si petit besoin.
    // "allCosts" est récupéré EN MÊME TEMPS (Promise.all) : chaque appel GLPI a un
    // coût fixe d'environ 0.5s (bootstrap PHP), donc paralléliser les deux appels
    // indépendants évite de payer ce coût deux fois de suite.
    const [tickets, allCosts, costsByAsset] = await Promise.all([
      glpi.listItems(sessionToken, 'Ticket'),
      glpi.listItems(sessionToken, 'TicketCost'),
      listCostsByAsset()
    ])

    const countByType = new Map()
    for (const ticket of tickets) {
      countByType.set(ticket.type, (countByType.get(ticket.type) ?? 0) + 1)
    }

    const ticketsByType = Object.entries(TICKET_TYPE_LABELS).map(([typeCode, label]) => ({
      type:  Number(typeCode),
      label,
      count: countByType.get(Number(typeCode)) ?? 0
    }))

    // ── Comptage des tickets par statut ───────────────────────────────────────
    // Même principe que ticketsByType, mais sur le champ "status" — affiché
    // dans le Dashboard avec les mêmes couleurs que les pastilles de TicketsPage.
    const countByStatus = new Map()
    for (const ticket of tickets) {
      countByStatus.set(ticket.status, (countByStatus.get(ticket.status) ?? 0) + 1)
    }

    const ticketsByStatus = Object.entries(TICKET_STATUSES).map(([statusCode, label]) => ({
      status: Number(statusCode),
      label,
      count:  countByStatus.get(Number(statusCode)) ?? 0
    }))

    // ── Coûts des tickets ──────────────────────────────────────────────────────
    // "allCosts" (récupéré ci-dessus en parallèle des tickets) contient TOUS les
    // TicketCost de GLPI en un seul appel — pas un appel par ticket : avec ~0.5s
    // par appel GLPI, faire un appel par ticket rendrait le Dashboard inutilisable
    // dès que le nombre de tickets devient important (ex. 121 tickets → ~60s).
    const totalCostsCount  = allCosts.length

    // Mêmes totaux que la page "Ajouter un coût" (Backoffice) — calculés à
    // partir des mêmes lignes (listCostsByAsset), pour garantir des chiffres
    // identiques entre le Dashboard et cette page.
    const totalCostAmount        = costsByAsset.reduce((sum, c) => sum + c.costImported, 0)
    const totalNewCostAmount     = costsByAsset.reduce((sum, c) => sum + c.costNew, 0)
    const totalReopenCostAmount  = costsByAsset.reduce((sum, c) => sum + c.costReopening, 0)
    const totalGeneralCostAmount = totalCostAmount + totalNewCostAmount + totalReopenCostAmount

    return {
      elements,
      totalElements,
      ticketsByType,
      ticketsByStatus,
      totalTickets: tickets.length,
      totalCostsCount,
      totalCostAmount,
      totalNewCostAmount,
      totalReopenCostAmount,
      totalGeneralCostAmount
    }
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
