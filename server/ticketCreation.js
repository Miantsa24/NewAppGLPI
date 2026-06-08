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

import axios from 'axios'
import * as glpiV1 from './glpiV1Client.js'

const V2_URL = process.env.GLPI_API_URL

export async function createTicketWithItems({ accessToken, name, content, type, urgency, items }) {
  // 1. Création du ticket via v2 — "accessToken" est l'en-tête Authorization
  //    complet ("Bearer xxx"), tel que reçu de la requête du navigateur : on le
  //    transmet tel quel, exactement comme le fait le proxy /api/glpi.
  const ticketResponse = await axios.post(
    `${V2_URL}/Assistance/Ticket`,
    { name, content, type, urgency },
    { headers: { Authorization: accessToken, Accept: 'application/json', 'Content-Type': 'application/json' } }
  )
  const ticketId = ticketResponse.data.id

  // 2. Association de chaque élément sélectionné — UNE session v1 pour toutes
  //    les associations (même principe que runImport : ouvrir/fermer une seule
  //    fois plutôt qu'à chaque appel).
  if (items.length > 0) {
    const sessionToken = await glpiV1.openSession()
    try {
      for (const { itemtype, items_id } of items) {
        await glpiV1.createItem(sessionToken, 'Item_Ticket', {
          tickets_id: ticketId,
          itemtype,
          items_id
        })
      }
    } finally {
      await glpiV1.closeSession(sessionToken)
    }
  }

  return ticketId
}
