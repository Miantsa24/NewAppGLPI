# 7. Gestion des tickets (Backoffice) — liste, fiche détail, édition, suppression

[← Retour au sommaire](README.md)

## Façon de faire

Une page "fiche détail avec édition" suit toujours la même structure d'état :

```js
const [ticket,  setTicket]  = useState(null)   // données chargées depuis le serveur
const [editing, setEditing] = useState(false)  // false = lecture, true = formulaire
const [form,    setForm]    = useState(null)   // copie modifiable, uniquement quand editing
```

- **Lecture** : `{ticket && !editing && <Affichage .../>}`
- **Édition** : `{ticket && editing && <Formulaire .../>}`
- **`startEditing()`** copie les champs de `ticket` dans `form` (jamais
  l'inverse : on ne modifie JAMAIS `ticket` directement, sinon l'écran
  "lecture" changerait aussi avant la sauvegarde).

---

## Fonctionnement détaillé, fonction par fonction — `server/ticketsData.js`

### `describeTicket(ticket)` — [ticketsData.js:38-51](../../server/ticketsData.js#L38-L51)

```js
function describeTicket(ticket) {
  return {
    id:         ticket.id,
    name:       ticket.name,
    content:    ticket.content,
    type:       TICKET_TYPES[ticket.type]         ?? `(type ${ticket.type})`,
    status:     TICKET_STATUSES[ticket.status]    ?? `(statut ${ticket.status})`,
    priority:   TICKET_PRIORITIES[ticket.priority] ?? `(priorité ${ticket.priority})`,
    date:       ticket.date,
    typeId:     ticket.type,
    statusId:   ticket.status,
    priorityId: ticket.priority
  }
}
```

- **Reçoit** : un objet ticket **brut** renvoyé par GLPI (avec `type`,
  `status`, `priority` sous forme d'entiers : `ticket.status === 6`, etc.).
- **Fait** : construit un nouvel objet qui contient **à la fois** :
  - les libellés traduits (`type`, `status`, `priority` → chaînes lisibles
    via les dictionnaires `TICKET_TYPES`/`TICKET_STATUSES`/`TICKET_PRIORITIES`
    définis en haut du fichier) ;
  - les codes bruts (`typeId`, `statusId`, `priorityId` → les entiers
    originaux), **en plus**.
- `TICKET_STATUSES[ticket.status] ?? \`(statut ${ticket.status})\`` : si le
  code GLPI n'est pas dans le dictionnaire (cas imprévu), on affiche le code
  brut entre parenthèses plutôt que `undefined` — l'app ne plante pas, et le
  cas anormal est visible.
- **Renvoie** : l'objet "vue" complet, prêt à être envoyé en JSON au frontend.
  Les libellés servent à l'**affichage**, les codes `xxxId` servent à
  **préremplir les `<select>`** du formulaire de modification.

### `listTickets()` — [ticketsData.js:72-84](../../server/ticketsData.js#L72-L84)

```js
export async function listTickets() {
  const sessionToken = await glpi.openSession()
  try {
    const tickets = await glpi.listItems(sessionToken, 'Ticket')
    return tickets
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(describeTicket)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
```

- **Reçoit** : rien.
- `glpi.listItems(sessionToken, 'Ticket')` : récupère **tous** les tickets en
  un seul appel (voir [01-sessions-glpi.md](01-sessions-glpi.md)).
- `.slice()` : copie le tableau **avant** de le trier — `.sort()` modifie le
  tableau **en place** ; sans `.slice()`, on muterait le tableau renvoyé par
  `listItems` (pas grave ici car il n'est pas réutilisé, mais c'est une bonne
  habitude pour éviter des effets de bord surprenants).
- `.sort((a, b) => (a.date < b.date ? 1 : -1))` : tri **décroissant** par
  date — si `a` est plus ancien que `b` (`a.date < b.date`), on renvoie `1`
  (place `a` après `b`) ; sinon `-1` (place `a` avant `b`). Résultat : du plus
  récent au plus ancien.
- `.map(describeTicket)` : applique la traduction des codes à **chaque**
  ticket.
- **Renvoie** : un tableau de tickets "vue" (avec libellés + codes), triés du
  plus récent au plus ancien — affiché par la page "Liste des tickets".

### `listTicketsForKanban()` — [ticketsData.js:59-67](../../server/ticketsData.js#L59-L67)

```js
export async function listTicketsForKanban() {
  const sessionToken = await glpi.openSession()
  try {
    const tickets = await glpi.listItems(sessionToken, 'Ticket')
    return tickets.map(t => ({ id: t.id, name: t.name, status: t.status }))
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
```

- Même appel GLPI que `listTickets`, mais :
  - **pas de tri** (le Kanban range les tickets par colonne, pas par date) ;
  - **pas de traduction** : `status` reste le **code brut GLPI** (`1`, `2`,
    `6`) — c'est exactement ce dont `columnKeyFor` a besoin (voir
    [04-kanban-drag-drop.md](04-kanban-drag-drop.md)) ;
  - seulement 3 champs (`id`, `name`, `status`) — données minimales pour
    l'affichage des cartes.
