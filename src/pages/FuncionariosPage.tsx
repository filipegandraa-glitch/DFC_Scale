import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import ModalTransition from '../components/ModalTransition'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'
import { getFunctionErrorMessage, translateFunctionErrorMessage } from '../lib/functionError'
import { supabase } from '../lib/supabase'
import { notifyToast } from '../lib/toast'
import type { PermissaoEmpresa } from '../lib/types'
import base from './PerfilAdminPage.module.css'
import styles from './FuncionariosPage.module.css'

// Configuração geral › Funcionários (só para titulares).
// O titular libera as empresas dele para quem trabalha com ele, como leitor (só consulta)
// ou editor (consulta e altera). Só aceita e-mails que JÁ têm login: criar login é só dos
// administradores. Regras no banco: dfc_listar_funcionarios, dfc_vincular_funcionario e
// dfc_definir_acessos_funcionario; e-mails e links de senha pela função dfc-funcionarios.

interface Props {
  userId: string
  menuPerfil?: ReactNode
  /** Menu lateral da Configuração geral */
  abas?: ReactNode
  onVoltar: () => void
}

interface Empresa { id: string; nome: string }

interface Acesso { empresa_id: string; empresa_nome: string; permissao: PermissaoEmpresa }

interface Funcionario {
  user_id: string
  nome: string | null
  email: string | null
  pendente: boolean
  convidado_em: string | null
  acessos: Acesso[]
}

type Selecao = Record<string, PermissaoEmpresa | undefined>

const ROTULO_PERMISSAO: Record<PermissaoEmpresa, string> = { leitor: 'Leitor', editor: 'Editor' }
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const nomeExibicao = (f: Pick<Funcionario, 'nome' | 'email'>) => f.nome?.trim() || f.email?.split('@')[0] || 'Funcionário'

const IconeMais = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const IconeEnvelope = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
  </svg>
)

