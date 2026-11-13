import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ErrorBoundary } from './ErrorBoundary'
import { MenuPerfil } from './components/perfil/MenuPerfil'
import { enviarBoasVindas } from './lib/boasVindas'
import { supabase } from './lib/supabase'
import type { Empresa } from './lib/types'
import AcceptInvitePage from './pages/AcceptInvitePage'
import AnaliseDrePage from './pages/AnaliseDrePage'
import EmpresaGatePage from './pages/EmpresaGatePage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import PerfilAdminPage from './pages/PerfilAdminPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import TermosPage from './pages/TermosPage'

// DFC Scale: fork do PainelGestaa com apenas a Análise DFC.
// Rotas: '/' (landing sem login, DFC com login), '/entrar' (login),
// '/termos' (termos de uso), '/reset-password' e '/referencias' (Referências
// do DRE, aberta pelo menu de perfil: todos consultam, só profiles.role = 'admin' edita).
const DFC_PATH = '/'
const ENTRAR_PATH = '/entrar'
const TERMOS_PATH = '/termos'
const REFERENCIAS_PATH = '/referencias'
// Caminho do app DFC no cadastro de apps do PainelGestaa (tabela `apps`),
// usado para respeitar a liberação de acesso feita pelo admin.
const DFC_INTERNAL_LINK = '/analise-dre'
const EMPRESA_STORAGE_KEY = 'empresa_selecionada'

export interface User {
  name: string
  email: string
  tipoUsuario: 'titular' | 'colaborador' | null
}

async function sessionToUser(session: Session): Promise<User> {
  const meta = session.user.user_metadata
  const email = session.user.email ?? ''
  const fallbackName = meta?.full_name
    ?? meta?.name
    ?? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, tipo_usuario')
    .eq('id', session.user.id)
    .maybeSingle()

  const name = profile?.name?.trim() || fallbackName
  const tipo = profile?.tipo_usuario
  const tipoUsuario = tipo === 'titular' || tipo === 'colaborador' ? tipo : null
  return { name, email, tipoUsuario }
}

function rotuloCargo(admin: boolean, tipo: User['tipoUsuario']) {
  if (admin) return 'Administrador'
  if (tipo === 'colaborador') return 'Colaborador'
  if (tipo === 'titular') return 'Titular'
  return 'Usuário'
}