- **Renvoie** : `[{ id, name, status }, ...]`.

### `getTicketDetail(ticketId)` — [ticketsData.js:184-224](../../server/ticketsData.js#L184-L224)

```js
export async function getTicketDetail(ticketId) {
  const sessionToken = await glpi.openSession()
  try {
    const ticket = await glpi.getItem(sessionToken, 'Ticket', ticketId)

    const [itemLinks, costs] = await Promise.all([
      glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'Item_Ticket'),
      glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'TicketCost')
    ])

    const items = await Promise.all(itemLinks.map(async link => {
      try {
        const item = await glpi.getItem(sessionToken, link.itemtype, link.items_id)
        return { itemtype: link.itemtype, id: link.items_id, name: item.name }
      } catch {
        return { itemtype: link.itemtype, id: link.items_id, name: '(élément introuvable)' }
      }
    }))

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
```

- **Reçoit** : `ticketId`.
- **Étape 1** : `getItem(sessionToken, 'Ticket', ticketId)` — récupère le
  ticket lui-même (un seul item, voir [01-sessions-glpi.md](01-sessions-glpi.md)).
- **Étape 2** : `Promise.all([listSubItems(..., 'Item_Ticket'), listSubItems(..., 'TicketCost')])`
  — récupère **en parallèle** :
  - `itemLinks` : les associations `Item_Ticket` de ce ticket (`{ itemtype, items_id }`)
  - `costs` : les `TicketCost` GLPI de ce ticket.
  - Indépendants l'un de l'autre → parallélisés pour ne payer qu'une seule
    fois le coût fixe (~0.5s) d'un aller-retour GLPI.
- **Étape 3** : `Promise.all(itemLinks.map(async link => {...}))` — pour
  **chaque** élément associé, va chercher son nom via
  `getItem(sessionToken, link.itemtype, link.items_id)`, **en parallèle pour
  tous les éléments** (pas un par un).
  - `try { ... } catch { return { ..., name: '(élément introuvable)' } }` :
    si l'élément a été supprimé depuis (ex. réinitialisation partielle),
    `getItem` échoue pour CET élément — on renvoie un nom de repli pour CETTE
    entrée seulement, sans faire planter `Promise.all` (qui rejetterait
    sinon **toute** la fiche détail pour une seule association orpheline).
- **Étape 4** : construction de l'objet final —
  - `...describeTicket(ticket)` (spread) : reprend tous les champs traduits +
    codes bruts vus plus haut.
  - `items` : le tableau résolu à l'étape 3.
  - `costs: costs.map(c => ({ name, actiontime, cost_time, cost_fixed }))` :
    ne garde que les 4 champs utiles de chaque `TicketCost` (le reste — id,
    dates internes GLPI... — n'est pas utile à l'affichage).
- **Renvoie** : un objet complet `{ id, name, content, type, status, priority,
  date, typeId, statusId, priorityId, items, costs }` — utilisé par la fiche
  détail Backoffice ET par `DetailModal` du Kanban (même route).

### `updateTicket(ticketId, fields)` — [ticketsData.js:232-239](../../server/ticketsData.js#L232-L239)

```js
export async function updateTicket(ticketId, fields) {
  const sessionToken = await glpi.openSession()
  try {
    await glpi.updateItem(sessionToken, 'Ticket', ticketId, fields)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
```

- **Reçoit** : `ticketId` et `fields` — un objet `{ name, content, type,
  status, priority }` avec des codes **bruts** (entiers), tel qu'envoyé par le
  formulaire de la fiche détail.
- **Fait** : un simple appel `updateItem` — aucune logique supplémentaire,
  c'est une fonction "wrapper" très fine.
