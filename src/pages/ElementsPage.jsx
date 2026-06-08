import { useState } from 'react'
import { Link } from 'react-router-dom'

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

function ElementsPage() {
  const token = localStorage.getItem('access_token')

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
      setError({ message: err.message, detail: err.glpi ?? null })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <p><Link to="/">← Retour au tableau de bord</Link></p>
      <h1>Éléments</h1>
      <p>Recherche en direct dans GLPI — combinez plusieurs critères pour affiner les résultats.</p>

      <form onSubmit={handleSearch} style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label>
            Type d'élément {' '}
            <select value={itemtype} onChange={e => setItemtype(e.target.value)}>
              {ELEMENT_TYPES.map(({ itemtype: type, label }) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {SEARCH_FIELDS.map(({ field, label }) => (
            <label key={field} style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
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

        <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {error && (
        <pre style={{ background: '#fee', padding: '1rem', overflowX: 'auto', marginTop: '1rem' }}>
          {JSON.stringify(error.detail ?? error.message, null, 2)}
        </pre>
      )}

      {results && results.length === 0 && <p style={{ marginTop: '1rem' }}>Aucun élément ne correspond à ces critères.</p>}

      {results && results.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: '0.5rem' }}>Nom</th>
              <th style={{ padding: '0.5rem' }}>Statut</th>
              <th style={{ padding: '0.5rem' }}>Emplacement</th>
              <th style={{ padding: '0.5rem' }}>Fabricant</th>
              <th style={{ padding: '0.5rem' }}>N° de série</th>
            </tr>
          </thead>
          <tbody>
            {results.map(element => (
              <tr key={element.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{element.name}</td>
                <td style={{ padding: '0.5rem' }}>{cellValue(element.status)}</td>
                <td style={{ padding: '0.5rem' }}>{cellValue(element.location)}</td>
                <td style={{ padding: '0.5rem' }}>{cellValue(element.manufacturer)}</td>
                <td style={{ padding: '0.5rem' }}>{element.serial ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default ElementsPage
