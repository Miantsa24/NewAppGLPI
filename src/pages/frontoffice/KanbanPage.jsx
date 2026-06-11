import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './KanbanPage.css'

// Le projet n'utilise que 3 statuts de ticket GLPI : Nouveau (1), En cours/attribué
// (2) et Clos (6) — voir aussi TICKET_STATUSES dans server/ticketsData.js et
// server/importPipeline.js. Les 3 colonnes du Kanban correspondent 1:1 à ces statuts.
const COLUMN_DEFS = [
  { key: 'nouveau',     glpiStatuses: [1], targetStatus: 1 },
  { key: 'in_progress', glpiStatuses: [2], targetStatus: 2 },
  { key: 'termine',     glpiStatuses: [6], targetStatus: 6 }
]

function columnKeyFor(status) {
  if (status === 1) return 'nouveau'
  if (status === 2) return 'in_progress'
  return 'termine'
}

function labelFor(settings, key, lang) {
  if (lang === 'mg') {
    const mg = settings[`label_mg_${key}`]
    if (mg) return mg
  }
  return settings[`label_fr_${key}`] ?? key
}

// ── Modale : saisie de solution (obligatoire pour passer en "Terminé") ────────
function SolveModal({ onConfirm, onCancel }) {
  const [text, setText] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (text.trim()) onConfirm(text.trim())
  }

  return (
    <div className="kanban-modal-backdrop" onClick={onCancel}>
      <div className="kanban-modal" onClick={e => e.stopPropagation()}>
        <h2>Clôturer le ticket</h2>
        <p className="kanban-modal__desc">
          Décrivez la solution apportée pour clôturer ce ticket.
        </p>
        <form onSubmit={handleSubmit}>
          <textarea
            className="kanban-modal__textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            required
            placeholder="Décrivez la solution apportée…"
            autoFocus
          />
          <div className="kanban-modal__actions">
            <button type="button" onClick={onCancel} className="kanban-modal__btn kanban-modal__btn--cancel">
              Annuler
            </button>
            <button type="submit" disabled={!text.trim()} className="kanban-modal__btn kanban-modal__btn--confirm">
              Confirmer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modale : détail d'un ticket ───────────────────────────────────────────────
function DetailModal({ ticketId, onClose }) {
  const [ticket,  setTicket]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    fetch(`http://localhost:3001/api/backoffice/tickets/${ticketId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setTicket(data.ticket)
        else { console.error('Détail ticket :', data.error); setError(true) }
      })
      .catch(err => { console.error('Détail ticket :', err.message); setError(true) })
      .finally(() => setLoading(false))
  }, [ticketId])

  return (
    <div className="kanban-modal-backdrop" onClick={onClose}>
      <div className="kanban-modal kanban-modal--wide" onClick={e => e.stopPropagation()}>
        <button className="kanban-modal__close" onClick={onClose} aria-label="Fermer">✕</button>

        {loading && <p>Chargement…</p>}
        {error   && <p className="kanban-modal__error">Impossible de charger ce ticket.</p>}

        {ticket && (
          <>
            <h2>{ticket.name}</h2>
            <div className="kanban-modal__meta">
              <span><strong>Type :</strong> {ticket.type}</span>
              <span><strong>Statut :</strong> {ticket.status}</span>
              <span><strong>Priorité :</strong> {ticket.priority}</span>
              <span><strong>Date :</strong> {ticket.date}</span>
            </div>

            <h3>Description</h3>
            <p className="kanban-modal__content">{ticket.content || '(aucune description)'}</p>

            {ticket.items.length > 0 && (
              <>
                <h3>Éléments associés</h3>
                <ul className="kanban-modal__items">
                  {ticket.items.map((item, i) => (
                    <li key={i}>{item.name} <em>({item.itemtype})</em></li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Colonne du Kanban ─────────────────────────────────────────────────────────
function KanbanColumn({ colDef, tickets, label, bgColor, draggingId, onDragStart, onDragEnd, onDrop, onCardClick, onAddClick }) {
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      className={`kanban-column ${isDragOver ? 'kanban-column--drag-over' : ''}`}
      style={{ background: bgColor }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragOver(false)
        onDrop(e.dataTransfer.getData('ticketId'))
      }}
    >
      <div className="kanban-column__header">
        <h2 className="kanban-column__title">{label}</h2>
        <span className="kanban-column__count">{tickets.length}</span>
      </div>

      <div className="kanban-column__cards">
        {tickets.map(ticket => (
          <div
            key={ticket.id}
            className={`kanban-card ${draggingId === ticket.id ? 'kanban-card--dragging' : ''}`}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('ticketId', ticket.id.toString())
              e.dataTransfer.effectAllowed = 'move'
              onDragStart(ticket.id)
            }}
            onDragEnd={onDragEnd}
            onClick={() => onCardClick(ticket.id)}
          >
            <span className="kanban-card__name">{ticket.name}</span>
          </div>
        ))}
      </div>

      {/* Bouton "Ajouter" uniquement sur la colonne "Nouveau" — navigue vers le
          formulaire complet de création de ticket (avec association d'éléments). */}
      {colDef.key === 'nouveau' && (
        <button className="kanban-column__add" onClick={onAddClick}>
          + Ajouter 1 ticket
        </button>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
function KanbanPage() {
  const navigate = useNavigate()

  const [lang,     setLang]     = useState('fr')
  const [settings, setSettings] = useState(null)
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)

  const [draggingId,    setDraggingId]    = useState(null)
  const [detailTicketId, setDetailTicketId] = useState(null)
  const [solveTarget,    setSolveTarget]    = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:3001/api/kanban/settings').then(r => r.json()),
      fetch('http://localhost:3001/api/frontoffice/kanban-tickets')
        .then(async r => {
          const body = await r.json().catch(() => ({ ok: false, tickets: [] }))
          return body.ok ? body.tickets : []
        })
    ])
      .then(([settingsRes, ticketsData]) => {
        if (settingsRes.ok) setSettings(settingsRes.settings)
        else setError(true)
        setTickets(Array.isArray(ticketsData) ? ticketsData : [])
      })
      .catch(err => {
        console.error('Erreur chargement Kanban :', err.message)
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  async function reloadTickets() {
    try {
      const r = await fetch('http://localhost:3001/api/frontoffice/kanban-tickets')
      const data = await r.json().catch(() => ({ ok: false, tickets: [] }))
      if (data.ok) setTickets(data.tickets)
    } catch { /* on garde l'état actuel */ }
  }

  function handleDrop(ticketIdStr, targetColKey) {
    const ticketId = parseInt(ticketIdStr, 10)
    const ticket   = tickets.find(t => t.id === ticketId)
    if (!ticket) return
    if (columnKeyFor(ticket.status) === targetColKey) return

    if (targetColKey === 'termine') {
      setSolveTarget({ ticketId })
    } else {
      const colDef = COLUMN_DEFS.find(c => c.key === targetColKey)
      patchStatus(ticketId, colDef.targetStatus)
    }
  }

  async function patchStatus(ticketId, newStatus) {
    setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))
    try {
      const r = await fetch(`http://localhost:3001/api/frontoffice/kanban-tickets/${ticketId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus })
      })
      const data = await r.json().catch(() => ({}))
      if (!data.ok) {
        console.error('Échec changement de statut :', data.error)
        reloadTickets()
      }
    } catch (err) {
      console.error('Échec changement de statut :', err.message)
      reloadTickets()
    }
  }

  async function handleSolveConfirm(solutionText) {
    const { ticketId } = solveTarget
    setSolveTarget(null)
    setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: 6 } : t))
    try {
      const r = await fetch(`http://localhost:3001/api/frontoffice/kanban-tickets/${ticketId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 6, solution: solutionText })
      })
      const data = await r.json().catch(() => ({}))
      if (!data.ok) {
        console.error('Échec résolution ticket :', data.error)
        reloadTickets()
      }
    } catch (err) {
      console.error('Échec résolution ticket :', err.message)
      reloadTickets()
    }
  }

  const ticketsByColumn = Object.fromEntries(
    COLUMN_DEFS.map(col => [
      col.key,
      tickets.filter(t => col.glpiStatuses.includes(t.status))
    ])
  )

  return (
    <Layout
      title="NewApp GLPI"
      navLinks={FRONTOFFICE_NAV_LINKS}
    >
    <div className="kanban-page">
      <header className="kanban-page__header">
        <div>
          <h1>Kanban</h1>
          <p className="kanban-page__intro">Glissez-déposez les tickets pour faire évoluer leur statut.</p>
        </div>
        <div className="kanban-page__lang">
          <button
            className={`kanban-lang-btn ${lang === 'fr' ? 'kanban-lang-btn--active' : ''}`}
            onClick={() => setLang('fr')}
          >FR</button>
          <button
            className={`kanban-lang-btn ${lang === 'mg' ? 'kanban-lang-btn--active' : ''}`}
            onClick={() => setLang('mg')}
          >MG</button>
        </div>
      </header>

      {loading && <p>Chargement…</p>}

      {error && (
        <p className="kanban-page__error">
          Impossible de charger certains éléments. Vérifiez votre connexion et réessayez.
        </p>
      )}

      {!loading && settings && (
        <div className="kanban-board">
          {COLUMN_DEFS.map(col => (
            <KanbanColumn
              key={col.key}
              colDef={col}
              tickets={ticketsByColumn[col.key]}
              label={labelFor(settings, col.key, lang)}
              bgColor={settings[`color_${col.key}`]}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
              onDrop={id => handleDrop(id, col.key)}
              onCardClick={setDetailTicketId}
              onAddClick={() => navigate('/tickets/new')}
            />
          ))}
        </div>
      )}
    </div>

    {detailTicketId !== null && (
      <DetailModal
        ticketId={detailTicketId}
        onClose={() => setDetailTicketId(null)}
      />
    )}

    {solveTarget && (
      <SolveModal
        onConfirm={handleSolveConfirm}
        onCancel={() => setSolveTarget(null)}
      />
    )}
    </Layout>
  )
}

export default KanbanPage
