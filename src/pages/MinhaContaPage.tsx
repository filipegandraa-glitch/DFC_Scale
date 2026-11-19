import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { notifyToast } from '../lib/toast'
import base from './PerfilAdminPage.module.css'
import styles from './MinhaContaPage.module.css'

// Minha conta (modelo: "Minha conta" da Precificação Scale): dados de quem usa e troca de senha.
// O nome fica em profiles.name (o mesmo de todos os apps ClinicScale). Telefone, WhatsApp,
// Instagram e outros links ficam no user_metadata da própria conta, sem tabela nova.
// E-mail de acesso e cargo não se alteram aqui.

interface Props {
  userId: string
  email: string
  /** Rótulo do cargo: Administrador, Titular, Colaborador... */
  cargo: string
  menuPerfil?: ReactNode
  onVoltar: () => void
  /** Chamado depois de salvar, para o topo do app mostrar o nome novo. */
  onPerfilAtualizado: () => void
  /** O App consulta antes de sair pelo botão Voltar do navegador (false = ficar). */
  registrarGuardaSaida?: (guarda: (() => boolean) | null) => void
}

interface Dados {
  nome: string
  telefone: string
  whatsapp: boolean
  instagram: string
  links: string[]
}

const VAZIO: Dados = { nome: '', telefone: '', whatsapp: false, instagram: '', links: [] }
const MAX_LINKS = 5
const CONFIRMAR_SAIDA = 'Você tem alterações não salvas na sua conta. Sair mesmo assim?'

function formatarTelefone(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** "@usuario", "instagram.com/usuario/" ou "usuario" viram "usuario". */
function limparInstagram(valor: string) {
  return valor
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '')
    .replace(/[^A-Za-z0-9._]/g, '')
    .slice(0, 30)
}

