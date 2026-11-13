import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import base from './PerfilAdminPage.module.css'
import styles from './EstruturaDrePage.module.css'
import {
  ConflitoEstrutura,
  ESTRUTURA_PADRAO,
  LINHAS_DRE,
  SEGMENTO_PADRAO,
  SUBTOTAIS_DRE,
  carregarEstrutura,
  clonarEstrutura,
  idDoSegmento,
  palavrasDoTexto,
  salvarEstrutura,
  serializarEstrutura,
  validarNomeConta,
  type ContaDre,
  type EstruturaDre,
  type LinhaDreId,
  type SegmentoDre,
} from '../lib/estruturaDre'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'

// Estrutura do DRE gerencial: linhas fixas do método + contas por segmento.
// Todos consultam; só ADM (podeEditar) altera — e o RLS de `configuracoes`
// barra a gravação de quem não é ADM.

interface Props {
  podeEditar: boolean
  nomeUsuario: string
  menuPerfil?: ReactNode
  onVoltar: () => void
  registrarGuardaSaida?: (guarda: (() => boolean) | null) => void
}

interface EmpresaResumo {
  id: string
  nome: string
  cnpj: string | null
}

const CONFIRMAR_SAIDA = 'Você tem alterações não salvas na estrutura do DRE. Sair mesmo assim?'
const MAX_CHIPS = 8

