import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './ElementsPage.css'

// Mêmes types et libellés que le Dashboard Backoffice (server/dashboardData.js)
// — ce sont les seuls types d'éléments ("assets") gérés par ce projet.
const ELEMENT_TYPES = [
  { itemtype: 'Computer',         label: 'Ordinateurs' },
  { itemtype: 'Monitor',          label: 'Écrans' },
  { itemtype: 'NetworkEquipment', label: 'Équipements réseau' },
  { itemtype: 'Peripheral',       label: 'Périphériques' },
  { itemtype: 'Phone',            label: 'Téléphones' },
  { itemtype: 'Printer',          label: 'Imprimantes' }
]

// Les critères de recherche correspondent à des champs RÉELS de la réponse GLPI
// (vérifiés en direct sur /Assets/Computer) : "name" est une simple chaîne,
// "location"/"status"/"manufacturer" sont des objets { id, name } imbriqués —
// d'où la notation pointée "location.name" pour filtrer sur leur libellé.
const SEARCH_FIELDS = [
  { field: 'name',              label: 'Nom' },
  { field: 'location.name',     label: 'Emplacement' },
  { field: 'status.name',       label: 'Statut' },
  { field: 'manufacturer.name', label: 'Fabricant' }
]

// ── Construction du filtre RSQL ────────────────────────────────────────────────
// GLPI v2 attend un paramètre "filter" au format RSQL : "champ=opérateur=valeur",
// plusieurs critères combinés par ";" (ET logique) ou "," (OU logique).
// On choisit ";" : une recherche "multicritère" doit affiner les résultats
// (ex. "nom contient PC" ET "emplacement contient Admin"), pas les élargir.
//
// Opérateur "=like=" avec des jokers "*" autour de la valeur : recherche
// "contient", plus naturelle pour un utilisateur qu'une égalité stricte.
// La valeur est entourée de guillemets doubles pour que GLPI la lise comme une
// chaîne littérale — sans ça, les "*" et les espaces casseraient la syntaxe RSQL.
// On ignore les critères laissés vides : seuls les champs renseignés filtrent.
function buildFilter(criteria) {
  const parts = []
  for (const { field } of SEARCH_FIELDS) {
    const value = criteria[field].trim()
    if (!value) continue
    const escaped = value.replace(/"/g, '\\"')   // évite de casser la chaîne RSQL si l'utilisateur tape des guillemets
    parts.push(`${field}=like="*${escaped}*"`)
  }
  return parts.join(';')
}

// "?? '—'" : tous les éléments n'ont pas forcément un statut, un emplacement ou
// un fabricant renseigné dans GLPI (objet null) — on affiche un tiret plutôt
// que de laisser une cellule vide ou "undefined".
function cellValue(nestedObject) {
  return nestedObject?.name ?? '—'
}

// onLogout : même rôle que dans DashboardPage — prévenir App que le token doit
// repasser à null, pour que la garde de route redirige bien vers /login.
function ElementsPage({ onLogout }) {
  const token    = localStorage.getItem('access_token')
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('access_token')
    onLogout()
    navigate('/login')
  }

  const [itemtype, setItemtype] = useState('Computer')

  // Un champ de saisie par critère de recherche, indexé par nom de champ GLPI.
  const [criteria, setCriteria] = useState(() =>
    Object.fromEntries(SEARCH_FIELDS.map(({ field }) => [field, '']))
  )

  const [results, setResults] = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  function updateCriterion(field, value) {
    setCriteria(current => ({ ...current, [field]: value }))
  }

  // La recherche est déclenchée par la soumission du formulaire (bouton ou
  // touche Entrée) — pas à chaque frappe, pour ne pas bombarder GLPI de requêtes.
  async function handleSearch(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResults(null)

    const filter = buildFilter(criteria)
    const params = new URLSearchParams({ limit: '50' })
    if (filter) params.set('filter', filter)

    try {
      const response = await fetch(`/api/glpi/Assets/${itemtype}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const body = await response.json().catch(() => ({ raw: response.statusText }))
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { glpi: body })
      setResults(body)
    } catch (err) {
      // Le détail technique part dans la console — l'utilisateur ne voit
      // qu'un message en texte clair (pas de JSON brut à l'écran).
      console.error('Échec de la recherche d\'éléments :', err.message, err.glpi)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout
      title="NewApp GLPI"
      navLinks={FRONTOFFICE_NAV_LINKS}
      actionLabel="Déconnexion"
      onAction={logout}
    >
    <div className="elements-page">
      <h1>Éléments</h1>
      <p className="elements-page__intro">Recherche en direct dans GLPI — combinez plusieurs critères pour affiner les résultats.</p>

      <form onSubmit={handleSearch} className="elements-page__form">
        <div className="elements-page__type">
          <label>
            Type d'élément {' '}
            <select value={itemtype} onChange={e => setItemtype(e.target.value)}>
              {ELEMENT_TYPES.map(({ itemtype: type, label }) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="elements-page__criteria">
          {SEARCH_FIELDS.map(({ field, label }) => (
            <label key={field} className="elements-page__criterion">
              {label}
              <input
                type="text"
                value={criteria[field]}
                onChange={e => updateCriterion(field, e.target.value)}
                placeholder={`Filtrer par ${label.toLowerCase()}…`}
              />
            </label>
          ))}
        </div>

        <button type="submit" disabled={loading} className="elements-page__submit">
          {loading ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {error && (
        <p className="elements-page__error">
          La recherche a échoué. Vérifiez vos critères et réessayez.
        </p>
      )}

      {results && results.length === 0 && <p className="elements-page__empty">Aucun élément ne correspond à ces critères.</p>}

      {results && results.length > 0 && (
        <table className="elements-page__table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Statut</th>
              <th>Emplacement</th>
              <th>Fabricant</th>
              <th>N° de série</th>
            </tr>
          </thead>
          <tbody>
            {results.map(element => (
              <tr key={element.id}>
                <td>{element.name}</td>
                <td>{cellValue(element.status)}</td>
                <td>{cellValue(element.location)}</td>
                <td>{cellValue(element.manufacturer)}</td>
                <td>{element.serial ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </Layout>
  )
}

export default ElementsPage
