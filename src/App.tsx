import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ErrorBoundary } from './ErrorBoundary'
import { supabase } from './lib/supabase'
import type { Empresa } from './lib/types'
import AcceptInvitePage from './pages/AcceptInvitePage'
import AnaliseDrePage from './pages/AnaliseDrePage'
import EmpresaGatePage from './pages/EmpresaGatePage'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import TermosPage from './pages/TermosPage'

// DFC Scale: fork do PainelGestaa com apenas a Análise DFC.
// Rotas: '/' (DFC), '/termos' (termos de uso) e '/reset-password'.
const DFC_PATH = '/'
const TERMOS_PATH = '/termos'
// Caminho do app DFC no cadastro de apps do PainelGestaa (tabela `apps`),
// usado para respeitar a liberação de acesso feita pelo admin.
const DFC_INTERNAL_LINK = '/analise-dre'
const EMPRESA_STORAGE_KEY = 'empresa_selecionada'

export interface User {
  name: string
  email: string
}

async function sessionToUser(session: Session): Promise<User> {
  const meta = session.user.user_metadata
  const email = session.user.email ?? ''
  const fallbackName = meta?.full_name
    ?? meta?.name
    ?? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', session.user.id)
    .maybeSingle()

  const name = profile?.name?.trim() || fallbackName
  return { name, email }
}

async function carregarAcessoUsuario(session: Session) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ativo, app_access_ids')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.ativo === false) {
    await supabase.auth.signOut()
    return { permitido: false, temAcessoDfc: false }
  }

  if (profile?.role === 'admin' || profile?.app_access_ids == null) {
    return { permitido: true, temAcessoDfc: true }
  }

  if (profile.app_access_ids.length === 0) {
    return { permitido: true, temAcessoDfc: false }
  }

  const { data: apps, error: appsError } = await supabase
    .from('apps')
    .select('internal_link')
    .in('id', profile.app_access_ids)

  if (appsError) {
    return { permitido: true, temAcessoDfc: true }
  }

  const temAcessoDfc = (apps ?? []).some(app => {
    const link = app.internal_link?.trim() ?? ''
    if (!link || link.startsWith('http')) return false
    return (link.startsWith('/') ? link : '/' + link) === DFC_INTERNAL_LINK
  })

  return { permitido: true, temAcessoDfc }
}

function restaurarEmpresa() {
  try {
    const stored = localStorage.getItem(EMPRESA_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as Empresa) : null
  } catch {
    return null
  }
}

