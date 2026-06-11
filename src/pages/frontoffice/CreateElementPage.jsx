import { useState } from 'react'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './CreateElementPage.css'

function CreateElementPage({ pageTitle, itemtype }) {
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
      // Session v1 serveur — pas de token utilisateur requis.
      // L'élément est journalisé côté serveur pour la réinitialisation.
      const response = await fetch('http://localhost:3001/api/frontoffice/elements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemtype, name, serial, otherserial, comment })
      })
      const data = await response.json().catch(() => ({}))
      if (!data.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { glpi: data.error })

      setName('')
      setSerial('')
      setOtherserial('')
      setComment('')
      setSuccess(true)
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
      <h1>{pageTitle}</h1>

      <form onSubmit={handleSubmit}>
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
