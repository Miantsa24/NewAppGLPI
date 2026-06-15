# 9. Autres patterns — SSE (progression en temps réel) & find-or-create

[← Retour au sommaire](README.md)

## Façon de faire

Deux patterns transversaux, utilisés par les routes Backoffice "Import" et
"Réinitialisation" :

- **SSE (Server-Sent Events)** : une route Express qui répond avec un flux
  `text/event-stream` au lieu d'un seul `res.json(...)` — permet d'envoyer
  **plusieurs** messages de progression au frontend pendant qu'une opération
  longue (import de centaines de lignes) est en cours.
- **Find-or-create** : avant de créer un élément GLPI qui référence un autre
  élément par nom (ex. un `Computer` référence un `Manufacturer` "Dell"), on
  cherche d'abord si cet élément existe déjà (par nom) ; sinon on le crée. Cela
  évite les doublons (deux lignes "Dell" dans la table `Manufacturer`).

---

## Fonctionnement détaillé, fonction par fonction — SSE

### Côté serveur — `POST /api/backoffice/import` — [server/index.js:76-122](../../server/index.js#L76-L122)

```js
app.post('/api/backoffice/import',
  requireBackofficeCode,
  upload.fields([
    { name: 'feuille1', maxCount: 1 },
    { name: 'feuille2', maxCount: 1 },
    { name: 'feuille3', maxCount: 1 },
    { name: 'images',   maxCount: 1 }
  ]),
  async (req, res) => {
    const files = req.files

    const missing = ['feuille1'].filter(key => !files?.[key]?.[0])
    if (missing.length > 0) {
      return res.status(400).json({ ok: false, error: `Fichier(s) manquant(s) : ${missing.join(', ')}` })
    }

    res.writeHead(200, {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'X-Accel-Buffering': 'no'
    })

    function emit(data) { res.write(`data: ${JSON.stringify(data)}\n\n`) }

    try {
      const result = await runImport({
        feuille1Csv: files.feuille1[0].buffer.toString('utf-8'),
        feuille2Csv: files.feuille2?.[0]?.buffer?.toString('utf-8'),
        feuille3Csv: files.feuille3?.[0]?.buffer?.toString('utf-8'),
        zipBuffer:   files.images?.[0]?.buffer,
        onProgress:  emit
      })
      console.log(`[import] Terminé : ${result.log.length} opérations journalisées`)
      emit({ type: 'done', ok: true, log: result.log })
    } catch (err) {
      const glpiError = err.response?.data ?? err.message
      console.error('[import] Erreur :', JSON.stringify(glpiError, null, 2))
      emit({ type: 'done', ok: false, error: glpiError })
    } finally {
      res.end()
    }
  }
)
```

- **Reçoit** : une requête `multipart/form-data` (formulaire avec fichiers).
- `multer({ storage: multer.memoryStorage() })` + `upload.fields([...])` :
  middleware qui transforme le corps multipart en `req.files` — un objet
  `{ feuille1: [{ buffer, ... }], feuille2: [...], ... }` (tableaux car
  `maxCount`, même si limité à 1 fichier). `memoryStorage()` : les fichiers
  restent en RAM (`.buffer`, un `Buffer` Node), jamais écrits sur disque —
  adapté à de petits CSV/ZIP traités immédiatement.
- **Validation précoce** : `const missing = ['feuille1'].filter(key => !files?.[key]?.[0])` —
  seule `feuille1` est obligatoire. `files?.[key]?.[0]` : `?.` (optional
  chaining) à chaque étape, car `req.files` peut être `undefined` si aucun
  fichier n'est envoyé, et `files.feuille1` peut être `undefined` si ce champ
  précis est absent. Si `missing.length > 0` → `return res.status(400).json(...)`
  — réponse JSON **classique** (pas SSE), envoyée **avant** `res.writeHead(...)`
  : c'est pour ça que le frontend doit vérifier `response.ok` avant de tenter
  de lire un flux SSE (voir ci-dessous).
