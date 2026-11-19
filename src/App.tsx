import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ErrorBoundary } from './ErrorBoundary'
import { AbasConfiguracao, type AbaConfiguracao } from './components/configuracao/AbasConfiguracao'
import { GrupoPerfil } from './components/perfil/BotaoTema'
import { MenuPerfil } from './components/perfil/MenuPerfil'
import { enviarBoasVindas } from './lib/boasVindas'
import { supabase } from './lib/supabase'
import type { Empresa } from './lib/types'
import AcceptInvitePage from './pages/AcceptInvitePage'
import AnaliseDrePage from './pages/AnaliseDrePage'
import EmpresaGatePage from './pages/EmpresaGatePage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import EstruturaDrePage from './pages/EstruturaDrePage'
import FuncionariosPage from './pages/FuncionariosPage'
import MinhaContaPage from './pages/MinhaContaPage'
import PerfilAdminPage from './pages/PerfilAdminPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import TermosPage from './pages/TermosPage'

// DFC Scale: fork do PainelGestaa com apenas a Análise DFC.
// Rotas: '/' (landing sem login, DFC com login), '/entrar' (login),
// '/termos' (termos de uso), '/reset-password', '/conta' (Minha conta) e a
// Configuração geral, com duas abas: '/referencias' (Referências do DRE) e
// '/estrutura' (Estrutura do DRE). Todas abrem pelo menu de perfil; na
// Configuração geral todos consultam, só profiles.role = 'admin' edita.
const DFC_PATH = '/'
const ENTRAR_PATH = '/entrar'
const TERMOS_PATH = '/termos'
const REFERENCIAS_PATH = '/referencias'
const ESTRUTURA_PATH = '/estrutura'
const CONTA_PATH = '/conta'
const FUNCIONARIOS_PATH = '/funcionarios'
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
  if (tipo === 'colaborador') return 'Funcionário'
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
      height: '100vh', background: '#16140f',
    }}>
      <div style={{
        width: 28, height: 28,
        border: '3px solid rgba(194, 160, 99, 0.18)',
        borderTopColor: '#c2a063',
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
      gap: 28, minHeight: '100vh', boxSizing: 'border-box', padding: '48px 16px',
      background: 'radial-gradient(ellipse 70% 55% at 50% -5%, rgba(194, 160, 99, 0.18) 0%, rgba(194, 160, 99, 0) 70%), #16140f',
      color: '#16140f', fontFamily: "'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif",
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 17, color: '#f4efe3' }}>
        <img src="/symbol-gold.svg" alt="" width={22} height={22} style={{ display: 'block' }} />
        <span>DFC <b style={{ fontWeight: 700 }}>Scale</b></span>
      </span>
      <div style={{
        width: '100%', maxWidth: 460, boxSizing: 'border-box', padding: 32,
        background: '#f2eee3', borderRadius: 16, boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h1 style={{
          margin: 0, fontFamily: "'Sora', 'Hanken Grotesk', system-ui, sans-serif",
          fontSize: 26, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', color: '#16140f',
        }}>
          Acesso à Análise DFC não liberado
        </h1>
        <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.55, color: '#5f5a4e' }}>
          Sua conta não tem permissão para usar a Análise DFC. Peça ao administrador para liberar o acesso.
        </p>
        <button
          onClick={onLogout}
          style={{
            width: '100%', background: '#16140f', color: '#f4efe3', border: '1px solid #16140f', borderRadius: 10,
            padding: '13px 18px', font: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </div>
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

  // Sair de uma tela de edição (Referências ou Estrutura do DRE) com alterações não
  // salvas: Voltar do navegador ou menu de perfil perguntam antes.
  const guardaSaidaRef = useRef<{ guarda: () => boolean; caminho: string } | null>(null)
  const registrarGuardaSaida = useCallback((guarda: (() => boolean) | null) => {
    guardaSaidaRef.current = guarda ? { guarda, caminho: window.location.pathname } : null
  }, [])
  const podeSairDaTela = () => !guardaSaidaRef.current || guardaSaidaRef.current.guarda()

  useEffect(() => {
    const onPopState = () => {
      const atual = guardaSaidaRef.current
      if (atual && window.location.pathname !== atual.caminho && !atual.guarda()) {
        window.history.pushState({}, '', atual.caminho)
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

  const abrirTela = useCallback((caminho: string) => {
    if (window.location.pathname === caminho) return
    const atual = guardaSaidaRef.current
    if (atual && !atual.guarda()) return
    window.history.pushState({}, '', caminho)
    setPathname(caminho)
  }, [])
  const abrirReferencias = useCallback(() => abrirTela(REFERENCIAS_PATH), [abrirTela])
  const abrirConta = useCallback(() => abrirTela(CONTA_PATH), [abrirTela])
  const abrirAbaConfiguracao = useCallback(
    (aba: AbaConfiguracao) => abrirTela(
      aba === 'estrutura' ? ESTRUTURA_PATH : aba === 'funcionarios' ? FUNCIONARIOS_PATH : REFERENCIAS_PATH,
    ),
    [abrirTela],
  )

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

  const cargo = rotuloCargo(isAdmin, user.tipoUsuario)
  // Funcionários: titulares (e administradores) liberam as empresas deles para a equipe.
  const podeTerEquipe = isAdmin || user.tipoUsuario !== 'colaborador'
  // Botão de modo claro/escuro + menu de perfil (aparece em todas as telas depois do login).
  const menuPerfil = (
    <GrupoPerfil>
      <MenuPerfil
        nome={user.name}
        email={user.email}
        cargo={cargo}
        onAbrirConta={abrirConta}
        onAbrirConfiguracao={abrirReferencias}
        onSair={() => { if (podeSairDaTela()) void handleLogout() }}
      />
    </GrupoPerfil>
  )

  if (pathname === CONTA_PATH) {
    return (
      <ErrorBoundary>
        <MinhaContaPage
          userId={userId!}
          email={user.email}
          cargo={cargo}
          menuPerfil={menuPerfil}
          onVoltar={() => navigate(DFC_PATH)}
          onPerfilAtualizado={() => void refreshAuthenticatedUser()}
          registrarGuardaSaida={registrarGuardaSaida}
        />
      </ErrorBoundary>
    )
  }

  // Funcionários: só titulares e administradores (colaborador cai na DFC, abaixo).
  if (pathname === FUNCIONARIOS_PATH && podeTerEquipe) {
    return (
      <ErrorBoundary>
        <FuncionariosPage
          userId={userId!}
          menuPerfil={menuPerfil}
          abas={<AbasConfiguracao atual="funcionarios" onAbrir={abrirAbaConfiguracao} mostrarFuncionarios />}
          onVoltar={() => navigate(DFC_PATH)}
        />
      </ErrorBoundary>
    )
  }

  // Estrutura do DRE: todos consultam; só o ADM edita (o RLS também barra a gravação).
  if (pathname === ESTRUTURA_PATH) {
    return (
      <ErrorBoundary>
        <EstruturaDrePage
          podeEditar={isAdmin}
          nomeUsuario={user.name}
          menuPerfil={menuPerfil}
          abas={<AbasConfiguracao atual="estrutura" onAbrir={abrirAbaConfiguracao} mostrarFuncionarios={podeTerEquipe} />}
          onVoltar={() => navigate(DFC_PATH)}
          registrarGuardaSaida={registrarGuardaSaida}
        />
      </ErrorBoundary>
    )
  }

  // Referências do DRE: todos consultam; só o ADM edita (o RLS também barra a gravação).
  if (pathname === REFERENCIAS_PATH) {
    return (
      <ErrorBoundary>
        <PerfilAdminPage
          podeEditar={isAdmin}
          nomeUsuario={user.name}
          menuPerfil={menuPerfil}
          abas={<AbasConfiguracao atual="referencias" onAbrir={abrirAbaConfiguracao} mostrarFuncionarios={podeTerEquipe} />}
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
        onAbrirReferencias={abrirReferencias}
        podeEditarReferencias={isAdmin}
      />
    </ErrorBoundary>
  )
}

export default App
