// ── Authentification Backoffice côté client ────────────────────────────────────
//
// Le serveur exige désormais le code backoffice (en-tête "X-Backoffice-Code")
// pour les opérations sensibles (import, reset, ajout de coût, paramètres
// Kanban — voir requireBackofficeCode dans server/index.js). LoginPage stocke
// le code saisi (validé par /api/backoffice/login) en sessionStorage ; ces
// fonctions le relisent et l'attachent aux requêtes concernées.

const CODE_KEY = 'backoffice_code'

export function setBackofficeCode(code) {
  sessionStorage.setItem(CODE_KEY, code)
}

export function clearBackofficeSession() {
  sessionStorage.removeItem('backoffice_unlocked')
  sessionStorage.removeItem(CODE_KEY)
}

// Variante de fetch() qui ajoute l'en-tête "X-Backoffice-Code" — à utiliser pour
// toute requête vers une route protégée par requireBackofficeCode.
export function backofficeFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Backoffice-Code': sessionStorage.getItem(CODE_KEY) ?? ''
    }
  })
}