- **`res.writeHead(200, { 'Content-Type': 'text/event-stream', ... })`** :
  bascule manuellement la réponse en mode "flux" — contrairement à
  `res.json(...)` qui envoie une réponse complète et ferme la connexion,
  `writeHead` envoie seulement les en-têtes et **laisse la connexion ouverte**
  pour des écritures successives.
  - `'Cache-Control': 'no-cache'` : empêche la mise en cache du flux.
  - `'X-Accel-Buffering': 'no'` : désactive le buffering si un reverse-proxy
    nginx est devant (sinon nginx pourrait retenir les données et les envoyer
    par gros blocs, annulant l'effet "temps réel").
- **`function emit(data) { res.write(\`data: ${JSON.stringify(data)}\n\n\`) }`** :
  - `res.write(...)` : écrit un morceau dans le flux **sans** fermer la
    connexion (contrairement à `res.end(...)` ou `res.json(...)`).
  - Le format `data: <json>\n\n` est le format **standard SSE** : chaque
    message commence par `data: `, et **deux retours à la ligne** (`\n\n`)
    marquent la fin du message.
  - `emit` est définie **localement** à cette requête — chaque appel HTTP a sa
    propre fonction `emit` liée à son propre `res`.
- **`onProgress: emit`** : `runImport` reçoit `emit` comme callback — à chaque
  étape importante (ex. "ligne 12/50 traitée"), `runImport` appelle
  `onProgress({ type: 'progress', ... })`, ce qui écrit immédiatement dans le
  flux HTTP.
- **Fin réussie** : `emit({ type: 'done', ok: true, log: result.log })` — un
  dernier message de type `'done'`, distinct des messages `'progress'`, pour
  que le frontend sache que c'est **terminé** et affiche le résultat final.
- **`catch`** : si `runImport` lève une exception, on émet `{ type: 'done', ok: false, error: ... }`
  — **toujours** un message `'done'`, succès ou échec, pour que le frontend
  sorte de sa boucle de lecture dans tous les cas.
- **`finally { res.end() }`** : ferme **réellement** la connexion HTTP — sans
  ça, le navigateur attendrait indéfiniment la fin du flux.

### `POST /api/backoffice/reset` — [server/index.js:143-164](../../server/index.js#L143-L164)

```js
app.post('/api/backoffice/reset', requireBackofficeCode, async (req, res) => {
  res.writeHead(200, {
    'Content-Type':    'text/event-stream',
    'Cache-Control':   'no-cache',
    'X-Accel-Buffering': 'no'
  })

  function emit(data) { res.write(`data: ${JSON.stringify(data)}\n\n`) }

  try {
    const result = await resetImportedData({ onProgress: emit })
    console.log(`[reset] Terminé : ${result.log.length} opérations`)
    emit({ type: 'done', ok: true, log: result.log })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[reset] Erreur :', JSON.stringify(glpiError, null, 2))
    emit({ type: 'done', ok: false, error: glpiError })
  } finally {
    res.end()
  }
})
```

- **Exactement la même structure** que l'import (mêmes en-têtes, même `emit`,
  même `try/catch/finally`) — seule différence : `resetImportedData({ onProgress: emit })`
  au lieu de `runImport(...)`, et pas de validation de fichiers (`POST` sans
  corps : l'opération porte sur "tout ce que `import_journal` connaît", pas sur
  une sélection envoyée par le client).
- `resetImportedData` parcourt le journal **dans l'ordre inverse de création
  (LIFO)** — supprimer d'abord ce qui a été créé en dernier évite de casser des
  références (ex. supprimer un `Manufacturer` alors qu'un `Computer` le
  référence encore lèverait une erreur GLPI).

### Côté client — lecture du flux — [src/pages/backoffice/ImportPage.jsx:45-87](../../src/pages/backoffice/ImportPage.jsx#L45-L87)

```js
const response = await backofficeFetch('http://localhost:3001/api/backoffice/import', {
  method: 'POST',
  body:   formData
})

if (!response.ok) {
  const data = await response.json().catch(() => ({}))
  setResult({ ok: false, error: data.error })
  return
}

const reader  = response.body.getReader()
const decoder = new TextDecoder()
let   buffer  = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })

  const parts = buffer.split('\n\n')
  buffer = parts.pop()

  for (const part of parts) {
    const line = part.trim()
    if (!line.startsWith('data: ')) continue
    try {
      const event = JSON.parse(line.slice(6))
      if (event.type === 'progress') setProgress(event)
      else if (event.type === 'done') setResult(event)
    } catch { /* fragment malformé */ }
  }
}
```

