import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession, backofficeFetch } from './api.js'
import './AddCostPage.css'

function BackofficeAddCostPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    clearBackofficeSession()
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

  // Liste de tous les coûts déjà enregistrés — affichée sous le formulaire,
  // et rechargée après chaque ajout réussi.
  const [costs,        setCosts]        = useState(null)
  const [costsError,   setCostsError]   = useState(false)
  const [costsLoading, setCostsLoading] = useState(true)

  const loadCosts = useCallback(async () => {
    setCostsLoading(true)
    setCostsError(false)
    try {
      const response = await fetch('http://localhost:3001/api/backoffice/costs')
      const data = await response.json().catch(() => ({}))
      if (!data.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setCosts(data.costs)
    } catch (err) {
      console.error('Échec du chargement des coûts :', err.message)
      setCostsError(true)
    } finally {
      setCostsLoading(false)
    }
  }, [])

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

  useEffect(() => { loadCosts() }, [loadCosts])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setResult(null)

    try {
      const response = await backofficeFetch('http://localhost:3001/api/backoffice/costs', {
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
        loadCosts()
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
      <header className="add-cost-page__header">
        <h1>Ajouter un coût</h1>
        <p className="add-cost-page__intro">
          Ajoutez un coût (temps passé, coût horaire, coût fixe) à un ticket existant.
        </p>
      </header>

      {loading   && <p>Chargement des tickets…</p>}
      {loadError && (
        <p className="add-cost-page__error">
          Impossible de charger la liste des tickets. Réessayez dans quelques instants.
        </p>
      )}

      {!loading && !loadError && tickets.length === 0 && (
        <p className="add-cost-page__empty">Aucun ticket disponible pour le moment.</p>
      )}

      {!loading && !loadError && tickets.length > 0 && (
        <form onSubmit={handleSubmit} className="add-cost-page__form">
          <div className="add-cost-page__field">
            <label>
              Ticket
              <select value={ticketId} onChange={e => setTicketId(e.target.value)}>
                {tickets.map(t => (
                  <option key={t.id} value={t.id}>#{t.id} — {t.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="add-cost-page__field">
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
          </div>

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

          <div className="add-cost-page__form-footer">
            <button type="submit" disabled={!canSubmit} className="add-cost-page__submit">
              {submitting ? 'Ajout…' : 'Ajouter le coût'}
            </button>
          </div>
        </form>
      )}

      <section className="add-cost-page__list">
        <h2>Coûts enregistrés</h2>

        {costsLoading && <p>Chargement des coûts…</p>}
        {costsError && (
          <p className="add-cost-page__error">
            Impossible de charger la liste des coûts. Réessayez dans quelques instants.
          </p>
        )}
        {!costsLoading && !costsError && costs?.length === 0 && (
          <p className="add-cost-page__empty">Aucun coût enregistré pour le moment.</p>
        )}
        {!costsLoading && !costsError && costs?.length > 0 && (
          <div className="add-cost-page__results">
            <table className="add-cost-page__table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Nom</th>
                  <th>Temps (s)</th>
                  <th>Coût horaire</th>
                  <th>Coût fixe</th>
                </tr>
              </thead>
              <tbody>
                {costs.map(cost => (
                  <tr key={cost.id}>
                    <td>#{cost.ticketId} — {cost.ticketName}</td>
                    <td>{cost.name}</td>
                    <td>{cost.actiontime}</td>
                    <td>{cost.cost_time}</td>
                    <td>{cost.cost_fixed}</td>
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

export default BackofficeAddCostPage