function normalizarLink(valor: string) {
  const t = valor.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function linkValido(valor: string) {
  if (!valor.trim()) return true
  try {
    const url = new URL(normalizarLink(valor))
    return url.hostname.includes('.')
  } catch {
    return false
  }
}

const textoOuVazio = (v: unknown) => (typeof v === 'string' ? v : '')

const IconeOlho = ({ aberto }: { aberto: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {aberto && <path d="M4 4l16 16" />}
  </svg>
)

function CampoSenha({ id, rotulo, valor, onMudar, autoComplete }: {
  id: string; rotulo: string; valor: string; onMudar: (v: string) => void; autoComplete: string
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className={styles.campo}>
      <label htmlFor={id} className={styles.rotulo}>{rotulo}</label>
      <div className={styles.caixaSenha}>
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          className={styles.input}
          value={valor}
          onChange={e => onMudar(e.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className={styles.olho}
          onClick={() => setVisivel(v => !v)}
          aria-label={visivel ? `Ocultar ${rotulo.toLowerCase()}` : `Mostrar ${rotulo.toLowerCase()}`}
          aria-pressed={visivel}
        >
          <IconeOlho aberto={visivel} />
        </button>
      </div>
    </div>
  )
}

export default function MinhaContaPage({ userId, email, cargo, menuPerfil, onVoltar, onPerfilAtualizado, registrarGuardaSaida }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [salvo, setSalvo] = useState<Dados>(VAZIO)
  const [dados, setDados] = useState<Dados>(VAZIO)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroDados, setErroDados] = useState<string | null>(null)

  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaRepetida, setSenhaRepetida] = useState('')
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)

  useEffect(() => {
    const tituloAnterior = document.title
    document.title = 'Minha conta — DFC Scale'
    return () => { document.title = tituloAnterior }
  }, [])

  useEffect(() => {
    let ativo = true
    Promise.all([
      supabase.from('profiles').select('name, avatar_url').eq('id', userId).maybeSingle(),
      supabase.auth.getUser(),
    ]).then(([{ data: perfil }, { data: { user } }]) => {
      if (!ativo) return
      const meta = user?.user_metadata ?? {}
      const inicial: Dados = {
        nome: perfil?.name?.trim() || textoOuVazio(meta.full_name) || textoOuVazio(meta.name) || email.split('@')[0],
        telefone: formatarTelefone(textoOuVazio(meta.telefone)),
        whatsapp: meta.telefone_whatsapp === true,
        instagram: limparInstagram(textoOuVazio(meta.instagram)),
        links: Array.isArray(meta.links) ? meta.links.filter((l: unknown): l is string => typeof l === 'string').slice(0, MAX_LINKS) : [],
      }
      setSalvo(inicial)
      setDados(inicial)
      setAvatarUrl(perfil?.avatar_url || null)
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [userId, email])

  const sujo = useMemo(() => JSON.stringify(dados) !== JSON.stringify(salvo), [dados, salvo])
  const senhaEmAndamento = senhaAtual !== '' || senhaNova !== '' || senhaRepetida !== ''
  const pendente = sujo || senhaEmAndamento

  // Sair com alterações não salvas: pergunta (Voltar do navegador, menu, fechar a aba).
  const pendenteRef = useRef(pendente)
  pendenteRef.current = pendente
  useEffect(() => {
    if (!registrarGuardaSaida) return
    registrarGuardaSaida(() => !pendenteRef.current || window.confirm(CONFIRMAR_SAIDA))
    return () => registrarGuardaSaida(null)
  }, [registrarGuardaSaida])
  useEffect(() => {
    if (!pendente) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [pendente])

  const voltar = () => {
    if (pendente && !window.confirm(CONFIRMAR_SAIDA)) return
    registrarGuardaSaida?.(null)
    onVoltar()
  }

  const mudar = <K extends keyof Dados>(campo: K, valor: Dados[K]) => {
    setErroDados(null)
    setDados(d => ({ ...d, [campo]: valor }))
  }

  const digitosTelefone = dados.telefone.replace(/\D/g, '').length
  const telefoneInvalido = digitosTelefone > 0 && digitosTelefone < 10
  const nomeInvalido = dados.nome.trim().length < 2
  const linksInvalidos = dados.links.map(l => !linkValido(l))
  const podeSalvar = sujo && !salvando && !nomeInvalido && !telefoneInvalido && !linksInvalidos.some(Boolean)

  const salvarDados = async (e: FormEvent) => {
    e.preventDefault()
    if (!podeSalvar) return
    setSalvando(true)
    setErroDados(null)

    const nome = dados.nome.trim().replace(/\s+/g, ' ')
    const links = dados.links.map(normalizarLink).filter(Boolean)
    const instagram = limparInstagram(dados.instagram)

    if (nome !== salvo.nome) {
      const { error } = await supabase.from('profiles').update({ name: nome }).eq('id', userId)
      if (error) {
        setSalvando(false)
        setErroDados('Não foi possível salvar o nome. Tente de novo.')
        return
      }
    }

    const { error } = await supabase.auth.updateUser({
      data: {
        telefone: dados.telefone.replace(/\D/g, ''),
        telefone_whatsapp: digitosTelefone > 0 && dados.whatsapp,
        instagram,
        links,
      },
    })
    setSalvando(false)
    if (error) {
      setErroDados('Não foi possível salvar os contatos. Tente de novo.')
      return
    }

    const atualizado: Dados = { ...dados, nome, instagram, links, whatsapp: digitosTelefone > 0 && dados.whatsapp }
    setSalvo(atualizado)
    setDados(atualizado)
    notifyToast('Dados salvos.', 'success')
    onPerfilAtualizado()
  }

  const senhaCurta = senhaNova.length > 0 && (senhaNova.length < 8 || !/\d/.test(senhaNova))
  const senhaDiferente = senhaRepetida.length > 0 && senhaRepetida !== senhaNova
  const senhaIgualAtual = senhaNova.length > 0 && senhaNova === senhaAtual
  const podeTrocarSenha = !trocandoSenha && senhaAtual.length > 0 && senhaNova.length >= 8 && /\d/.test(senhaNova)
    && senhaRepetida === senhaNova && !senhaIgualAtual

  const trocarSenha = async (e: FormEvent) => {
    e.preventDefault()
    if (!podeTrocarSenha) return
    setTrocandoSenha(true)
    setErroSenha(null)

    // Confere a senha atual antes de trocar.
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senhaAtual })
    if (erroLogin) {
      setTrocandoSenha(false)
      setErroSenha('A senha atual não confere.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: senhaNova })
    setTrocandoSenha(false)
    if (error) {
      const msg = error.message.toLowerCase()
      setErroSenha(
        msg.includes('different') ? 'A nova senha precisa ser diferente da atual.'
          : msg.includes('weak') || msg.includes('short') ? 'Essa senha é fraca demais. Use uma mais longa, com letras e números.'
            : 'Não foi possível trocar a senha. Tente de novo.',
      )
      return
    }

    setSenhaAtual('')
    setSenhaNova('')
    setSenhaRepetida('')
    notifyToast('Senha trocada.', 'success')
  }

  const inicial = (dados.nome.trim() || email).charAt(0).toLocaleUpperCase('pt-BR')

  return (
    <div className={`${base.page} ${styles.page}`}>
      {/* ── Faixa escura: navegação e título ── */}
      <header className={`${base.faixa} tema-grafite`}>
        <div className={base.faixaGlow} aria-hidden />
        <div className={base.faixaConteudo}>
          <div className={base.nav}>
            <button type="button" className={base.marca} onClick={voltar} aria-label="DFC Scale — voltar">
              <img src="/symbol-gold.svg" alt="" width={22} height={22} />
              <span>DFC <b>Scale</b></span>
            </button>
            <div className={base.navDir}>
              <button type="button" className={base.navLink} onClick={voltar}>← Voltar</button>
              {menuPerfil}
            </div>
          </div>

          <div className={base.faixaCabeca}>
            <p className={base.eyebrow}>Conta</p>
            <h1 className={base.titulo}>Minha conta</h1>
            <p className={base.apoio}>
              Seus dados e sua senha. As Referências e a Estrutura do DRE ficam em Configuração geral.
            </p>
          </div>
        </div>
      </header>

      {/* ── Corpo marfim ── */}
      <main className={`${base.corpo} tema-marfim`}>
        <div className={base.conteudo}>
          {carregando ? (
            <div className={base.carregando} role="status">
              <span className={base.spinner} aria-hidden />
              Carregando a sua conta…
            </div>
          ) : (
            <div className={styles.grade}>
              {/* Cartão de identidade */}
              <aside className={styles.lateral}>
                <div className={styles.cartao}>
                  <div className={styles.avatar} aria-hidden>
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{inicial}</span>}
                  </div>
                  <p className={styles.cartaoNome}>{dados.nome.trim() || email.split('@')[0]}</p>
                  <p className={styles.cartaoEmail}>{email}</p>
                  <hr className={styles.cartaoDivisor} />
                  <p className={styles.cartaoCargo}>{cargo}</p>
                </div>
                <p className={styles.legenda}>É assim que você aparece no topo do app e para a mentoria.</p>
              </aside>

              <div className={styles.colunaCards}>
                {/* Quem é você */}
                <form className={styles.card} onSubmit={salvarDados} noValidate>
                  <h2 className={styles.cardTitulo}>Quem é você</h2>

                  <div className={styles.campo}>
                    <label htmlFor="conta-nome" className={styles.rotulo}>Nome</label>
                    <input
                      id="conta-nome"
                      className={`${styles.input} ${nomeInvalido ? styles.inputInvalido : ''}`}
                      value={dados.nome}
                      onChange={e => mudar('nome', e.target.value)}
                      autoComplete="name"
                      maxLength={80}
                      aria-invalid={nomeInvalido}
                      aria-describedby={nomeInvalido ? 'conta-nome-erro' : undefined}
                    />
                    {nomeInvalido && <p id="conta-nome-erro" className={styles.erroCampo}>Informe o seu nome.</p>}
                  </div>

                  <div className={styles.duasColunas}>
                    <div className={styles.campo}>
                      <label htmlFor="conta-telefone" className={styles.rotulo}>Telefone</label>
                      <input
                        id="conta-telefone"
                        className={`${styles.input} ${telefoneInvalido ? styles.inputInvalido : ''}`}
                        value={dados.telefone}
                        onChange={e => mudar('telefone', formatarTelefone(e.target.value))}
                        placeholder="(11) 90000-0000"
                        inputMode="tel"
                        autoComplete="tel-national"
                        aria-invalid={telefoneInvalido}
                        aria-describedby={telefoneInvalido ? 'conta-telefone-erro' : undefined}
                      />
                      {telefoneInvalido && <p id="conta-telefone-erro" className={styles.erroCampo}>Inclua o DDD e o número completo.</p>}
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={dados.whatsapp}
                          onChange={e => mudar('whatsapp', e.target.checked)}
                          disabled={digitosTelefone === 0}
                        />
                        <span>É meu WhatsApp</span>
                      </label>
                    </div>

                    <div className={styles.campo}>
                      <label htmlFor="conta-instagram" className={styles.rotulo}>Instagram</label>
                      <div className={styles.caixaPrefixo}>
                        <span className={styles.prefixo} aria-hidden>@</span>
                        <input
                          id="conta-instagram"
                          className={styles.inputComPrefixo}
                          value={dados.instagram}
                          onChange={e => mudar('instagram', limparInstagram(e.target.value))}
                          placeholder="usuario"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-describedby="conta-instagram-dica"
                        />
                      </div>
                      <p id="conta-instagram-dica" className={styles.dica}>Só o usuário: a arroba entra sozinha.</p>
                    </div>
                  </div>

                  <div className={styles.campo}>
                    <span className={styles.rotulo} id="conta-links-rotulo">Outros links</span>
                    {dados.links.length > 0 && (
                      <ul className={styles.listaLinks} aria-labelledby="conta-links-rotulo">
                        {dados.links.map((link, i) => (
                          <li key={i} className={styles.linhaLink}>
                            <input
                              className={`${styles.input} ${linksInvalidos[i] ? styles.inputInvalido : ''}`}
                              value={link}
                              onChange={e => mudar('links', dados.links.map((l, j) => (j === i ? e.target.value : l)))}
                              placeholder="site da clínica, LinkedIn…"
                              inputMode="url"
                              autoCapitalize="none"
                              spellCheck={false}
                              aria-label={`Link ${i + 1}`}
                              aria-invalid={linksInvalidos[i]}
                            />
                            <button
                              type="button"
                              className={styles.remover}
                              onClick={() => mudar('links', dados.links.filter((_, j) => j !== i))}
                              aria-label={`Remover link ${i + 1}`}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                                <path d="M6 6l12 12M18 6L6 18" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {linksInvalidos.some(Boolean) && <p className={styles.erroCampo}>Confira o link destacado.</p>}
                    {dados.links.length < MAX_LINKS && (
                      <button
                        type="button"
                        className={styles.adicionar}
                        onClick={() => mudar('links', [...dados.links, ''])}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Adicionar link
                      </button>
                    )}
                  </div>

                  <div className={styles.rodapeCard}>
                    <div className={styles.travado}>
                      <span className={styles.chip}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                        {email}
                      </span>
                      <span className={styles.dica}>E-mail de acesso e cargo: fale com a mentoria para trocar.</span>
                    </div>
                    <div className={styles.acoes}>
                      {erroDados && <p className={styles.erroAcao} role="alert">{erroDados}</p>}
                      <button type="submit" className={base.btnSalvar} disabled={!podeSalvar}>
                        {salvando ? 'Salvando…' : 'Salvar dados'}
                      </button>
                    </div>
                  </div>
                </form>

                {/* Segurança */}
                <form className={styles.card} onSubmit={trocarSenha} noValidate>
                  <h2 className={styles.cardTitulo}>Segurança</h2>
                  {/* Para gerenciadores de senha associarem a conta */}
                  <input type="email" value={email} autoComplete="username" readOnly hidden />

                  <CampoSenha id="senha-atual" rotulo="Senha atual" valor={senhaAtual} onMudar={v => { setErroSenha(null); setSenhaAtual(v) }} autoComplete="current-password" />

                  <div className={styles.duasColunas}>
                    <div>
                      <CampoSenha id="senha-nova" rotulo="Nova senha" valor={senhaNova} onMudar={v => { setErroSenha(null); setSenhaNova(v) }} autoComplete="new-password" />
                      <p className={senhaCurta ? styles.erroCampo : styles.dica}>Mínimo de 8 caracteres, com ao menos um número.</p>
                      {senhaIgualAtual && <p className={styles.erroCampo}>A nova senha precisa ser diferente da atual.</p>}
                    </div>
                    <div>
                      <CampoSenha id="senha-repetida" rotulo="Repetir a nova" valor={senhaRepetida} onMudar={v => { setErroSenha(null); setSenhaRepetida(v) }} autoComplete="new-password" />
                      {senhaDiferente && <p className={styles.erroCampo}>As senhas não são iguais.</p>}
                    </div>
                  </div>

                  <div className={styles.acoesSenha}>
                    {erroSenha && <p className={styles.erroAcao} role="alert">{erroSenha}</p>}
                    <button type="submit" className={base.btnSalvar} disabled={!podeTrocarSenha}>
                      {trocandoSenha ? 'Trocando…' : 'Trocar senha'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
