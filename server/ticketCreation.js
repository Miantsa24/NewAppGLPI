// ── Création de ticket avec association d'éléments (FrontOffice, Phase 7) ─────
//
// Pourquoi mélanger les DEUX APIs GLPI ici (comme pour l'upload d'images en
// Phase 2) ?
//   - Le TICKET doit être créé via l'API v2 (OAuth2), AVEC le token de
//     l'utilisateur connecté : ainsi "user_recipient" est le VRAI utilisateur,
//     pas un compte technique — vérifié en direct (ticket créé avec le token
//     d'un utilisateur → user_recipient = cet utilisateur).
//   - L'ASSOCIATION du ticket à des éléments (table de liaison Item_Ticket)
//     n'est PAS exposée dans l'API v2.3 de cette installation (absente du
//     swagger /api.php/v2.3/doc.json, malgré l'existence du schéma "Ticket_Item"
//     en lecture). Seule la v1 (legacy) sait créer cette association — exactement
//     le même constat que pour l'upload de Document en Phase 2.
// → Le ticket est donc créé avec le token de l'UTILISATEUR (v2), puis chaque
//   association est créée avec les identifiants SERVEUR (App-Token + user_token,
//   v1) dans une session dédiée — comme pour le pipeline d'import.

import * as glpiV1 from './glpiV1Client.js'
import db          from './db.js'

const insertJournal = db.prepare('INSERT INTO import_journal (glpi_itemtype, glpi_id, label) VALUES (?, ?, ?)')

// Crée un ticket via session v1 (credentials serveur, pas de token utilisateur),
// associe les éléments sélectionnés et journalise tout pour la réinitialisation.
// Remplace l'ancienne version v2 — inutile depuis la suppression du login FrontOffice.
export async function createTicketWithItems({ name, content, type, urgency, items }) {
  const sessionToken = await glpiV1.openSession()
  try {
    // 1. Ticket créé via v1 — même résultat que v2 mais sans token utilisateur.
    const ticketId = await glpiV1.createItem(sessionToken, 'Ticket', {
      name, content, type, urgency
    })
    insertJournal.run('Ticket', ticketId, name)

    // 2. Association ticket ↔ éléments (Item_Ticket) — v1 uniquement (absent de v2).
    for (const { itemtype, items_id } of items) {
      const linkId = await glpiV1.createItem(sessionToken, 'Item_Ticket', {
        tickets_id: ticketId,
        itemtype,
        items_id
      })
      insertJournal.run('Item_Ticket', linkId, `${itemtype}#${items_id} → ticket #${ticketId}`)
    }

    return ticketId
  } finally {
    await glpiV1.closeSession(sessionToken)
  }
}

// Ajoute un coût (TicketCost) à un ticket existant — utilisé par la page
// Backoffice "Ajouter un coût". Journalisé comme tout le reste pour que la
// réinitialisation puisse le supprimer.
export async function addTicketCost({ ticketId, name, actiontime, cost_time, cost_fixed }) {
  const sessionToken = await glpiV1.openSession()
  try {
    const costId = await glpiV1.createItem(sessionToken, 'TicketCost', {
      tickets_id: ticketId,
      name,
      actiontime,
      cost_time,
      cost_fixed
    })
    insertJournal.run('TicketCost', costId, `Coût "${name}" → ticket #${ticketId}`)
    return costId
  } finally {
    await glpiV1.closeSession(sessionToken)
  }
}
