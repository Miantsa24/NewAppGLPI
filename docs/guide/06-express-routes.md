# 6. Express — routes API & middlewares

[← Retour au sommaire](README.md)

## Façon de faire

Toute route qui parle à GLPI ou à la base suit le même squelette :

```js
app.METHODE('/api/chemin/:param', async (req, res) => {
  try {
    // ... logique, accès req.params / req.body ...
    res.json({ ok: true, ...données })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[contexte] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  }
})
```

- `{ ok: true/false, ... }` : convention du projet pour que le frontend sache
  si la requête a réussi sans avoir à interpréter le code HTTP.
- `err.response?.data ?? err.message` : `axios` met l'erreur HTTP renvoyée par
  GLPI dans `err.response.data` ; si l'erreur vient d'ailleurs (ex. réseau),
  on retombe sur `err.message`. Le `?.` (optional chaining) évite un crash si
  `err.response` n'existe pas.

---

## Fonctionnement détaillé, fonction par fonction

### `requireBackofficeCode(req, res, next)` — [server/index.js:57-63](../../server/index.js#L57-L63)

```js
function requireBackofficeCode(req, res, next) {
  const code = req.get('X-Backoffice-Code')
  if (!code || code !== process.env.BACKOFFICE_CODE) {
    return res.status(401).json({ ok: false, error: 'Code backoffice requis ou invalide' })
  }
  next()
}

// utilisation : insérer le middleware avant le handler
app.post('/api/backoffice/costs', requireBackofficeCode, async (req, res) => { ... })
```

- **Reçoit** : les trois paramètres standards d'un middleware Express —
  `req` (la requête), `res` (la réponse), `next` (fonction à appeler pour
  passer au handler suivant).
- `req.get('X-Backoffice-Code')` : lit l'en-tête HTTP `X-Backoffice-Code`,
  envoyé par le frontend via `backofficeFetch` (voir
  [src/pages/backoffice/api.js](../../src/pages/backoffice/api.js)).
- `if (!code || code !== process.env.BACKOFFICE_CODE)` : deux cas rejetés —
  en-tête absent (`!code`) OU valeur incorrecte. `process.env.BACKOFFICE_CODE`
  est lu depuis `.env` (chargé par `import 'dotenv/config'` en haut de
  `index.js`).
- `return res.status(401).json({ ok: false, error: '...' })` : **le `return`
  est essentiel** — sans lui, l'exécution continuerait après le `if` et
  appellerait `next()` quand même, donnant accès au handler malgré un code
  invalide.
- `next()` : appelé uniquement si le code est valide — "tout est bon, passe au
  handler suivant" (celui défini après ce middleware dans
  `app.post(url, requireBackofficeCode, handler)`).
- **Renvoie** : rien directement — soit une réponse HTTP 401 (cas refusé),
  soit l'exécution du handler suivant (cas accepté).

---

## La route la plus complexe : changement de statut Kanban

### `PATCH /api/frontoffice/kanban-tickets/:id/status` — [server/index.js:424-485](../../server/index.js#L424-L485)

C'est cette route qui gère **tous** les changements de statut depuis le
Kanban : passage simple (Nouveau ↔ In progress), clôture (→ Terminé), et
réouverture (Terminé → In progress, avec annulation ou pourcentage). Décodage
complet, étape par étape.

```js
app.patch('/api/frontoffice/kanban-tickets/:id/status', async (req, res) => {
  const ticketId = req.params.id
  const { status, solution, cost, costTime, actiontime, cancelLastCost, reopenPercent } = req.body

  if (!status) return res.status(400).json({ ok: false, error: 'status requis' })

  const sessionToken = await glpiV1.openSession()
  try {
    if (status === 6) {
      // ... clôture ...
    } else {
      // ... changement simple, ou réouverture ...
    }
    res.json({ ok: true })
  } catch (err) {
    const glpiError = err.response?.data ?? err.message
    console.error('[kanban status] Erreur :', JSON.stringify(glpiError, null, 2))
    res.status(500).json({ ok: false, error: glpiError })
  } finally {
    await glpiV1.closeSession(sessionToken)
  }
})
```

