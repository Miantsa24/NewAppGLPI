// ── Client API GLPI v1 (legacy) ───────────────────────────────────────────────
//
// Pourquoi un second client, alors qu'on a déjà l'API v2 (OAuth2) ?
// → Deux raisons :
//   1. Upload de fichiers : la v2 ne propose AUCUN endpoint d'upload (vérifié sur
//      ses 2455 routes). Seule la v1 sait recevoir un fichier en "multipart/form-data".
//   2. Le Backoffice n'a PAS de token OAuth2 GLPI : son authentification est un
//      simple code unique (voir /api/backoffice/login), indépendant de tout compte
//      GLPI. Pour que le Backoffice puisse écrire dans GLPI (import), il lui faut
//      donc des identifiants "côté serveur" qui ne dépendent d'aucun utilisateur
//      connecté — exactement ce que fournissent l'App-Token + le user_token.
// → Conséquence : tout le pipeline d'import (création des items ET upload des
//   images) passe par CE client v1, avec une session ouverte une seule fois.
//
// Authentification v1 = mécanisme différent de l'OAuth2 :
//   - App-Token  : jeton fixe qui identifie l'application cliente (stocké en .env)
//   - user_token : jeton personnel d'un compte utilisateur GLPI (stocké en .env)
//   - session_token : jeton TEMPORAIRE obtenu en échangeant les deux jetons ci-dessus
//                     via initSession ; à fournir dans chaque requête suivante,
//                     puis à libérer avec killSession en fin d'utilisation.

import axios    from 'axios'
import FormData from 'form-data'
import fs       from 'fs'

const V1_URL     = process.env.GLPI_API_V1_URL
const APP_TOKEN  = process.env.GLPI_APP_TOKEN
const USER_TOKEN = process.env.GLPI_USER_TOKEN

// Petit utilitaire interne : construit les en-têtes communs à toutes les requêtes
// authentifiées par session. "extra" permet d'ajouter/écraser certains en-têtes
// (ex. Content-Type pour les requêtes avec corps JSON).
function sessionHeaders(sessionToken, extra = {}) {
  return {
    'Session-Token': sessionToken,
    'App-Token':     APP_TOKEN,
    'Accept':        'application/json',
    ...extra
  }
}

// ── Ouvrir / fermer une session ────────────────────────────────────────────────
// À appeler UNE fois en début de pipeline (openSession) et UNE fois à la fin
// (closeSession, dans un bloc finally pour ne jamais laisser de session ouverte
// même si une erreur survient en cours de route).
export async function openSession() {
  const response = await axios.get(`${V1_URL}/initSession`, {
    headers: {
      'Authorization': `user_token ${USER_TOKEN}`,
      'App-Token':     APP_TOKEN,
      'Accept':        'application/json'
    }
  })
  return response.data.session_token
}

export async function closeSession(sessionToken) {
  await axios.get(`${V1_URL}/killSession`, { headers: sessionHeaders(sessionToken) })
}

// ── CRUD générique ─────────────────────────────────────────────────────────────
// Ces trois fonctions couvrent tous les besoins du pipeline d'import : lire une
// liste d'items existants (pour le "find" du find-or-create), en créer un nouveau,
// en supprimer un (utilisé par la Réinitialisation, Phase 3).
// "itemtype" est le nom GLPI du type visé : "Computer", "Location", "Ticket"...

// Récupère UN item par son id (ex. pour afficher la fiche détail d'un ticket).
export async function getItem(sessionToken, itemtype, id) {
  const response = await axios.get(`${V1_URL}/${itemtype}/${id}`, { headers: sessionHeaders(sessionToken) })
  return response.data
}

// Récupère les sous-éléments LIÉS à un item via une relation GLPI, en utilisant
// la notation d'URL imbriquée "/<itemtype>/<id>/<sousType>" — déjà utilisée
// pour vérifier les associations Document_Item et Item_Ticket pendant les tests.
// Exemples : listSubItems(st, 'Ticket', 5, 'TicketCost') → coûts du ticket #5
//            listSubItems(st, 'Ticket', 5, 'Item_Ticket') → éléments associés au ticket #5
export async function listSubItems(sessionToken, itemtype, id, subItemtype) {
  const response = await axios.get(`${V1_URL}/${itemtype}/${id}/${subItemtype}`, {
    headers: sessionHeaders(sessionToken),
    params:  { range: '0-9999' }
  })
  return response.data
}

