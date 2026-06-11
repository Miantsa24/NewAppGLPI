import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import { ASSET_TYPES } from '../../../shared/assetTypes.js'
import './ElementsPage.css'

// "type"       : 'text' = saisie libre, 'select' = liste déroulante peuplée depuis GLPI.
// "queryParam" : nom du paramètre envoyé au backend (/api/frontoffice/elements?name=PC...).
// "refKey"     : clé dans l'objet "refs" pour les options des listes déroulantes.
const SEARCH_FIELDS = [
  { field: 'name',              label: 'Nom',         type: 'text',   queryParam: 'name' },
  { field: 'location.name',     label: 'Emplacement', type: 'select', queryParam: 'location',     refKey: 'locations' },
  { field: 'status.name',       label: 'Statut',      type: 'select', queryParam: 'status',       refKey: 'states' },
  { field: 'manufacturer.name', label: 'Fabricant',   type: 'select', queryParam: 'manufacturer', refKey: 'manufacturers' }
]

function cellValue(nestedObject) {
  return nestedObject?.name ?? '—'
}

// ── Construction des paramètres de requête ─────────────────────────────────────
// Chaque critère non vide devient un paramètre de l'URL :
//   name=PC            → filtre "contient" appliqué côté serveur
//   location=Bureau    → correspondance exacte (valeur issue de la liste déroulante)
// Le backend /api/frontoffice/elements gère le filtrage en JavaScript (session v1,
// pas de token utilisateur requis — contrairement au proxy v2 qui exigeait un login).
function buildParams(itemtype, criteria) {
  const params = new URLSearchParams({ itemtype })
  for (const { field, queryParam } of SEARCH_FIELDS) {
    const value = criteria[field].trim()
    if (value) params.set(queryParam, value)
  }
  return params
}

function ElementsPage() {
  const [itemtype,  setItemtype]  = useState('Computer')

  const [criteria, setCriteria] = useState(() =>
    Object.fromEntries(SEARCH_FIELDS.map(({ field }) => [field, '']))
  )

  const [results, setResults] = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  // Données de référence pour les listes déroulantes : chargées une seule fois
  // au montage depuis le backend (session v1 serveur, pas de token requis).
  const [refs,        setRefs]        = useState({ locations: [], states: [], manufacturers: [] })
  const [refsLoading, setRefsLoading] = useState(true)

  useEffect(() => {
    fetch('http://localhost:3001/api/frontoffice/search-refs')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setRefs({
          locations:     data.locations,
          states:        data.states,
          manufacturers: data.manufacturers
        })
      })
      .catch(err => console.error('Chargement des références :', err.message))
      .finally(() => setRefsLoading(false))
  }, [])

  function updateCriterion(field, value) {
    setCriteria(current => ({ ...current, [field]: value }))
  }

  // Auto-recherche : 400 ms de debounce pour le champ Nom (texte libre).
  // Pour les listes déroulantes, le résultat est immédiat dès la sélection.
  // Si tous les critères sont vides → réinitialise sans lancer de requête.
  useEffect(() => {
    const hasAnyCriterion = SEARCH_FIELDS.some(({ field }) => criteria[field].trim())
    if (!hasAnyCriterion) {
      setResults(null)
      setError(null)
      return
    }

    const params = buildParams(itemtype, criteria)

    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`http://localhost:3001/api/frontoffice/elements?${params}`)
        const data = await response.json().catch(() => ({}))
        if (!data.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
        setResults(data.items)
      } catch (err) {
        console.error('Échec de la recherche d\'éléments :', err.message)
        setError(true)
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [criteria, itemtype])

  // Soumission manuelle (bouton ou Entrée) — exécution immédiate sans debounce.
  async function handleSearch(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResults(null)

    const params = buildParams(itemtype, criteria)

    try {
      const response = await fetch(`http://localhost:3001/api/frontoffice/elements?${params}`)
      const data = await response.json().catch(() => ({}))
      if (!data.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setResults(data.items)
    } catch (err) {
      console.error('Échec de la recherche d\'éléments :', err.message)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout
      title="NewApp GLPI"
      navLinks={FRONTOFFICE_NAV_LINKS}
    >
    <div className="elements-page">
      <header className="elements-page__header">
        <h1>Éléments</h1>
        <p className="elements-page__intro">
          Recherche en direct dans GLPI — utilisez un seul critère ou combinez-les.
          Les résultats s'affichent automatiquement.
        </p>
      </header>

      <form onSubmit={handleSearch} className="elements-page__form">
        <div className="elements-page__type">
          <label className="elements-page__criterion">
            Type d'élément
            <select value={itemtype} onChange={e => setItemtype(e.target.value)}>
              {ASSET_TYPES.map(({ itemtype: type, label }) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="elements-page__criteria">
          {SEARCH_FIELDS.map(({ field, label, type: fieldType, refKey }) => (
            <label key={field} className="elements-page__criterion">
              {label}
              {fieldType === 'select' ? (
                // Liste déroulante : options chargées depuis GLPI au montage.
                // "Tous" (valeur '') = aucun filtre appliqué pour ce critère.
                <select
                  value={criteria[field]}
                  onChange={e => updateCriterion(field, e.target.value)}
                  disabled={refsLoading}
                >
                  <option value="">Tous</option>
                  {(refs[refKey] ?? []).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={criteria[field]}
                  onChange={e => updateCriterion(field, e.target.value)}
                  placeholder={`Filtrer par ${label.toLowerCase()}…`}
                />
              )}
            </label>
          ))}
        </div>

        <div className="elements-page__form-footer">
          <button type="submit" disabled={loading} className="elements-page__submit">
            {loading ? 'Recherche…' : 'Rechercher'}
          </button>
        </div>
      </form>

      {error && (
        <p className="elements-page__error">
          La recherche a échoué. Vérifiez votre connexion au serveur et réessayez.
        </p>
      )}

      {results && results.length === 0 && (
        <p className="elements-page__empty">Aucun élément ne correspond à ces critères.</p>
      )}

      {results && results.length > 0 && (
        <div className="elements-page__results">
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
        </div>
      )}
    </div>
    </Layout>
  )
}

export default ElementsPage
