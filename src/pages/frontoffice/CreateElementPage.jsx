import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './CreateElementPage.css'

// Les 4 types restants une fois Ordinateur et Écran sortis dans leurs propres
// menus — ce sont les seuls autres types d'"assets" gérés par ce projet
// (mêmes 6 types au total que ElementsPage / CreateTicketPage).
const OTHER_ELEMENT_TYPES = [
  { itemtype: 'NetworkEquipment', label: 'Équipement réseau' },
  { itemtype: 'Peripheral',       label: 'Périphérique' },
  { itemtype: 'Phone',            label: 'Téléphone' },
  { itemtype: 'Printer',          label: 'Imprimante' }
]

// onLogout : même rôle que dans CreateTicketPage — prévenir App que le token
// doit repasser à null, pour que la garde de route redirige vers /login.
//
// "itemtype" : type GLPI fixe pour les pages dédiées (Computer, Monitor) ;
// la valeur spéciale "others" déclenche un sélecteur parmi les 4 types restants
// — un seul composant générique pour les trois entrées de menu, comme convenu
// ("Une page par catégorie", avec "Autres éléments" couvrant les 4 types restants).
function CreateElementPage({ onLogout, pageTitle, itemtype }) {
  const token    = localStorage.getItem('access_token')
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('access_token')
    onLogout()
    navigate('/login')
  }

  const isOtherCategory = itemtype === 'others'
  const [selectedType, setSelectedType] = useState(OTHER_ELEMENT_TYPES[0].itemtype)
  const targetType = isOtherCategory ? selectedType : itemtype

  // Champs communs aux 6 types d'"assets" (vérifiés dans la spec OpenAPI GLPI :
  // name, comment, serial, otherserial) — les seuls qu'on demande, pour rester
  // aussi simple qu'une création de ticket (pas de relations/listes déroulantes).
  const [name,        setName]        = useState('')
  const [serial,      setSerial]      = useState('')
  const [otherserial, setOtherserial] = useState('')
  const [comment,     setComment]     = useState('')

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [success,     setSuccess]     = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(false)
    setSuccess(false)

    try {
      const response = await fetch(`/api/glpi/Assets/${targetType}`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, serial, otherserial, comment })
      })
      const body = await response.json().catch(() => ({ raw: response.statusText }))
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { glpi: body })

      // Formulaire vidé : prêt pour une nouvelle saisie sans recharger la page
      // (utile si on doit créer plusieurs éléments à la suite).
      setName('')
      setSerial('')
      setOtherserial('')
      setComment('')
      setSuccess(true)
    } catch (err) {
      // Le détail technique part dans la console — l'utilisateur ne voit
      // qu'un message en texte clair (pas de JSON brut à l'écran).
      console.error(`Échec de la création (${targetType}) :`, err.message, err.glpi)
      setSubmitError(true)
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
    <div className="create-element-page">
      <h1>{pageTitle}</h1>

      <form onSubmit={handleSubmit}>
        {isOtherCategory && (
          <div className="create-element-page__field">
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

        <div className="create-element-page__field">
          <label>
            Nom
            <input type="text" value={name} onChange={e => setName(e.target.value)} required />
          </label>
        </div>

        <div className="create-element-page__row">
          <label>
            N° de série
            <input type="text" value={serial} onChange={e => setSerial(e.target.value)} />
          </label>
          <label>
            Autre n° de série
            <input type="text" value={otherserial} onChange={e => setOtherserial(e.target.value)} />
          </label>
        </div>

        <div className="create-element-page__field">
          <label>
            Commentaire
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} />
          </label>
        </div>

        {submitError && (
          <p className="create-element-page__error">La création a échoué. Vérifiez les champs et réessayez.</p>
        )}

        {success && (
          <p className="create-element-page__success">Élément créé avec succès. Vous pouvez en créer un autre.</p>
        )}

        <button type="submit" disabled={submitting} className="create-element-page__submit">
          {submitting ? 'Création…' : 'Créer'}
        </button>
      </form>
    </div>
    </Layout>
  )
}

export default CreateElementPage
