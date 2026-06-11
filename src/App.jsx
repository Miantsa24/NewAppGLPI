import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ASSET_TYPES } from '../shared/assetTypes.js'
// FrontOffice : pages accessibles à tous, sans authentification
import DashboardPage       from './pages/frontoffice/DashboardPage.jsx'
import KanbanPage          from './pages/frontoffice/KanbanPage.jsx'
import ElementsPage        from './pages/frontoffice/ElementsPage.jsx'
import CreateElementPage   from './pages/frontoffice/CreateElementPage.jsx'
import CreateTicketPage    from './pages/frontoffice/CreateTicketPage.jsx'

// Backoffice : pages réservées à l'administration, protégées par le code unique
import BackofficeLoginPage          from './pages/backoffice/LoginPage.jsx'
import BackofficeImportPage         from './pages/backoffice/ImportPage.jsx'
import BackofficeDashboardPage      from './pages/backoffice/DashboardPage.jsx'
import BackofficeTicketsPage        from './pages/backoffice/TicketsPage.jsx'
import BackofficeTicketDetailPage   from './pages/backoffice/TicketDetailPage.jsx'
import BackofficeElementsPage       from './pages/backoffice/ElementsPage.jsx'
import BackofficeElementDetailPage  from './pages/backoffice/ElementDetailPage.jsx'
import BackofficeKanbanSettingsPage from './pages/backoffice/KanbanSettingsPage.jsx'
import BackofficeAddCostPage        from './pages/backoffice/AddCostPage.jsx'
import BackofficeResetPage          from './pages/backoffice/ResetPage.jsx'

function App() {
  // Même principe qu'avant : un booléen en sessionStorage pour le code backoffice.
  // sessionStorage survit aux rechargements MAIS pas à la fermeture de l'onglet —
  // adapté à un accès "backoffice" temporaire.
  const [backofficeUnlocked, setBackofficeUnlocked] = useState(
    () => sessionStorage.getItem('backoffice_unlocked') === 'true'
  )

  return (
    <Routes>
      {/* ── FrontOffice : accès libre, sans authentification ────────────────── */}
      <Route path="/"                       element={<DashboardPage />} />
      <Route path="/kanban"                 element={<KanbanPage />} />
      <Route path="/elements"              element={<ElementsPage />} />
      {ASSET_TYPES.map(({ itemtype, slug, singular }) => (
        <Route
          key={slug}
          path={`/elements/${slug}/new`}
          element={<CreateElementPage pageTitle={`Créer ${singular}`} itemtype={itemtype} />}
        />
      ))}
      <Route path="/tickets/new"           element={<CreateTicketPage />} />

      {/* ── Backoffice : saisie du code d'accès ─────────────────────────────── */}
      <Route
        path="/backoffice/login"
        element={<BackofficeLoginPage onUnlock={() => setBackofficeUnlocked(true)} />}
      />

      {/* "/backoffice" redirige directement vers le Dashboard — plus d'Accueil. */}
      <Route
        path="/backoffice"
        element={
          backofficeUnlocked
            ? <Navigate to="/backoffice/dashboard" replace />
            : <Navigate to="/backoffice/login"     replace />
        }
      />

      {/* ── Backoffice : pages protégées par le code unique ──────────────────── */}
      <Route
        path="/backoffice/dashboard"
        element={
          backofficeUnlocked
            ? <BackofficeDashboardPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />

      <Route
        path="/backoffice/import"
        element={
          backofficeUnlocked
            ? <BackofficeImportPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />

      <Route
        path="/backoffice/tickets"
        element={
          backofficeUnlocked
            ? <BackofficeTicketsPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />
      <Route
        path="/backoffice/tickets/:id"
        element={
          backofficeUnlocked
            ? <BackofficeTicketDetailPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />

      {ASSET_TYPES.map(({ itemtype, slug, label }) => (
        <Route
          key={slug}
          path={`/backoffice/elements/${slug}`}
          element={
            backofficeUnlocked
              ? <BackofficeElementsPage onLock={() => setBackofficeUnlocked(false)} pageTitle={label} itemtype={itemtype} intro="Liste en direct depuis GLPI — cliquez sur un élément pour voir sa fiche détaillée." />
              : <Navigate to="/backoffice/login" replace />
          }
        />
      ))}
      <Route
        path="/backoffice/elements/:itemtype/:id"
        element={
          backofficeUnlocked
            ? <BackofficeElementDetailPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />

      <Route
        path="/backoffice/costs/new"
        element={
          backofficeUnlocked
            ? <BackofficeAddCostPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />

      <Route
        path="/backoffice/kanban-settings"
        element={
          backofficeUnlocked
            ? <BackofficeKanbanSettingsPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />

      <Route
        path="/backoffice/reset"
        element={
          backofficeUnlocked
            ? <BackofficeResetPage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />
    </Routes>
  )
}

export default App
