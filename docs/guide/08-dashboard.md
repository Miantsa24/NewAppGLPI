# 8. Dashboard Backoffice — comptages en direct depuis GLPI

[← Retour au sommaire](README.md)

## Façon de faire

Le Dashboard ne stocke **aucune** statistique : à chaque chargement de page,
le serveur recalcule tout **en direct** depuis GLPI (principe rappelé en tête
de [server/dashboardData.js](../../server/dashboardData.js)). Avantage : toute
modification faite directement dans GLPI (ajout/suppression d'un ordinateur,
changement de statut d'un ticket...) apparaît immédiatement, sans
synchronisation à gérer. Contrepartie : il faut limiter le **nombre d'appels
GLPI** (chacun coûte ~0.5s de bootstrap PHP), donc :

- compter avec `countItems` (lit juste l'en-tête `Content-Range`, voir
  [01-sessions-glpi.md](01-sessions-glpi.md)) plutôt que `listItems` quand on
  n'a besoin que d'un nombre ;
- regrouper côté JavaScript (`Map` + boucle) après **un seul** `listItems`
  plutôt que faire une requête GLPI par catégorie ;
- paralléliser tous les appels indépendants avec `Promise.all`.

---

## Extrait réel — [server/dashboardData.js:19-99](../../server/dashboardData.js#L19-L99)

```js
export async function getDashboardStats() {
  const sessionToken = await glpi.openSession()
  try {
    const elements = await Promise.all(ASSET_TYPES.map(async ({ itemtype, label }) => ({
      itemtype, label, count: await glpi.countItems(sessionToken, itemtype)
    })))
    const totalElements = elements.reduce((sum, e) => sum + e.count, 0)

    const [tickets, allCosts, costsByAsset] = await Promise.all([
      glpi.listItems(sessionToken, 'Ticket'),
      glpi.listItems(sessionToken, 'TicketCost'),
      listCostsByAsset()
    ])
    // ... regroupements ...
    return { elements, totalElements, ticketsByType, ticketsByStatus, totalTickets: tickets.length,
             totalCostsCount, totalCostAmount, totalNewCostAmount, totalReopenCostAmount, totalGeneralCostAmount }
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
```

---

## Fonctionnement détaillé, fonction par fonction

### `getDashboardStats()` — [dashboardData.js:19-99](../../server/dashboardData.js#L19-L99)

**Reçoit** : rien. **Renvoie** : un seul objet contenant TOUTES les
statistiques de la page — c'est cet objet que la route `GET /api/backoffice/dashboard`
([index.js:127-135](../../server/index.js#L127-L135)) renvoie tel quel dans
`{ ok: true, stats }`.

#### Bloc 1 — Comptage des éléments par type — [dashboardData.js:26-29](../../server/dashboardData.js#L26-L29)

```js
const elements = await Promise.all(ASSET_TYPES.map(async ({ itemtype, label }) => ({
  itemtype, label, count: await glpi.countItems(sessionToken, itemtype)
})))
const totalElements = elements.reduce((sum, e) => sum + e.count, 0)
```

- `ASSET_TYPES` (importé de [src/shared/assetTypes.js](../../src/shared/assetTypes.js))
  : la liste des types d'inventaire gérés par l'app (`Computer`, `Monitor`,
  `Printer`, ...), chacun avec son `itemtype` GLPI et son `label` affiché.
- `ASSET_TYPES.map(async ({ itemtype, label }) => ({ ... count: await glpi.countItems(...) }))` :
  pour **chaque type**, une fonction `async` qui renvoie `{ itemtype, label, count }`
  — `count` est obtenu via `countItems` (un seul aller-retour GLPI léger, lit
  `Content-Range`, voir [01-sessions-glpi.md](01-sessions-glpi.md)).
- `Promise.all(...)` : les promesses de **tous** les types sont lancées **en
  même temps** — le temps total est celui du type le plus lent, pas la somme
  de tous.
- `elements.reduce((sum, e) => sum + e.count, 0)` : additionne les `count` de
  chaque type — `0` est la valeur initiale (si `elements` était vide,
  `totalElements` vaudrait `0` plutôt que de planter sur un tableau vide, voir
  [03-calcul-couts.md](03-calcul-couts.md) pour le pattern `reduce`).
- **Résultat** : `elements = [{ itemtype: 'Computer', label: 'Ordinateurs', count: 12 }, ...]`
  et `totalElements = 12 + ... `.

#### Bloc 2 — Récupération parallèle des données "tickets" — [dashboardData.js:38-42](../../server/dashboardData.js#L38-L42)

```js
const [tickets, allCosts, costsByAsset] = await Promise.all([
  glpi.listItems(sessionToken, 'Ticket'),
  glpi.listItems(sessionToken, 'TicketCost'),
  listCostsByAsset()
])
```

- Trois opérations **indépendantes**, lancées ensemble :
  - `tickets` : la liste complète des tickets GLPI (servira aux blocs 3 et 4) ;
  - `allCosts` : la liste complète des `TicketCost` GLPI (servira au bloc 5,
    juste pour son `.length`) ;
  - `costsByAsset` : le résultat de `listCostsByAsset()` — **la même fonction**
    que celle utilisée par la page "Ajouter un coût" (voir
    [03-calcul-couts.md](03-calcul-couts.md)), ce qui garantit que les totaux
    affichés ici et sur cette page **correspondent toujours**.
- `const [tickets, allCosts, costsByAsset] = await Promise.all([...])` :
  déstructuration du tableau de résultats — l'ordre des variables correspond à
  l'ordre des promesses dans le tableau.

#### Bloc 3 — Tickets par type — [dashboardData.js:44-53](../../server/dashboardData.js#L44-L53)

```js
const countByType = new Map()
for (const ticket of tickets) {
  countByType.set(ticket.type, (countByType.get(ticket.type) ?? 0) + 1)
}

const ticketsByType = Object.entries(TICKET_TYPE_LABELS).map(([typeCode, label]) => ({
  type:  Number(typeCode),
  label,
  count: countByType.get(Number(typeCode)) ?? 0
}))
```

- **Étape A — comptage** : `countByType` est une `Map` vide. Pour chaque
  ticket, `countByType.set(ticket.type, (countByType.get(ticket.type) ?? 0) + 1)` :
  - `countByType.get(ticket.type)` : le compte actuel pour ce type, ou
    `undefined` si c'est la première fois qu'on voit ce type.
  - `?? 0` : si `undefined`, on part de `0`.
  - `+ 1` : on incrémente.
  - `.set(...)` : on réécrit la nouvelle valeur dans la `Map`.
  - C'est le pattern classique "compteur par clé" (même pattern que
    `nameByTypeAndId`/`itemsByTicket` dans [03-calcul-couts.md](03-calcul-couts.md),
    mais ici la valeur est un simple entier, pas un objet ou un tableau).
- **Étape B — mise en forme** : `TICKET_TYPE_LABELS = { 1: 'Incidents', 2: 'Demandes' }`
  ([dashboardData.js:17](../../server/dashboardData.js#L17)) est le dictionnaire
  des types possibles. `Object.entries(TICKET_TYPE_LABELS)` donne
  `[['1', 'Incidents'], ['2', 'Demandes']]` — `.map(([typeCode, label]) => ({...}))`
  construit, pour **chaque type connu** (même ceux à `0` ticket), un objet
  `{ type, label, count }` :
  - `type: Number(typeCode)` : `Object.entries` renvoie toujours les clés en
    **chaînes** (`'1'`, `'2'`) même si l'objet d'origine a des clés
    numériques — `Number(...)` reconvertit.
  - `count: countByType.get(Number(typeCode)) ?? 0` : récupère le compte de la
    `Map` (clé numérique, car `ticket.type` est un entier GLPI), ou `0` si ce
    type n'apparaît dans aucun ticket.
- **Pourquoi partir de `TICKET_TYPE_LABELS` et pas de `countByType` directement** :
  ainsi, **tous les types possibles** apparaissent dans `ticketsByType` —
  même "Demandes: 0" si aucun ticket de ce type n'existe — au lieu de faire
  disparaître la carte correspondante du Dashboard.

#### Bloc 4 — Tickets par statut — [dashboardData.js:58-67](../../server/dashboardData.js#L58-L67)

```js
const countByStatus = new Map()
for (const ticket of tickets) {
  countByStatus.set(ticket.status, (countByStatus.get(ticket.status) ?? 0) + 1)
}

const ticketsByStatus = Object.entries(TICKET_STATUSES).map(([statusCode, label]) => ({
  status: Number(statusCode),
  label,
  count:  countByStatus.get(Number(statusCode)) ?? 0
}))
```

- **Exactement le même principe que le bloc 3**, mais sur `ticket.status` et
  avec le dictionnaire `TICKET_STATUSES` (importé de
  [ticketsData.js](../../server/ticketsData.js), le même dictionnaire que celui
  utilisé par `describeTicket` — voir [07-gestion-tickets.md](07-gestion-tickets.md)).
- Le frontend (`DashboardPage.jsx`) utilise ensuite `s.label` pour retrouver la
  couleur correspondante dans `STATUS_COLORS` (même couleurs que les pastilles
  de la page "Liste des tickets").

#### Bloc 5 — Coûts — [dashboardData.js:74-82](../../server/dashboardData.js#L74-L82)

```js
const totalCostsCount = allCosts.length

const totalCostAmount        = costsByAsset.reduce((sum, c) => sum + c.costImported, 0)
const totalNewCostAmount     = costsByAsset.reduce((sum, c) => sum + c.costNew, 0)
const totalReopenCostAmount  = costsByAsset.reduce((sum, c) => sum + c.costReopening, 0)
const totalGeneralCostAmount = totalCostAmount + totalNewCostAmount + totalReopenCostAmount
```

- `totalCostsCount = allCosts.length` : nombre **brut** de lignes `TicketCost`
  dans GLPI (juste un comptage — `allCosts` a déjà été récupéré au bloc 2 sans
  appel GLPI supplémentaire).
- `costsByAsset` : tableau `[{ ..., costImported, costNew, costReopening }, ...]`
  — une ligne par type d'élément (Ordinateur, Imprimante, ...), produit par
  `listCostsByAsset` (voir [03-calcul-couts.md](03-calcul-couts.md) pour le
  détail de ces 3 champs : coût importé, nouveau coût, coût de réouverture).
- **Trois `reduce`** indépendants, un par catégorie de coût : chacun additionne
  le champ correspondant sur **toutes les lignes** de `costsByAsset` —
  exactement le même calcul que `grandTotal` dans `AddCostPage.jsx` (voir
  [03-calcul-couts.md](03-calcul-couts.md)), ce qui garantit que les chiffres
  du Dashboard et de la page "Ajouter un coût" sont **toujours identiques**
  (même source `costsByAsset`, même formule).
- `totalGeneralCostAmount = totalCostAmount + totalNewCostAmount + totalReopenCostAmount` :
  le grand total, simple somme des trois.

#### Le `return` final — [dashboardData.js:84-95](../../server/dashboardData.js#L84-L95)

```js
return {
  elements, totalElements,
  ticketsByType, ticketsByStatus, totalTickets: tickets.length,
  totalCostsCount, totalCostAmount, totalNewCostAmount, totalReopenCostAmount, totalGeneralCostAmount
}
```

- Un seul objet plat regroupant **toutes** les valeurs calculées dans les 5
  blocs ci-dessus — c'est exactement la forme de `stats` reçue côté frontend
  (`data.stats` dans `DashboardPage.jsx`).
- `totalTickets: tickets.length` : calculé ici directement (pas de variable
  intermédiaire), simple longueur du tableau récupéré au bloc 2.

---

## Fonctionnement détaillé, fonction par fonction — `src/pages/backoffice/DashboardPage.jsx`

### `StatCard({ label, count, color })` — [DashboardPage.jsx:13-20](../../src/pages/backoffice/DashboardPage.jsx#L13-L20)

```jsx
function StatCard({ label, count, color }) {
  return (
    <div className="stat-card" style={color ? { borderTopColor: color } : undefined}>
      <div className="stat-card__count" style={color ? { color } : undefined}>{count}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}
```

- **Reçoit** (props) : `label` (texte affiché), `count` (nombre ou chaîne déjà
  formatée), `color` (optionnel — code couleur CSS, ex. `'#c0392b'`).
- **Fait** : un petit composant purement visuel ("dumb component") — affiche
  `count` en gros et `label` en dessous.
- `style={color ? { borderTopColor: color } : undefined}` : si `color` est
  fourni, applique une bordure supérieure colorée ; sinon, **pas d'attribut
  `style` du tout** (`undefined`, pas `{}`) — évite d'écraser le style CSS par
  défaut de `.stat-card` avec un objet `style` vide.
- **Renvoie** : le JSX de la carte. Réutilisé pour **toutes** les statistiques
  (éléments, tickets par type, tickets par statut, coûts) — éviter de répéter
  la même structure JSX pour chaque ligne.

### Le chargement — `useEffect` avec `cancelled` — [DashboardPage.jsx:51-80](../../src/pages/backoffice/DashboardPage.jsx#L51-L80)

```js
useEffect(() => {
  let cancelled = false

  async function loadStats() {
    try {
      const response = await fetch('http://localhost:3001/api/backoffice/dashboard')
      const data = await response.json()
      if (cancelled) return

      if (data.ok) {
        setStats(data.stats)
      } else {
        console.error('Échec du chargement des statistiques :', data.error)
        setError(true)
      }
    } catch (err) {
      if (!cancelled) {
        console.error('Échec du chargement des statistiques :', err.message)
        setError(true)
      }
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  loadStats()
  return () => { cancelled = true }
}, [])
```

- `useEffect(() => {...}, [])` : tableau de dépendances **vide** → exécuté
  **une seule fois**, au montage du composant (chargement initial — pas besoin
  de recharger à chaque rendu).
- `let cancelled = false` + `return () => { cancelled = true }` : la fonction
  renvoyée par `useEffect` est la "fonction de nettoyage", appelée si le
  composant est **démonté** avant la fin du `fetch` (ex. l'utilisateur change
  de page très vite). `cancelled` passe alors à `true`, et chaque `if (!cancelled)`
  empêche un `setStats`/`setError`/`setLoading` sur un composant qui n'existe
  plus (évite l'avertissement React "Can't perform a React state update on an
  unmounted component").
- `if (cancelled) return` (juste après `await response.json()`) : vérifie
  l'annulation **avant** de traiter la réponse — si le composant a été démonté
  pendant l'attente du `fetch`, on arrête tout net sans appeler `setStats`.
- Sinon : `data.ok` → `setStats(data.stats)` ; sinon `setError(true)` (message
  technique en `console.error`, message générique à l'écran).
- `finally { if (!cancelled) setLoading(false) }` : dans tous les cas (succès,
  erreur applicative, exception), on arrête le spinner — sauf si démonté.

### Affichage conditionnel — [DashboardPage.jsx:95-157](../../src/pages/backoffice/DashboardPage.jsx#L95-L157)

```jsx
{loading && <p>Chargement…</p>}
{error && <p className="...">Impossible de charger les statistiques...</p>}
{stats && (
  <>
    <section>...Éléments par type...</section>
    <section>...Tickets (par type, par statut)...</section>
    <section>...Coûts...</section>
  </>
)}
```

- Trois affichages **mutuellement compatibles avec l'état** mais pas
  nécessairement exclusifs dans le code (`loading`/`error`/`stats` sont des
  états indépendants) — en pratique, `loading` passe à `false` avant que
  `stats` ou `error` soit défini, donc à l'écran un seul bloc est visible à la
  fois.
- `<>...</>` (fragment React) : regroupe les 3 `<section>` sans ajouter de
  `<div>` superflu dans le DOM.
- Chaque section fait `stats.xxx.map(item => <StatCard key={...} .../>)` —
  c'est ici que `StatCard` est réutilisé pour chaque ligne de `elements`,
  `ticketsByType`, `ticketsByStatus`, et que les 5 `StatCard` "Coûts" sont
  écrites individuellement (pas de `.map`, car ce sont 5 statistiques
  **différentes**, pas une liste homogène).
- `stats.totalCostAmount.toLocaleString('fr-FR')` : formate le nombre avec des
  espaces comme séparateurs de milliers (`1234567` → `"1 234 567"`) — convention
  française, cohérent avec `AddCostPage.jsx` (voir [03-calcul-couts.md](03-calcul-couts.md)).

---

## Recette en 3 étapes pour ajouter une nouvelle statistique au Dashboard

1. **Calculer la donnée côté serveur** dans `getDashboardStats()` —
   l'ajouter comme nouvelle clé de l'objet `return { ... }`
   ([dashboardData.js:84-95](../../server/dashboardData.js#L84-L95)). Si la
   donnée nécessite un appel GLPI supplémentaire, l'ajouter dans le
   `Promise.all` du bloc 2 pour ne pas créer d'attente séquentielle
   supplémentaire.
2. **Aucune modification de la route** `GET /api/backoffice/dashboard` n'est
   nécessaire — elle renvoie déjà `{ ok: true, stats }` où `stats` est
   **l'objet entier** renvoyé par `getDashboardStats()`. Toute nouvelle clé
   est automatiquement transmise.
3. **Afficher la donnée côté frontend** : dans `DashboardPage.jsx`, ajouter un
   `<StatCard label="..." count={stats.maNouvelleStat} />` (ou un
   `.map(...)` si c'est un tableau) dans la `<section>` appropriée — créer une
   nouvelle `<section>` si la statistique ne correspond à aucune catégorie
   existante (Éléments / Tickets / Coûts).

---

## À retenir pour coder à la main

- "Lire en direct depuis GLPI, ne rien stocker" : simplifie énormément le code
  (pas de synchronisation), au prix de devoir limiter le **nombre** d'appels
  GLPI (chacun ~0.5s).
- `countItems` (juste un nombre) vs `listItems` (toute la liste) : choisir
  selon le besoin réel — ici `elements` n'a besoin que du nombre, alors que
  `tickets` est ensuite parcouru pour 2 regroupements différents (type ET
  statut), donc `listItems` une seule fois est plus efficace que 2×`countItems`
  par statut/type.
- Le pattern `new Map()` + `for` + `map.set(k, (map.get(k) ?? 0) + 1)` :
  compteur par clé, à mémoriser — variante "à 1 valeur" du pattern Map vu dans
  [03-calcul-couts.md](03-calcul-couts.md).
- Partir du **dictionnaire des valeurs possibles** (`TICKET_TYPE_LABELS`,
  `TICKET_STATUSES`) plutôt que des données observées, pour que les catégories
  à `0` apparaissent aussi dans le résultat.
- `useEffect(() => { let cancelled = false; ...; return () => { cancelled = true } }, [])` :
  pattern standard pour un chargement initial annulable — à réutiliser pour
  toute page qui charge des données au montage.
- Réutiliser les **mêmes fonctions de calcul** (`listCostsByAsset`) pour deux
  affichages différents (Dashboard et AddCostPage) garantit que les chiffres
  affichés ne divergent jamais.
