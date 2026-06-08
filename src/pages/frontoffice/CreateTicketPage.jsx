import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './CreateTicketPage.css'

// Mêmes types d'éléments que la page de recherche (ElementsPage) — ce sont les
// seuls types d'"assets" gérés par ce projet, et donc les seuls associables.
const ELEMENT_TYPES = [
  { itemtype: 'Computer',         label: 'Ordinateurs' },
  { itemtype: 'Monitor',          label: 'Écrans' },
  { itemtype: 'NetworkEquipment', label: 'Équipements réseau' },
  { itemtype: 'Peripheral',       label: 'Périphériques' },
  { itemtype: 'Phone',            label: 'Téléphones' },
  { itemtype: 'Printer',          label: 'Imprimantes' }
]

// Codes "type" et "urgency" du Ticket GLPI (mêmes valeurs que celles vérifiées
// en Phase 2 pour le type ; l'urgence suit l'échelle standard à 5 niveaux de
// GLPI — vérifiée sur un ticket existant : urgency=3 → "Moyenne").
const TICKET_TYPES = [
  { value: 1, label: 'Incident' },
  { value: 2, label: 'Demande' }
]
const URGENCY_LEVELS = [
  { value: 1, label: 'Très faible' },
  { value: 2, label: 'Faible' },
  { value: 3, label: 'Moyenne' },
  { value: 4, label: 'Haute' },
  { value: 5, label: 'Très haute' }
]

// Clé unique d'un élément, indépendante de son type GLPI — sert à éviter les
// doublons dans le "panier" (un Computer #46 et un Monitor #46 sont différents).
function itemKey(item) {
  return `${item.itemtype}#${item.items_id}`
}

