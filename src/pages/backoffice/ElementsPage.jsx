import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './ElementsPage.css'

// Les 4 types restants une fois Ordinateur et Écran sortis dans leurs propres
// menus — mêmes types que côté FrontOffice (CreateElementPage), pour rester
// cohérent sur ce qui constitue "les autres éléments" dans ce projet.
const OTHER_ELEMENT_TYPES = [
  { itemtype: 'NetworkEquipment', label: 'Équipements réseau' },
  { itemtype: 'Peripheral',       label: 'Périphériques' },
  { itemtype: 'Phone',            label: 'Téléphones' },
  { itemtype: 'Printer',          label: 'Imprimantes' }
]

// onLock : même rôle que dans BackofficeTicketsPage — prévenir App que l'accès
// backoffice doit être reverrouillé.
//
// "itemtype" : type GLPI fixe pour les pages dédiées (Computer, Monitor) ;
// la valeur spéciale "others" déclenche un sélecteur parmi les 4 types restants
// — un seul composant générique pour les trois entrées de menu (Ordinateurs /
// Écrans / Autres éléments), comme convenu ("Une page par catégorie").
function BackofficeElementsPage({ onLock, pageTitle, itemtype, intro }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  const isOtherCategory = itemtype === 'others'
  const [selectedType, setSelectedType] = useState(OTHER_ELEMENT_TYPES[0].itemtype)
  const targetType = isOtherCategory ? selectedType : itemtype

  const [elements, setElements] = useState(null)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(true)

  // [targetType] en dépendance : si l'utilisateur change de type via le
  // sélecteur (page "Autres éléments"), on relance le chargement avec le
  // nouveau type plutôt que de garder l'ancienne liste affichée.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setElements(null)

    async function loadElements() {
      try {
        const response = await fetch(`http://localhost:3001/api/backoffice/elements/${targetType}`)
        const data = await response.json()
        if (cancelled) return

        if (data.ok) {
          setElements(data.elements)
        } else {
          // Le détail technique part dans la console — l'utilisateur ne voit
          // qu'un message en texte clair (pas de JSON brut à l'écran).
          console.error('Échec du chargement des éléments :', data.error)
          setError(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Échec du chargement des éléments :', err.message)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadElements()
    return () => { cancelled = true }
  }, [targetType])

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
      <div className="backoffice-elements-page">
        <h1>{pageTitle}</h1>
        <p className="backoffice-elements-page__intro">{intro}</p>

        {isOtherCategory && (
          <div className="backoffice-elements-page__type">
            <label>
              Type d'élément {' '}
              <select value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                {OTHER_ELEMENT_TYPES.map(({ itemtype: type, label }) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {loading && <p>Chargement…</p>}

        {error && (
          <p className="backoffice-elements-page__error">
            Impossible de charger la liste. Réessayez dans quelques instants.
          </p>
        )}

        {elements && elements.length === 0 && <p>Aucun élément pour le moment.</p>}

        {elements && elements.length > 0 && (
          <table className="backoffice-elements-page__table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>N° de série</th>
                <th>Autre n° de série</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {elements.map(element => (
                <tr key={element.id}>
                  <td>
                    <Link to={`/backoffice/elements/${targetType}/${element.id}`}>{element.name}</Link>
                  </td>
                  <td>{element.serial ?? '—'}</td>
                  <td>{element.otherserial ?? '—'}</td>
                  <td>{element.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  )
}

export default BackofficeElementsPage