#### Entrée

- `req.params.id` : l'id du ticket, depuis l'URL (`:id`).
- `req.body` : déstructuré en 7 champs — tous **optionnels sauf `status`** :
  - `status` : `1`, `2` ou `6` (Nouveau / In progress / Clos).
  - `solution` : texte de la solution (utilisé seulement si `status === 6`).
  - `cost`, `costTime`, `actiontime` : les 3 champs du "nouveau coût" saisis à
    la clôture (utilisés seulement si `status === 6`).
  - `cancelLastCost` : booléen, présent quand l'utilisateur clique "Annuler"
    dans `ReopenModal`.
  - `reopenPercent` : chaîne numérique, présente quand l'utilisateur valide le
    formulaire de pourcentage dans `ReopenModal`.
- `if (!status) return res.status(400)...` : validation minimale — `status`
  est **obligatoire**, le reste dépend du cas.

#### Branche `status === 6` (clôture) — [index.js:432-454](../../server/index.js#L432-L454)

```js
await glpiV1.createItem(sessionToken, 'ITILSolution', {
  itemtype: 'Ticket',
  items_id: Number(ticketId),
  content:  solution || '(résolu)'
})
await glpiV1.updateItem(sessionToken, 'Ticket', ticketId, { status: 6 })

const costFixed     = parseFloat(cost) || 0
const costTimeRate  = parseFloat(costTime) || 0
const actiontimeSec = parseInt(actiontime, 10) || 0
if (costFixed > 0 || costTimeRate > 0 || actiontimeSec > 0) {
  db.prepare("INSERT INTO ticket_costs (ticket_id, actiontime, cost_time, cost_fixed, type) VALUES (?, ?, ?, ?, 'cloture')")
    .run(Number(ticketId), actiontimeSec, costTimeRate, costFixed)
}
```

1. **Créer une `ITILSolution`** : en GLPI, "résoudre" un ticket passe par la
   création d'un objet `ITILSolution` lié au ticket (`itemtype: 'Ticket'`,
   `items_id: <id>`). `content: solution || '(résolu)'` : si l'utilisateur n'a
   laissé aucun texte (ne devrait pas arriver, le champ est `required` dans
   `SolveModal`), on met un texte de repli plutôt que d'envoyer une chaîne
   vide à GLPI.
2. **Forcer le statut à 6** : créer une `ITILSolution` ne suffit pas toujours
   à faire passer GLPI en statut "Clos" exactement (selon le workflow GLPI) —
   on force donc explicitement `updateItem(..., { status: 6 })`.
3. **Enregistrer le "nouveau coût"** :
   - `parseFloat(cost) || 0` : convertit la chaîne reçue en nombre ; si
     `parseFloat` renvoie `NaN` (champ vide ou non numérique), `NaN || 0`
     donne `0` (en JS, `NaN` est "falsy").
   - `if (costFixed > 0 || costTimeRate > 0 || actiontimeSec > 0)` : on
     n'insère une ligne **que si au moins un des 3 champs est non nul** — pas
     de ligne "coût = 0" inutile si l'utilisateur n'a rien saisi.
   - `INSERT INTO ticket_costs (..., type) VALUES (?, ?, ?, ?, 'cloture')` :
     **4 `?`** pour `ticket_id, actiontime, cost_time, cost_fixed`, et
     `'cloture'` écrit en dur — c'est CETTE ligne que `cancelLastCost` et
     `reopenPercent` retrouveront plus tard via
     `WHERE type = 'cloture' ORDER BY id DESC LIMIT 1` (voir
     [02-sqlite.md](02-sqlite.md)).

#### Branche `else` (changement simple, annulation, réouverture) — [index.js:455-476](../../server/index.js#L455-L476)

```js
await glpiV1.updateItem(sessionToken, 'Ticket', ticketId, { status })

if (cancelLastCost) {
  // SELECT le dernier coût 'cloture' → DELETE cette ligne
} else if (reopenPercent) {
  // SELECT le dernier coût 'cloture' → calcule reopenAmount → INSERT type='reouverture'
}
```

