# 4. React — Kanban : drag & drop natif + gestion d'état

[← Retour au sommaire](README.md)

## Façon de faire

Le **drag & drop natif HTML5** (sans librairie) repose sur 3 attributs/events :

- `draggable` (sur l'élément qu'on peut saisir) + `onDragStart` : on stocke une
  info dans `e.dataTransfer.setData(clé, valeur)`.
- `onDragOver` (sur la zone cible) : **obligatoire** d'appeler
  `e.preventDefault()`, sinon `onDrop` ne se déclenche jamais.
- `onDrop` (sur la zone cible) : on lit `e.dataTransfer.getData(clé)`.

La mise à jour de l'état React suit le pattern **optimiste** : on met à jour
l'écran **immédiatement**, puis on envoie la requête au serveur ; si elle
échoue, on recharge les vraies données.

---

## Fonctionnement détaillé, fonction par fonction — `src/pages/frontoffice/KanbanPage.jsx`

### `COLUMN_DEFS`, `columnKeyFor`, `labelFor` — [KanbanPage.jsx:10-28](../../src/pages/frontoffice/KanbanPage.jsx#L10-L28)

```js
const COLUMN_DEFS = [
  { key: 'nouveau',     glpiStatuses: [1], targetStatus: 1 },
  { key: 'in_progress', glpiStatuses: [2], targetStatus: 2 },
  { key: 'termine',     glpiStatuses: [6], targetStatus: 6 }
]

function columnKeyFor(status) {
  if (status === 1) return 'nouveau'
  if (status === 2) return 'in_progress'
  return 'termine'
}

function labelFor(settings, key, lang) {
  if (lang === 'mg') {
    const mg = settings[`label_mg_${key}`]
    if (mg) return mg
  }
  return settings[`label_fr_${key}`] ?? key
}
```

- `COLUMN_DEFS` : tableau **statique** décrivant les 3 colonnes du tableau.
  `glpiStatuses` = quels statuts GLPI bruts vont dans cette colonne ;
  `targetStatus` = quel statut envoyer au serveur quand on dépose un ticket
  dans cette colonne. Ici il y a une correspondance 1:1, mais séparer les deux
  champs permettrait d'avoir, par ex., plusieurs statuts GLPI affichés dans
  une même colonne.
- `columnKeyFor(status)` :
  - **Reçoit** : un statut GLPI brut (entier `1`, `2` ou `6`).
  - **Fait** : `if/else` en cascade — `1` → `'nouveau'`, `2` → `'in_progress'`,
    tout le reste (donc `6`) → `'termine'`.
  - **Renvoie** : la `key` de `COLUMN_DEFS` correspondante — utilisée pour
    savoir dans quelle colonne afficher un ticket, et pour détecter un
    "drop sans changement" (`handleDrop`).
- `labelFor(settings, key, lang)` :
  - **Reçoit** : l'objet `settings` (chargé depuis `GET /api/kanban/settings`,
    contient les libellés personnalisables des colonnes), la `key` de la
    colonne (`'nouveau'`, etc.), et la langue active (`'fr'` ou `'mg'`).
  - **Fait** : si `lang === 'mg'` ET qu'un libellé malgache non-vide existe
    (`settings.label_mg_nouveau`, etc.), on le renvoie. Sinon on retombe sur
    le libellé français `settings.label_fr_<key>`, ou `key` lui-même en
    dernier recours (`?? key`).
  - **Renvoie** : une chaîne — le titre affiché en haut de la colonne.

### `KanbanColumn` — [KanbanPage.jsx:182-230](../../src/pages/frontoffice/KanbanPage.jsx#L182-L230)

```jsx
function KanbanColumn({ colDef, tickets, label, bgColor, draggingId, onDragStart, onDragEnd, onDrop, onCardClick, onAddClick }) {
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      className={`kanban-column ${isDragOver ? 'kanban-column--drag-over' : ''}`}
      style={{ background: bgColor }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragOver(false)
        onDrop(e.dataTransfer.getData('ticketId'))
      }}
    >
      {/* en-tête, cartes, bouton "+ Ajouter" */}
    </div>
  )
}
```

