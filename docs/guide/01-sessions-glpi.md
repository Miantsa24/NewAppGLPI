# 1. Sessions GLPI (API v1) — `openSession` / `closeSession` et CRUD générique

[← Retour au sommaire](README.md)

## Façon de faire

GLPI ne garde pas de "connexion" permanente. Chaque échange suit toujours le
même cycle en 3 temps :

1. **Ouvrir une session** → on échange des jetons fixes (App-Token + user_token,
   stockés dans `.env`) contre un `session_token` **temporaire**.
2. **Faire les appels** dont on a besoin, en passant ce `session_token` dans les
   en-têtes de CHAQUE requête.
3. **Fermer la session** (`killSession`) — toujours, même si une erreur s'est
   produite, donc dans un bloc `finally`.

```
try {
  ouvrir la session          → sessionToken
  ... faire les appels GLPI avec sessionToken ...
  retourner le résultat
} finally {
  fermer la session
}
```

## Extrait réel — [server/glpiV1Client.js:46-59](../../server/glpiV1Client.js#L46-L59)

```js
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
```

Utilisation typique — [server/ticketsData.js:100-102 + 174-176](../../server/ticketsData.js#L100-L102) :

```js
export async function listCostsByAsset() {
  const sessionToken = await glpi.openSession()
  try {
    // ... tous les appels GLPI ici, avec sessionToken ...
    return rows
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
```

---

## Fonctionnement détaillé, fonction par fonction

Tout ce qui suit vient de `server/glpiV1Client.js` — le module qui centralise
**tous** les appels HTTP vers GLPI en API v1 (legacy). Chaque fonction est un
petit "wrapper" autour d'un appel `axios`.

### `sessionHeaders(sessionToken, extra = {})` — [glpiV1Client.js:33-40](../../server/glpiV1Client.js#L33-L40)

```js
function sessionHeaders(sessionToken, extra = {}) {
  return {
    'Session-Token': sessionToken,
    'App-Token':     APP_TOKEN,
    'Accept':        'application/json',
    ...extra
  }
}
```

- **Reçoit** : le `sessionToken` obtenu via `openSession()`, et optionnellement
  un objet `extra` d'en-têtes supplémentaires (ex. `Content-Type`).
- **Fait** : construit l'objet d'en-têtes HTTP commun à **toutes** les requêtes
  authentifiées — `Session-Token` + `App-Token` + `Accept: application/json`.
- `...extra` (spread) : si `extra` contient une clé déjà présente (ex.
  `Content-Type`), elle **écrase** celle d'avant car elle est placée en
  dernier dans l'objet littéral.
- **Renvoie** : l'objet d'en-têtes prêt à passer à `axios` (`{ headers: ... }`).
- Fonction privée (pas d'`export`) — uniquement utilisée à l'intérieur de ce
  fichier, par toutes les autres fonctions ci-dessous.

### `openSession()` — [glpiV1Client.js:46-55](../../server/glpiV1Client.js#L46-L55)

- **Reçoit** : rien (les jetons `APP_TOKEN`/`USER_TOKEN` viennent de `.env`,
  lus une seule fois en haut du fichier).
- **Fait** : `GET /initSession` avec `Authorization: user_token <USER_TOKEN>`
  et `App-Token: <APP_TOKEN>` — GLPI vérifie ces deux jetons fixes et crée une
  session temporaire côté serveur GLPI.
- **Renvoie** : `response.data.session_token` — une chaîne à transmettre dans
  toutes les requêtes suivantes (via `sessionHeaders`).

### `closeSession(sessionToken)` — [glpiV1Client.js:57-59](../../server/glpiV1Client.js#L57-L59)

- **Reçoit** : le `sessionToken` à invalider.
- **Fait** : `GET /killSession` avec ce token dans les en-têtes — GLPI libère
  la session côté serveur.
- **Renvoie** : rien (`await` sans valeur de retour utile). Appelée dans un
  `finally`, donc s'exécute même si le `try` a levé une erreur.

### `getItem(sessionToken, itemtype, id)` — [glpiV1Client.js:68-71](../../server/glpiV1Client.js#L68-L71)

- **Reçoit** : le token de session, le type GLPI (`'Ticket'`, `'Computer'`...)
  et l'id numérique de l'item.
- **Fait** : `GET /<itemtype>/<id>` — récupère **un seul** item par son id.
- **Renvoie** : `response.data`, l'objet JSON brut renvoyé par GLPI (tous les
  champs de l'item : `name`, `status`, `type`, etc.).
- Utilisée par exemple pour la fiche détail d'un ticket (`getTicketDetail`).

### `listSubItems(sessionToken, itemtype, id, subItemtype)` — [glpiV1Client.js:78-84](../../server/glpiV1Client.js#L78-L84)

- **Reçoit** : le type et l'id d'un item "parent", et le type d'item "enfant"
  à lister (ex. `listSubItems(token, 'Ticket', 5, 'TicketCost')`).
- **Fait** : `GET /<itemtype>/<id>/<subItemtype>` avec `range: '0-9999'` (on
  demande "toute la liste" — pas de pagination car les volumes sont petits).
- **Renvoie** : `response.data`, un tableau des sous-éléments liés (ex. tous
  les `TicketCost` du ticket #5, ou tous les `Item_Ticket` — les associations
  éléments↔ticket).
- Utilisée dans `getTicketDetail` (récupérer les éléments associés + les
  coûts d'un ticket) et dans `deleteTicket` (lister ce qu'il faut nettoyer du
  journal avant de supprimer le ticket).

### `listItems(sessionToken, itemtype)` — [glpiV1Client.js:89-95](../../server/glpiV1Client.js#L89-L95)

- **Reçoit** : le token et un type GLPI.
- **Fait** : `GET /<itemtype>` avec `range: '0-9999'` — récupère **tous** les
  items de ce type en un seul appel.
- **Renvoie** : `response.data`, un tableau d'objets. C'est la fonction la plus
  utilisée du fichier : dès qu'on a besoin de "tous les tickets", "tous les
  Item_Ticket", "tous les TicketCost"..., on l'appelle une fois et on
  filtre/regroupe ensuite **côté JavaScript** (voir
  [03-calcul-couts.md](03-calcul-couts.md)).

### `countItems(sessionToken, itemtype)` — [glpiV1Client.js:102-109](../../server/glpiV1Client.js#L102-L109)

```js
export async function countItems(sessionToken, itemtype) {
  const response = await axios.get(`${V1_URL}/${itemtype}`, {
    headers: sessionHeaders(sessionToken),
    params:  { range: '0-0' }
  })
  const contentRange = response.headers['content-range']     // "0-0/9"
  return contentRange ? parseInt(contentRange.split('/')[1], 10) : response.data.length
}
```

- **Reçoit** : le token et un type GLPI.
- **Fait** : demande la **plus petite tranche possible** (`range: '0-0'` = un
  seul item), puis lit l'en-tête de réponse HTTP `Content-Range`, dont le
  format est `"début-fin/TOTAL"` (ex. `"0-0/9"`).
- `contentRange.split('/')[1]` : découpe la chaîne `"0-0/9"` sur le `/` →
  `["0-0", "9"]` → on prend l'élément `[1]` = `"9"`, puis `parseInt(..., 10)`
  pour avoir le nombre `9`.
- **Renvoie** : le total d'items de ce type, **sans** avoir téléchargé la
  liste complète — utilisé par le Dashboard pour compter rapidement les
  éléments par type (`ASSET_TYPES.map(...)`).
- Si jamais GLPI ne renvoie pas l'en-tête `Content-Range` (cas de repli),
  `response.data.length` reste un filet de sécurité.

### `createItem(sessionToken, itemtype, input)` — [glpiV1Client.js:115-121](../../server/glpiV1Client.js#L115-L121)

- **Reçoit** : le token, le type d'item à créer, et `input` — un objet
  `{ champ: valeur, ... }` avec des clés **plates** (ex.
  `{ name: 'PC-01', locations_id: 4 }`).
- **Fait** : `POST /<itemtype>/` avec un corps `{ input }` (GLPI v1 exige ce
  wrapper `input` pour toute écriture).
- **Renvoie** : `response.data.id` — l'id GLPI du nouvel item, à utiliser
  immédiatement (ex. pour l'associer à un ticket) ou à journaliser.

### `updateItem(sessionToken, itemtype, id, input)` — [glpiV1Client.js:126-131](../../server/glpiV1Client.js#L126-L131)

- **Reçoit** : token, type, id de l'item existant, et `input` = les champs à
  modifier (seulement ceux-là, pas besoin de renvoyer l'objet complet).
- **Fait** : `PUT /<itemtype>/<id>` avec `{ input }`.
- **Renvoie** : rien d'utile (`await` sans valeur récupérée). Utilisée par
  exemple pour changer le statut d'un ticket : `updateItem(token, 'Ticket', id, { status: 6 })`.

### `deleteItem(sessionToken, itemtype, id)` — [glpiV1Client.js:136-141](../../server/glpiV1Client.js#L136-L141)

- **Reçoit** : token, type, id.
- **Fait** : `DELETE /<itemtype>/<id>` avec `data: { input: { id }, force_purge: true }`.
- `force_purge: true` : suppression **réelle et définitive**, pas une mise à
  la corbeille — nécessaire pour que la Réinitialisation (Phase 3) efface
  vraiment toute trace de l'import.
- **Renvoie** : rien.

### `uploadDocument(sessionToken, { filePath, fileName })` — [glpiV1Client.js:151-172](../../server/glpiV1Client.js#L151-L172)

- **Reçoit** : un chemin de fichier local (`filePath`) et le nom à donner au
  Document GLPI (`fileName`).
- **Fait** :
  1. Construit un `FormData` (corps `multipart/form-data`).
  2. `form.append('uploadManifest', JSON.stringify({ input: { name: fileName, _filename: [fileName] } }), { contentType: 'application/json' })`
     — un "manifeste" qui décrit le futur Document.
  3. `form.append('filename[0]', fs.createReadStream(filePath), fileName)` —
     le contenu binaire du fichier, lu en **flux** (`createReadStream`, pas
     `readFileSync`) pour ne pas charger tout le fichier en mémoire.
  4. `POST /Document/` avec `form.getHeaders()` fusionné aux en-têtes de
     session (donne le `Content-Type: multipart/form-data; boundary=...`).
- **Renvoie** : `response.data.id` — l'id du `Document` créé dans GLPI (à
  associer ensuite à un item via `linkDocumentToItem`).

### `downloadDocument(sessionToken, documentId)` — [glpiV1Client.js:180-186](../../server/glpiV1Client.js#L180-L186)

- **Reçoit** : l'id d'un `Document` GLPI.
- **Fait** : `GET /Document/<id>` avec `Accept: application/octet-stream` (au
  lieu du `application/json` habituel) et `responseType: 'arraybuffer'` côté
  axios — pour récupérer les **octets bruts** sans qu'axios essaie de les
  décoder comme du texte/JSON.
- **Renvoie** : `{ data: response.data, contentType: response.headers['content-type'] }`
  — utilisé par la route `GET /api/backoffice/elements/:itemtype/:id/image`
  pour servir l'image directement au navigateur.

### `linkDocumentToItem(sessionToken, { documentId, itemtype, itemId })` — [glpiV1Client.js:192-198](../../server/glpiV1Client.js#L192-L198)

- **Reçoit** : l'id d'un `Document` déjà créé, et le type+id de l'item auquel
  l'associer.
- **Fait** : appelle simplement `createItem(sessionToken, 'Document_Item', { documents_id: documentId, itemtype, items_id: itemId })`
  — crée une ligne dans la table de liaison `Document_Item` (même principe que
  `Item_Ticket` qui relie un élément à un ticket).
- **Renvoie** : l'id de cette ligne `Document_Item` (valeur de retour de
  `createItem`).

---

## À retenir pour coder à la main

- **Toujours** `try { ... } finally { closeSession() }` — sinon la session
  GLPI reste ouverte (fuite de ressources côté serveur GLPI).
- Le `sessionToken` se passe **en paramètre** à toutes les fonctions qui font
  des appels GLPI — il n'y a pas de variable globale.
- **Deux APIs coexistent** dans ce projet :
  - **v1** (`glpiV1Client.js`) : session_token + App-Token, format `{ input: {...} }`,
    seule à savoir uploader des fichiers et utilisée par le Backoffice (pas de
    compte GLPI / OAuth2).
  - **v2** (`glpiV2Client.js`) : OAuth2 (token utilisateur FrontOffice), format
    avec objets imbriqués.
- **Piège N+1** : ne JAMAIS faire un appel GLPI par ticket/élément dans une
  boucle (chaque appel coûte ~0.5s). Toujours :
  ```js
  const [tickets, costs] = await Promise.all([
    glpi.listItems(sessionToken, 'Ticket'),
    glpi.listItems(sessionToken, 'TicketCost')
  ])
  // puis regrouper/filtrer CÔTÉ JS avec des Map/filter
  ```
- `countItems` vs `listItems` : utiliser `countItems` quand on veut juste un
  **nombre** (Dashboard), `listItems` quand on a besoin des **données** de
  chaque item.