- `if (!response.ok) { ... return }` : gère le cas `400` (fichiers manquants,
  réponse JSON classique envoyée **avant** `writeHead`) — dans ce cas
  `response.body` n'est pas un flux SSE, il faut le lire comme du JSON normal.
- `response.body.getReader()` : obtient un **lecteur de flux** sur le corps de
  la réponse — permet de lire les octets **au fur et à mesure** qu'ils
  arrivent, sans attendre la fin de la réponse.
- `new TextDecoder()` : convertit les octets bruts (`Uint8Array`) reçus en
  texte UTF-8.
- **Boucle `while (true) { const { done, value } = await reader.read(); if (done) break; ... }`** :
  pattern standard de lecture d'un `ReadableStream` — `reader.read()` renvoie
  une promesse qui se résout à chaque nouveau morceau (`value`) reçu, jusqu'à
  `done === true` (flux fermé, c.-à-d. `res.end()` côté serveur a été appelé).
- **`buffer += decoder.decode(value, { stream: true })`** :
  - `{ stream: true }` : indique au décodeur que d'autres morceaux vont
    suivre — il ne tente pas de décoder immédiatement une séquence d'octets
    UTF-8 incomplète (un caractère multi-octets coupé en plein milieu entre
    deux chunks réseau), il la garde en mémoire interne pour le prochain appel.
  - `buffer +=` : accumule le texte décodé — un même message SSE peut arriver
    en plusieurs morceaux réseau, et un seul "chunk" réseau peut contenir
    plusieurs messages SSE.
- **`const parts = buffer.split('\n\n'); buffer = parts.pop()`** :
  - chaque message SSE complet est terminé par `\n\n` — `split('\n\n')` les
    sépare.
  - le **dernier élément** de `parts` est ce qui reste **après** le dernier
    `\n\n` — soit une chaîne vide (si le buffer se terminait exactement par
    `\n\n`), soit un message **incomplet** (coupé par la frontière réseau).
    `parts.pop()` le retire de `parts` et le remet dans `buffer` pour qu'il
    soit complété par le prochain `read()`.
- **Pour chaque message complet** (`parts`) : `line.startsWith('data: ')` —
  ignore les lignes vides ; `JSON.parse(line.slice(6))` — `.slice(6)` enlève
  le préfixe `'data: '` (6 caractères) pour ne garder que le JSON.
  - `event.type === 'progress'` → `setProgress(event)` : met à jour une barre
    de progression affichée à l'écran.
  - `event.type === 'done'` → `setResult(event)` : affiche le résultat final
    (journal complet des opérations, succès/échec).