- GLPI accepte la mise à jour directe de `status`/`priority` sans étape
  intermédiaire (contrairement au Kanban où `status: 6` passe par une
  `ITILSolution` — voir [06-express-routes.md](06-express-routes.md)). Un
  ticket peut être mis directement en `status: 6` ici sans créer de solution.
- **Renvoie** : rien.

### `deleteTicket(ticketId)` — [ticketsData.js:247-264](../../server/ticketsData.js#L247-L264)

```js
export async function deleteTicket(ticketId) {
  const sessionToken = await glpi.openSession()
  try {
    const itemLinks = await glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'Item_Ticket')
    const costs     = await glpi.listSubItems(sessionToken, 'Ticket', ticketId, 'TicketCost')

    await glpi.deleteItem(sessionToken, 'Ticket', ticketId)

    const deleteJournalEntry = db.prepare(
      'DELETE FROM import_journal WHERE glpi_itemtype = ? AND glpi_id = ?'
    )
    deleteJournalEntry.run('Ticket', Number(ticketId))
    for (const link of itemLinks) deleteJournalEntry.run('Item_Ticket', link.id)
    for (const cost of costs)     deleteJournalEntry.run('TicketCost', cost.id)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
```

- **Reçoit** : `ticketId`.
- **Étape 1 — lister AVANT de supprimer** : `itemLinks` (associations
  `Item_Ticket`) et `costs` (`TicketCost`) sont récupérés **avant** la
  suppression du ticket. Raison : `deleteItem(..., 'Ticket', ticketId)`
  utilise `force_purge: true`, ce qui supprime le ticket **et** fait
  disparaître en cascade ses `Item_Ticket`/`TicketCost` côté GLPI — après
  coup, on ne pourrait plus les lister pour nettoyer le journal.
- **Étape 2** : `deleteItem(sessionToken, 'Ticket', ticketId)` — suppression
  réelle du ticket dans GLPI.
- **Étape 3 — nettoyage du journal** (`import_journal`, table SQLite qui trace
  ce que l'import a créé — voir [09-autres-patterns.md](09-autres-patterns.md)) :
  - `db.prepare('DELETE FROM import_journal WHERE glpi_itemtype = ? AND glpi_id = ?')` :
    requête préparée **une fois**, réutilisée pour chaque suppression
    (`deleteJournalEntry.run(...)`).
  - `deleteJournalEntry.run('Ticket', Number(ticketId))` : retire l'entrée du
    ticket lui-même.
  - `for (const link of itemLinks) deleteJournalEntry.run('Item_Ticket', link.id)` :
    retire chaque association `Item_Ticket` détruite en cascade.
  - `for (const cost of costs) deleteJournalEntry.run('TicketCost', cost.id)` :
    idem pour chaque `TicketCost`.
  - **Pourquoi** : sans ce nettoyage, la page "Réinitialisation" (Phase 3)
    essaierait plus tard de re-supprimer (via `deleteItem`) des éléments
    GLPI qui n'existent déjà plus → erreur 404 côté GLPI.
- **Renvoie** : rien.

---

## Fonctionnement détaillé, fonction par fonction — `src/pages/backoffice/TicketDetailPage.jsx`

### `loadTicket()` (via `useCallback`) — [TicketDetailPage.jsx:61-86](../../src/pages/backoffice/TicketDetailPage.jsx#L61-L86)

```js
const loadTicket = useCallback(async () => {
  setLoading(true)
  setError(null)
  try {
    const response = await fetch(`http://localhost:3001/api/backoffice/tickets/${id}`)
    const data = await response.json()
    if (data.ok) {
      setTicket(data.ticket)
    } else {
      console.error('Échec du chargement du ticket :', data.error)
      setError(true)
    }
  } catch (err) {
    console.error('Échec du chargement du ticket :', err.message)
    setError(true)
  } finally {
    setLoading(false)
  }
}, [id])

