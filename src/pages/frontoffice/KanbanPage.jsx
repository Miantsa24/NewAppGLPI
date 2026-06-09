import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './KanbanPage.css'

// GLPI utilise des codes entiers pour les statuts de ticket :
//   1 = Nouveau, 2 = En cours (attribué), 3 = En cours (planifié),
//   4 = En attente, 5 = Résolu, 6 = Clos.
// On les regroupe en 3 colonnes visuelles.
// "targetStatus" : le statut GLPI qu'on envoie quand on y dépose un ticket.
const COLUMN_DEFS = [
  { key: 'nouveau',     glpiStatuses: [1],       targetStatus: 1 },
  { key: 'in_progress', glpiStatuses: [2, 3, 4], targetStatus: 2 },
  { key: 'termine',     glpiStatuses: [5, 6],    targetStatus: 5 }
]

// Retrouve la clé de colonne correspondant à un statut GLPI donné.
function columnKeyFor(status) {
  if (status === 1) return 'nouveau'
  if ([2, 3, 4].includes(status)) return 'in_progress'
  return 'termine'
}

// Retourne le libellé à afficher pour une colonne selon la langue active.
// Fallback : si le label malgache n'est pas configuré (chaîne vide),
// on retombe sur le label français — configuré via le Backoffice.
function labelFor(settings, key, lang) {
  if (lang === 'mg') {
    const mg = settings[`label_mg_${key}`]
    if (mg) return mg
  }
  return settings[`label_fr_${key}`] ?? key
}

// ── Modale : saisie de solution (obligatoire pour passer en "Terminé") ────────
// GLPI exige une solution pour passer un ticket en Résolu (statut 5) — on ne
// peut pas juste PATCH le statut sans l'accompagner d'un contenu de solution.
// Cette modale collecte ce contenu avant d'envoyer la requête.
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