// Récupère une liste d'items d'un type donné (ex. pour chercher par nom).
// range "0-9999" : on veut TOUT récupérer d'un coup (les volumes ici sont petits,
// pas besoin de pagination) pour pouvoir filtrer ensuite côté JavaScript.
export async function listItems(sessionToken, itemtype) {
  const response = await axios.get(`${V1_URL}/${itemtype}`, {
    headers: sessionHeaders(sessionToken),
    params:  { range: '0-9999' }
  })
  return response.data
}

// Compte le nombre total d'items d'un type, SANS rapatrier la liste complète.
// Astuce : on demande la plus petite tranche possible ("range: 0-0" = un seul
// item), et on lit le total dans l'en-tête de réponse "Content-Range", dont le
// format est "début-fin/TOTAL" (ex. "0-0/9" → 9 items au total). Beaucoup plus
// léger qu'un GET de toute la liste quand on ne veut qu'un nombre (Dashboard).
export async function countItems(sessionToken, itemtype) {
  const response = await axios.get(`${V1_URL}/${itemtype}`, {
    headers: sessionHeaders(sessionToken),
    params:  { range: '0-0' }
  })
  const contentRange = response.headers['content-range']     // "0-0/9"
  return contentRange ? parseInt(contentRange.split('/')[1], 10) : response.data.length
}

// Crée un item et retourne son id GLPI.
// "input" est un objet simple { champ: valeur, ... } — la v1 utilise des clés
// plates comme "locations_id: 4" (contrairement à la v2 qui imbrique des objets
// { location: { id: 4 } }).
export async function createItem(sessionToken, itemtype, input) {
  const response = await axios.post(`${V1_URL}/${itemtype}/`,
    { input },
    { headers: sessionHeaders(sessionToken, { 'Content-Type': 'application/json' }) }
  )
  return response.data.id
}

// Supprime définitivement un item ("force_purge": true = suppression réelle,
// pas une simple mise à la corbeille — cohérent avec l'objectif de Réinitialisation
// qui doit effacer toute trace de l'import, pas juste la masquer).
export async function deleteItem(sessionToken, itemtype, id) {
  await axios.delete(`${V1_URL}/${itemtype}/${id}`, {
    headers: sessionHeaders(sessionToken),
    data:    { input: { id }, force_purge: true }
  })
}

// ── Upload de fichier : création d'un Document GLPI ────────────────────────────
// D'après docs/apirest.md de GLPI (section "Upload a document file") :
//   - on POSTe sur /Document/ (le endpoint "document.php" n'existe pas en v1)
//   - le manifeste ne contient QUE "name" et "_filename" (la création du Document
//     et son ASSOCIATION à un item sont deux opérations bien distinctes)
//   - le champ binaire doit s'appeler "filename[0]" — un tableau INDEXÉ, car
//     "_filename" dans le manifeste est aussi un tableau, et GLPI fait
//     correspondre les deux PAR INDEX (filename[0] ↔ _filename[0], etc.)
export async function uploadDocument(sessionToken, { filePath, fileName }) {
  const form = new FormData()

  // "contentType: application/json" sur cette partie : sans ça, GLPI essaie de
  // l'interpréter comme un fichier binaire au lieu de lire son JSON.
  form.append('uploadManifest', JSON.stringify({
    input: { name: fileName, _filename: [fileName] }
  }), { contentType: 'application/json' })

  // Lecture en flux (stream) : évite de charger toute l'image en mémoire d'un coup,
  // important si on traite plusieurs fichiers à la suite dans une boucle.
  form.append('filename[0]', fs.createReadStream(filePath), fileName)

  const response = await axios.post(`${V1_URL}/Document/`, form, {
    // form.getHeaders() fournit "Content-Type: multipart/form-data; boundary=..."
    // (la "frontière" qui sépare les parties du corps) — on le fusionne avec
    // les en-têtes de session habituels.
    headers: sessionHeaders(sessionToken, form.getHeaders())
  })

  return response.data.id
}

// ── Association Document ↔ item (table de liaison Document_Item) ───────────────
// En GLPI, un Document est une entité indépendante (un "fichier dans le coffre").
// L'associer à un Computer/Monitor/Ticket... passe par une ligne dans la table
// de liaison Document_Item — exactement comme Item_Ticket relie un item à un ticket.
export async function linkDocumentToItem(sessionToken, { documentId, itemtype, itemId }) {
  return createItem(sessionToken, 'Document_Item', {
    documents_id: documentId,
    itemtype,
    items_id: itemId
  })
}
