import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import { ASSET_TYPES } from '../../../shared/assetTypes.js'
import './CreateTicketPage.css'

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

function itemKey(item) {
  return `${item.itemtype}#${item.items_id}`
}

function CreateTicketPage() {
  const navigate = useNavigate()

  const [name,    setName]    = useState('')
  const [content, setContent] = useState('')
  const [type,    setType]    = useState(1)
  const [urgency, setUrgency] = useState(3)

  const [searchType,    setSearchType]    = useState('Computer')
  const [searchName,    setSearchName]    = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching,     setSearching]     = useState(false)

  const [selectedItems, setSelectedItems] = useState([])

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Recherche d'éléments à associer — utilise la même route v1 que la page Éléments
  // (session serveur, pas de token utilisateur, réponse { ok, items: [{id, name, ...}] }).
  async function handleSearch(event) {
    event.preventDefault()
    setSearching(true)
    setSearchResults(null)

    const params = new URLSearchParams({ itemtype: searchType })
    const trimmed = searchName.trim()
    if (trimmed) params.set('name', trimmed)

    try {
      const response = await fetch(`http://localhost:3001/api/frontoffice/elements?${params}`)
      const data = await response.json().catch(() => ({}))
      setSearchResults(data.ok ? data.items : [])
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
        ? current
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
      // Session v1 serveur — ticket + associations journalisés pour la réinitialisation.
      const response = await fetch('/api/frontoffice/tickets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, content, type, urgency,
          items: selectedItems.map(({ itemtype, items_id }) => ({ itemtype, items_id }))
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!data.ok) {
        console.error('Échec de la création du ticket :', data.error)
        throw new Error('La création du ticket a échoué. Vérifiez les champs et réessayez.')
      }
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
    >
    <div className="create-ticket-page">
      <header className="create-ticket-page__header">
        <h1>Créer un ticket</h1>
        <p className="create-ticket-page__intro">
          Décrivez votre incident ou votre demande, puis associez les éléments concernés si besoin.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="create-ticket-page__form">
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
            Type
            <select value={type} onChange={e => setType(Number(e.target.value))}>
              {TICKET_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Urgence
            <select value={urgency} onChange={e => setUrgency(Number(e.target.value))}>
              {URGENCY_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <section className="create-ticket-page__items">
          <h2>Éléments concernés</h2>
          <p className="create-ticket-page__items-intro">Recherchez et ajoutez un ou plusieurs éléments concernés par ce ticket.</p>

          <div className="create-ticket-page__search-row">
            <label>
              Type d'élément
              <select value={searchType} onChange={e => setSearchType(e.target.value)}>
                {ASSET_TYPES.map(({ itemtype, label }) => <option key={itemtype} value={itemtype}>{label}</option>)}
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

        <div className="create-ticket-page__form-footer">
          <button type="submit" disabled={submitting} className="create-ticket-page__submit">
            {submitting ? 'Création…' : 'Créer le ticket'}
          </button>
        </div>
      </form>
    </div>
    </Layout>
  )
}

export default CreateTicketPage