- **`catch { /* fragment malformé */ }`** : si `JSON.parse` échoue (ne devrait
  arriver qu'en cas de bug du découpage `\n\n`), on ignore silencieusement ce
  fragment plutôt que de faire planter toute la lecture du flux.

---

## Fonctionnement détaillé, fonction par fonction — Find-or-create

### `existingIdByName(ctx, itemtype, name)` — [server/importPipeline.js:140-151](../../server/importPipeline.js#L140-L151)

```js
async function existingIdByName(ctx, itemtype, name) {
  if (!ctx.cache.has(itemtype)) {
    try {
      const existingItems = await glpi.listItems(ctx.sessionToken, itemtype)
      ctx.cache.set(itemtype, new Map(existingItems.map(item => [item.name, item.id])))
    } catch (err) {
      if (!glpiV2.isUnsupportedInV1(err)) throw err
      ctx.cache.set(itemtype, new Map())
    }
  }
  return ctx.cache.get(itemtype).get(name)
}
```

- **Reçoit** : `ctx` (contexte partagé de l'import — contient `sessionToken`,
  `cache`, etc.), `itemtype` (ex. `'Manufacturer'`), `name` (ex. `'Dell'`).
- **`ctx.cache`** : une `Map(itemtype → Map(nom → id))` — un cache **à deux
  niveaux**, construit **une seule fois par itemtype** pendant tout l'import.
- `if (!ctx.cache.has(itemtype))` : la **première fois** qu'on cherche un nom
  pour ce `itemtype`, on construit le cache de ce type :
  - `glpi.listItems(ctx.sessionToken, itemtype)` : **un seul** appel GLPI qui
    récupère **tous** les éléments existants de ce type.
  - `new Map(existingItems.map(item => [item.name, item.id]))` :
    `existingItems.map(item => [item.name, item.id])` produit un tableau de
    paires `[nom, id]` ; `new Map([[nom1,id1], [nom2,id2], ...])` transforme ce
    tableau en `Map` — permet ensuite des recherches par nom en O(1) au lieu de
    parcourir le tableau à chaque ligne du CSV.
  - `catch (err) { if (!glpiV2.isUnsupportedInV1(err)) throw err; ctx.cache.set(itemtype, new Map()) }` :
    certains `itemtype` (ex. `'Socket'`) ne sont pas listables via l'API v1.
    `glpiV2.isUnsupportedInV1(err)` distingue cette erreur **attendue** d'une
    **vraie** erreur (réseau, session expirée, ...) :
    - si c'est l'erreur attendue → on met une `Map` **vide** en cache (ce type
      ne sera jamais trouvé, donc `findOrCreate` créera systématiquement via le
      repli v2 sans pouvoir dédupliquer) ;
    - sinon → `throw err` : on **relance** l'erreur, qui remontera et fera
      échouer l'import (ne pas masquer une vraie panne).
- `return ctx.cache.get(itemtype).get(name)` : recherche dans le cache déjà
  construit. Renvoie l'`id` trouvé, ou **`undefined`** si aucun élément de ce
  type ne porte ce nom.
- **Pourquoi un cache et pas un appel GLPI par ligne de CSV** : avec ~0.5s par
  appel GLPI, et potentiellement des dizaines de lignes référençant chacune
  4-5 données de référence, un appel par recherche rendrait l'import très
  lent. Un seul `listItems` par `itemtype` (il y en a peu : `Location`,
  `Manufacturer`, `State`, `User`, `<Type>Model`...) suffit.

### `findOrCreate(ctx, itemtype, name, extraFields)` — [server/importPipeline.js:153-166](../../server/importPipeline.js#L153-L166)

```js
async function findOrCreate(ctx, itemtype, name, extraFields = {}) {
  if (!name) return 0

  const existingId = await existingIdByName(ctx, itemtype, name)
  if (existingId !== undefined) return existingId

  const id = await glpi.createItem(ctx.sessionToken, itemtype, { name, ...extraFields })
  ctx.cache.get(itemtype).set(name, id)
  journalize(ctx, itemtype, id, name)
  return id
}
```

- **Reçoit** : `ctx`, `itemtype`, `name` (la valeur texte du CSV, ex. `"Dell"`
  ou `""`), `extraFields` (objet optionnel, vide par défaut, pour des champs
  supplémentaires à la création).
- **`if (!name) return 0`** : si la colonne CSV est **vide**, on renvoie `0`
  directement, **sans appeler GLPI**. En GLPI, "aucune référence" se représente
  par l'id `0` (les colonnes `*_id` sont `NOT NULL DEFAULT 0`), pas par `NULL`
  — c'est pourquoi `0` (et non `null`/`undefined`) est la valeur correcte ici.
- **`const existingId = await existingIdByName(ctx, itemtype, name); if (existingId !== undefined) return existingId`** :
  - `!== undefined` (et pas une simple vérité `if (existingId)`) : car `0` est
    un id **valide** (premier élément créé) — `if (existingId)` serait `false`
    pour `existingId === 0` et provoquerait une création en double. Le test
    explicite `!== undefined` distingue "id trouvé, même si c'est 0" de
    "rien trouvé".
  - Si trouvé → **renvoie l'id existant immédiatement**, aucune création.
- **Sinon (pas trouvé)** :
  - `glpi.createItem(ctx.sessionToken, itemtype, { name, ...extraFields })` :
    crée le nouvel élément dans GLPI avec `name` et les champs additionnels
    éventuels.
  - `ctx.cache.get(itemtype).set(name, id)` : **met à jour le cache** avec ce
    nouvel élément — si une ligne suivante du CSV référence le **même** nom
    (ex. deux ordinateurs "Dell"), `existingIdByName` le trouvera cette fois
    sans nouvel appel GLPI ni nouvelle création.
  - `journalize(ctx, itemtype, id, name)` : enregistre cette création dans
    `import_journal` (voir ci-dessous) — pour que la réinitialisation puisse la
    défaire.
  - `return id`.

### `journalize(ctx, itemtype, id, label)` — [server/importPipeline.js:122-124](../../server/importPipeline.js#L122-L124)

```js
function journalize(ctx, itemtype, id, label) {
  ctx.insertJournal.run(itemtype, id, label)
}
```

- **Reçoit** : `ctx` (contient `ctx.insertJournal`, une requête SQLite
  préparée `INSERT INTO import_journal (...) VALUES (?, ?, ?)`), `itemtype`,
  `id` (l'id GLPI du nouvel élément), `label` (son nom, pour affichage dans le
  journal d'import/réinitialisation).
- **Fait** : un simple appel à la requête préparée — `.run(itemtype, id, label)`
  insère une ligne dans `import_journal`. C'est cette table que
  `resetImportedData` parcourt (en LIFO) pour tout supprimer, et que
  `deleteTicket` nettoie individuellement (voir
  [07-gestion-tickets.md](07-gestion-tickets.md)).
- **Wrapper minimal** : `journalize` n'existe que pour donner un **nom
  explicite** à `ctx.insertJournal.run(...)` à chaque site d'appel — appelé
  une dizaine de fois dans `importPipeline.js` (un par type de référence créé,
  plus pour les éléments et tickets eux-mêmes).

### `findOrCreateRef(sessionToken, itemtype, name)` — [server/index.js:508-517](../../server/index.js#L508-L517)

```js
async function findOrCreateRef(sessionToken, itemtype, name) {
  if (!name) return 0
  const existingItems = await glpiV1.listItems(sessionToken, itemtype)
  const found = existingItems.find(item => item.name === name)
  if (found) return found.id

  const id = await glpiV1.createItem(sessionToken, itemtype, { name })
  db.prepare('INSERT INTO import_journal (glpi_itemtype, glpi_id, label) VALUES (?, ?, ?)').run(itemtype, id, name)
  return id
}
```

- **Même principe** que `findOrCreate`, utilisé par la route de création
  d'élément FrontOffice (pas par l'import en masse) — différences :
  - **pas de cache** : `glpiV1.listItems(sessionToken, itemtype)` est appelé à
    **chaque** invocation — acceptable ici car la création d'un élément
    FrontOffice se fait **une ligne à la fois** (formulaire), pas en boucle sur
    un CSV de dizaines de lignes (pas besoin d'optimiser).
  - `existingItems.find(item => item.name === name)` : recherche linéaire dans
    le tableau (au lieu d'une `Map`) — encore une fois, acceptable car appelé
    une seule fois par soumission de formulaire.
  - `db.prepare('INSERT INTO import_journal ...').run(...)` : prépare et
    exécute la requête **directement** (pas de `ctx.insertJournal` ni de
    fonction `journalize` séparée) — `db` est importé directement dans
    `index.js`.
- **`if (!name) return 0`** et **`if (found) return found.id`** : mêmes règles
  que `findOrCreate` (0 = pas de référence, recherche avant création) — la
  différence de syntaxe (`if (found)` au lieu de `!== undefined`) fonctionne
  ici car `found` est soit un **objet** (toujours truthy) soit `undefined`
  (jamais `0`, contrairement à un id).

---

## À retenir pour coder à la main

- **SSE = `res.writeHead` + `res.write('data: ' + JSON + '\n\n')` répété +
  `res.end()` en `finally`** — à mémoriser comme un bloc complet, c'est
  toujours la même structure pour toute opération longue avec progression.
- Côté client, la lecture d'un flux SSE via `fetch` est **toujours** :
  `getReader()` + `TextDecoder` + boucle `while(true)` + `split('\n\n')` +
  garder le dernier fragment incomplet dans un `buffer`.
- **Find-or-create** : toujours `if (!name) return 0` en premier (GLPI : pas
  de référence = id `0`, pas `null`), puis chercher, puis créer si absent —
  et **toujours** comparer avec `!== undefined` (pas juste `if (x)`), car `0`
  est un id valide.
- **Cache `Map(type → Map(nom → id))`** construit en **un seul** `listItems`
  par type, rempli au fur et à mesure des créations (`cache.set(...)` après
  chaque `createItem`) — pattern indispensable dès qu'on traite plusieurs
  lignes qui peuvent référencer les mêmes noms.
- Toute création GLPI faite par le serveur (et pas directement par
  l'utilisateur dans GLPI) doit être **journalisée** (`import_journal`) pour
  rester réversible via "Réinitialisation" — sinon ces éléments restent
  orphelins dans GLPI après un reset.
