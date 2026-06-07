import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// Nouveau rôle de cette page : Express a DÉJÀ échangé le code contre un token.
// GLPI redirige vers Express → Express échange → Express redirige ici avec ?access_token=XXX
// Cette page n'a plus qu'à lire le token dans l'URL et le stocker.
function CallbackPage() {
  const [params] = useSearchParams()
  const navigate  = useNavigate()

  useEffect(() => {
    const access_token = params.get('access_token')

    if (access_token) {
      // Stocke le token Bearer dans localStorage pour les futures requêtes GLPI
      localStorage.setItem('access_token', access_token)
      // navigate avec replace:true → retire /callback de l'historique du navigateur
      navigate('/', { replace: true })
    } else {
      // Pas de token dans l'URL = erreur quelque part en amont
      navigate('/login', { replace: true })
    }
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10rem' }}>
      <p>Connexion en cours...</p>
    </div>
  )
}

export default CallbackPage