// onLogout : même rôle que dans DashboardPage — prévenir App que le token doit
// repasser à null, pour que la garde de route redirige bien vers /login.
function CreateTicketPage({ onLogout }) {
  const token    = localStorage.getItem('access_token')
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('access_token')
    onLogout()
    navigate('/login')
  }

  // ── Champs du formulaire de ticket ──────────────────────────────────────────
  const [name,    setName]    = useState('')
  const [content, setContent] = useState('')
  const [type,    setType]    = useState(1)
  const [urgency, setUrgency] = useState(3)

  // ── Recherche d'éléments à associer ─────────────────────────────────────────
  const [searchType, setSearchType] = useState('Computer')
  const [searchName, setSearchName] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching,     setSearching]     = useState(false)

  // "Panier" des éléments sélectionnés — un simple tableau d'objets
  // { itemtype, items_id, name } : tout ce qu'il faut pour l'affichage ET pour
  // construire le corps de la requête de création.
  const [selectedItems, setSelectedItems] = useState([])

  // ── Soumission ───────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Recherche par nom (recherche "contient", même principe RSQL que ElementsPage,
  // mais simplifiée à un seul critère — ici on cherche QUOI associer, pas une
  // exploration multicritère du parc).
  async function handleSearch(event) {
    event.preventDefault()
    setSearching(true)
    setSearchResults(null)

    const params = new URLSearchParams({ limit: '20' })
    const trimmed = searchName.trim()
    if (trimmed) {
      const escaped = trimmed.replace(/"/g, '\\"')
      params.set('filter', `name=like="*${escaped}*"`)
    }

    try {
      const response = await fetch(`/api/glpi/Assets/${searchType}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const body = await response.json()
      setSearchResults(response.ok ? body : [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  function addItem(element) {
    const candidate = { itemtype: searchType, items_id: element.id, name: element.name }
    setSelectedItems(current =>
      current.some(item => itemKey(item) === itemKey(candidate))
        ? current                          // déjà présent : on ne duplique pas
        : [...current, candidate]
    )
  }

  function removeItem(item) {
    setSelectedItems(current => current.filter(i => itemKey(i) !== itemKey(item)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch('/api/frontoffice/tickets', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name, content, type, urgency,
          items: selectedItems.map(({ itemtype, items_id }) => ({ itemtype, items_id }))
        })
      })
      const data = await response.json()
      if (!data.ok) {
        // Le détail technique part dans la console — l'utilisateur ne voit
        // qu'un message en texte clair (pas de JSON brut à l'écran).
        console.error('Échec de la création du ticket :', data.error)
        throw new Error('La création du ticket a échoué. Vérifiez les champs et réessayez.')
      }

      // Ticket créé : direction la fiche détail pour voir le résultat (la même
      // page que celle du Backoffice fonctionnerait aussi, mais on reste dans
      // le périmètre FrontOffice — on revient simplement au tableau de bord).
      navigate('/')
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout
      title="NewApp GLPI"
      navLinks={FRONTOFFICE_NAV_LINKS}
      actionLabel="Déconnexion"
      onAction={logout}
    >
    <div className="create-ticket-page">
      <h1>Créer un ticket</h1>

      <form onSubmit={handleSubmit}>
        <div className="create-ticket-page__field">
          <label>
            Titre
            <input type="text" value={name} onChange={e => setName(e.target.value)} required />
          </label>
        </div>

        <div className="create-ticket-page__field">
          <label>
            Description
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} required />
          </label>
        </div>

        <div className="create-ticket-page__row">
          <label>
            Type {' '}
            <select value={type} onChange={e => setType(Number(e.target.value))}>
              {TICKET_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Urgence {' '}
            <select value={urgency} onChange={e => setUrgency(Number(e.target.value))}>
              {URGENCY_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {/* ── Association d'éléments ──────────────────────────────────────────── */}
        <section className="create-ticket-page__items">
          <h2>Éléments concernés</h2>
          <p className="create-ticket-page__items-intro">Recherchez et ajoutez un ou plusieurs éléments concernés par ce ticket.</p>

          <div className="create-ticket-page__search-row">
            <label>
              Type d'élément
              <select value={searchType} onChange={e => setSearchType(e.target.value)}>
                {ELEMENT_TYPES.map(({ itemtype, label }) => <option key={itemtype} value={itemtype}>{label}</option>)}
              </select>
            </label>
            <label>
              Nom
              <input type="text" value={searchName} onChange={e => setSearchName(e.target.value)} placeholder="Rechercher par nom…" />
            </label>
            <button type="button" onClick={handleSearch} disabled={searching} className="create-ticket-page__btn">
              {searching ? 'Recherche…' : 'Rechercher'}
            </button>
          </div>

          {searchResults && searchResults.length === 0 && <p>Aucun résultat.</p>}

          {searchResults && searchResults.length > 0 && (
            <ul className="create-ticket-page__list">
              {searchResults.map(element => {
                const already = selectedItems.some(i => itemKey(i) === itemKey({ itemtype: searchType, items_id: element.id }))
                return (
                  <li key={element.id} className="create-ticket-page__list-item">
                    <span>{element.name}</span>
                    <button type="button" onClick={() => addItem(element)} disabled={already} className="create-ticket-page__add-btn">
                      {already ? 'Déjà ajouté' : 'Ajouter'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <h3>Éléments sélectionnés ({selectedItems.length})</h3>
          {selectedItems.length === 0 ? (
            <p>Aucun élément sélectionné pour l'instant.</p>
          ) : (
            <ul className="create-ticket-page__list">
              {selectedItems.map(item => (
                <li key={itemKey(item)} className="create-ticket-page__list-item">
                  <span>{item.name} <em>({item.itemtype})</em></span>
                  <button type="button" onClick={() => removeItem(item)} className="create-ticket-page__remove-btn">
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {submitError && (
          <p className="create-ticket-page__error">{submitError}</p>
        )}

        <button type="submit" disabled={submitting} className="create-ticket-page__submit">
          {submitting ? 'Création…' : 'Créer le ticket'}
        </button>
      </form>
    </div>
    </Layout>
  )
}

export default CreateTicketPage