const formatarDataHora = (iso: string) => {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  return `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

async function nomeDoAutor(id: string | null): Promise<string | null> {
  if (!id) return null
  const { data } = await supabase.from('profiles').select('name').eq('id', id).maybeSingle()
  return data?.name?.trim() || null
}

/** Aplica uma mudança numa cópia do segmento indicado. */
function comSegmento(estrutura: EstruturaDre, segmentoId: string, mudar: (s: SegmentoDre) => SegmentoDre): EstruturaDre {
  return { ...estrutura, segmentos: estrutura.segmentos.map(s => (s.id === segmentoId ? mudar(s) : s)) }
}

const comConta = (s: SegmentoDre, nome: string, mudar: (c: ContaDre) => ContaDre): SegmentoDre =>
  ({ ...s, contas: s.contas.map(c => (c.nome === nome ? mudar(c) : c)) })

export default function EstruturaDrePage({ podeEditar, nomeUsuario, menuPerfil, onVoltar, registrarGuardaSaida }: Props) {
  const [carregamento, setCarregamento] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const [erroCarregamento, setErroCarregamento] = useState('')
  const [salva, setSalva] = useState<EstruturaDre>(() => clonarEstrutura(ESTRUTURA_PADRAO))
  const [atual, setAtual] = useState<EstruturaDre>(() => clonarEstrutura(ESTRUTURA_PADRAO))
  const [versao, setVersao] = useState<string | null>(null)
  const [autor, setAutor] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro' | 'conflito'; texto: string } | null>(null)
  const [segmentoId, setSegmentoId] = useState(SEGMENTO_PADRAO)
  const [empresas, setEmpresas] = useState<EmpresaResumo[] | null>(null)

  // Formulários abertos (um por vez)
  const [novaConta, setNovaConta] = useState<{ linha: LinhaDreId; nome: string; palavras: string; erro: string } | null>(null)
  const [editandoPalavras, setEditandoPalavras] = useState<{ nome: string; texto: string } | null>(null)
  const [novoSegmento, setNovoSegmento] = useState<{ nome: string; copiarDe: string; erro: string } | null>(null)

  const carregar = useCallback(async () => {
    setCarregamento('carregando')
    setAviso(null)
    try {
      const r = await carregarEstrutura()
      setSalva(r.estrutura)
      setAtual(clonarEstrutura(r.estrutura))
      setVersao(r.atualizadoEm)
      setAutor(await nomeDoAutor(r.autorId))
      setSegmentoId(id => (r.estrutura.segmentos.some(s => s.id === id) ? id : SEGMENTO_PADRAO))
      setCarregamento('pronto')
    } catch (err) {
      setErroCarregamento(err instanceof Error ? err.message : String(err))
      setCarregamento('erro')
    }
  }, [])

  useEffect(() => {
    const tituloAnterior = document.title
    document.title = 'Estrutura do DRE — DFC Scale'
    void carregar()
    return () => { document.title = tituloAnterior }
  }, [carregar])

  // Lista de empresas (só ADM enxerga todas)
  useEffect(() => {
    if (!podeEditar) return
    supabase.from('empresas').select('id, nome, cnpj').eq('ativo', true).order('nome')
      .then(({ data }) => setEmpresas((data ?? []) as EmpresaResumo[]))
  }, [podeEditar])

  // A barra de salvar é fixa no rodapé: o campo focado não fica escondido atrás dela.
  useEffect(() => {
    if (!podeEditar) return
    const raiz = document.documentElement
    const anterior = raiz.style.scrollPaddingBottom
    raiz.style.scrollPaddingBottom = '140px'
    return () => { raiz.style.scrollPaddingBottom = anterior }
  }, [podeEditar])

  const temAlteracoes = useMemo(
    () => serializarEstrutura(atual, null) !== serializarEstrutura(salva, null),
    [atual, salva],
  )

  useEffect(() => {
    if (!temAlteracoes) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [temAlteracoes])

  useEffect(() => {
    if (!registrarGuardaSaida) return
    registrarGuardaSaida(() => !salvando && (!temAlteracoes || window.confirm(CONFIRMAR_SAIDA)))
    return () => registrarGuardaSaida(null)
  }, [registrarGuardaSaida, temAlteracoes, salvando])

  const sairCom = (acao: () => void) => () => {
    if (salvando) return
    if (temAlteracoes && !window.confirm(CONFIRMAR_SAIDA)) return
    acao()
  }

  const segmento = atual.segmentos.find(s => s.id === segmentoId) ?? atual.segmentos[0]
  const empresasNoSegmento = (id: string) =>
    empresas
      ? empresas.filter(e => (atual.empresas[e.id] ?? SEGMENTO_PADRAO) === id).length
      : null

  const mudar = (fn: (e: EstruturaDre) => EstruturaDre) => {
    setAtual(prev => fn(prev))
    if (aviso?.tipo === 'ok') setAviso(null)
  }

  // ── Ações do ADM ──
  const adicionarConta = (e: FormEvent) => {
    e.preventDefault()
    if (!novaConta) return
    const nome = novaConta.nome.trim().replace(/\s+/g, ' ')
    const erro = validarNomeConta(nome, segmento)
    if (erro) {
      setNovaConta({ ...novaConta, erro })
      return
    }
    const conta: ContaDre = { nome, linha: novaConta.linha, palavras: palavrasDoTexto(novaConta.palavras), ativo: true }
    mudar(est => comSegmento(est, segmento.id, s => ({ ...s, contas: [...s.contas, conta] })))
    setNovaConta(null)
  }

  const alternarConta = (nome: string) =>
    mudar(est => comSegmento(est, segmento.id, s => comConta(s, nome, c => ({ ...c, ativo: !c.ativo }))))

  const aplicarPalavras = (e: FormEvent) => {
    e.preventDefault()
    if (!editandoPalavras) return
    const palavras = palavrasDoTexto(editandoPalavras.texto)
    mudar(est => comSegmento(est, segmento.id, s => comConta(s, editandoPalavras.nome, c => ({ ...c, palavras }))))
    setEditandoPalavras(null)
  }

  const criarSegmento = (e: FormEvent) => {
    e.preventDefault()
    if (!novoSegmento) return
    const nome = novoSegmento.nome.trim().replace(/\s+/g, ' ')
    if (nome.length < 2 || nome.length > 60) {
      setNovoSegmento({ ...novoSegmento, erro: 'Digite um nome entre 2 e 60 caracteres.' })
      return
    }
    if (atual.segmentos.some(s => s.nome.toLowerCase() === nome.toLowerCase())) {
      setNovoSegmento({ ...novoSegmento, erro: 'Já existe um segmento com esse nome.' })
      return
    }
    const origem = atual.segmentos.find(s => s.id === novoSegmento.copiarDe) ?? atual.segmentos[0]
    const id = idDoSegmento(nome, atual.segmentos)
    const novo: SegmentoDre = { id, nome, contas: origem.contas.map(c => ({ ...c, palavras: [...c.palavras] })) }
    mudar(est => ({ ...est, segmentos: [...est.segmentos, novo] }))
    setSegmentoId(id)
    setNovoSegmento(null)
  }

  const definirSegmentoDaEmpresa = (empresaId: string, novoId: string) =>
    mudar(est => {
      const empresasMap = { ...est.empresas }
      if (novoId === SEGMENTO_PADRAO) delete empresasMap[empresaId]
      else empresasMap[empresaId] = novoId
      return { ...est, empresas: empresasMap }
    })

  const descartar = () => {
    setAtual(clonarEstrutura(salva))
    setNovaConta(null)
    setEditandoPalavras(null)
    setNovoSegmento(null)
    setAviso(null)
    if (!salva.segmentos.some(s => s.id === segmentoId)) setSegmentoId(SEGMENTO_PADRAO)
  }

  const salvar = async () => {
    if (!podeEditar || !temAlteracoes || salvando) return
    setSalvando(true)
    setAviso(null)
    try {
      const { data: sessao } = await supabase.auth.getUser()
      const atualizadoEm = await salvarEstrutura(atual, { versaoCarregada: versao, autorId: sessao.user?.id ?? null })
      setSalva(clonarEstrutura(atual))
      setVersao(atualizadoEm)
      setAutor(nomeUsuario || null)
      setAviso({ tipo: 'ok', texto: 'Salvo. A nova estrutura já vale para os lançamentos de todas as empresas.' })
      toast.success('Estrutura do DRE salva.')
    } catch (err) {
      if (err instanceof ConflitoEstrutura) {
        setAviso({ tipo: 'conflito', texto: err.message })
      } else {
        const msg = err instanceof Error ? err.message : ''
        setAviso({
          tipo: 'erro',
          texto: msg.startsWith('Sua conta') ? msg : `Não foi possível salvar. Verifique a conexão e tente de novo.${msg ? ` (${msg})` : ''}`,
        })
      }
    } finally {
      setSalvando(false)
    }
  }

  const contasDaLinha = (linha: LinhaDreId) => segmento.contas.filter(c => c.linha === linha)
  const subtotalDepois = (linha: LinhaDreId) => SUBTOTAIS_DRE.find(s => s.depoisDe === linha)

  return (
    <div className={`${base.page} ${styles.page}`}>
      {/* ── Faixa escura: navegação e título ── */}
      <header className={`${base.faixa} tema-grafite`}>
        <div className={base.faixaGlow} aria-hidden />
        <div className={base.faixaConteudo}>
          <div className={base.nav}>
            <button type="button" className={base.marca} onClick={sairCom(onVoltar)} aria-label="DFC Scale — voltar">
              <img src="/symbol-gold.svg" alt="" width={22} height={22} />
              <span>DFC <b>Scale</b></span>
            </button>
            <div className={base.navDir}>
              <button type="button" className={base.navLink} onClick={sairCom(onVoltar)}>← Voltar</button>
              {menuPerfil}
            </div>
          </div>

          <div className={base.faixaCabeca}>
            <p className={base.eyebrow}>{podeEditar ? 'Perfil administrativo' : 'Perfil'}</p>
            <h1 className={base.titulo}>Estrutura do DRE</h1>
            <p className={base.apoio}>
              O DRE gerencial tem as mesmas linhas para todas as empresas. Dentro de cada linha ficam as contas do
              segmento da empresa: é por elas que os lançamentos são reconhecidos e organizados.
              {podeEditar
                ? ' Só administradores alteram a estrutura; os usuários apenas consultam.'
                : ' Só administradores podem alterar a estrutura.'}
            </p>
          </div>
        </div>
      </header>

      {/* ── Corpo marfim ── */}
      <main className={`${base.corpo} tema-marfim`}>
        <div className={base.conteudo}>

          {carregamento === 'carregando' && (
            <div className={base.carregando} role="status">
              <span className={base.spinner} aria-hidden />
              Carregando a estrutura…
            </div>
          )}

          {carregamento === 'erro' && (
            <div className={base.erroCarga} role="alert">
              <p>Não foi possível carregar a estrutura{erroCarregamento ? `: ${erroCarregamento}` : '.'}</p>
              <button type="button" className={base.btnSecundario} onClick={() => void carregar()}>Tentar de novo</button>
            </div>
          )}

          {carregamento === 'pronto' && (
            <>
              {/* ── Segmentos ── */}
              <section className={base.secao} aria-labelledby="segmentos-titulo">
                <h2 id="segmentos-titulo" className={base.secaoTitulo}>Segmento</h2>
                <div className={styles.segmentos} role="tablist" aria-label="Segmentos">
                  {atual.segmentos.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={s.id === segmento.id}
                      className={`${styles.segmento} ${s.id === segmento.id ? styles.segmentoAtivo : ''}`}
                      onClick={() => { setSegmentoId(s.id); setNovaConta(null); setEditandoPalavras(null) }}
                    >
                      {s.nome}
                      {s.id === SEGMENTO_PADRAO && <span className={styles.segmentoTag}>padrão</span>}
                    </button>
                  ))}
                  {podeEditar && !novoSegmento && (
                    <button
                      type="button"
                      className={styles.segmentoNovo}
                      onClick={() => setNovoSegmento({ nome: '', copiarDe: segmento.id, erro: '' })}
                      disabled={salvando}
                    >
                      + Novo segmento
                    </button>
                  )}
                </div>

                {novoSegmento && (
                  <form className={styles.formulario} onSubmit={criarSegmento}>
                    <label className={styles.campoForm}>
                      <span>Nome do segmento</span>
                      <input
                        autoFocus
                        value={novoSegmento.nome}
                        onChange={e => setNovoSegmento({ ...novoSegmento, nome: e.target.value, erro: '' })}
                        placeholder="Ex.: Estética e harmonização"
                        maxLength={60}
                      />
                    </label>
                    <label className={styles.campoForm}>
                      <span>Começar com as contas de</span>
                      <select value={novoSegmento.copiarDe} onChange={e => setNovoSegmento({ ...novoSegmento, copiarDe: e.target.value })}>
                        {atual.segmentos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </label>
                    <div className={styles.formAcoes}>
                      <button type="submit" className={styles.btnPrimario}>Criar segmento</button>
                      <button type="button" className={base.btnSecundario} onClick={() => setNovoSegmento(null)}>Cancelar</button>
                    </div>
                    {novoSegmento.erro && <p className={styles.erroForm}>{novoSegmento.erro}</p>}
                  </form>
                )}

                <p className={base.secaoTexto}>
                  {segmento.contas.filter(c => c.ativo).length} contas ativas
                  {segmento.contas.some(c => !c.ativo) && `, ${segmento.contas.filter(c => !c.ativo).length} desativadas`}
                  {empresasNoSegmento(segmento.id) !== null && ` · ${empresasNoSegmento(segmento.id)} empresas neste segmento`}
                  {segmento.id === SEGMENTO_PADRAO && ' · empresas sem segmento definido usam este.'}
                </p>
              </section>

              {/* ── Linhas e contas ── */}
              <section className={base.secao} aria-labelledby="linhas-titulo">
                <h2 id="linhas-titulo" className={base.secaoTitulo}>Linhas e contas — {segmento.nome}</h2>
                <p className={base.secaoTexto}>
                  As linhas e os subtotais são fixos (método ClinicScale). Cada lançamento entra na linha da conta
                  em que foi classificado. As palavras-chave ajudam a reconhecer a conta pela descrição do extrato.
                  {podeEditar && ' Contas desativadas deixam de receber lançamentos novos, mas os antigos continuam organizados.'}
                </p>

                <ol className={styles.arvore}>
                  {LINHAS_DRE.map(linha => {
                    const contas = contasDaLinha(linha.id)
                    const subtotal = subtotalDepois(linha.id)
                    return (
                      <Fragment key={linha.id}>
                        <li className={styles.linha}>
                          <div className={styles.linhaTopo}>
                            <span className={`${styles.sinal} ${linha.tipo === 'receita' ? styles.sinalMais : styles.sinalMenos}`} aria-hidden>
                              {linha.tipo === 'receita' ? '+' : '−'}
                            </span>
                            <div className={styles.linhaTexto}>
                              <h3 className={styles.linhaRotulo}>{linha.rotulo}</h3>
                              <p className={styles.linhaDescricao}>{linha.descricao}</p>
                            </div>
                            <span className={styles.linhaContagem}>
                              {contas.filter(c => c.ativo).length} {contas.filter(c => c.ativo).length === 1 ? 'conta' : 'contas'}
                            </span>
                          </div>

                          <ul className={styles.contas}>
                            {contas.map(conta => {
                              const editando = editandoPalavras?.nome === conta.nome
                              const extras = conta.palavras.length - MAX_CHIPS
                              return (
                                <li key={conta.nome} className={`${styles.conta} ${conta.ativo ? '' : styles.contaInativa}`}>
                                  <div className={styles.contaTopo}>
                                    <span className={styles.contaNome}>
                                      {conta.nome}
                                      {!conta.ativo && <span className={styles.tagInativa}>desativada</span>}
                                    </span>
                                    {podeEditar && !editando && (
                                      <span className={styles.contaAcoes}>
                                        <button
                                          type="button"
                                          className={styles.linkAcao}
                                          onClick={() => { setNovaConta(null); setEditandoPalavras({ nome: conta.nome, texto: conta.palavras.join(', ') }) }}
                                          disabled={salvando}
                                        >
                                          Palavras-chave
                                        </button>
                                        <button type="button" className={styles.linkAcao} onClick={() => alternarConta(conta.nome)} disabled={salvando}>
                                          {conta.ativo ? 'Desativar' : 'Reativar'}
                                        </button>
                                      </span>
                                    )}
                                  </div>

                                  {editando ? (
                                    <form className={styles.formPalavras} onSubmit={aplicarPalavras}>
                                      <label className={styles.campoForm}>
                                        <span>Palavras-chave (separe por vírgula)</span>
                                        <textarea
                                          autoFocus
                                          rows={2}
                                          value={editandoPalavras.texto}
                                          onChange={e => setEditandoPalavras({ ...editandoPalavras, texto: e.target.value })}
                                        />
                                      </label>
                                      <div className={styles.formAcoes}>
                                        <button type="submit" className={styles.btnPrimario}>Aplicar</button>
                                        <button type="button" className={base.btnSecundario} onClick={() => setEditandoPalavras(null)}>Cancelar</button>
                                      </div>
                                    </form>
                                  ) : conta.palavras.length > 0 ? (
                                    <p className={styles.palavras}>
                                      <span className={base.srOnly}>Palavras-chave: </span>
                                      {conta.palavras.slice(0, MAX_CHIPS).map(p => <span key={p} className={styles.chip}>{p}</span>)}
                                      {extras > 0 && <span className={styles.chipMais} title={conta.palavras.slice(MAX_CHIPS).join(', ')}>+{extras}</span>}
                                    </p>
                                  ) : (
                                    <p className={styles.semPalavras}>Sem palavras-chave: reconhecida pelo histórico ou pela IA.</p>
                                  )}
                                </li>
                              )
                            })}
                          </ul>

                          {podeEditar && (novaConta?.linha === linha.id ? (
                            <form className={styles.formulario} onSubmit={adicionarConta}>
                              <label className={styles.campoForm}>
                                <span>Nome da conta</span>
                                <input
                                  autoFocus
                                  value={novaConta.nome}
                                  maxLength={120}
                                  onChange={e => setNovaConta({ ...novaConta, nome: e.target.value, erro: '' })}
                                />
                              </label>
                              <label className={styles.campoForm}>
                                <span>Palavras-chave (opcional, separe por vírgula)</span>
                                <input value={novaConta.palavras} onChange={e => setNovaConta({ ...novaConta, palavras: e.target.value })} />
                              </label>
                              <div className={styles.formAcoes}>
                                <button type="submit" className={styles.btnPrimario}>Adicionar conta</button>
                                <button type="button" className={base.btnSecundario} onClick={() => setNovaConta(null)}>Cancelar</button>
                              </div>
                              {novaConta.erro && <p className={styles.erroForm}>{novaConta.erro}</p>}
                            </form>
                          ) : (
                            <button
                              type="button"
                              className={styles.adicionar}
                              onClick={() => { setEditandoPalavras(null); setNovaConta({ linha: linha.id, nome: '', palavras: '', erro: '' }) }}
                              disabled={salvando}
                            >
                              + Adicionar conta em {linha.rotulo.toLowerCase()}
                            </button>
                          ))}
                        </li>

                        {subtotal && (
                          <li className={styles.subtotal} aria-label={`Subtotal: ${subtotal.rotulo}`}>
                            <span className={styles.subtotalIgual} aria-hidden>=</span>
                            <span className={styles.subtotalRotulo}>{subtotal.rotulo}</span>
                            <span className={styles.subtotalFormula}>{subtotal.formula}</span>
                          </li>
                        )}
                      </Fragment>
                    )
                  })}
                </ol>
              </section>

              {/* ── Segmento de cada empresa (ADM) ── */}
              {podeEditar && (
                <section className={base.secao} aria-labelledby="empresas-titulo">
                  <h2 id="empresas-titulo" className={base.secaoTitulo}>Segmento das empresas</h2>
                  <p className={base.secaoTexto}>
                    Define qual plano de contas cada empresa usa. Empresas sem escolha ficam em {atual.segmentos.find(s => s.id === SEGMENTO_PADRAO)?.nome}.
                    {atual.segmentos.length === 1 && ' Crie outro segmento acima para poder trocar.'}
                  </p>
                  {empresas === null ? (
                    <div className={base.carregando} role="status"><span className={base.spinner} aria-hidden />Carregando empresas…</div>
                  ) : empresas.length === 0 ? (
                    <p className={base.secaoTexto}>Nenhuma empresa ativa.</p>
                  ) : (
                    <ul className={styles.empresas}>
                      {empresas.map(emp => (
                        <li key={emp.id} className={styles.empresa}>
                          <span className={styles.empresaNome}>
                            {emp.nome}
                            {emp.cnpj && <span className={styles.empresaCnpj}>{emp.cnpj}</span>}
                          </span>
                          <select
                            aria-label={`Segmento de ${emp.nome}`}
                            value={atual.empresas[emp.id] ?? SEGMENTO_PADRAO}
                            onChange={e => definirSegmentoDaEmpresa(emp.id, e.target.value)}
                            disabled={salvando || atual.segmentos.length === 1}
                          >
                            {atual.segmentos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {!podeEditar && (
                <p className={base.metaLeitura}>
                  {versao
                    ? `Última alteração em ${formatarDataHora(versao)}${autor ? `, por ${autor}` : ''}.`
                    : 'Estrutura padrão do método.'}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {podeEditar && carregamento === 'pronto' && (
        <footer className={base.barraSalvar}>
          <div className={base.barraSalvarInner}>
            <button type="button" className={base.btnSalvar} onClick={() => void salvar()} disabled={!temAlteracoes || salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            {temAlteracoes && !salvando && (
              <button type="button" className={base.btnSecundario} onClick={descartar}>Descartar alterações</button>
            )}
            <div className={base.status} aria-live="polite">
              {aviso && aviso.tipo !== 'ok' ? (
                <p className={base.statusErro}>
                  {aviso.texto}
                  {aviso.tipo === 'conflito' && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className={base.linkInline}
                        onClick={() => {
                          if (temAlteracoes && !window.confirm('Recarregar traz a versão salva por outra pessoa e descarta as suas alterações. Continuar?')) return
                          void carregar()
                        }}
                      >
                        Recarregar
                      </button>
                    </>
                  )}
                </p>
              ) : (
                <p className={base.statusTexto}>
                  {salvando ? 'Salvando…' : temAlteracoes ? 'Há alterações ainda não salvas.' : aviso?.tipo === 'ok' ? aviso.texto : 'Nada alterado.'}
                </p>
              )}
              <p className={base.statusMeta}>
                {versao
                  ? `Última alteração em ${formatarDataHora(versao)}${autor ? `, por ${autor}` : ''}.`
                  : 'Ainda no padrão do método: ninguém alterou a estrutura.'}
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