- **Reçoit** (props) : `colDef` (l'entrée de `COLUMN_DEFS` pour cette colonne),
  `tickets` (déjà filtrés pour cette colonne par le parent), `label`,
  `bgColor`, `draggingId` (id du ticket en cours de glissement, ou `null`),
  et des callbacks (`onDragStart`, `onDragEnd`, `onDrop`, `onCardClick`,
  `onAddClick`).
- `const [isDragOver, setIsDragOver] = useState(false)` : état **local** à
  CETTE colonne — `true` quand un élément glissé survole cette colonne
  précise (sert juste à l'effet visuel `kanban-column--drag-over`).
- `onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}` :
  `e.preventDefault()` est **obligatoire** — sans lui, le navigateur considère
  par défaut que cette zone n'accepte pas de drop, et `onDrop` ne se
  déclencherait jamais.
- `onDragLeave={() => setIsDragOver(false)}` : remet l'effet visuel à zéro
  quand l'élément glissé quitte la colonne sans y être déposé.
- `onDrop={e => { e.preventDefault(); setIsDragOver(false); onDrop(e.dataTransfer.getData('ticketId')) }}` :
  - `e.dataTransfer.getData('ticketId')` : lit la donnée déposée par
    `onDragStart` (voir ci-dessous) — une **chaîne** (le drag & drop HTML5 ne
    transporte que du texte).
  - `onDrop(...)` : appelle le callback du parent (`id => handleDrop(id, col.key)`,
    voir plus bas) avec cette chaîne.
- Pour chaque ticket de `tickets`, une `<div draggable onDragStart={...} onDragEnd={onDragEnd} onClick={...}>` :
  - `draggable` : rend l'élément saisissable par l'utilisateur.
  - `onDragStart={e => { e.dataTransfer.setData('ticketId', ticket.id.toString()); e.dataTransfer.effectAllowed = 'move'; onDragStart(ticket.id) }}` :
    - `setData('ticketId', ...)` : stocke l'id du ticket (converti en chaîne
      avec `.toString()` — `dataTransfer` n'accepte que des chaînes) ; c'est
      cette valeur que `onDrop` relira avec `getData('ticketId')`.
    - `onDragStart(ticket.id)` : remonte l'id au parent (`setDraggingId`) pour
      l'effet visuel `kanban-card--dragging`.
  - `onDragEnd={onDragEnd}` : remonté au parent (`() => setDraggingId(null)`)
    — remet `draggingId` à `null` quand le glissement se termine (déposé ou
    annulé).

### `handleDrop(ticketIdStr, targetColKey)` — [KanbanPage.jsx:276-290](../../src/pages/frontoffice/KanbanPage.jsx#L276-L290)

```js
function handleDrop(ticketIdStr, targetColKey) {
  const ticketId = parseInt(ticketIdStr, 10)
  const ticket   = tickets.find(t => t.id === ticketId)
  if (!ticket) return
  if (columnKeyFor(ticket.status) === targetColKey) return

  if (targetColKey === 'termine') {
    setSolveTarget({ ticketId })
  } else if (targetColKey === 'in_progress' && ticket.status === 6) {
    setReopenTarget({ ticketId })
  } else {
    const colDef = COLUMN_DEFS.find(c => c.key === targetColKey)
    patchStatus(ticketId, colDef.targetStatus)
  }
}
```

- **Reçoit** : `ticketIdStr` (la chaîne lue depuis `dataTransfer`) et
  `targetColKey` (la `key` de la colonne où le ticket a été déposé, ex.
  `'in_progress'`).
- `parseInt(ticketIdStr, 10)` : reconvertit la chaîne en entier (`dataTransfer`
  ne transporte que du texte — voir [01-sessions-glpi.md] non, plutôt voir
  l'extrait drag&drop ci-dessus).
- `tickets.find(t => t.id === ticketId)` : retrouve l'objet ticket complet
  dans l'état React (`tickets`). `if (!ticket) return` : garde-fou si l'id ne
  correspond à rien (ne devrait pas arriver, mais évite un crash silencieux).
- `if (columnKeyFor(ticket.status) === targetColKey) return` : **si le ticket
  est déposé dans sa colonne d'origine** (aucun changement de statut), on ne
  fait rien — évite un appel serveur inutile.
- **Trois branches selon la colonne cible** :
  1. `targetColKey === 'termine'` → ouvre la modale de clôture
     (`setSolveTarget({ ticketId })`, voir [05-modales.md](05-modales.md)) —
     **aucun appel serveur immédiat** : on attend que l'utilisateur remplisse
     le formulaire de solution/coût.
  2. `targetColKey === 'in_progress' && ticket.status === 6` → le ticket était
     **Clos** (`status === 6`) et on le ramène en "In progress" : c'est le cas
     **réouverture**, on ouvre `ReopenModal` (`setReopenTarget({ ticketId })`).
  3. **Sinon** (tout autre changement simple, ex. Nouveau → In progress) :
     `COLUMN_DEFS.find(c => c.key === targetColKey)` retrouve la définition de
     la colonne cible, et on appelle directement `patchStatus(ticketId, colDef.targetStatus)`
     — pas de modale, changement immédiat.

### `patchStatus(ticketId, newStatus)` — [KanbanPage.jsx:292-309](../../src/pages/frontoffice/KanbanPage.jsx#L292-L309)

```js
async function patchStatus(ticketId, newStatus) {
  setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))
  try {
    const r = await fetch(`http://localhost:3001/api/frontoffice/kanban-tickets/${ticketId}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus })
    })
    const data = await r.json().catch(() => ({}))
    if (!data.ok) {
      console.error('Échec changement de statut :', data.error)
      reloadTickets()
    }
  } catch (err) {
    console.error('Échec changement de statut :', err.message)
    reloadTickets()
  }
}
```

- **Reçoit** : `ticketId` et le nouveau statut GLPI (`newStatus`, entier).
- **Étape 1 — mise à jour optimiste** :
  `setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))`
  — met à jour **immédiatement** l'écran, AVANT même d'avoir contacté le
  serveur. `{ ...t, status: newStatus }` : copie toutes les propriétés de `t`
  (spread) puis écrase `status` — pattern standard pour "modifier un élément
  d'un tableau d'état React sans muter l'original" (React compare les
  références pour détecter les changements ; muter `t.status = newStatus`
  directement ne déclencherait pas de re-rendu).
- **Étape 2 — requête serveur** : `PATCH /api/frontoffice/kanban-tickets/:id/status`
  avec `{ status: newStatus }` dans le corps JSON (voir
  [06-express-routes.md](06-express-routes.md) pour la route).
- **Étape 3 — gestion d'échec** : `data.ok` à `false` (erreur applicative) OU
  exception réseau (`catch`) → `reloadTickets()` : recharge la vraie liste
  depuis le serveur pour **annuler** la mise à jour optimiste incorrecte
  (resynchronisation).
- **Renvoie** : rien (`async function` sans `return` utile — appelée pour son
  effet de bord).

### `reloadTickets()` — [KanbanPage.jsx:268-274](../../src/pages/frontoffice/KanbanPage.jsx#L268-L274)

```js
async function reloadTickets() {
  try {
    const r = await fetch('http://localhost:3001/api/frontoffice/kanban-tickets')
    const data = await r.json().catch(() => ({ ok: false, tickets: [] }))
    if (data.ok) setTickets(data.tickets)
  } catch { /* on garde l'état actuel */ }
}
```

- **Reçoit** : rien.
- **Fait** : recharge la liste complète des tickets depuis le serveur.
- `data.ok` → `setTickets(data.tickets)` : remplace l'état par les données
  serveur (source de vérité).
- `catch { /* on garde l'état actuel */ }` : si même le rechargement échoue
  (ex. serveur down), on ne fait **rien** plutôt que d'effacer l'écran — on
  garde l'affichage précédent, même potentiellement désynchronisé, plutôt que
  de tout casser.

### `ticketsByColumn` — [KanbanPage.jsx:374-379](../../src/pages/frontoffice/KanbanPage.jsx#L374-L379)

```js
const ticketsByColumn = Object.fromEntries(
  COLUMN_DEFS.map(col => [
    col.key,
    tickets.filter(t => col.glpiStatuses.includes(t.status))
  ])
)
```

- **Reçoit** (via closure) : `tickets` (l'état complet) et `COLUMN_DEFS`.
- `COLUMN_DEFS.map(col => [col.key, tickets.filter(...)])` : pour chaque
  colonne, construit une **paire** `[clé, valeur]` = `[col.key, tickets dont le
  statut est dans col.glpiStatuses]`.
- `Object.fromEntries([[k1,v1], [k2,v2], ...])` : transforme ce tableau de
  paires en objet `{ k1: v1, k2: v2, ... }`.
- **Résultat** : `{ nouveau: [...], in_progress: [...], termine: [...] }` — un
  tableau de tickets par colonne, recalculé à **chaque rendu** (pas de
  `useMemo` : les volumes sont petits, pas besoin d'optimiser).
- Utilisé dans le JSX : `tickets={ticketsByColumn[col.key]}` pour chaque
  `<KanbanColumn>`.

---

## À retenir pour coder à la main

- `tickets.map(t => t.id === ticketId ? {...t, status: x} : t)` est LE pattern
  pour "modifier un élément d'un tableau d'état React" — à mémoriser par cœur.
- `onDragOver` sans `e.preventDefault()` → le navigateur refuse le drop (effet
  "interdit"). C'est l'erreur n°1 sur le drag & drop HTML5.
- `e.dataTransfer.setData('clé', valeur)` n'accepte que des **chaînes** — pour
  un id numérique, `.toString()` puis `parseInt(..., 10)` au `onDrop`.
- Mise à jour optimiste = UI réactive **immédiatement**, mais il faut TOUJOURS
  prévoir le chemin d'erreur (`reloadTickets()`) pour ne pas laisser l'écran
  dans un état qui ne correspond plus au serveur.
- `if (columnKeyFor(ticket.status) === targetColKey) return` : toujours
  vérifier qu'un drag & drop correspond à un **vrai changement** avant
  d'agir — sinon on déclenche des appels serveur (et des modales !) pour rien.