async function carregarAcessoUsuario(session: Session) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, ativo, app_access_ids')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.ativo === false) {
    await supabase.auth.signOut()
    return { permitido: false, temAcessoDfc: false, admin: false }
  }

  // Cargo de ADM (o mesmo do PainelGestaa): libera a edição das Referências do DRE.
  // null = não deu para ler agora (falha de rede): mantém o que já se sabia.
  const admin: boolean | null = profileError ? null : profile?.role === 'admin'

  if (admin || profile?.app_access_ids == null) {
    return { permitido: true, temAcessoDfc: true, admin }
  }

  if (profile.app_access_ids.length === 0) {
    return { permitido: true, temAcessoDfc: false, admin }
  }

  const { data: apps, error: appsError } = await supabase
    .from('apps')
    .select('internal_link')
    .in('id', profile.app_access_ids)

  if (appsError) {
    return { permitido: true, temAcessoDfc: true, admin }
  }

  const temAcessoDfc = (apps ?? []).some(app => {
    const link = app.internal_link?.trim() ?? ''
    if (!link || link.startsWith('http')) return false
    return (link.startsWith('/') ? link : '/' + link) === DFC_INTERNAL_LINK
  })

  return { permitido: true, temAcessoDfc, admin }
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
  const [isAdmin, setIsAdmin] = useState(false)
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
        setIsAdmin(false)
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
        setIsAdmin(false)
        return
      }

      setUser(await sessionToUser(session))
      setUserId(session.user.id)
      setTemAcessoDfc(acesso.temAcessoDfc)
      if (acesso.admin !== null) setIsAdmin(acesso.admin)
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

  // Depois do login em /entrar, o app abre na raiz (DFC).
  useEffect(() => {
    if (user && pathname === ENTRAR_PATH) {
      window.history.replaceState({}, '', DFC_PATH)
      setPathname(DFC_PATH)
    }
  }, [user, pathname])

  // Sair das Referências do DRE com alterações não salvas (Voltar do navegador ou menu de perfil).
  const guardaSaidaRef = useRef<(() => boolean) | null>(null)
  const registrarGuardaSaida = useCallback((guarda: (() => boolean) | null) => {
    guardaSaidaRef.current = guarda
  }, [])
  const podeSairDaTela = () => !guardaSaidaRef.current || guardaSaidaRef.current()

  useEffect(() => {
    const onPopState = () => {
      const guarda = guardaSaidaRef.current
      if (guarda && window.location.pathname !== REFERENCIAS_PATH && !guarda()) {
        window.history.pushState({}, '', REFERENCIAS_PATH)
        return
      }
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem(EMPRESA_STORAGE_KEY)
    setEmpresaSelecionada(null)
    await supabase.auth.signOut()
    setTermosAceitos(null)
    setUserId(null)
    setIsAdmin(false)
    window.history.replaceState({}, '', DFC_PATH)
    setPathname(DFC_PATH)
  }

  const abrirReferencias = useCallback(() => {
    if (window.location.pathname === REFERENCIAS_PATH) return
    window.history.pushState({}, '', REFERENCIAS_PATH)
    setPathname(REFERENCIAS_PATH)
  }, [])

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
          window.history.replaceState({}, '', ENTRAR_PATH)
          setPathname(ENTRAR_PATH)
        }}
        onRecoveryComplete={async () => {
          setIsRecoveryFlow(false)
          await supabase.auth.signOut()
          window.history.replaceState({}, '', ENTRAR_PATH)
          setPathname(ENTRAR_PATH)
        }}
      />
    </ErrorBoundary>
  )

  if (loading) {
    return <Carregando />
  }

  if (!user) {
    if (pathname === '/reset-password') return resetPassword
    if (pathname === ENTRAR_PATH) {
      return (
        <LoginPage
          onForgotPassword={() => navigate('/reset-password')}
          onVoltar={() => navigate(DFC_PATH)}
        />
      )
    }
    return <LandingPage onEntrar={() => navigate(ENTRAR_PATH)} />
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
            // Primeiro acesso ao DFC: dispara o e-mail de boas-vindas (a função ignora quem já tinha aceitado).
            if (termosAceitos === false) enviarBoasVindas()
            setTermosAceitos(true)
            navigate(DFC_PATH)
          }}
        />
      </ErrorBoundary>
    )
  }

  const menuPerfil = (
    <MenuPerfil
      nome={user.name}
      email={user.email}
      cargo={rotuloCargo(isAdmin, user.tipoUsuario)}
      podeEditarReferencias={isAdmin}
      onAbrirReferencias={abrirReferencias}
      onSair={() => { if (podeSairDaTela()) void handleLogout() }}
    />
  )

  // Referências do DRE: todos consultam; só o ADM edita (o RLS também barra a gravação).
  if (pathname === REFERENCIAS_PATH) {
    return (
      <ErrorBoundary>
        <PerfilAdminPage
          podeEditar={isAdmin}
          nomeUsuario={user.name}
          menuPerfil={menuPerfil}
          onVoltar={() => navigate(DFC_PATH)}
          registrarGuardaSaida={registrarGuardaSaida}
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
          onVerTermos={() => navigate(TERMOS_PATH)}
          nomeUsuario={user.name}
          emailUsuario={user.email}
          menuPerfil={menuPerfil}
        />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <AnaliseDrePage
        empresa={empresaSelecionada}
        onTrocarEmpresa={trocarEmpresa}
        menuPerfil={menuPerfil}
      />
    </ErrorBoundary>
  )
}

export default App
