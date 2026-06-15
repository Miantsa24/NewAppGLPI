# 5. Popups / Modales React (pattern réutilisable)

[← Retour au sommaire](README.md)

## Façon de faire

Une modale = **un composant séparé**, affiché **conditionnellement** depuis le
parent via une variable d'état (`null` = fermée, objet = ouverte + données
nécessaires) :

```jsx
const [monModal, setMonModal] = useState(null)   // null = fermé

// ouverture, avec les données nécessaires
setMonModal({ ticketId: 42 })

// affichage conditionnel
{monModal && <MonModal data={monModal} onClose={() => setMonModal(null)} />}
```

À l'intérieur de la modale : un **fond (backdrop)** qui ferme au clic, et un
**panneau** qui stoppe la propagation du clic (sinon cliquer DANS la modale la
fermerait aussi, car le clic "remonte" jusqu'au backdrop) :

```jsx
<div className="kanban-modal-backdrop" onClick={onClose}>
  <div className="kanban-modal" onClick={e => e.stopPropagation()}>
    {/* contenu */}
  </div>
</div>
```

---

## Fonctionnement détaillé, fonction par fonction — `src/pages/frontoffice/KanbanPage.jsx`

Le Kanban utilise **trois** modales, toutes pilotées par une variable d'état
différente dans `KanbanPage` :

| Modale         | État qui la contrôle | Ouverte quand…                                  |
|-----------------|-----------------------|--------------------------------------------------|
| `SolveModal`    | `solveTarget`         | un ticket est déposé dans la colonne "Terminé"   |
| `ReopenModal`   | `reopenTarget`        | un ticket "Clos" est déposé dans "In progress"   |
| `DetailModal`   | `detailTicketId`      | on clique sur une carte de ticket                |

### `SolveModal({ onConfirm, onCancel })` — [KanbanPage.jsx:33-86](../../src/pages/frontoffice/KanbanPage.jsx#L33-L86)

```jsx
function SolveModal({ onConfirm, onCancel }) {
  const [text, setText] = useState('')
  const [actiontime, setActiontime] = useState('')
  const [costTime, setCostTime] = useState('')
  const [cost, setCost] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (text.trim()) onConfirm(text.trim(), { actiontime, costTime, cost })
  }

  return (
    <div className="kanban-modal-backdrop" onClick={onCancel}>
      <div className="kanban-modal" onClick={e => e.stopPropagation()}>
        <h2>Clôturer le ticket</h2>
        <form onSubmit={handleSubmit}>
          <textarea value={text} onChange={e => setText(e.target.value)} required autoFocus />
          {/* champs actiontime / costTime / cost */}
          <div className="kanban-modal__actions">
            <button type="button" onClick={onCancel}>Annuler</button>
            <button type="submit" disabled={!text.trim()}>Confirmer</button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- **Reçoit** (props) : `onConfirm` (callback appelé à la validation) et
  `onCancel` (callback appelé pour fermer sans valider).
- **État local** : 4 champs contrôlés (`text` = description de la solution,
  `actiontime`, `costTime`, `cost` = les 3 champs du "nouveau coût").
  Chacun est **réinitialisé automatiquement** quand la modale se referme,
  car React détruit le composant (et son état) quand
  `{solveTarget && <SolveModal .../>}` redevient `false`.
- `handleSubmit(e)` :
  - `e.preventDefault()` : empêche le rechargement de page par défaut d'un
    `<form>`.
  - `if (text.trim())` : la solution est **obligatoire** (`required` sur le
    `<textarea>` le bloque déjà côté navigateur, mais on revérifie ici).
  - `onConfirm(text.trim(), { actiontime, costTime, cost })` : remonte au
    parent le texte de solution ET un objet avec les 3 valeurs de coût —
    **toutes des chaînes** à ce stade (valeurs brutes d'`<input>`), converties
    en nombres plus tard côté serveur (`parseFloat`/`parseInt`).
- `onClick={onCancel}` sur le backdrop + `onClick={e => e.stopPropagation()}`
  sur le panneau : pattern standard (voir "Façon de faire" ci-dessus).
- `autoFocus` sur le `<textarea>` : le curseur est placé directement dedans à
  l'ouverture — l'utilisateur peut taper sans cliquer.

### `ReopenModal({ onClose, onCancelCost, onReopenPercent })` — [KanbanPage.jsx:88-124](../../src/pages/frontoffice/KanbanPage.jsx#L88-L124)

```jsx
function ReopenModal({ onClose, onCancelCost, onReopenPercent }) {
  const [showPercent, setShowPercent] = useState(false)
  const [percent, setPercent] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (percent) onReopenPercent(percent)
  }

  return (
    <div className="kanban-modal-backdrop" onClick={onClose}>
      <div className="kanban-modal" onClick={e => e.stopPropagation()}>
        <h2>Réouvrir le ticket</h2>
        <p className="kanban-modal__desc">
          Ce ticket a été clôturé. Quelle action voulez-vous faire ?
        </p>
        {!showPercent ? (
          <div className="kanban-modal__actions">
            <button type="button" onClick={onCancelCost} className="kanban-modal__btn kanban-modal__btn--danger">Annuler</button>
            <button type="button" onClick={() => setShowPercent(true)} className="kanban-modal__btn kanban-modal__btn--confirm">Réouverture</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="kanban-modal__field">
              Pourcentage du dernier coût de clôture
              <input type="number" min="0" step="0.01" value={percent} onChange={e => setPercent(e.target.value)} placeholder="ex. 10" autoFocus required />
            </label>
            <div className="kanban-modal__actions">
              <button type="button" onClick={() => setShowPercent(false)} className="kanban-modal__btn kanban-modal__btn--cancel">Retour</button>
              <button type="submit" disabled={!percent} className="kanban-modal__btn kanban-modal__btn--confirm">Confirmer</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- **Reçoit** (props) : `onClose` (ferme sans rien faire — clic sur le
  backdrop), `onCancelCost` (bouton "Annuler"), `onReopenPercent` (soumission
  du formulaire de pourcentage).
- **État local** :
  - `showPercent` (booléen) : `false` = affiche les 2 boutons "Annuler" /
    "Réouverture" ; `true` = affiche le formulaire de pourcentage.
  - `percent` : la valeur saisie (chaîne, ex. `"10"`).
- **Modale "à étapes"** : `{!showPercent ? (...2 boutons...) : (...formulaire...)}`
  — un seul composant qui change complètement d'apparence selon `showPercent`,
  sans démonter/remonter (le composant reste le même, seul le JSX rendu
  change).
- Bouton **"Annuler"** (`onCancelCost`) : appelle directement le callback —
  pas d'étape intermédiaire, l'action est immédiate.
- Bouton **"Réouverture"** (`() => setShowPercent(true)`) : ne fait
  qu'**afficher le formulaire** — l'action réelle n'a lieu qu'à la soumission.
- Dans le formulaire :
  - Bouton **"Retour"** (`() => setShowPercent(false)`) : revient aux 2
    boutons sans fermer la modale (`type="button"`, donc ne soumet pas le
    `<form>`).
  - `handleSubmit` : `if (percent) onReopenPercent(percent)` — `percent` est
    encore une **chaîne** ici ; la conversion (`parseFloat`) se fait côté
    serveur.
- `disabled={!percent}` : le bouton "Confirmer" est désactivé tant que le
  champ est vide — évite d'envoyer une réouverture sans pourcentage.

> **Bugs corrigés sur ce composant** :
> - Les classes CSS utilisaient un simple `_` (`kanban-modal_btn`) alors que
>   `KanbanPage.css` définit des classes BEM en double `_`
>   (`kanban-modal__btn`) — la modale s'affichait donc **sans aucun style**.
>   Toujours vérifier que les classes JSX correspondent **exactement** (y
>   compris le nombre de `_`) à celles du fichier `.css`.
> - `autofocus` (minuscule, attribut HTML) ne fonctionne pas en JSX — il faut
>   `autoFocus` (camelCase, comme tous les attributs React).

### `DetailModal({ ticketId, onClose })` — [KanbanPage.jsx:127-179](../../src/pages/frontoffice/KanbanPage.jsx#L127-L179)

```jsx
function DetailModal({ ticketId, onClose }) {
  const [ticket,  setTicket]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    fetch(`http://localhost:3001/api/backoffice/tickets/${ticketId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setTicket(data.ticket)
        else { console.error('Détail ticket :', data.error); setError(true) }
      })
      .catch(err => { console.error('Détail ticket :', err.message); setError(true) })
      .finally(() => setLoading(false))
  }, [ticketId])

  return (
    <div className="kanban-modal-backdrop" onClick={onClose}>
      <div className="kanban-modal kanban-modal--wide" onClick={e => e.stopPropagation()}>
        <button className="kanban-modal__close" onClick={onClose} aria-label="Fermer">✕</button>
        {loading && <p>Chargement…</p>}
        {error   && <p className="kanban-modal__error">Impossible de charger ce ticket.</p>}
        {ticket && (/* affichage du détail */)}
      </div>
    </div>
  )
}
```

- **Reçoit** (props) : `ticketId` (l'id à afficher) et `onClose`.
- **`useEffect(..., [ticketId])`** : se déclenche au montage **et** chaque
  fois que `ticketId` change. Comme React **détruit et recrée** ce composant
  à chaque ouverture (`{detailTicketId !== null && <DetailModal ticketId={detailTicketId} .../>}`),
  ce `useEffect` s'exécute donc "au montage" à chaque ouverture de modale — pas
  besoin de logique de rechargement supplémentaire.
- Appelle `GET /api/backoffice/tickets/:id` — **réutilise la route Backoffice**
  de fiche détail (même `getTicketDetail`, voir
  [07-gestion-tickets.md](07-gestion-tickets.md)) bien qu'on soit dans une
  page FrontOffice : la route ne fait aucune vérification de droits
  spécifique ici.
- `finally(() => setLoading(false))` : s'exécute dans tous les cas (succès,
  erreur applicative `data.ok === false`, ou exception réseau).
- Affichage : `loading` → "Chargement…", `error` → message d'erreur, `ticket`
  → nom, métadonnées (type/statut/priorité/date), description, et la liste
  des éléments associés (`ticket.items`).
- `aria-label="Fermer"` sur le bouton `✕` : accessibilité — un lecteur d'écran
  annonce "Fermer" plutôt que de lire le caractère `✕`.

---

## Fonctionnement détaillé — les handlers qui pilotent `ReopenModal`

### `handleReopenCancelCost()` — [KanbanPage.jsx:332-351](../../src/pages/frontoffice/KanbanPage.jsx#L332-L351)

```js
async function handleReopenCancelCost() {
  const { ticketId } = reopenTarget
  setReopenTarget(null)
  setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: 2 } : t))
  try {
    const r = await fetch(`http://localhost:3001/api/frontoffice/kanban-tickets/${ticketId}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 2, cancelLastCost: true })
    })
    const data = await r.json().catch(() => ({}))
    if (!data.ok) { console.error('Échec réouverture ticket :', data.error); reloadTickets() }
  } catch (err) {
    console.error('Échec réouverture ticket :', err.message)
    reloadTickets()
  }
}
```

- **Reçoit** : rien — lit `reopenTarget` (état du composant parent, défini par
  `handleDrop` quand un ticket Clos est déposé dans "In progress").
- `const { ticketId } = reopenTarget` : déstructure l'objet `{ ticketId }`.
- `setReopenTarget(null)` : ferme la modale **immédiatement** (avant même la
  requête réseau).
- `setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: 2 } : t))` :
  mise à jour optimiste — le ticket repasse visuellement en "In progress"
  (statut `2`) tout de suite.
- `fetch(..., { body: JSON.stringify({ status: 2, cancelLastCost: true }) })` :
  envoie `status: 2` (changement de statut simple) **et** `cancelLastCost: true`
  — le serveur interprète ce flag pour supprimer le dernier coût de clôture
  (voir [02-sqlite.md](02-sqlite.md) et [06-express-routes.md](06-express-routes.md)).
- Gestion d'erreur identique à `patchStatus` : `reloadTickets()` en cas
  d'échec applicatif ou réseau.

### `handleReopenWithPercent(percent)` — [KanbanPage.jsx:353-372](../../src/pages/frontoffice/KanbanPage.jsx#L353-L372)

```js
async function handleReopenWithPercent(percent) {
  const { ticketId } = reopenTarget
  setReopenTarget(null)
  setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: 2 } : t))
  try {
    const r = await fetch(`http://localhost:3001/api/frontoffice/kanban-tickets/${ticketId}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 2, reopenPercent: percent })
    })
    const data = await r.json().catch(() => ({}))
    if (!data.ok) { console.error('Échec réouverture ticket :', data.error); reloadTickets() }
  } catch (err) {
    console.error('Échec réouverture ticket :', err.message)
    reloadTickets()
  }
}
```

- **Reçoit** : `percent` — la chaîne saisie dans `ReopenModal` (ex. `"10"`),
  transmise par `onReopenPercent(percent)`.
- Structure **identique** à `handleReopenCancelCost`, sauf le corps de la
  requête : `{ status: 2, reopenPercent: percent }` — le serveur calcule alors
  le montant de réouverture à partir du dernier coût de clôture et de ce
  pourcentage (voir [02-sqlite.md](02-sqlite.md), bloc `reopenPercent`).
- `percent` reste une **chaîne** dans `JSON.stringify` — le serveur fait
  `parseFloat(reopenPercent)` avant de l'utiliser dans un calcul.

### `handleSolveConfirm(solutionText, { actiontime, costTime, cost })` — [KanbanPage.jsx:311-330](../../src/pages/frontoffice/KanbanPage.jsx#L311-L330)

```js
async function handleSolveConfirm(solutionText, { actiontime, costTime, cost }) {
  const { ticketId } = solveTarget
  setSolveTarget(null)
  setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: 6 } : t))
  try {
    const r = await fetch(`http://localhost:3001/api/frontoffice/kanban-tickets/${ticketId}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 6, solution: solutionText, actiontime, costTime, cost })
    })
    const data = await r.json().catch(() => ({}))
    if (!data.ok) { console.error('Échec résolution ticket :', data.error); reloadTickets() }
  } catch (err) {
    console.error('Échec résolution ticket :', err.message)
    reloadTickets()
  }
}
```

- **Reçoit** : `solutionText` (chaîne, texte de la solution) et un objet
  `{ actiontime, costTime, cost }` — exactement ce que `SolveModal.onConfirm`
  transmet.
- Même structure : ferme la modale, met à jour `status: 6` (Clos)
  optimistiquement, puis `PATCH` avec `status: 6` + `solution` + les 3 champs
  de coût — le serveur crée une `ITILSolution`, force le statut à 6, **et**
  insère une ligne `ticket_costs` de type `'cloture'` si un montant a été
  saisi (voir [06-express-routes.md](06-express-routes.md)).

---

## À retenir pour coder à la main

- `onClick={e => e.stopPropagation()}` sur le panneau intérieur : **toujours**
  nécessaire si le backdrop a un `onClick` qui ferme la modale.
- Affichage conditionnel `{condition && <Composant />}` : si `condition` est
  `null`/`undefined`/`false`/`0`/`''`, React n'affiche rien — et le composant
  est **démonté** (son état local est perdu, donc réinitialisé à la prochaine
  ouverture).
- Une modale "à étapes" (ex. d'abord 2 boutons, puis un formulaire) = un
  `useState` booléen (`showPercent`) qui bascule l'affichage `? ... : ...`.
- Les classes CSS doivent **correspondre exactement** à celles définies dans le
  `.css` (attention `kanban-modal__btn` avec double `_` vs `kanban-modal_btn`
  avec un seul).
- Toujours fermer la modale (`setXxxTarget(null)`) **avant** la requête réseau
  — l'utilisateur ne doit pas attendre la réponse serveur pour voir la modale
  se fermer.
- Les valeurs venant d'`<input type="number">` sont des **chaînes** côté
  JSX/état React — la conversion (`parseFloat`/`parseInt`) se fait côté
  serveur, pas dans la modale.
