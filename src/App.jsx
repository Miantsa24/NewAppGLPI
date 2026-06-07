import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage           from './pages/LoginPage.jsx'
import DashboardPage       from './pages/DashboardPage.jsx'
import BackofficeLoginPage from './pages/BackofficeLoginPage.jsx'
import BackofficeHomePage  from './pages/BackofficeHomePage.jsx'

function App() {
  // useState avec fonction d'initialisation : localStorage n'est lu qu'UNE fois,
  // au tout premier rendu — ensuite "token" devient un véritable état React.
  // Conséquence : toute mise à jour via setToken() déclenche un re-rendu de App,
  // donc un recalcul de l'élément affiché par la route "/".
  const [token, setToken] = useState(() => localStorage.getItem('access_token'))

  // Même principe que "token", mais pour l'accès backoffice : un simple booléen
  // (pas de vraie donnée à stocker, juste "le code a-t-il été validé ?").
  // sessionStorage : survit aux rechargements de page MAIS pas à la fermeture
  // de l'onglet — adapté à un accès "backoffice" qu'on ne veut pas garder ouvert
  // indéfiniment, contrairement au token GLPI (localStorage, persistant).
  const [backofficeUnlocked, setBackofficeUnlocked] = useState(
    () => sessionStorage.getItem('backoffice_unlocked') === 'true'
  )

  return (
    <Routes>
      {/* onLogin permet à LoginPage de prévenir App qu'un token vient d'être obtenu */}
      <Route path="/login" element={<LoginPage onLogin={setToken} />} />

      {/* Page principale : protégée — redirige vers /login si pas de token.
          "token" est maintenant réactif : dès que setToken change sa valeur,
          React re-rend App et recalcule cet élément avec la nouvelle valeur. */}
      <Route
        path="/"
        element={token ? <DashboardPage onLogout={() => setToken(null)} /> : <Navigate to="/login" replace />}
      />

      {/* Saisie du code d'accès backoffice — onUnlock = setBackofficeUnlocked(true) */}
      <Route
        path="/backoffice/login"
        element={<BackofficeLoginPage onUnlock={() => setBackofficeUnlocked(true)} />}
      />

      {/* Backoffice : protégé par le code unique — même schéma que la route "/" :
          si "backofficeUnlocked" est false, on redirige vers la saisie du code. */}
      <Route
        path="/backoffice"
        element={
          backofficeUnlocked
            ? <BackofficeHomePage onLock={() => setBackofficeUnlocked(false)} />
            : <Navigate to="/backoffice/login" replace />
        }
      />
    </Routes>
  )
}

export default App
