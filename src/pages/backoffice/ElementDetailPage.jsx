import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './ElementDetailPage.css'

// Retrouve la page-liste d'origine à partir du type GLPI de l'élément affiché —
// nécessaire pour le lien "Retour" : Ordinateurs et Écrans ont chacun leur menu
// dédié, les 4 autres types partagent la page "Autres éléments".
function listPathFor(itemtype) {
  if (itemtype === 'Computer') return '/backoffice/elements/computers'
  if (itemtype === 'Monitor')  return '/backoffice/elements/monitors'
  return '/backoffice/elements/others'
}

const LIST_LABELS = {
  computers: 'la liste des ordinateurs',
  monitors:  'la liste des écrans',
  others:    'la liste des autres éléments'
}

// useParams() lit ":itemtype" et ":id" dans l'URL (ex. "/backoffice/elements/Computer/64")
// — un seul composant générique couvre les 6 types, comme la fiche détail des
// tickets (BackofficeTicketDetailPage) couvre tous les tickets.
// onLock : même rôle que BackofficeTicketDetailPage — reverrouille l'accès backoffice.
function BackofficeElementDetailPage({ onLock }) {
  const { itemtype, id } = useParams()
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  const [element, setElement] = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  // [itemtype, id] en dépendance : si on navigue d'une fiche à une autre sans
  // démontage, l'effet relance le chargement avec les nouveaux paramètres.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setElement(null)

    async function loadElement() {
      try {
        const response = await fetch(`http://localhost:3001/api/backoffice/elements/${itemtype}/${id}`)
        const data = await response.json()
        if (cancelled) return

        if (data.ok) {
          setElement(data.element)
        } else {
          // Le détail technique part dans la console — l'utilisateur ne voit
          // qu'un message en texte clair (pas de JSON brut à l'écran).
          console.error('Échec du chargement de l\'élément :', data.error)
          setError(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Échec du chargement de l\'élément :', err.message)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadElement()
    return () => { cancelled = true }
  }, [itemtype, id])

  const listPath = listPathFor(itemtype)

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="element-detail-page">
      <p className="element-detail-page__back">
        <Link to={listPath}>← Retour à {LIST_LABELS[listPath.split('/').pop()]}</Link>
      </p>

      {loading && <p>Chargement…</p>}

      {error && (
        <p className="element-detail-page__error">
          Impossible de charger cet élément. Réessayez dans quelques instants.
        </p>
      )}

      {element && (
        <>
          <h1>{element.name}</h1>

          <div className="element-detail-page__meta">
            <p><strong>Emplacement :</strong> {element.location ?? '—'}</p>
            <p><strong>Fabricant :</strong> {element.manufacturer ?? '—'}</p>
            <p><strong>Statut :</strong> {element.status ?? '—'}</p>
            <p><strong>N° de série :</strong> {element.serial ?? '—'}</p>
            <p><strong>Autre n° de série :</strong> {element.otherserial ?? '—'}</p>
          </div>

          <h2>Commentaire</h2>
          {/* white-space: pre-wrap (voir CSS) : GLPI conserve les sauts de
              ligne du commentaire — sans cette règle ils seraient ignorés. */}
          <p className="element-detail-page__content">
            {element.comment || '(aucun commentaire)'}
          </p>
        </>
      )}
    </div>
    </Layout>
  )
}

export default BackofficeElementDetailPage
