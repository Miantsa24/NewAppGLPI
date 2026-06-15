# 3. Calcul des coûts — agrégation avec `Map`, `reduce`, répartition

[← Retour au sommaire](README.md)

## Façon de faire

Le besoin : on a une LISTE de lignes "à plat" (coûts GLPI, lignes SQLite), et
on veut un **total par ticket**, puis répartir ce total entre les éléments
associés à ce ticket. La recette :

1. **Construire un `Map`** : clé = identifiant (ex. `ticket_id`), valeur =
   somme cumulée.
2. **Parcourir les lignes** avec une boucle `for...of`, et pour chaque ligne :
   `map.set(clé, (map.get(clé) ?? 0) + montant)`
3. **Diviser** le total par le nombre d'éléments associés pour répartir
   équitablement.

---

## Fonctionnement détaillé, fonction par fonction — `listCostsByAsset`

[server/ticketsData.js:100-177](../../server/ticketsData.js#L100-L177)

C'est **la** fonction centrale du calcul des coûts : elle alimente la page
"Ajouter un coût" (Backoffice) ET le Dashboard (via `getDashboardStats`, voir
[08-dashboard.md](08-dashboard.md)). Elle renvoie un tableau avec **une ligne
par (ticket, élément associé)**.

### Étape 0 — ouverture de session et appels GLPI en parallèle

```js
export async function listCostsByAsset() {
  const sessionToken = await glpi.openSession()
  try {
    const [tickets, itemTickets, ticketCosts] = await Promise.all([
      glpi.listItems(sessionToken, 'Ticket'),
      glpi.listItems(sessionToken, 'Item_Ticket'),
      glpi.listItems(sessionToken, 'TicketCost')
    ])
```

- **Reçoit** : aucun paramètre.
- `Promise.all([...])` : lance les 3 appels GLPI **en même temps** plutôt que
  l'un après l'autre — chaque appel coûte ~0.5s de "bootstrap", donc 3 appels
  séquentiels = ~1.5s, en parallèle = ~0.5s.
- Résultat : trois tableaux —
  - `tickets` : tous les tickets (`{ id, name, ... }`)
  - `itemTickets` : toutes les lignes de la table de liaison `Item_Ticket`
    (`{ tickets_id, itemtype, items_id }`) — qui relie un ticket à un ou
    plusieurs éléments (Computer, Monitor...).
  - `ticketCosts` : tous les `TicketCost` GLPI (coûts **importés**, créés lors
    de l'import initial).

### Étape 1 — regrouper les associations par ticket — [ticketsData.js:110-115](../../server/ticketsData.js#L110-L115)

```js
const itemsByTicket = new Map()
for (const link of itemTickets) {
  const list = itemsByTicket.get(link.tickets_id) ?? []
  list.push({ itemtype: link.itemtype, id: link.items_id })
  itemsByTicket.set(link.tickets_id, list)
}
```

- Construit une `Map` : clé = `tickets_id`, valeur = **tableau** des éléments
  associés `{ itemtype, id }`.
- `itemsByTicket.get(link.tickets_id) ?? []` : si ce ticket n'a pas encore de
  liste, on en crée une vide (`[]`) ; sinon on récupère la liste existante.
- `list.push(...)` puis `itemsByTicket.set(...)` : ajoute l'élément à la liste
  et la range de nouveau dans la `Map` (note : comme `list` est le **même**
  tableau que celui déjà dans la `Map`, le `.set()` n'est ici pas strictement
  indispensable — mais il rend le code explicite et reste correct même si on
  changeait `list` pour un nouveau tableau).
- Résultat : `Map { 12 → [{itemtype:'Computer', id:3}], 15 → [{itemtype:'Monitor', id:7}, {itemtype:'Computer', id:9}], ... }`

### Étape 2 — résoudre les noms des éléments associés — [ticketsData.js:117-125](../../server/ticketsData.js#L117-L125)

```js
const distinctTypes = [...new Set(itemTickets.map(link => link.itemtype))]
const itemListsByType = await Promise.all(
  distinctTypes.map(itemtype => glpi.listItems(sessionToken, itemtype))
)
const nameByTypeAndId = new Map(
  distinctTypes.map((itemtype, i) => [itemtype, new Map(itemListsByType[i].map(it => [it.id, it.name]))])
)
```

- `itemTickets.map(link => link.itemtype)` : extrait juste le `itemtype` de
  chaque association → ex. `['Computer', 'Monitor', 'Computer', 'Phone', ...]`
  (avec doublons).
- `new Set(...)` : élimine les doublons. `[...Set]` : reconvertit en tableau →
  ex. `['Computer', 'Monitor', 'Phone']` — la liste des types **distincts**
  rencontrés.
- `distinctTypes.map(itemtype => glpi.listItems(...))` + `Promise.all` : **un
  seul appel GLPI par type distinct** (pas un appel par élément !) — même
  principe N+1 que le reste du projet.
- `nameByTypeAndId` : une `Map` **à deux niveaux** :
  - niveau 1 : `itemtype → Map`
  - niveau 2 (pour chaque type) : `id de l'élément → son nom`
  - `new Map(itemListsByType[i].map(it => [it.id, it.name]))` : transforme le
    tableau d'items GLPI (`[{id:3, name:'PC-01'}, ...]`) en `Map { 3 → 'PC-01', ... }`.
  - Utilisation plus tard : `nameByTypeAndId.get('Computer').get(3)` → `'PC-01'`.

### Étape 3 — coût importé par ticket — [ticketsData.js:131-138](../../server/ticketsData.js#L131-L138)

```js
const importedCostByTicket = new Map()
for (const cost of ticketCosts) {
  const amount = Number(cost.cost_time ?? 0) * Number(cost.actiontime ?? 0) / 3600 + Number(cost.cost_fixed ?? 0)
  importedCostByTicket.set(
    cost.tickets_id,
    (importedCostByTicket.get(cost.tickets_id) ?? 0) + amount
  )
}
```

- Pour chaque `TicketCost` GLPI :
  - `cost_time` = **tarif horaire** (pas un montant direct).
  - `amount = cost_time × actiontime(secondes) / 3600 + cost_fixed` — convertit
    le temps passé en heures, multiplie par le tarif horaire, ajoute le coût
    fixe. C'est **la formule de coût utilisée partout** dans ce projet.
  - `Number(x ?? 0)` : si `cost_time`/`actiontime`/`cost_fixed` est `null`
    (GLPI peut renvoyer `null`), `?? 0` le remplace par `0` avant la
    conversion — sans ça, `Number(null) = 0` fonctionnerait aussi en fait,
    mais `null * x = 0` alors que `undefined * x = NaN` ; le `?? 0` protège
    contre les deux cas de façon explicite et lisible.
- `importedCostByTicket.set(cost.tickets_id, (map.get(...) ?? 0) + amount)` :
  **accumulation** — un ticket peut avoir plusieurs lignes `TicketCost`,
  chacune ajoute son montant au total existant (`?? 0` pour le tout premier
  ajout).
- Résultat : `Map { 12 → 1500, 15 → 800, ... }` — total importé par ticket.

### Étape 4 — nouveau coût ET coût de réouverture, par ticket — [ticketsData.js:143-149](../../server/ticketsData.js#L143-L149)

```js
const newCostByTicket = new Map()
const reopenCostByTicket = new Map()
for (const row of db.prepare('SELECT ticket_id, actiontime, cost_time, cost_fixed, type FROM ticket_costs').all()) {
  const amount = Number(row.cost_time ?? 0) * Number(row.actiontime ?? 0) / 3600 + Number(row.cost_fixed ?? 0)
  const target = row.type === 'reouverture' ? reopenCostByTicket : newCostByTicket
  target.set(row.ticket_id, (target.get(row.ticket_id) ?? 0) + amount)
}
```

- Cette fois la source est **SQLite** (`ticket_costs`, pas GLPI) — les "nouveaux
  coûts" saisis lors de la clôture d'un ticket (Kanban) et les "coûts de
  réouverture" insérés lors d'une réouverture (voir
  [06-express-routes.md](06-express-routes.md)).
- Même formule de montant que l'étape 3.
- **Répartition vers DEUX `Map` différentes selon `row.type`** :
  - `row.type === 'reouverture'` → `reopenCostByTicket`
  - sinon (`'cloture'`) → `newCostByTicket`
  - `target` est juste un **alias** (référence) vers l'une des deux `Map` —
    ça évite de dupliquer la ligne `target.set(...)` dans un `if/else`.
- **C'est ici qu'était le bug "coût de réouverture toujours à 0"** : la
  requête SQL d'origine ne sélectionnait pas la colonne `type`
  (`SELECT ticket_id, actiontime, cost_time, cost_fixed FROM ticket_costs`,
  sans `type`) → `row.type` était `undefined` → `row.type === 'reouverture'`
  était toujours `false` → **tout** partait dans `newCostByTicket`, jamais
  dans `reopenCostByTicket`. D'où : la colonne "Coût de réouverture" restait à
  0 alors que "Nouveau coût fixe" et le total général augmentaient bien. Le
  correctif a été d'ajouter `type` à la liste des colonnes du `SELECT`.

### Étape 5 — construire les lignes finales, avec répartition — [ticketsData.js:151-173](../../server/ticketsData.js#L151-L173)

```js
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
```

- `ticketNameById` : petite `Map` `id → name`, construite à partir de
  `tickets` (étape 0) — pour afficher `"Ticket #12 — Imprimante HS"` plutôt
  que juste l'id.
- **Boucle externe** : `for (const [ticketId, items] of itemsByTicket)` —
  itère sur la `Map` construite à l'étape 1 ; `items` est le tableau des
  éléments associés à ce ticket.
- **Répartition** (`/ items.length`) : les TROIS totaux par ticket
  (`costImported`, `costNew`, `costReopening`) sont **divisés par le nombre
  d'éléments associés** — si un ticket a 2 éléments et un coût importé total
  de 1000, chaque élément reçoit `costImported = 500`.
  - Règle métier confirmée pour ce projet : **les trois colonnes sont
    réparties de la même façon**, y compris le coût de réouverture (la règle
    "chaque élément a son propre super-coût de base, donc son propre
    pourcentage" revient mathématiquement à diviser le total par
    `items.length`).
- **Boucle interne** : `for (const item of items)` — une ligne par élément
  associé, avec :
  - `assetName` : `nameByTypeAndId.get(item.itemtype)?.get(item.id) ?? \`#${item.id}\`` —
    `?.` (optional chaining) protège si `nameByTypeAndId` n'a pas cette clé
    `itemtype` (ne devrait pas arriver mais coûte rien) ; `?? \`#${item.id}\``
    donne un nom de repli si l'élément n'a pas été trouvé.
- `rows.sort((a, b) => b.ticketId - a.ticketId)` : trie par `ticketId`
  **décroissant** (les tickets les plus récents — ids les plus grands —
  en premier).
- **Renvoie** : le tableau `rows`, une ligne par `(ticket, élément associé)`,
  avec les 3 coûts déjà répartis.

---

## Fonctionnement détaillé — re-agrégation côté frontend

[src/pages/backoffice/AddCostPage.jsx:118-136](../../src/pages/backoffice/AddCostPage.jsx#L118-L136)

`listCostsByAsset` renvoie une ligne par `(ticket, élément)`. La page
"Ajouter un coût" a besoin de deux vues supplémentaires : un total **par type
d'élément**, et un **total général**. Ce sont de simples `.map()`/`.reduce()`
sur le résultat déjà reçu — aucun nouvel appel réseau.

### `totalsByType` — un total par type d'élément

```js
const totalsByType = itemtypesPresent.map(itemtype => {
  const rows = costs.filter(c => c.itemtype === itemtype)
  const imported = rows.reduce((sum, c) => sum + c.costImported, 0)
  const fresh    = rows.reduce((sum, c) => sum + c.costNew, 0)
  const reopen   = rows.reduce((sum, c) => sum + (c.costReopening ?? 0), 0)
  return { itemtype, imported, fresh, reopen, total: imported + fresh + reopen }
})
```

- **Reçoit** (via closure) : `costs` (le tableau renvoyé par
  `GET /api/backoffice/costs`, donc par `listCostsByAsset`), et
  `itemtypesPresent` (calculé juste avant : `[...new Set(costs.map(c => c.itemtype))]`,
  la liste des types distincts présents).
- Pour **chaque type d'élément** (`Computer`, `Monitor`, ...) :
  - `rows = costs.filter(c => c.itemtype === itemtype)` : ne garde que les
    lignes de ce type.
  - `rows.reduce((sum, c) => sum + c.costImported, 0)` : additionne
    `costImported` de toutes ces lignes → total importé pour ce type.
  - Idem pour `fresh` (= `costNew`) et `reopen` (= `costReopening`).
  - `(c.costReopening ?? 0)` : protection si jamais `costReopening` est
    `undefined` sur une vieille ligne — évite `undefined + nombre = NaN`.
  - `total: imported + fresh + reopen` : somme des 3 catégories pour ce type.
- **Renvoie** : un tableau d'objets `{ itemtype, imported, fresh, reopen, total }`,
  un par type d'élément présent — affiché dans le tableau "Totaux par type
  d'élément".

> **Bug rencontré ici** : la première version de ce `.map()` calculait bien
> `reopen` mais **oubliait de l'inclure dans le `return {...}`**. Résultat :
> `t.reopen` valait `undefined` côté affichage, et `t.reopen.toFixed(2)`
> plantait avec `Cannot read properties of undefined (reading 'toFixed')`.
> Règle à retenir : **toute variable calculée doit apparaître dans l'objet
> retourné**, sinon elle est perdue.

### `grandTotal` — le total général, toutes catégories confondues

```js
const grandTotal = totalsByType.reduce(
  (acc, t) => ({
    imported: acc.imported + t.imported,
    fresh:    acc.fresh + t.fresh,
    reopen:   acc.reopen + t.reopen,
    total:    acc.total + t.total
  }),
  { imported: 0, fresh: 0, reopen: 0, total: 0 }
)
```

- **Reçoit** : `totalsByType` (calculé juste avant).
- `reduce((acc, t) => ({...}), { imported: 0, fresh: 0, reopen: 0, total: 0 })` :
  - `acc` (accumulateur) démarre avec l'objet `{ imported: 0, fresh: 0, reopen: 0, total: 0 }`
    (le **2ᵉ argument** de `reduce`, obligatoire ici pour ne pas planter si
    `totalsByType` est vide).
  - pour chaque `t` de `totalsByType`, on renvoie un **nouvel objet** où
    chaque champ = `acc.champ + t.champ` — additionne les totaux de tous les
    types entre eux.
- **Renvoie** : un seul objet `{ imported, fresh, reopen, total }` — la somme
  de TOUTES les lignes de `totalsByType`, affichée dans la ligne "Total
  général" du tableau (uniquement quand aucun filtre par type n'est actif).

---

## À retenir pour coder à la main

- `map.get(clé) ?? 0` : le `??` (nullish coalescing) donne `0` si la clé
  n'existe pas encore dans le `Map` — évite un `undefined + nombre = NaN`.
- `reduce((acc, x) => acc + x.valeur, 0)` : le `0` est la valeur de départ,
  obligatoire pour ne pas planter sur un tableau vide.
- **Un objet retourné doit lister TOUTES ses propriétés** : si on calcule une
  variable (`const reopen = ...`) mais qu'on l'oublie dans le `return {...}`,
  elle sera `undefined` côté appelant — bug classique rencontré dans ce projet
  (`t.reopen.toFixed(2)` → `Cannot read properties of undefined`).
- Le `SELECT` SQL doit lister **toutes** les colonnes dont le code a besoin —
  une colonne manquante donne `undefined` silencieusement (pas d'erreur SQL),
  ce qui peut fausser une comparaison (`row.type === 'reouverture'`) sans
  qu'on s'en rende compte immédiatement.
- Choix de répartir (`/ items.length`) ou non dépend de la **règle métier** :
  ici, "coût importé", "nouveau coût" ET "coût de réouverture" sont tous les
  trois répartis (chaque élément reçoit une part) — toujours bien clarifier la
  règle AVANT de coder un calcul de répartition.