function Carregando() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#080808',
    }}>
      <div style={{
        width: 28, height: 28,
        border: '3px solid #1e1e1e',
        borderTopColor: '#c9a22a',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function SemAcesso({ onLogout }: { onLogout: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, height: '100vh', background: '#080808', color: '#e8e8e8', padding: 24, textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Acesso à Análise DFC não liberado</h1>
      <p style={{ color: '#9a9a9a', maxWidth: 420, margin: 0 }}>
        Sua conta não tem permissão para usar a Análise DFC. Peça ao administrador para liberar o acesso.
      </p>
      <button
        onClick={onLogout}
        style={{
          background: '#c9a22a', color: '#080808', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        Sair
      </button>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pathname, setPathname] = useState(window.location.pathname)
  const [isInviteFlow, setIsInviteFlow] = useState(false)
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [termosAceitos, setTermosAceitos] = useState<boolean | null>(null)
  const [temAcessoDfc, setTemAcessoDfc] = useState(true)
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(restaurarEmpresa)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark')
  }, [])

  const refreshAuthenticatedUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      setUser(null)
      setUserId(null)
      return
    }

    setUser(await sessionToUser(session))
    setUserId(session.user.id)
  }, [])

  const navigate = (path: string) => {
    window.history.pushState({}, '', path)
    setPathname(path)
  }

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=invite')) {
      setIsInviteFlow(true)
    }
    if (hash.includes('type=recovery')) {
      setIsRecoveryFlow(true)
    }

    const aplicarSessao = async (session: Session | null, event?: string) => {
      if (!session) {
        setUser(null)
        setUserId(null)
        setTermosAceitos(null)
        setTemAcessoDfc(true)
        setIsInviteFlow(false)
        setIsRecoveryFlow(false)
        return
      }

      const acesso = await carregarAcessoUsuario(session)
      if (!acesso.permitido) {
        setUser(null)
        setUserId(null)
        setTermosAceitos(null)
        setTemAcessoDfc(true)
        return
      }

      setUser(await sessionToUser(session))
      setUserId(session.user.id)
      setTemAcessoDfc(acesso.temAcessoDfc)
      if (session.user.email && window.location.hash.includes('type=invite')) {
        setIsInviteFlow(true)
        setInviteEmail(session.user.email)
      }
      if (event === 'PASSWORD_RECOVERY' || window.location.hash.includes('type=recovery')) {
        setIsRecoveryFlow(true)
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await aplicarSessao(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      void aplicarSessao(session, event)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) {
      setTermosAceitos(null)
      return
    }

    supabase
      .from('termos_aceite')
      .select('id')
      .eq('user_id', userId)
      .eq('app', 'dfc-clinicscale')
      .maybeSingle()
      .then(({ data }) => setTermosAceitos(!!data))
  }, [userId])

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem(EMPRESA_STORAGE_KEY)
    setEmpresaSelecionada(null)
    await supabase.auth.signOut()
    setTermosAceitos(null)
    setUserId(null)
    window.history.replaceState({}, '', DFC_PATH)
    setPathname(DFC_PATH)
  }

  const selecionarEmpresa = (emp: Empresa) => {
    localStorage.setItem(EMPRESA_STORAGE_KEY, JSON.stringify(emp))
    setEmpresaSelecionada(emp)
  }

  const trocarEmpresa = useCallback(() => {
    localStorage.removeItem(EMPRESA_STORAGE_KEY)
    setEmpresaSelecionada(null)
  }, [])

  const resetPassword = (
    <ErrorBoundary>
      <ResetPasswordPage
        recoveryMode={isRecoveryFlow}
        onBack={() => {
          setIsRecoveryFlow(false)
          window.history.replaceState({}, '', DFC_PATH)
          setPathname(DFC_PATH)
        }}
        onRecoveryComplete={async () => {
          setIsRecoveryFlow(false)
          await supabase.auth.signOut()
          window.history.replaceState({}, '', DFC_PATH)
          setPathname(DFC_PATH)
        }}
      />
    </ErrorBoundary>
  )

  if (loading) {
    return <Carregando />
  }

  if (!user) {
    if (pathname === '/reset-password') return resetPassword
    return <LoginPage onForgotPassword={() => navigate('/reset-password')} />
  }

  if (isInviteFlow) {
    return (
      <ErrorBoundary>
        <AcceptInvitePage
          email={inviteEmail || user.email}
          onSuccess={async () => {
            await refreshAuthenticatedUser()
            setIsInviteFlow(false)
            window.history.replaceState({}, '', DFC_PATH)
            navigate(DFC_PATH)
          }}
        />
      </ErrorBoundary>
    )
  }

  if (pathname === '/reset-password') return resetPassword

  if (!temAcessoDfc) {
    return <SemAcesso onLogout={handleLogout} />
  }

  if (termosAceitos === null) {
    return <Carregando />
  }

  if (pathname === TERMOS_PATH || termosAceitos === false) {
    return (
      <ErrorBoundary>
        <TermosPage
          userId={userId!}
          userName={user.name}
          onAceitar={() => {
            setTermosAceitos(true)
            navigate(DFC_PATH)
          }}
        />
      </ErrorBoundary>
    )
  }

  if (pathname !== DFC_PATH) {
    window.history.replaceState({}, '', DFC_PATH)
  }

  if (!empresaSelecionada) {
    return (
      <ErrorBoundary>
        <EmpresaGatePage
          onSelecionar={selecionarEmpresa}
          onVoltar={handleLogout}
          voltarLabel="Sair"
          onVerTermos={() => navigate(TERMOS_PATH)}
        />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <AnaliseDrePage
        empresa={empresaSelecionada}
        onTrocarEmpresa={trocarEmpresa}
        onVoltar={handleLogout}
        voltarLabel="Sair"
      />
    </ErrorBoundary>
  )
}

export default App