// ── Modale : création d'un nouveau ticket ─────────────────────────────────────
// Formulaire minimal (Titre + Description) placé directement sur le Kanban —
// pas besoin de quitter la page pour créer un ticket rapide.
function AddModal({ onConfirm, onCancel, submitting }) {
  const [name,    setName]    = useState('')
  const [content, setContent] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    onConfirm({ name, content })
  }

  return (
    <div className="kanban-modal-backdrop" onClick={onCancel}>
      <div className="kanban-modal" onClick={e => e.stopPropagation()}>
        <h2>Nouveau ticket</h2>
        <form onSubmit={handleSubmit}>
          <label className="kanban-modal__field">
            Titre
            <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </label>
          <label className="kanban-modal__field">
            Description
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} required />
          </label>
          <div className="kanban-modal__actions">
            <button type="button" onClick={onCancel} className="kanban-modal__btn kanban-modal__btn--cancel">
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !content.trim()}
              className="kanban-modal__btn kanban-modal__btn--confirm"
            >
              {submitting ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modale : détail d'un ticket ───────────────────────────────────────────────
// Réutilise l'endpoint Backoffice existant (/api/backoffice/tickets/:id) plutôt
// que de dupliquer la logique — ce serveur connaît déjà les traductions de codes
// (type, statut, priorité) et les éléments associés résolus.
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
            {/* white-space: pre-wrap (voir CSS) : conserve les sauts de ligne GLPI */}
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
// Composant réutilisé pour les 3 colonnes — reçoit la couleur de fond et le
// libellé depuis les paramètres Backoffice, les tickets depuis le composant parent.
// La gestion du drag & drop est entièrement en HTML5 natif : pas de bibliothèque.
function KanbanColumn({ colDef, tickets, label, bgColor, draggingId, onDragStart, onDragEnd, onDrop, onCardClick, onAddClick }) {
  // "isDragOver" : état local pour mettre en évidence la colonne cible pendant
  // le survol — ne concerne que cette colonne, pas le composant parent.
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
        {/* Badge avec le nombre de tickets — mis à jour en temps réel */}
        <span className="kanban-column__count">{tickets.length}</span>
      </div>

      <div className="kanban-column__cards">
        {tickets.map(ticket => (
          <div
            key={ticket.id}
            className={`kanban-card ${draggingId === ticket.id ? 'kanban-card--dragging' : ''}`}
            draggable
            onDragStart={e => {
              // dataTransfer : le "presse-papiers" du drag & drop HTML5.
              // On y stocke l'id du ticket pour le retrouver dans onDrop.
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

      {/* Bouton "Ajouter" uniquement sur la colonne "Nouveau" */}
      {colDef.key === 'nouveau' && (
        <button className="kanban-column__add" onClick={onAddClick}>
          + Ajouter 1 ticket
        </button>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
function KanbanPage({ onLogout }) {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('access_token')
    onLogout()
    navigate('/login')
  }

  const [lang,     setLang]     = useState('fr')
  const [settings, setSettings] = useState(null)
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)

  // Quel ticket est en cours de glissement (pour l'effet visuel de la carte)
  const [draggingId, setDraggingId] = useState(null)

  // Modales
  const [showAddModal,   setShowAddModal]   = useState(false)
  const [addSubmitting,  setAddSubmitting]  = useState(false)
  const [detailTicketId, setDetailTicketId] = useState(null)
  const [solveTarget,    setSolveTarget]    = useState(null)  // { ticketId }

  // Chargement en parallèle : paramètres Kanban + liste des tickets GLPI.
  // On lit le token DANS l'effet (pas en dehors) pour éviter un avertissement
  // lint sur les dépendances de useEffect.
  useEffect(() => {
    const token = localStorage.getItem('access_token')

    Promise.all([
      fetch('http://localhost:3001/api/kanban/settings').then(r => r.json()),
      // Endpoint backend dédié — session v1 serveur, retourne TOUS les tickets
      // (importés + créés par les utilisateurs), pas seulement ceux de l'utilisateur
      // connecté (contrairement au proxy v2 qui filtre selon le token OAuth2).
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

  // Recharge la liste depuis GLPI si une mise à jour optimiste échoue.
  async function reloadTickets() {
    try {
      const r = await fetch('http://localhost:3001/api/frontoffice/kanban-tickets')
      const data = await r.json().catch(() => ({ ok: false, tickets: [] }))
      if (data.ok) setTickets(data.tickets)
    } catch { /* on garde l'état actuel */ }
  }

  // ── Gestion du drop ───────────────────────────────────────────────────────
  function handleDrop(ticketIdStr, targetColKey) {
    const ticketId = parseInt(ticketIdStr, 10)
    const ticket   = tickets.find(t => t.id === ticketId)
    if (!ticket) return
    // On ne fait rien si le ticket est déjà dans la colonne cible.
    if (columnKeyFor(ticket.status) === targetColKey) return

    if (targetColKey === 'termine') {
      // Cas spécial : GLPI exige une solution pour résoudre un ticket —
      // on ouvre la modale avant d'envoyer quoi que ce soit à l'API.
      setSolveTarget({ ticketId })
    } else {
      const colDef = COLUMN_DEFS.find(c => c.key === targetColKey)
      patchStatus(ticketId, colDef.targetStatus)
    }
  }

  // Mise à jour optimiste : on change le statut localement AVANT la réponse
  // serveur pour que l'interface soit instantanée. Si la requête échoue,
  // on recharge depuis GLPI pour retrouver l'état réel.
  // On passe par le backend v1 (pas le proxy v2) pour contourner les filtres
  // de visibilité GLPI — l'utilisateur connecté peut ne pas avoir le droit de
  // modifier des tickets créés par l'import (qui appartiennent à un autre compte).
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
    // Mise à jour optimiste vers statut 5 (Résolu)
    setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: 5 } : t))
    try {
      // Le backend v1 crée l'ITILSolution ET résout le ticket en un seul appel.
      const r = await fetch(`http://localhost:3001/api/frontoffice/kanban-tickets/${ticketId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 5, solution: solutionText })
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

  async function handleAddConfirm({ name, content }) {
    setAddSubmitting(true)
    const token = localStorage.getItem('access_token')
    try {
      const r = await fetch('/api/frontoffice/tickets', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, content, type: 1, urgency: 3, items: [] })
      })
      const data = await r.json()
      if (data.ok) {
        setShowAddModal(false)
        // On ajoute le ticket localement avec les infos minimales connues,
        // sans recharger toute la liste — le statut 1 = "Nouveau" par défaut.
        setTickets(ts => [...ts, {
          id: data.ticketId, name, status: 1, type: 1, urgency: 3,
          date: new Date().toLocaleDateString('fr-FR')
        }])
      } else {
        console.error('Échec création ticket Kanban :', data.error)
      }
    } catch (err) {
      console.error('Échec création ticket Kanban :', err.message)
    } finally {
      setAddSubmitting(false)
    }
  }

  // Groupe les tickets par colonne — recalculé à chaque rendu quand "tickets" change.
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
      actionLabel="Déconnexion"
      onAction={logout}
    >
    <div className="kanban-page">
      <div className="kanban-page__header">
        <h1>Kanban</h1>
        {/* Sélecteur de langue — si un label malgache n'est pas configuré,
            le fallback sur le français s'applique automatiquement (labelFor). */}
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
      </div>

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
              onAddClick={() => setShowAddModal(true)}
            />
          ))}
        </div>
      )}
    </div>

    {showAddModal && (
      <AddModal
        onConfirm={handleAddConfirm}
        onCancel={() => setShowAddModal(false)}
        submitting={addSubmitting}
      />
    )}

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
