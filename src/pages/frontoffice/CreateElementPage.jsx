import { useState, useEffect, useCallback } from 'react'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import { ASSET_TYPES } from '../../../shared/assetTypes.js'
import './CreateElementPage.css'

// Même convention que ElementsPage.jsx : GLPI renvoie tantôt null, tantôt un
// objet { name: null } pour une relation non renseignée.
function cellValue(nestedObject) {
  return nestedObject?.name ?? '—'
}

// "Item_Type" (colonne du CSV d'import, voir importPipeline.js) — la page ne
// liste qu'un seul itemtype à la fois, donc cette valeur est identique pour
// toutes les lignes. On la dérive de ASSET_TYPES (ex. "un ordinateur" → "Ordinateur").
function itemTypeLabel(itemtype) {
  const entry = ASSET_TYPES.find(t => t.itemtype === itemtype)
  if (!entry) return itemtype
  return entry.singular.replace(/^(un|une)\s+/, '').replace(/^./, c => c.toUpperCase())
}

function CreateElementPage({ pageTitle, itemtype }) {
  const [name,            setName]            = useState('')
  const [status,          setStatus]          = useState('')
  const [location,        setLocation]        = useState('')
  const [manufacturer,    setManufacturer]    = useState('')
  const [model,           setModel]           = useState('')
  const [inventoryNumber, setInventoryNumber] = useState('')
  const [user,            setUser]            = useState('')

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [success,     setSuccess]     = useState(false)

  // Liste des éléments déjà existants pour ce type — donne un aperçu de
  // l'inventaire actuel pendant la saisie, et se rafraîchit après création.
  const [elements,    setElements]    = useState(null)
  const [listError,   setListError]   = useState(false)
  const [listLoading, setListLoading] = useState(true)

  const loadElements = useCallback(async () => {
    setListLoading(true)
    setListError(false)
    try {
      const response = await fetch(`http://localhost:3001/api/frontoffice/elements?itemtype=${itemtype}`)
      const data = await response.json().catch(() => ({}))
      if (!data.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setElements(data.items)
    } catch (err) {
      console.error(`Échec du chargement des éléments existants (${itemtype}) :`, err.message)
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }, [itemtype])

  useEffect(() => { loadElements() }, [loadElements])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(false)
    setSuccess(false)

    try {
      // Session v1 serveur — pas de token utilisateur requis.
      // L'élément est journalisé côté serveur pour la réinitialisation.
      const response = await fetch('http://localhost:3001/api/frontoffice/elements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemtype, name, status, location, manufacturer, model, inventoryNumber, user })
      })
      const data = await response.json().catch(() => ({}))
      if (!data.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { glpi: data.error })

      setName('')
      setStatus('')
      setLocation('')
      setManufacturer('')
      setModel('')
      setInventoryNumber('')
      setUser('')
      setSuccess(true)
      loadElements()
    } catch (err) {
      console.error(`Échec de la création (${itemtype}) :`, err.message, err.glpi)
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout
      title="NewApp GLPI"
      navLinks={FRONTOFFICE_NAV_LINKS}
    >
    <div className="create-element-page">
      <header className="create-element-page__header">
        <h1>{pageTitle}</h1>
      </header>

      <form onSubmit={handleSubmit} className="create-element-page__form">
        <div className="create-element-page__field">
          <label>
            Nom
            <input type="text" value={name} onChange={e => setName(e.target.value)} required />
          </label>
        </div>

        <div className="create-element-page__row">
          <label>
            Statut
            <input type="text" value={status} onChange={e => setStatus(e.target.value)} />
          </label>
          <label>
            Type
            <input type="text" value={itemTypeLabel(itemtype)} disabled />
          </label>
        </div>

        <div className="create-element-page__row">
          <label>
            Emplacement
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} />
          </label>
          <label>
            Fabricant
            <input type="text" value={manufacturer} onChange={e => setManufacturer(e.target.value)} />
          </label>
        </div>

        <div className="create-element-page__row">
          <label>
            Modèle
            <input type="text" value={model} onChange={e => setModel(e.target.value)} />
          </label>
          <label>
            N° d'inventaire
            <input type="text" value={inventoryNumber} onChange={e => setInventoryNumber(e.target.value)} />
          </label>
        </div>

        <div className="create-element-page__field">
          <label>
            Utilisateur
            <input type="text" value={user} onChange={e => setUser(e.target.value)} />
          </label>
        </div>

        {submitError && (
          <p className="create-element-page__error">La création a échoué. Vérifiez les champs et réessayez.</p>
        )}

        {success && (
          <p className="create-element-page__success">Élément créé avec succès. Vous pouvez en créer un autre.</p>
        )}

        <div className="create-element-page__form-footer">
          <button type="submit" disabled={submitting} className="create-element-page__submit">
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>

      <section className="create-element-page__list">
        <h2>Éléments existants</h2>

        {listLoading && <p>Chargement…</p>}

        {listError && (
          <p className="create-element-page__error">
            Impossible de charger la liste des éléments existants.
          </p>
        )}

        {elements && elements.length === 0 && (
          <p className="create-element-page__empty">Aucun élément pour le moment.</p>
        )}

        {elements && elements.length > 0 && (
          <div className="create-element-page__results">
            <table className="create-element-page__table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Statut</th>
                  <th>Emplacement</th>
                  <th>Fabricant</th>
                  <th>Type</th>
                  <th>Modèle</th>
                  <th>N° d'inventaire</th>
                  <th>Utilisateur</th>
                </tr>
              </thead>
              <tbody>
                {elements.map(element => (
                  <tr key={element.id}>
                    <td>{element.name}</td>
                    <td>{cellValue(element.status)}</td>
                    <td>{cellValue(element.location)}</td>
                    <td>{cellValue(element.manufacturer)}</td>
                    <td>{itemTypeLabel(itemtype)}</td>
                    <td>{cellValue(element.model)}</td>
                    <td>{element.serial ?? '—'}</td>
                    <td>{cellValue(element.user)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
    </Layout>
  )
}

export default CreateElementPage
