import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession, backofficeFetch } from './api.js'
import { ASSET_TYPES } from '../../../shared/assetTypes.js'
import './AddCostPage.css'

// Libellé lisible du type GLPI (ex. "Computer" → "Ordinateurs") — repris de la
// même source que les menus et le dashboard (shared/assetTypes.js).
function itemTypeLabel(itemtype) {
  return ASSET_TYPES.find(t => t.itemtype === itemtype)?.label ?? itemtype
}

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
  const [itemtypeFilter, setItemtypeFilter] = useState('')

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

  // Types présents dans la liste — alimentent le filtre (dynamique : pas limité
  // à ASSET_TYPES, au cas où un ticket serait lié à un autre type d'élément).
  const itemtypesPresent = costs ? [...new Set(costs.map(c => c.itemtype))] : []
  const filteredCosts = costs?.filter(c => !itemtypeFilter || c.itemtype === itemtypeFilter)

  // Totaux par type d'élément (calculés sur TOUS les coûts, pas seulement
  // ceux affichés par le filtre) — importé/nouveau/total, dans l'ordre de
  // itemtypesPresent.
  const totalsByType = itemtypesPresent.map(itemtype => {
    const rows = costs.filter(c => c.itemtype === itemtype)
    const imported = rows.reduce((sum, c) => sum + c.costImported, 0)
    const fresh    = rows.reduce((sum, c) => sum + c.costNew, 0)
    const reopen    = rows.reduce((sum, c) => sum + (c.costReopening ?? 0), 0)
    return { itemtype, imported, fresh, reopen, total: imported + fresh + reopen}
  })

  // Total général (toutes catégories confondues) — affiché uniquement quand
  // le filtre est sur "Tous les types".
  const grandTotal = totalsByType.reduce(
    (acc, t) => ({
      imported: acc.imported + t.imported,
      fresh:    acc.fresh + t.fresh,
      reopen:   acc.reopen + t.reopen,
      total:    acc.total + t.total
    }),
    { imported: 0, fresh: 0,reopen : 0, total: 0 }
  )

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
        <div className="add-cost-page__list-header">
          <h2>Coûts enregistrés</h2>

          {itemtypesPresent.length > 0 && (
            <label className="add-cost-page__filter">
              Filtrer par type d'élément
              <select value={itemtypeFilter} onChange={e => setItemtypeFilter(e.target.value)}>
                <option value="">Tous les types</option>
                {itemtypesPresent.map(itemtype => (
                  <option key={itemtype} value={itemtype}>{itemTypeLabel(itemtype)}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {costsLoading && <p>Chargement des coûts…</p>}
        {costsError && (
          <p className="add-cost-page__error">
            Impossible de charger la liste des coûts. Réessayez dans quelques instants.
          </p>
        )}
        {!costsLoading && !costsError && costs?.length === 0 && (
          <p className="add-cost-page__empty">Aucun coût enregistré pour le moment.</p>
        )}
        {!costsLoading && !costsError && costs?.length > 0 && filteredCosts.length === 0 && (
          <p className="add-cost-page__empty">Aucun coût pour ce type d'élément.</p>
        )}
        {!costsLoading && !costsError && filteredCosts?.length > 0 && (
          <div className="add-cost-page__results">
            <table className="add-cost-page__table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Élément</th>
                  <th>Type</th>
                  <th>Coût importé (Ar)</th>
                  <th>Nouveau coût fixe (Ar)</th>
                  <th>Coût de réouverture (Ar)</th>

                </tr>
              </thead>
              <tbody>
                {filteredCosts.map((cost, index) => (
                  <tr key={index}>
                    <td>#{cost.ticketId} — {cost.ticketName}</td>
                    <td>{cost.assetName}</td>
                    <td>{itemTypeLabel(cost.itemtype)}</td>
                    <td>{cost.costImported.toFixed(2)}</td>
                    <td>{cost.costNew.toFixed(2)}</td>
                    <td>{(cost.costReopening ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!costsLoading && !costsError && totalsByType.length > 0 && (
          <div className="add-cost-page__totals">
            <h3>Totaux par type d'élément</h3>
            <div className="add-cost-page__results">
              <table className="add-cost-page__table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Coût importé (Ar)</th>
                    <th>Nouveau coût (Ar)</th>
                    <th>Nouveau de réouverture (Ar)</th>
                    <th>Total (Ar)</th>
                  </tr>
                </thead>
                <tbody>
                  {totalsByType.map(t => (
                    <tr key={t.itemtype}>
                      <td>{itemTypeLabel(t.itemtype)}</td>
                      <td>{t.imported.toFixed(2)}</td>
                      <td>{t.fresh.toFixed(2)}</td>
                      <td>{t.reopen.toFixed(2)}</td>
                      <td>{t.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  {!itemtypeFilter && (
                    <tr className="add-cost-page__totals-grand">
                      <td>Total général</td>
                      <td>{grandTotal.imported.toFixed(2)}</td>
                      <td>{grandTotal.fresh.toFixed(2)}</td>
                      <td>{grandTotal.reopen.toFixed(2)}</td>
                      <td>{grandTotal.total.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
    </Layout>
  )
}

export default BackofficeAddCostPage