// ── Escolha de empresas e permissões (usada em "Adicionar" e "Editar acessos") ──
function EscolhaEmpresas({ empresas, selecao, onMudar, desabilitado }: {
  empresas: Empresa[]
  selecao: Selecao
  onMudar: (s: Selecao) => void
  desabilitado: boolean
}) {
  return (
    <fieldset className={styles.empresas} disabled={desabilitado}>
      <legend className={styles.rotulo}>Empresas que a pessoa pode acessar</legend>
      <ul className={styles.listaEmpresas}>
        {empresas.map(emp => {
          const permissao = selecao[emp.id]
          const marcada = permissao !== undefined
          const idCheck = `emp-${emp.id}`
          return (
            <li key={emp.id} className={`${styles.linhaEmpresa} ${marcada ? styles.linhaEmpresaMarcada : ''}`}>
              <label htmlFor={idCheck} className={styles.checkEmpresa}>
                <input
                  id={idCheck}
                  type="checkbox"
                  checked={marcada}
                  onChange={e => onMudar({ ...selecao, [emp.id]: e.target.checked ? 'leitor' : undefined })}
                />
                <span className={styles.nomeEmpresa}>{emp.nome}</span>
              </label>
              <div className={styles.segmento} role="radiogroup" aria-label={`Permissão em ${emp.nome}`}>
                {(['leitor', 'editor'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={permissao === p}
                    disabled={!marcada}
                    className={`${styles.segmentoOpcao} ${permissao === p ? styles.segmentoAtivo : ''}`}
                    onClick={() => onMudar({ ...selecao, [emp.id]: p })}
                  >
                    {ROTULO_PERMISSAO[p]}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      <p className={styles.dica}>
        <strong>Leitor</strong> só consulta a DFC e os relatórios. <strong>Editor</strong> também importa extratos e
        cria, edita e exclui lançamentos. Empresas não marcadas ficam invisíveis para a pessoa.
      </p>
    </fieldset>
  )
}

const selecaoParaAcessos = (selecao: Selecao) =>
  Object.entries(selecao)
    .filter((par): par is [string, PermissaoEmpresa] => par[1] !== undefined)
    .map(([empresa_id, permissao]) => ({ empresa_id, permissao }))

// ── Modal: adicionar funcionário ─────────────────────────────────────────────
function ModalAdicionar({ empresas, onFechar, onConcluido }: {
  empresas: Empresa[]
  onFechar: () => void
  onConcluido: () => void
}) {
  const [email, setEmail] = useState('')
  const [selecao, setSelecao] = useState<Selecao>(() => (empresas.length === 1 ? { [empresas[0].id]: 'leitor' } : {}))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fundo = useBackdropDismiss(onFechar, enviando)

  const acessos = selecaoParaAcessos(selecao)
  const emailOk = EMAIL_VALIDO.test(email.trim())
  const podeEnviar = !enviando && emailOk && acessos.length > 0

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!podeEnviar) return
    setEnviando(true)
    setErro(null)
    const { data, error } = await supabase.functions.invoke('dfc-funcionarios', {
      body: { acao: 'adicionar', email: email.trim().toLowerCase(), acessos },
    })
    setEnviando(false)
    if (error || !data?.ok) {
      setErro(error ? await getFunctionErrorMessage(error, 'Não foi possível adicionar o funcionário.') : 'Não foi possível adicionar o funcionário.')
      return
    }
    const destino = email.trim().toLowerCase()
    if (!data.email_enviado) {
      notifyToast(
        data.modo === 'convidado'
          ? `Acesso liberado, mas o e-mail com o link de senha não saiu. Use "Reenviar convite" na lista.`
          : `Acesso liberado para ${destino}, mas o e-mail de aviso não saiu.`,
        'warning',
        { duration: 9000 },
      )
    } else if (data.modo === 'convidado') {
      notifyToast(`Acesso liberado. ${destino} ainda não tinha entrado: mandamos o link para criar a senha.`, 'success')
    } else {
      notifyToast(`Acesso liberado para ${destino}. Avisamos por e-mail.`, 'success')
    }
    onConcluido()
  }

  return (
    <div className={styles.fundoModal} onPointerDown={fundo.handleBackdropPointerDown} onClick={fundo.handleBackdropClick}>
      <form className={styles.modal} onClick={e => e.stopPropagation()} onSubmit={enviar} noValidate aria-labelledby="titulo-adicionar">
        <h2 id="titulo-adicionar" className={styles.modalTitulo}>Adicionar funcionário</h2>
        <p className={styles.modalApoio}>
          Informe o e-mail de login da pessoa. Ela precisa já ter acesso ao DFC Scale: se ainda não tiver,
          peça a um administrador para criar o login dela. Depois disso, ela entra só nas empresas que você marcar.
        </p>

        <div className={styles.campo}>
          <label htmlFor="func-email" className={styles.rotulo}>E-mail de login</label>
          <input
            id="func-email"
            type="email"
            className={styles.input}
            value={email}
            onChange={e => { setErro(null); setEmail(e.target.value) }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome@clinica.com.br"
            autoFocus
          />
        </div>

        <EscolhaEmpresas empresas={empresas} selecao={selecao} onMudar={s => { setErro(null); setSelecao(s) }} desabilitado={enviando} />

        {erro && <p className={styles.erro} role="alert">{erro}</p>}

        <div className={styles.acoesModal}>
          <button type="button" className={base.btnSecundario} onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button type="submit" className={base.btnSalvar} disabled={!podeEnviar}>
            {enviando ? 'Liberando…' : 'Liberar acesso'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Modal: editar acessos (e remover) ────────────────────────────────────────
function ModalEditar({ funcionario, empresas, onFechar, onConcluido }: {
  funcionario: Funcionario
  empresas: Empresa[]
  onFechar: () => void
  onConcluido: () => void
}) {
  const inicial = useMemo<Selecao>(
    () => Object.fromEntries(funcionario.acessos.map(a => [a.empresa_id, a.permissao])),
    [funcionario],
  )
  const [selecao, setSelecao] = useState<Selecao>(inicial)
  const [salvando, setSalvando] = useState(false)
  const [confirmarRemocao, setConfirmarRemocao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fundo = useBackdropDismiss(onFechar, salvando)

  const acessos = selecaoParaAcessos(selecao)
  const mudou = JSON.stringify(acessos.slice().sort((a, b) => a.empresa_id.localeCompare(b.empresa_id)))
    !== JSON.stringify(selecaoParaAcessos(inicial).sort((a, b) => a.empresa_id.localeCompare(b.empresa_id)))
  const nome = nomeExibicao(funcionario)

  const gravar = async (lista: { empresa_id: string; permissao: PermissaoEmpresa }[], mensagem: string) => {
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.rpc('dfc_definir_acessos_funcionario', { p_user_id: funcionario.user_id, p_acessos: lista })
    setSalvando(false)
    if (error) {
      setErro(translateFunctionErrorMessage(error.message, 'Não foi possível salvar os acessos.'))
      return
    }
    notifyToast(mensagem, 'success')
    onConcluido()
  }

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    if (salvando || !mudou) return
    if (acessos.length === 0) {
      setConfirmarRemocao(true)
      return
    }
    void gravar(acessos, `Acessos de ${nome} atualizados.`)
  }

  return (
    <div className={styles.fundoModal} onPointerDown={fundo.handleBackdropPointerDown} onClick={fundo.handleBackdropClick}>
      <form className={styles.modal} onClick={e => e.stopPropagation()} onSubmit={salvar} noValidate aria-labelledby="titulo-editar">
        {confirmarRemocao ? (
          <>
            <h2 id="titulo-editar" className={styles.modalTitulo}>Remover {nome}?</h2>
            <p className={styles.modalApoio}>
              {nome} perde o acesso a todas as suas empresas na hora. A conta dele(a) continua existindo e você pode
              adicionar de novo quando quiser.
            </p>
            {erro && <p className={styles.erro} role="alert">{erro}</p>}
            <div className={styles.acoesModal}>
              <button type="button" className={base.btnSecundario} onClick={() => setConfirmarRemocao(false)} disabled={salvando}>Voltar</button>
              <button type="button" className={styles.btnPerigo} disabled={salvando} onClick={() => void gravar([], `${nome} não tem mais acesso às suas empresas.`)}>
                {salvando ? 'Removendo…' : 'Remover acesso'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="titulo-editar" className={styles.modalTitulo}>Acessos de {nome}</h2>
            {funcionario.email && <p className={styles.modalApoio}>{funcionario.email}</p>}

            <EscolhaEmpresas empresas={empresas} selecao={selecao} onMudar={s => { setErro(null); setSelecao(s) }} desabilitado={salvando} />

            {erro && <p className={styles.erro} role="alert">{erro}</p>}

            <div className={styles.acoesModalSeparadas}>
              <button type="button" className={styles.linkPerigo} onClick={() => setConfirmarRemocao(true)} disabled={salvando}>
                Remover funcionário
              </button>
              <div className={styles.acoesModal}>
                <button type="button" className={base.btnSecundario} onClick={onFechar} disabled={salvando}>Cancelar</button>
                <button type="submit" className={base.btnSalvar} disabled={salvando || !mudou}>
                  {salvando ? 'Salvando…' : 'Salvar acessos'}
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function FuncionariosPage({ userId, menuPerfil, abas, onVoltar }: Props) {
  const [carregamento, setCarregamento] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [adicionando, setAdicionando] = useState(false)
  const [editando, setEditando] = useState<Funcionario | null>(null)
  const [reenviando, setReenviando] = useState<string | null>(null)

  useEffect(() => {
    const tituloAnterior = document.title
    document.title = 'Funcionários — DFC Scale'
    return () => { document.title = tituloAnterior }
  }, [])

  const carregar = useCallback(async () => {
    setCarregamento(c => (c === 'pronto' ? c : 'carregando'))

    const { data: vinculos, error: erroVinculos } = await supabase
      .from('empresa_membros')
      .select('empresa_id')
      .eq('user_id', userId)
      .eq('role', 'admin')
    if (erroVinculos) { setCarregamento('erro'); return }

    const ids = (vinculos ?? []).map(v => v.empresa_id)
    const [empresasRes, funcionariosRes] = await Promise.all([
      ids.length
        ? supabase.from('empresas').select('id, nome').in('id', ids).eq('ativo', true).order('nome')
        : Promise.resolve({ data: [] as Empresa[], error: null }),
      supabase.rpc('dfc_listar_funcionarios'),
    ])
    if (empresasRes.error || funcionariosRes.error) { setCarregamento('erro'); return }

    const porPessoa = new Map<string, Funcionario>()
    for (const linha of funcionariosRes.data ?? []) {
      const atual = porPessoa.get(linha.user_id) ?? {
        user_id: linha.user_id,
        nome: linha.nome,
        email: linha.email,
        pendente: linha.pendente,
        convidado_em: linha.convidado_em,
        acessos: [],
      }
      atual.acessos.push({ empresa_id: linha.empresa_id, empresa_nome: linha.empresa_nome, permissao: linha.permissao })
      porPessoa.set(linha.user_id, atual)
    }

    setEmpresas((empresasRes.data ?? []) as Empresa[])
    setFuncionarios([...porPessoa.values()])
    setCarregamento('pronto')
  }, [userId])

  useEffect(() => { void carregar() }, [carregar])

  const reenviar = async (f: Funcionario) => {
    setReenviando(f.user_id)
    const { data, error } = await supabase.functions.invoke('dfc-funcionarios', { body: { acao: 'reenviar', user_id: f.user_id } })
    setReenviando(null)
    if (error || !data?.ok) {
      notifyToast(error ? await getFunctionErrorMessage(error, 'Não foi possível reenviar o convite.') : 'Não foi possível reenviar o convite.', 'error')
      return
    }
    notifyToast(data.email_enviado ? `Convite reenviado para ${f.email}.` : 'O link foi gerado, mas o e-mail não saiu. Tente de novo em instantes.', data.email_enviado ? 'success' : 'warning')
  }

  const concluir = () => {
    setAdicionando(false)
    setEditando(null)
    void carregar()
  }

  return (
    <div className={`${base.page} ${styles.page} ${abas ? base.comLateral : ''}`}>
      {/* ── Faixa escura: navegação e título ── */}
      <header className={`${base.faixa} tema-grafite`}>
        <div className={base.faixaGlow} aria-hidden />
        <div className={base.faixaConteudo}>
          <div className={base.nav}>
            <button type="button" className={base.marca} onClick={onVoltar} aria-label="DFC Scale — voltar">
              <img src="/symbol-gold.svg" alt="" width={22} height={22} />
              <span>DFC <b>Scale</b></span>
            </button>
            <div className={base.navDir}>
              <button type="button" className={base.navLink} onClick={onVoltar}>← Voltar</button>
              {menuPerfil}
            </div>
          </div>

          <div className={base.faixaCabeca}>
            <p className={base.eyebrow}>Configuração geral</p>
            <h1 className={base.titulo}>Funcionários</h1>
            <p className={base.apoio}>
              Libere as suas empresas para quem trabalha com você. Cada pessoa só vê as empresas que você marcar,
              como leitor (só consulta) ou editor (consulta e altera). A pessoa precisa já ter login: quem cria logins
              são os administradores.
            </p>
          </div>
        </div>
      </header>

      {/* ── Corpo marfim ── */}
      <main className={`${base.corpo} tema-marfim`}>
        <div className={base.corpoGrade}>
          {abas && <aside className={base.lateral}>{abas}</aside>}
          <div className={base.conteudo}>
            {carregamento === 'carregando' && (
              <div className={base.carregando} role="status">
                <span className={base.spinner} aria-hidden />
                Carregando os funcionários…
              </div>
            )}

            {carregamento === 'erro' && (
              <div className={base.erroCarga} role="alert">
                <p>Não foi possível carregar os funcionários.</p>
                <button type="button" className={base.btnSecundario} onClick={() => void carregar()}>Tentar de novo</button>
              </div>
            )}

            {carregamento === 'pronto' && empresas.length === 0 && (
              <section className={styles.vazio}>
                <h2 className={styles.vazioTitulo}>Cadastre uma empresa primeiro</h2>
                <p className={styles.vazioTexto}>
                  Funcionários recebem acesso às empresas de que você é titular. Assim que você cadastrar a sua
                  primeira empresa, volte aqui para liberar o acesso da sua equipe.
                </p>
                <button type="button" className={base.btnSalvar} onClick={onVoltar}>Ir para as minhas empresas</button>
              </section>
            )}

            {carregamento === 'pronto' && empresas.length > 0 && (
              <section aria-labelledby="titulo-equipe">
                <div className={styles.topo}>
                  <div>
                    <h2 id="titulo-equipe" className={base.secaoTitulo}>Sua equipe</h2>
                    <p className={styles.contagem}>
                      {funcionarios.length === 0
                        ? 'Ninguém além de você por enquanto.'
                        : `${funcionarios.length} ${funcionarios.length === 1 ? 'pessoa' : 'pessoas'} com acesso às suas empresas.`}
                    </p>
                  </div>
                  <button type="button" className={`${base.btnSalvar} ${styles.btnAdicionar}`} onClick={() => setAdicionando(true)}>
                    <IconeMais /> Adicionar funcionário
                  </button>
                </div>

                {funcionarios.length === 0 ? (
                  <div className={styles.vazioLista}>
                    <p>
                      Adicione a secretária, o gerente ou o contador: escolha as empresas e se a pessoa só consulta
                      ou também edita. A pessoa precisa já ter login no DFC Scale (criado por um administrador).
                    </p>
                  </div>
                ) : (
                  <ul className={styles.lista}>
                    {funcionarios.map(f => {
                      const nome = nomeExibicao(f)
                      return (
                        <li key={f.user_id} className={styles.cartao}>
                          <div className={styles.cartaoTopo}>
                            <span className={styles.avatar} aria-hidden>{nome.charAt(0).toLocaleUpperCase('pt-BR')}</span>
                            <div className={styles.identidade}>
                              <p className={styles.nome}>
                                {nome}
                                {f.pendente && <span className={styles.seloPendente}>Convite pendente</span>}
                              </p>
                              {f.email && <p className={styles.email}>{f.email}</p>}
                            </div>
                            <div className={styles.acoesCartao}>
                              {f.pendente && (
                                <button
                                  type="button"
                                  className={styles.linkAcao}
                                  onClick={() => void reenviar(f)}
                                  disabled={reenviando === f.user_id}
                                >
                                  <IconeEnvelope /> {reenviando === f.user_id ? 'Enviando…' : 'Reenviar convite'}
                                </button>
                              )}
                              <button type="button" className={base.btnSecundario} onClick={() => setEditando(f)}>
                                Editar acessos
                              </button>
                            </div>
                          </div>
                          <ul className={styles.acessos} aria-label={`Empresas de ${nome}`}>
                            {f.acessos.map(a => (
                              <li key={a.empresa_id} className={styles.acesso}>
                                <span className={styles.acessoEmpresa}>{a.empresa_nome}</span>
                                <span className={a.permissao === 'editor' ? styles.seloEditor : styles.seloLeitor}>
                                  {ROTULO_PERMISSAO[a.permissao]}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <dl className={styles.legenda}>
                  <div><dt>Leitor</dt><dd>Consulta a DFC, os gráficos e exporta relatórios. Não altera nada.</dd></div>
                  <div><dt>Editor</dt><dd>Também importa extratos e cria, edita e exclui lançamentos.</dd></div>
                  <div><dt>Você (titular)</dt><dd>Tudo isso, mais editar a empresa e liberar acessos.</dd></div>
                </dl>
              </section>
            )}
          </div>
        </div>
      </main>

      <ModalTransition open={adicionando}>
        {adicionando && <ModalAdicionar empresas={empresas} onFechar={() => setAdicionando(false)} onConcluido={concluir} />}
      </ModalTransition>
      <ModalTransition open={!!editando}>
        {editando && <ModalEditar funcionario={editando} empresas={empresas} onFechar={() => setEditando(null)} onConcluido={concluir} />}
      </ModalTransition>
    </div>
  )
}
