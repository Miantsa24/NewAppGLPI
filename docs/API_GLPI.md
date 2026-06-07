# J-0 — Étape 2 : API GLPI

## 2.1 Les deux APIs de GLPI

GLPI expose deux APIs REST :

| Critère | API v1 (legacy) | API v2 (high-level) |
|---|---|---|
| **URL** | `http://glpi.localhost/api.php/v1` | `http://glpi.localhost/api.php/v2.3` |
| **Style** | REST bas niveau | REST haut niveau / plus structuré |
| **Authentification** | Session token (2 étapes) | OAuth2 standard (1 étape) |
| **Format** | JSON | JSON |
| **Granularité** | Accès table par table | Endpoints métier plus abstraits |
| **Maturité** | Stable, bien documentée | Plus récente, GLPI 10+ |
| **Flexibilité** | Très haute (accès brut aux objets) | Plus guidée, moins de liberté |

**Choix retenu pour NewApp : API v2** pour les raisons suivantes :
- OAuth2 s'intègre proprement dans React
- GraphQL disponible pour filtre et recherche
- Scopes granulaires pour contrôler les droits de NewApp
- Endpoints métier structurés pour CRUD

---

## 2.2 Fonctionnement de l'API v1 (legacy)

### Flux d'authentification
```
1. POST /api.php/v1/initSession
   → Headers: Authorization: user_token <token>
   → Réponse: { "session_token": "abc123..." }

2. Toutes les requêtes suivantes:
   → Headers: Session-Token: abc123...

3. POST /api.php/v1/killSession  (à la fin)
```

### Principaux endpoints v1
```
GET    /api.php/v1/User               → liste des utilisateurs
GET    /api.php/v1/User/2             → utilisateur id=2
POST   /api.php/v1/Ticket             → créer un ticket
PUT    /api.php/v1/Ticket/5           → modifier ticket id=5
DELETE /api.php/v1/Ticket/5           → supprimer ticket id=5
GET    /api.php/v1/search/Ticket      → recherche avancée
GET    /api.php/v1/listSearchOptions/Ticket → champs disponibles
```

Les noms d'objets dans l'URL correspondent aux noms des classes PHP GLPI (`Ticket`, `Computer`, `User`, `Entity`…).

---

## 2.3 Fonctionnement de l'API v2

### Authentification OAuth2
```
Toutes les requêtes:
→ Headers: Authorization: Bearer <access_token>
(pas de session à initier/fermer)
```

### Modules couverts par v2
```
Administration / Assets / Assistance / Components /
Custom Assets / Dropdowns / GraphQL / Inventory /
Knowledgebase / Localization / Management /
Notes / Notifications / Project / Rule / Session /
Setup / Statistics / Status / Tools
```

### Scopes disponibles
| Scope | Accès |
|---|---|
| `user` | Informations des utilisateurs |
| `api` | Accès général à l'API |
| `email` | Email des utilisateurs |
| `inventory` | Inventaire envoyé par un agent |
| `status` | Point d'entrée statut |
| `graphql` | Point d'entrée GraphQL |

---

## 2.4 Flow OAuth2 — Authorization Code

Le flow se déroule en 3 étapes :

```
Étape 1 — Redirection vers GLPI pour login
  → NewApp redirige vers /api.php/authorize
  → L'utilisateur se connecte sur GLPI
  → GLPI renvoie ?code=xxx vers le redirect_uri

Étape 2 — Échange du code contre un token
  → NewApp fait POST /api.php/token avec le code reçu
  → GLPI répond avec { access_token, refresh_token, expires_in }

Étape 3 — Appels API
  → Chaque requête porte le header: Authorization: Bearer <access_token>
```

### ⚠️ Points importants
- Le `code` est à **usage unique** et expire en quelques secondes
- Il faut enchaîner immédiatement Étape 1 → Étape 2
- Les `redirect_uri` doivent être **absolues** (ex: `http://glpi.localhost/...`) — les URIs relatives sont rejetées

---

## 2.5 Configuration du client OAuth NewApp

### Paramètres du client
```
Nom           : NewApp
Grant         : authorization_code,mot de passe, client credential
Scopes        : user, api, email,status, inventory, graphql
client_id     : 7f540689c280752e84db89dbf5cf42af418df5f79db79ddc721d029ae525f384
client_secret : 4cd6a6bb3e9666001c31ef236883de47010a2f1f8ce3b8796d488ccd21500bc1
```

### Redirect URIs enregistrées (doivent être absolues)
```
http://localhost:5173/callback
http://glpi.localhost/api.php/oauth2/redirection
http://glpi.localhost/api.php/swagger-oauth-redirect
```

### Structure BDD (table glpi_oauthclients)
```sql
identifier      → client_id OAuth (hash long, clé primaire)
name            → nom lisible du client
secret          → client_secret (hashé en BDD)
redirect_uri    → JSON array des URIs autorisées (absolues obligatoire)
grants          → JSON array des grants autorisés
scopes          → JSON array des scopes autorisés
is_active       → 1 = actif
is_confidential → 1 = client confidentiel
allowed_ips     → restriction IP (null = pas de restriction)
```

---

<!-- ## 2.6 Appels de test

### Étape 1 — Obtenir un code d'autorisation
```
GET http://glpi.localhost/api.php/authorize
  ?response_type=code
  &client_id=24e3784d34e66090d11e5f6cdf92099f57b0d0c4bb426a4e9655a4d5b8483ff2
  &redirect_uri=http://glpi.localhost/api.php/swagger-oauth-redirect
  &scope=user%20api%20email
  &state=test123
```

### Étape 2 — Échanger le code contre un access_token
```cmd
curl.exe -X POST http://glpi.localhost/api.php/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code
      &code=<CODE>
      &client_id=<CLIENT_ID>
      &client_secret=<CLIENT_SECRET>
      &redirect_uri=http://glpi.localhost/api.php/swagger-oauth-redirect"
```

Réponse attendue :
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Étape 3 — Appel API avec le token
```cmd
curl.exe -X GET http://glpi.localhost/api.php/v2.3/User \
  -H "Authorization: Bearer <access_token>"
``` -->

---

## 2.7 Leçons apprises pendant les tests

| Problème rencontré | Cause | Solution |
|---|---|---|
| `invalid_client` avec `client_id=NewApp` | GLPI utilise le hash comme `client_id`, pas le nom | Utiliser le hash `identifier` de la table `glpi_oauthclients` |
| Redirect vers `localhost:5173` échoue | NewApp n'existe pas encore | Utiliser `swagger-oauth-redirect` pour les tests |
| URIs relatives rejetées | GLPI exige des URIs absolues | Préfixer avec `http://glpi.localhost` |
| `invalid_grant` | Code expiré (usage unique, quelques secondes) | Enchaîner immédiatement étape 1 et étape 2 |
| `curl` échoue dans PowerShell | PowerShell aliase `curl` vers `Invoke-WebRequest` | Utiliser `curl.exe` ou cmd |
