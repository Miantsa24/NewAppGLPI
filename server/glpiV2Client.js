// ── Client API GLPI v2 (repli pour les itemtypes absents de la v1) ───────────────
//
// Pourquoi un troisième client, alors qu'on a déjà v1 (glpiV1Client) et le proxy
// v2 OAuth2 (utilisé par le FrontOffice connecté) ?
// → Certains itemtypes récents (ex. "Socket") ne sont PAS exposés par l'API v1
//   (réponse "ERROR_RESOURCE_NOT_FOUND_NOR_COMMONDBTM") mais LE SONT par la v2,
//   sous "/Assets/<Type>" (vérifié via /api.php/v2.3/doc.json).
// → La v2 exige un access_token OAuth2 lié à un VRAI utilisateur (la v1 fonctionne
//   sans utilisateur via App-Token + user_token, mais la v2 n'accepte pas les
//   tokens "client_credentials" sur ses endpoints de ressources — testé, 401
//   ERROR_UNAUTHENTICATED). On utilise donc le grant "password" avec un compte de
//   service (GLPI_SERVICE_USERNAME/PASSWORD), via le même client OAuth2 que
//   /api/auth/login (déjà autorisé pour ce grant).
//
// Ce client ne couvre QUE le strict nécessaire : créer/supprimer un item sous
// "/Assets/<Type>" — utilisé en repli par importPipeline quand la v1 échoue.

import axios from 'axios'

const API_URL   = process.env.GLPI_API_URL // http://glpi.localhost/api.php/v2.3
const BASE_URL  = process.env.GLPI_BASE_URL
const CLIENT_ID     = process.env.GLPI_CLIENT_ID
const CLIENT_SECRET = process.env.GLPI_CLIENT_SECRET
const SERVICE_USERNAME = process.env.GLPI_SERVICE_USERNAME
const SERVICE_PASSWORD = process.env.GLPI_SERVICE_PASSWORD

// Cache mémoire du token : un access_token v2 dure 3600s (voir réponse de
// /api.php/token). On le réutilise tant qu'il n'est pas expiré, pour éviter une
// authentification complète à chaque item créé/supprimé pendant un import.
let cachedToken = null
let cachedTokenExpiresAt = 0

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken

  const response = await axios.post(
    `${BASE_URL}/api.php/token`,
    new URLSearchParams({
      grant_type:    'password',
      username:      SERVICE_USERNAME,
      password:      SERVICE_PASSWORD,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         'api'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  cachedToken = response.data.access_token
  // Marge de 60s pour ne jamais utiliser un token tout juste expiré.
  cachedTokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000
  return cachedToken
}

async function authHeaders() {
  const token = await getAccessToken()
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

// Crée un item via "/Assets/<itemtype>" et retourne son id.
// "fields" est déjà au format v2 (ex. { name, location: { id } }), contrairement
// à la v1 qui attend des clés plates ("locations_id").
export async function createItem(itemtype, fields) {
  const headers = await authHeaders()
  const response = await axios.post(`${API_URL}/Assets/${itemtype}`, fields, {
    headers: { ...headers, 'Content-Type': 'application/json' }
  })
  return response.data.id
}

// Supprime définitivement un item créé via createItem ci-dessus — utilisé par la
// Réinitialisation pour les items que la v1 ne sait ni créer ni supprimer.
export async function deleteItem(itemtype, id) {
  const headers = await authHeaders()
  await axios.delete(`${API_URL}/Assets/${itemtype}/${id}`, {
    headers,
    params: { force: true }
  })
}

// Compte le nombre total d'items d'un type — même principe que countItems en v1
// (le total est lu dans l'en-tête "Content-Range": "0-0/TOTAL"), pour les
// itemtypes que la v1 n'expose pas (utilisé par le Dashboard).
export async function countItems(itemtype) {
  const headers = await authHeaders()
  const response = await axios.get(`${API_URL}/Assets/${itemtype}`, {
    headers,
    params: { limit: 1 }
  })
  const contentRange = response.headers['content-range'] // "0-0/9"
  return contentRange ? parseInt(contentRange.split('/')[1], 10) : response.data.length
}

// Certains itemtypes récents (ex. "Socket") ne sont PAS exposés par l'API v1 —
// elle répond ce code d'erreur précis plutôt qu'une erreur de validation.
// Sert à détecter quand basculer sur le repli v2 ci-dessus.
export function isUnsupportedInV1(err) {
  return err.response?.data?.[0] === 'ERROR_RESOURCE_NOT_FOUND_NOR_COMMONDBTM'
}
