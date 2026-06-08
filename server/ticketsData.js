// ── Données de la page Tickets (Phase 5 : liste + fiche détail) ───────────────
//
// Comme dashboardData.js : lecture EN DIRECT depuis GLPI (pas de cache local),
// dans une session v1 propre au Backoffice (pas de token OAuth2 disponible ici).

import * as glpi from './glpiV1Client.js'

// GLPI stocke type/statut/priorité sous forme de petits entiers (vérifié par un
// test réel pendant la Phase 2 : Incident=1, New=1, Medium=3...). On traduit ces
// codes en libellés lisibles ici, une fois pour toutes, pour ne pas avoir à le
// refaire dans chaque composant React.
const TICKET_TYPES = { 1: 'Incident', 2: 'Demande' }
const TICKET_STATUSES = {
  1: 'Nouveau',
  2: 'En cours (attribué)',
  3: 'En cours (planifié)',
  4: 'En attente',
  5: 'Résolu',
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
function describeTicket(ticket) {
  return {
    id:       ticket.id,
    name:     ticket.name,
    content:  ticket.content,
    type:     TICKET_TYPES[ticket.type]         ?? `(type ${ticket.type})`,
    status:   TICKET_STATUSES[ticket.status]    ?? `(statut ${ticket.status})`,
    priority: TICKET_PRIORITIES[ticket.priority] ?? `(priorité ${ticket.priority})`,
    date:     ticket.date
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

// ── Fiche détail d'un ticket ───────────────────────────────────────────────────
// En plus des champs du ticket lui-même, on rapatrie :
//   - les ÉLÉMENTS associés (table de liaison Item_Ticket → on résout chaque
//     id en nom lisible, ex. "PC-ADM-001" plutôt que "Computer #19")
//   - les COÛTS associés (TicketCost)
export async function getTicketDetail(ticketId) {
  const sessionToken = await glpi.openSession()
  try {
    const ticket = await glpi.getItem(sessionToken, 'Ticket', ticketId)

    const itemLinks = await glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'Item_Ticket')
    const items = []
    for (const link of itemLinks) {
      try {
        const item = await glpi.getItem(sessionToken, link.itemtype, link.items_id)
        items.push({ itemtype: link.itemtype, id: link.items_id, name: item.name })
      } catch {
        // L'élément a pu être supprimé depuis (ex. réinitialisation partielle) :
        // on l'affiche quand même, avec un nom de repli, plutôt que de faire
        // planter toute la fiche pour une seule association orpheline.
        items.push({ itemtype: link.itemtype, id: link.items_id, name: '(élément introuvable)' })
      }
    }

    const costs = await glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'TicketCost')

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