useEffect(() => {
  setTicket(null)
  loadTicket()
}, [loadTicket])
```

- **Reçoit** (via closure) : `id` — extrait de l'URL par `useParams()`
  (`/backoffice/tickets/:id` → `{ id: "5" }`), l'équivalent React-Router de
  `req.params.id` côté serveur.
- `useCallback(..., [id])` : la fonction `loadTicket` n'est **recréée** que si
  `id` change — permet de la référencer dans `useEffect` ET dans `handleSave`
  (pour recharger après une sauvegarde) sans dupliquer le code de fetch.
- **Fait** : `GET /api/backoffice/tickets/:id` → `data.ok` → `setTicket(data.ticket)`,
  sinon `setError(true)`. `finally { setLoading(false) }` dans tous les cas.
- `useEffect(() => { setTicket(null); loadTicket() }, [loadTicket])` :
  - se déclenche au montage **et** chaque fois que `loadTicket` change (donc
    chaque fois que `id` change — navigation vers un autre ticket).
  - `setTicket(null)` **avant** `loadTicket()` : évite d'afficher brièvement
    les données de l'**ancien** ticket pendant le chargement du nouveau (si
    on navigue directement de `/tickets/5` à `/tickets/8`).

### `startEditing()` — [TicketDetailPage.jsx:88-98](../../src/pages/backoffice/TicketDetailPage.jsx#L88-L98)

```js
function startEditing() {
  setForm({
    name:     ticket.name,
    content:  ticket.content ?? '',
    type:     ticket.typeId,
    status:   ticket.statusId,
    priority: ticket.priorityId
  })
  setSaveError(null)
  setEditing(true)
}
```

- **Reçoit** : rien (lit `ticket`, l'état déjà chargé).
- **Fait** : copie les champs de `ticket` dans un nouvel objet `form` —
  **uniquement** les champs modifiables par le formulaire.
  - `content: ticket.content ?? ''` : si `ticket.content` est `null` (ticket
    sans description), on initialise avec une chaîne vide plutôt que `null`
    — un `<textarea value={null}>` provoquerait un avertissement React
    ("changing a controlled input to be uncontrolled").
  - `type: ticket.typeId` (et idem `status`/`priority`) : on prend les **codes
    bruts** (`typeId`, pas `type`) — ce sont eux qui correspondent aux
    `value={...}` des `<option>` du `<select>`.
- `setSaveError(null)` : efface un message d'erreur d'une tentative
  précédente.
- `setEditing(true)` : bascule l'affichage vers le formulaire
  (`{ticket && editing && <form>...</form>}`).

### `handleSave(event)` — [TicketDetailPage.jsx:100-125](../../src/pages/backoffice/TicketDetailPage.jsx#L100-L125)

```js
async function handleSave(event) {
  event.preventDefault()
  setSaving(true)
  setSaveError(null)
  try {
    const response = await backofficeFetch(`http://localhost:3001/api/backoffice/tickets/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form)
    })
    const data = await response.json().catch(() => ({}))
    if (!data.ok) {
      console.error('Échec de la modification du ticket :', data.error)
      setSaveError('La modification a échoué. Réessayez.')
      return
    }
    setEditing(false)
    await loadTicket()
  } catch (err) {
    console.error('Échec de la modification du ticket :', err.message)
    setSaveError('La modification a échoué. Réessayez.')
  } finally {
    setSaving(false)
  }
}
```

- **Reçoit** : `event` (l'événement de soumission du `<form>`).
- `event.preventDefault()` : empêche le rechargement de page par défaut.
- `backofficeFetch(...)` (au lieu de `fetch`) : ajoute automatiquement
  l'en-tête `X-Backoffice-Code` exigé par `requireBackofficeCode` côté serveur
  (voir [06-express-routes.md](06-express-routes.md) et
  [src/pages/backoffice/api.js](../../src/pages/backoffice/api.js)).
- `PUT .../tickets/:id` avec `body: JSON.stringify(form)` : envoie l'objet
  `form` complet (`{ name, content, type, status, priority }`, codes bruts) —
  la route `PUT /api/backoffice/tickets/:id` ([index.js:198-216](../../server/index.js#L198-L216))
  fait `parseInt(type, 10)` etc. avant d'appeler `updateTicket`.
- `if (!data.ok) { ...; return }` : en cas d'échec, on affiche un message
  d'erreur et on **reste en mode édition** (`return` avant `setEditing(false)`)
  — l'utilisateur peut corriger et resoumettre sans perdre sa saisie.
- Succès : `setEditing(false)` (retour à l'affichage lecture) puis
  `await loadTicket()` — **recharge** le ticket depuis le serveur pour
  afficher les libellés à jour (ex. nouveau statut traduit en "Clos").
- `finally { setSaving(false) }` : réactive le bouton "Enregistrer" dans tous
  les cas.

### `handleDelete()` — [TicketDetailPage.jsx:127-152](../../src/pages/backoffice/TicketDetailPage.jsx#L127-L152)

```js
async function handleDelete() {
  const confirmed = window.confirm(
    `Supprimer définitivement le ticket "${ticket.name}" ?\n\n` +
    'Cette action est IRRÉVERSIBLE : le ticket et ses éléments/coûts associés seront effacés de GLPI.'
  )
  if (!confirmed) return

  setDeleting(true)
  setDeleteError(null)
  try {
    const response = await backofficeFetch(`http://localhost:3001/api/backoffice/tickets/${id}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    if (!data.ok) {
      console.error('Échec de la suppression du ticket :', data.error)
      setDeleteError('La suppression a échoué. Réessayez.')
      setDeleting(false)
      return
    }
    navigate('/backoffice/tickets')
  } catch (err) {
    console.error('Échec de la suppression du ticket :', err.message)
    setDeleteError('La suppression a échoué. Réessayez.')
    setDeleting(false)
  }
}
```

- **Reçoit** : rien (lit `ticket.name` pour le message de confirmation).
- `window.confirm(...)` : boîte de dialogue **native du navigateur**, renvoie
  `true`/`false` de façon **synchrone** (bloque le thread jusqu'au clic de
  l'utilisateur). `if (!confirmed) return` : si l'utilisateur clique
  "Annuler", on arrête **tout** ici — aucun état n'a encore été modifié.
- Si confirmé : `setDeleting(true)` (désactive/change le libellé du bouton),
  puis `DELETE /api/backoffice/tickets/:id` via `backofficeFetch`.
- En cas d'échec (`!data.ok` ou exception) : message d'erreur + `setDeleting(false)`
  — on **reste sur la page** (la fiche existe toujours côté GLPI).
- En cas de succès : `navigate('/backoffice/tickets')` — retour à la liste
  (pas besoin de `setDeleting(false)`, le composant est démonté par la
  navigation).
- Remarquer : **pas de `finally`** ici (contrairement à `handleSave`) — car
  en cas de succès on **quitte la page**, donc remettre `setDeleting(false)`
  serait inutile (et provoquerait un avertissement React "set state on an
  unmounted component" si fait après le `navigate`).

---

## Champs "codes bruts" vs "libellés" — pourquoi les deux ?

GLPI stocke `type`, `status`, `priority` sous forme de **petits entiers** (ex.
`status: 6`). Pour l'**affichage** on veut un texte ("Clos"), mais pour un
`<select>` de **formulaire** on a besoin du **code** (`<option value="6">`).
La solution : `describeTicket` renvoie **les deux** (voir plus haut), et le
frontend choisit lequel utiliser selon le contexte :

```jsx
<select value={form.status} onChange={e => setForm(f => ({ ...f, status: Number(e.target.value) }))}>
  <option value={1}>Nouveau</option>
  <option value={2}>En cours (attribué)</option>
  <option value={6}>Clos</option>
</select>
```

`Number(e.target.value)` : la valeur d'un `<select>`/`<input>` est **toujours
une chaîne** dans le DOM, même si les `<option value={1}>` semblent
numériques — il faut la reconvertir explicitement si on veut comparer/envoyer
un nombre (sinon `form.status` vaudrait `"6"` au lieu de `6`, et
`PUT .../tickets/:id` recevrait une chaîne là où GLPI attend un entier — bien
que la route fasse de toute façon `parseInt(status, 10)` côté serveur par
sécurité).

---

## À retenir pour coder à la main

- **Ne jamais modifier l'objet `ticket` chargé directement** — toujours passer
  par une copie (`form`) pendant l'édition, et ne remplacer `ticket` qu'après
  succès de la sauvegarde (via `loadTicket()`).
- `window.confirm(...)` renvoie `true`/`false` de façon **synchrone** —
  pratique pour les actions destructrices (suppression), mais bloque le thread
  (à éviter pour autre chose que des confirmations courtes).
- `backofficeFetch` (au lieu de `fetch`) : ajoute automatiquement l'en-tête
  `X-Backoffice-Code` exigé par le middleware `requireBackofficeCode` côté
  serveur.
- Pour une suppression GLPI avec `force_purge: true` : **lister les
  sous-éléments AVANT** de supprimer le parent (la suppression cascade les
  fait disparaître), pour pouvoir nettoyer le journal après coup.
- `Promise.all(itemLinks.map(async link => { try {...} catch { return repli } }))` :
  paralléliser des résolutions individuelles **avec un filet de sécurité par
  élément**, pour qu'une seule entrée orpheline ne fasse pas échouer tout le
  `Promise.all`.
