import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './AddCostPage.css'

function BackofficeAddCostPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  const [tickets,    setTickets]    = useState([])
  const [loadError,  setLoadError]  = useState(false)
  const [loading,    setLoading]    = useState(true)

  const [ticketId, setTicketId] = useState('')
  const [name,      setName]      = useState('')
  const [actiontime, setActiontime] = useState('')
  const [costTime,  setCostTime]  = useState('')
  const [costFixed, setCostFixed] = useState('')

  const [submitting,  setSubmitting]  = useState(false)
  const [result,      setResult]      = useState(null)

  useEffect(() => {
    fetch('http://localhost:3001/api/backoffice/tickets')
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setTickets(data.tickets)
          if (data.tickets.length > 0) setTicketId(String(data.tickets[0].id))
        } else {
          setLoadError(true)
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/backoffice/costs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, name, actiontime, costTime, costFixed })
      })
      const data = await response.json().catch(() => ({}))
      if (!data.ok) {
        console.error('Échec ajout du coût :', data.error)
        setResult('error')
      } else {
        setResult('success')
        setName('')
        setActiontime('')
        setCostTime('')
        setCostFixed('')
      }
    } catch (err) {
      console.error('Échec ajout du coût :', err.message)
      setResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = ticketId && name.trim() && !submitting

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="add-cost-page">
      <h1>Ajouter un coût</h1>
      <p className="add-cost-page__intro">
        Ajoutez un coût (temps passé, coût horaire, coût fixe) à un ticket existant.
      </p>

      {loading   && <p>Chargement des tickets…</p>}
      {loadError && (
        <p className="add-cost-page__error">
          Impossible de charger la liste des tickets. Réessayez dans quelques instants.
        </p>
      )}

      {!loading && !loadError && tickets.length === 0 && (
        <p>Aucun ticket disponible pour le moment.</p>
      )}

      {!loading && !loadError && tickets.length > 0 && (
        <form onSubmit={handleSubmit} className="add-cost-page__form">
          <label>
            Ticket
            <select value={ticketId} onChange={e => setTicketId(e.target.value)}>
              {tickets.map(t => (
                <option key={t.id} value={t.id}>#{t.id} — {t.name}</option>
              ))}
            </select>
          </label>

          <label>
            Nom du coût
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex. Intervention sur site"
              required
            />
          </label>

          <div className="add-cost-page__row">
            <label>
              Temps passé (secondes)
              <input
                type="number"
                min="0"
                value={actiontime}
                onChange={e => setActiontime(e.target.value)}
                placeholder="0"
              />
            </label>
            <label>
              Coût horaire
              <input
                type="number"
                min="0"
                step="0.01"
                value={costTime}
                onChange={e => setCostTime(e.target.value)}
                placeholder="0"
              />
            </label>
            <label>
              Coût fixe
              <input
                type="number"
                min="0"
                step="0.01"
                value={costFixed}
                onChange={e => setCostFixed(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          {result === 'success' && (
            <p className="add-cost-page__success">Coût ajouté avec succès au ticket.</p>
          )}
          {result === 'error' && (
            <p className="add-cost-page__error">L'ajout du coût a échoué. Réessayez.</p>
          )}

          <button type="submit" disabled={!canSubmit} className="add-cost-page__submit">
            {submitting ? 'Ajout…' : 'Ajouter le coût'}
          </button>
        </form>
      )}
    </div>
    </Layout>
  )
}

export default BackofficeAddCostPage
