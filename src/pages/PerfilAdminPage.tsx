import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import styles from './PerfilAdminPage.module.css'
import {
  CAMPOS_LIMITE,
  ConflitoReferencias,
  LINHAS_REFERENCIA,
  REFERENCIAS_PADRAO,
  ROTULO_CAMPO,
  ROTULO_FAIXA,
  carregarReferencias,
  formatarNumero,
  lerLimite,
  limitesIguais,
  prefixoLimite,
  salvarReferencias,
  trechosDasFaixas,
  validarLinha,
  type CampoLimite,
  type DefinicaoLinha,
  type FaixaReferencia,
  type LimitesReferencia,
  type LinhaReferenciaId,
  type ReferenciasDre,
  type ResultadoLinha,
} from '../lib/referenciasDre'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'

// Referências do DRE, aberta pelo menu de perfil. Todos consultam; só quem tem
// profiles.role = 'admin' edita (podeEditar) e o RLS da tabela `configuracoes`
// barra a gravação de quem não é ADM. Layout inspirado na "Configuração geral"
// da Precificação Scale.

type TextosLinha = Record<CampoLimite, string>
type Formulario = Record<LinhaReferenciaId, TextosLinha>

const paraTextos = (refs: ReferenciasDre): Formulario =>
  Object.fromEntries(LINHAS_REFERENCIA.map(def => [def.id, {
    ideal: formatarNumero(refs[def.id].ideal),
    aceitavel: formatarNumero(refs[def.id].aceitavel),
    atencao: formatarNumero(refs[def.id].atencao),
  }])) as Formulario

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`

const formatarDataHora = (iso: string) => {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  const dia = data.toLocaleDateString('pt-BR')
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}

/** Barra da prévia: faixa e largura (%) de cada trecho, sem trechos vazios. */
function trechosDaBarra(def: DefinicaoLinha, l: LimitesReferencia): { faixa: FaixaReferencia; largura: number }[] {
  const amplitude = Math.abs(l.atencao - l.ideal) || Math.max(1, l.ideal * 0.2)
  const pedacos: { faixa: FaixaReferencia; de: number; ate: number }[] = def.sentido === 'menor'
    ? (() => {
        const inicio = Math.max(0, l.ideal - amplitude * 1.2)
        const fim = l.atencao + amplitude * 0.8
        return [
          { faixa: 'ideal', de: inicio, ate: l.ideal },
          { faixa: 'aceitavel', de: l.ideal, ate: l.aceitavel },
          { faixa: 'media', de: l.aceitavel, ate: l.atencao },
          { faixa: 'atencao', de: l.atencao, ate: fim },
        ]
      })()
    : (() => {
        const inicio = Math.max(0, l.atencao - amplitude * 0.8)
        const fim = Math.min(100, l.ideal + amplitude * 1.2)
        return [
          { faixa: 'atencao', de: inicio, ate: l.atencao },
          { faixa: 'media', de: l.atencao, ate: l.aceitavel },
          { faixa: 'aceitavel', de: l.aceitavel, ate: l.ideal },
          { faixa: 'ideal', de: l.ideal, ate: Math.max(fim, l.ideal) },
        ]
      })()
  const total = pedacos.reduce((s, p) => s + Math.max(0, p.ate - p.de), 0) || 1
  return pedacos
    .map(p => ({ faixa: p.faixa, largura: (Math.max(0, p.ate - p.de) / total) * 100 }))
    .filter(p => p.largura > 0)
}

interface Props {
  /** ADM edita; os demais veem as faixas só para consulta. */
  podeEditar: boolean
  nomeUsuario: string
  /** Menu de perfil do canto superior direito. */
  menuPerfil?: ReactNode
  onVoltar: () => void
  /** O App consulta antes de sair pelo botão Voltar do navegador (false = ficar). */
  registrarGuardaSaida?: (guarda: (() => boolean) | null) => void
}

const CONFIRMAR_SAIDA = 'Você tem alterações não salvas nas referências. Sair mesmo assim?'

async function nomeDoAutor(id: string | null): Promise<string | null> {
  if (!id) return null
  const { data } = await supabase.from('profiles').select('name').eq('id', id).maybeSingle()
  return data?.name?.trim() || null
}

export default function PerfilAdminPage({ podeEditar, nomeUsuario, menuPerfil, onVoltar, registrarGuardaSaida }: Props) {
  const [carregamento, setCarregamento] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const [erroCarregamento, setErroCarregamento] = useState('')
  const [salvas, setSalvas] = useState<ReferenciasDre>(REFERENCIAS_PADRAO)
  const [form, setForm] = useState<Formulario>(() => paraTextos(REFERENCIAS_PADRAO))
  const [versao, setVersao] = useState<string | null>(null)
  const [autor, setAutor] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro' | 'conflito'; texto: string } | null>(null)
  const [linhaEmFoco, setLinhaEmFoco] = useState<LinhaReferenciaId>(LINHAS_REFERENCIA[0].id)

  const carregar = useCallback(async () => {
    setCarregamento('carregando')
    setAviso(null)
    try {
      const atual = await carregarReferencias()
      setSalvas(atual.referencias)
      setForm(paraTextos(atual.referencias))
      setVersao(atual.atualizadoEm)
      setAutor(await nomeDoAutor(atual.autorId))
      setCarregamento('pronto')
    } catch (err) {
      setErroCarregamento(err instanceof Error ? err.message : String(err))
      setCarregamento('erro')
    }
  }, [])

  useEffect(() => {
    const tituloAnterior = document.title
    document.title = 'Referências do DRE — DFC Scale'
    void carregar()
    return () => { document.title = tituloAnterior }
  }, [carregar])

  // A barra de salvar (só do ADM) é fixa no rodapé: o campo focado por Tab não fica escondido atrás dela.
  useEffect(() => {
    if (!podeEditar) return
    const raiz = document.documentElement
    const paddingAnterior = raiz.style.scrollPaddingBottom
    raiz.style.scrollPaddingBottom = '140px'
    return () => { raiz.style.scrollPaddingBottom = paddingAnterior }
  }, [podeEditar])

  const analise = useMemo(() => {
    const porLinha = {} as Record<LinhaReferenciaId, ResultadoLinha & { alterada: boolean }>
    let alteradas = 0
    let comErro = 0
    for (const def of LINHAS_REFERENCIA) {
      const resultado = validarLinha(def, form[def.id])
      const alterada = !resultado.limites || !limitesIguais(resultado.limites, salvas[def.id])
      if (alterada) alteradas += 1
      if (resultado.erro) comErro += 1
      porLinha[def.id] = { ...resultado, alterada }
    }
    const noPadrao = LINHAS_REFERENCIA.every(def => {
      const l = porLinha[def.id].limites
      return l !== null && limitesIguais(l, REFERENCIAS_PADRAO[def.id])
    })
    return { porLinha, alteradas, comErro, noPadrao }
  }, [form, salvas])

  const temAlteracoes = analise.alteradas > 0
  const podeSalvar = podeEditar && carregamento === 'pronto' && temAlteracoes && analise.comErro === 0 && !salvando

  // Aviso do navegador ao fechar/recarregar com alterações não salvas.
  useEffect(() => {
    if (!temAlteracoes) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [temAlteracoes])

  // Voltar do navegador e "Sair" do menu de perfil: o App pergunta aqui antes de trocar de tela.
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

  const alterarCampo = (id: LinhaReferenciaId, campo: CampoLimite, texto: string) => {
    setForm(prev => ({ ...prev, [id]: { ...prev[id], [campo]: texto } }))
    if (aviso?.tipo === 'ok') setAviso(null)
  }

  // Ao sair do campo, padroniza a escrita: "13.5" → "13,5", "07" → "7".
  const padronizarCampo = (id: LinhaReferenciaId, campo: CampoLimite) => {
    const leitura = lerLimite(form[id][campo])
    if (leitura.valor === undefined) return
    const texto = formatarNumero(leitura.valor)
    if (texto !== form[id][campo]) alterarCampo(id, campo, texto)
  }

  const voltarAoPadrao = () => {
    setForm(paraTextos(REFERENCIAS_PADRAO))
    setAviso(null)
  }

  const descartar = () => {
    setForm(paraTextos(salvas))
    setAviso(null)
  }

  const salvar = async () => {
    if (!podeSalvar) return
    const novas = Object.fromEntries(
      LINHAS_REFERENCIA.map(def => [def.id, analise.porLinha[def.id].limites as LimitesReferencia]),
    ) as ReferenciasDre
    setSalvando(true)
    setAviso(null)
    try {
      const { data: sessao } = await supabase.auth.getUser()
      const atualizadoEm = await salvarReferencias(novas, { versaoCarregada: versao, autorId: sessao.user?.id ?? null })
      setSalvas(novas)
      setForm(paraTextos(novas))
      setVersao(atualizadoEm)
      setAutor(nomeUsuario || null)
      setAviso({ tipo: 'ok', texto: 'Salvo. As novas faixas já valem para todas as empresas.' })
      toast.success('Referências do DRE salvas.')
    } catch (err) {
      if (err instanceof ConflitoReferencias) {
        setAviso({ tipo: 'conflito', texto: err.message })
      } else {
        const msg = err instanceof Error ? err.message : ''
        setAviso({
          tipo: 'erro',
          texto: msg.startsWith('Sua conta')
            ? msg
            : `Não foi possível salvar. Verifique a conexão e tente de novo.${msg ? ` (${msg})` : ''}`,
        })
      }
    } finally {
      setSalvando(false)
    }
  }

  const defFoco = LINHAS_REFERENCIA.find(d => d.id === linhaEmFoco) ?? LINHAS_REFERENCIA[0]
  const limitesFoco = analise.porLinha[defFoco.id].limites

  const statusTexto = salvando
    ? 'Salvando…'
    : analise.comErro > 0
      ? `Corrija ${plural(analise.comErro, 'linha destacada', 'linhas destacadas')} para salvar.`
      : temAlteracoes
        ? `${plural(analise.alteradas, 'linha alterada', 'linhas alteradas')}, ainda não ${analise.alteradas === 1 ? 'salva' : 'salvas'}.`
        : aviso?.tipo === 'ok'
          ? aviso.texto
          : 'Nada alterado.'

  return (
    <div className={styles.page}>
      {/* ── Faixa escura: navegação e título ── */}
      <header className={`${styles.faixa} tema-grafite`}>
        <div className={styles.faixaGlow} aria-hidden />
        <div className={styles.faixaConteudo}>
          <div className={styles.nav}>
            <button type="button" className={styles.marca} onClick={sairCom(onVoltar)} aria-label="DFC Scale — voltar">
              <img src="/symbol-gold.svg" alt="" width={22} height={22} />
              <span>DFC <b>Scale</b></span>
            </button>
            <div className={styles.navDir}>
              <button type="button" className={styles.navLink} onClick={sairCom(onVoltar)}>← Voltar</button>
              {menuPerfil}
            </div>
          </div>

          <div className={styles.faixaCabeca}>
            <p className={styles.eyebrow}>{podeEditar ? 'Perfil administrativo' : 'Perfil'}</p>
            <h1 className={styles.titulo}>Referências do DRE</h1>
            <p className={styles.apoio}>
              Estas faixas valem para todas as empresas do DFC Scale. Elas definem quando cada linha do DRE
              aparece como Ideal, Aceitável, Na média ou Atenção, sempre em percentual sobre o recebimento do mês.
              {!podeEditar && ' Só administradores podem alterar estes valores.'}
            </p>
          </div>
        </div>
      </header>

      {/* ── Corpo marfim ── */}
      <main className={`${styles.corpo} tema-marfim`}>
        <div className={styles.conteudo}>

          {carregamento === 'carregando' && (
            <div className={styles.carregando} role="status">
              <span className={styles.spinner} aria-hidden />
              Carregando as referências…
            </div>
          )}

          {carregamento === 'erro' && (
            <div className={styles.erroCarga} role="alert">
              <p>Não foi possível carregar as referências{erroCarregamento ? `: ${erroCarregamento}` : '.'}</p>
              <button type="button" className={styles.btnSecundario} onClick={() => void carregar()}>
                Tentar de novo
              </button>
            </div>
          )}

          {carregamento === 'pronto' && (
            <>
              <section className={styles.secao} aria-labelledby="faixas-titulo">
                <div className={styles.secaoTopo}>
                  <h2 id="faixas-titulo" className={styles.secaoTitulo}>Faixas em vigor</h2>
                  {podeEditar && (
                    <button
                      type="button"
                      className={styles.linkPadrao}
                      onClick={voltarAoPadrao}
                      disabled={analise.noPadrao || salvando}
                    >
                      Voltar ao padrão do método
                    </button>
                  )}
                </div>
                <p className={styles.secaoTexto}>
                  Nas linhas de custo, quanto menor, melhor. Na margem de contribuição, quanto maior, melhor.
                  Entre Aceitável e Atenção fica a faixa intermediária (na média).{podeEditar && ' Nada muda até você salvar.'}
                </p>

                <div className={styles.tabela} role="group" aria-label="Faixas de cada linha do DRE">
                  <div className={styles.cabecalho} aria-hidden>
                    <span className={styles.cabecalhoLinha}>Linha do DRE</span>
                    {CAMPOS_LIMITE.map(campo => (
                      <span key={campo} className={`${styles.chip} ${styles[`chip_${campo}`]}`}>
                        {ROTULO_CAMPO[campo]}
                      </span>
                    ))}
                  </div>

                  {LINHAS_REFERENCIA.map(def => {
                    const linha = analise.porLinha[def.id]
                    const idErro = `erro-${def.id}`
                    return (
                      <div
                        key={def.id}
                        className={[
                          styles.linha,
                          def.destaque ? styles.linhaDestaque : '',
                          linha.erro ? styles.linhaComErro : '',
                          linhaEmFoco === def.id ? styles.linhaEmFoco : '',
                        ].join(' ')}
                        onFocusCapture={() => setLinhaEmFoco(def.id)}
                      >
                        <div className={styles.linhaTexto}>
                          <button
                            type="button"
                            className={styles.linhaRotulo}
                            onClick={() => setLinhaEmFoco(def.id)}
                            aria-label={`Ver como a faixa de ${def.rotulo} é lida`}
                          >
                            {def.rotulo}
                            {linha.alterada && !linha.erro && <span className={styles.marcaAlterada}>alterada</span>}
                          </button>
                          <span className={styles.linhaComposicao}>{def.composicao}</span>
                        </div>

                        {!podeEditar && CAMPOS_LIMITE.map(campo => (
                          <div key={campo} className={styles.campo}>
                            <span className={styles.campoRotuloMobile} aria-hidden>
                              {ROTULO_CAMPO[campo]} · {prefixoLimite(campo, def.sentido)}
                            </span>
                            <span className={`${styles.campoCaixa} ${styles.campoLeitura}`}>
                              <span className={styles.campoPrefixo} aria-hidden>{prefixoLimite(campo, def.sentido)}</span>
                              <span className={styles.campoValor}>
                                <span className={styles.srOnly}>{ROTULO_CAMPO[campo]}: {prefixoLimite(campo, def.sentido)} </span>
                                {form[def.id][campo]}
                              </span>
                              <span className={styles.campoSufixo}>%</span>
                            </span>
                          </div>
                        ))}

                        {podeEditar && CAMPOS_LIMITE.map(campo => {
                          const invalido = linha.camposInvalidos.includes(campo)
                          return (
                            <label key={campo} className={`${styles.campo} ${invalido ? styles.campoInvalido : ''}`}>
                              <span className={styles.campoRotuloMobile} aria-hidden>
                                {ROTULO_CAMPO[campo]} · {prefixoLimite(campo, def.sentido)}
                              </span>
                              <span className={styles.campoCaixa}>
                                <span className={styles.campoPrefixo}>{prefixoLimite(campo, def.sentido)}</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  className={styles.campoInput}
                                  value={form[def.id][campo]}
                                  onChange={e => alterarCampo(def.id, campo, e.target.value)}
                                  onBlur={() => padronizarCampo(def.id, campo)}
                                  aria-label={`${def.rotulo}, ${ROTULO_CAMPO[campo]}: ${prefixoLimite(campo, def.sentido)} quantos por cento`}
                                  aria-invalid={invalido || undefined}
                                  aria-describedby={linha.erro ? idErro : undefined}
                                  disabled={salvando}
                                />
                                <span className={styles.campoSufixo} aria-hidden>%</span>
                              </span>
                            </label>
                          )
                        })}

                        {linha.erro && (
                          <p id={idErro} className={styles.linhaErro}>{linha.erro}</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {!podeEditar && (
                  <p className={styles.metaLeitura}>
                    {versao
                      ? `Última alteração em ${formatarDataHora(versao)}${autor ? `, por ${autor}` : ''}.`
                      : 'Valores padrão do método.'}
                  </p>
                )}
              </section>

              <section className={styles.secao} aria-labelledby="leitura-titulo">
                <h2 id="leitura-titulo" className={styles.secaoTitulo}>Como a faixa é lida</h2>
                <p className={styles.secaoTexto}>
                  <strong className={styles.focoRotulo}>{defFoco.rotulo}</strong>
                  {' · '}
                  {defFoco.sentido === 'maior' ? 'quanto maior, melhor' : 'quanto menor, melhor'}.
                  Clique numa linha para ver a leitura dela.
                </p>

                {limitesFoco ? (
                  <>
                    <div className={styles.barra} aria-hidden>
                      {trechosDaBarra(defFoco, limitesFoco).map(t => (
                        <span key={t.faixa} className={`${styles.barraTrecho} ${styles[`fundo_${t.faixa}`]}`} style={{ width: `${t.largura}%` }} />
                      ))}
                    </div>
                    <ul className={styles.legenda}>
                      {trechosDasFaixas(defFoco, limitesFoco).map(t => (
                        <li key={t.faixa} className={styles.legendaItem}>
                          <span className={`${styles.legendaPonto} ${styles[`fundo_${t.faixa}`]}`} aria-hidden />
                          <span className={styles.legendaNome}>{ROTULO_FAIXA[t.faixa]}</span>
                          <span className={styles.legendaValor}>{t.texto}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className={styles.semPrevia}>Corrija os valores desta linha para ver a leitura das faixas.</p>
                )}
              </section>

              <section className={styles.secao} aria-labelledby="calculo-titulo">
                <h2 id="calculo-titulo" className={styles.secaoTitulo}>Como calcular</h2>
                <ul className={styles.regras}>
                  <li>Cada linha: valor da linha ÷ recebimento do mês × 100.</li>
                  <li>
                    Margem de contribuição: recebimento menos as linhas de canceladas até royalties,
                    ÷ recebimento × 100. Na DFC ela é a mesma margem dos indicadores.
                  </li>
                  <li>
                    Exemplo: recebimento de R$ 100.000 no mês e R$ 1.200 de tarifa de cartão dão 1,2%
                    do recebimento, e é esse 1,2% que entra na faixa da linha.
                  </li>
                </ul>
              </section>
            </>
          )}
        </div>
      </main>

      {podeEditar && carregamento === 'pronto' && (
        <footer className={styles.barraSalvar}>
          <div className={styles.barraSalvarInner}>
            <button type="button" className={styles.btnSalvar} onClick={() => void salvar()} disabled={!podeSalvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            {temAlteracoes && !salvando && (
              <button type="button" className={styles.btnSecundario} onClick={descartar}>
                Descartar alterações
              </button>
            )}
            <div className={styles.status} aria-live="polite">
              {aviso && aviso.tipo !== 'ok' ? (
                <p className={styles.statusErro}>
                  {aviso.texto}
                  {aviso.tipo === 'conflito' && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className={styles.linkInline}
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
                <p className={styles.statusTexto}>{statusTexto}</p>
              )}
              <p className={styles.statusMeta}>
                {versao
                  ? `Última alteração em ${formatarDataHora(versao)}${autor ? `, por ${autor}` : ''}.`
                  : 'Ainda no padrão do método: ninguém alterou estas faixas.'}
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