1. **Toujours** : `updateItem(..., { status })` — applique le nouveau statut
   reçu (`1` ou `2`) au ticket dans GLPI. C'est la **seule** action pour un
   simple drag & drop "Nouveau → In progress" (ni `cancelLastCost` ni
   `reopenPercent` ne sont alors présents dans `req.body`).
2. **Si `cancelLastCost`** (bouton "Annuler" de `ReopenModal`) : supprime la
   dernière ligne `ticket_costs` de type `'cloture'` pour ce ticket — voir le
   détail SQL dans [02-sqlite.md](02-sqlite.md).
3. **Sinon si `reopenPercent`** (bouton "Réouverture") : relit cette même
   ligne (sans la supprimer), recalcule son montant, applique le pourcentage,
   et insère une **nouvelle** ligne `type = 'reouverture'` — voir le détail
   SQL dans [02-sqlite.md](02-sqlite.md).
4. `if (...) {...} else if (...) {...}` : **un seul** des deux blocs peut
   s'exécuter — `cancelLastCost` et `reopenPercent` ne sont jamais envoyés en
   même temps par le frontend (deux boutons différents de `ReopenModal`,
   chacun n'envoie qu'un seul des deux flags).

#### Fin commune

```js
res.json({ ok: true })
} catch (err) {
  const glpiError = err.response?.data ?? err.message
  console.error('[kanban status] Erreur :', JSON.stringify(glpiError, null, 2))
  res.status(500).json({ ok: false, error: glpiError })
} finally {
  await glpiV1.closeSession(sessionToken)
}
```

- `res.json({ ok: true })` : exécuté uniquement si **aucune** des opérations
  ci-dessus n'a levé d'exception.
- `catch` : capture toute erreur (GLPI ou SQLite) et répond `500` avec
  `{ ok: false, error: ... }`.
- `finally { await glpiV1.closeSession(sessionToken) }` : la session GLPI est
  fermée **dans tous les cas** — succès ou erreur.

---

## Pourquoi v1 et pas le proxy v2 ici ? — [index.js:415-423](../../server/index.js#L415-L423)

Le commentaire au-dessus de la route explique le choix :
1. Le proxy v2 filtre les tickets selon le token de l'utilisateur connecté —
   il pourrait ne pas avoir le droit de modifier des tickets créés par
   l'import.
2. Pour passer en statut "Clos" (6), GLPI exige une `ITILSolution` ; en v1,
   `createItem` sur `ITILSolution` + `updateItem(status: 6)` couvre ce besoin
   directement.

---

## À retenir pour coder à la main

- Un middleware Express = une fonction `(req, res, next) => {...}` placée
  AVANT le handler dans `app.METHODE(url, middleware, handler)`.
- `req.params.id` (partie de l'URL `:id`) vs `req.body` (corps JSON envoyé par
  le client) vs `req.get('Header-Name')` (en-tête HTTP) — trois sources de
  données différentes, à ne pas confondre.
- `res.json({ ok: false, error: ... })` + `res.status(xxx)` : toujours
  renvoyer un statut HTTP cohérent (400 = erreur du client, 401 = non
  autorisé, 500 = erreur serveur).
- `return` avant un `res.status(...)` dans un middleware ou un handler : sans
  lui, le code continue de s'exécuter après la réponse déjà envoyée
  (potentiellement `next()` ou un second `res.json(...)`, qui provoque une
  erreur "headers already sent").
- `parseFloat(x) || 0` / `parseInt(x, 10) || 0` : pattern court pour "0 si la
  chaîne est vide ou non numérique" — fonctionne car `NaN` est "falsy" en JS.
- Une route peut avoir **plusieurs branches** (`if status === 6 / else`,
  `if cancelLastCost / else if reopenPercent`) mais garde **un seul**
  `try/catch/finally` global — la fermeture de session (`finally`) et la
  gestion d'erreur (`catch`) couvrent toutes les branches.
