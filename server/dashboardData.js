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
    const tickets = await glpi.listItems(sessionToken, 'Ticket')

    const countByType = new Map()
    for (const ticket of tickets) {
      countByType.set(ticket.type, (countByType.get(ticket.type) ?? 0) + 1)
    }

    const ticketsByType = Object.entries(TICKET_TYPE_LABELS).map(([typeCode, label]) => ({
      type:  Number(typeCode),
      label,
      count: countByType.get(Number(typeCode)) ?? 0
    }))

    return {
      elements,
      totalElements,
      ticketsByType,
      totalTickets: tickets.length
    }
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
