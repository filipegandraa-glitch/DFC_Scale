import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import ModalTransition from '../ModalTransition'
import styles from './TourBoasVindas.module.css'

// Marca de "tour concluído" — guardada no user_metadata (vale em qualquer
// navegador) e no localStorage (fallback imediato se a gravação falhar).
// Cada tour tem a sua chave: 'dfc_tour_concluido' (tela da DFC) e
// 'dfc_tour_empresas_concluido' (escolha de empresa).
const CHAVE_PADRAO = 'dfc_tour_concluido'
const CHAVE_LOCAL = (chave: string, userId: string) => `${chave}:${userId}`
// "Ver depois" adia só até a próxima sessão do navegador.
const CHAVE_ADIADO = (chave: string) => chave === CHAVE_PADRAO ? 'dfc_tour_adiado' : `${chave}:adiado`

function lerStorage(storage: Storage, chave: string) {
  try { return storage.getItem(chave) } catch { return null }
}

function gravarStorage(storage: Storage, chave: string, valor: string) {
  try { storage.setItem(chave, valor) } catch { /* modo privado etc. */ }
}

/** Controla quando o tour aparece: no primeiro acesso de cada usuário. */
export function useTourBoasVindas(chave: string = CHAVE_PADRAO) {
  const [aberto, setAberto] = useState(false)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    let ativo = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!ativo || !user) return
      userIdRef.current = user.id
      const concluido = Boolean(user.user_metadata?.[chave])
        || Boolean(lerStorage(localStorage, CHAVE_LOCAL(chave, user.id)))
      const adiado = Boolean(lerStorage(sessionStorage, CHAVE_ADIADO(chave)))
      if (!concluido && !adiado) setAberto(true)
    })
    return () => { ativo = false }
  }, [chave])

  const concluir = useCallback(() => {
    setAberto(false)
    const userId = userIdRef.current
    if (!userId) return
    gravarStorage(localStorage, CHAVE_LOCAL(chave, userId), '1')
    void supabase.auth.updateUser({ data: { [chave]: new Date().toISOString() } })
  }, [chave])

  const adiar = useCallback(() => {
    setAberto(false)
    gravarStorage(sessionStorage, CHAVE_ADIADO(chave), '1')
  }, [chave])

  const abrir = useCallback(() => setAberto(true), [])

  return { aberto, abrir, concluir, adiar }
}

// ── Ícones em linha (outline), conforme o guia de marca ──────────────────────
const Icone = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
const IconeUpload = () => <Icone><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></Icone>
const IconeMais = () => <Icone><path d="M12 5v14M5 12h14" /></Icone>
const IconeChat = () => <Icone><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Icone>
const IconePlanilha = () => <Icone><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></Icone>
const IconeSeta = () => <Icone><path d="M5 12h14M13 6l6 6-6 6" /></Icone>
const IconeFechar = () => <Icone><path d="M6 6l12 12M18 6L6 18" /></Icone>
const IconeHexCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" /><path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
)

const RECURSOS = [
  { icone: <IconeUpload />, titulo: 'Importar Extrato', texto: 'Suba o .xlsx, .xls ou .csv do banco. A IA sugere a classificação de cada lançamento.' },
  { icone: <IconeMais />, titulo: '+ Novo lançamento', texto: 'Lance à mão o que não passou pelo banco, em poucos passos.' },
  { icone: <IconeChat />, titulo: 'Assistente de DFC', texto: 'Pergunte em português: “qual meu maior custo?”, “como está minha margem?”.' },
  { icone: <IconePlanilha />, titulo: 'Exportar Relatório', texto: 'Baixe a DFC do período filtrado em planilha .xlsx, pronta para o contador.' },
]

const TOTAL_PASSOS = 3

interface TourBoasVindasProps {
  aberto: boolean
  onConcluir: () => void
  onAdiar: () => void
  onImportar: () => void
  onNovoLancamento: () => void
}

export function TourBoasVindas({ aberto, onConcluir, onAdiar, onImportar, onNovoLancamento }: TourBoasVindasProps) {
  const [passo, setPasso] = useState(1)
  const painelRef = useRef<HTMLDivElement>(null)
  const corpoRef = useRef<HTMLDivElement>(null)

  // Sempre recomeça do passo 1 ao abrir.
  useEffect(() => {
    if (aberto) setPasso(1)
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    painelRef.current?.focus({ preventScroll: true })
    // Trava a rolagem da página atrás do tour enquanto ele está aberto.
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onAdiar() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', onKey)
    }
  }, [aberto, onAdiar])

  useEffect(() => {
    corpoRef.current?.scrollTo({ top: 0 })
  }, [passo])

  const escolher = (acao: () => void) => {
    onConcluir()
    acao()
  }

  return (
    <ModalTransition open={aberto}>
      {aberto && (
        <div className={styles.overlay}>
          <div
            ref={painelRef}
            className={styles.painel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-titulo"
            aria-describedby="tour-subtitulo"
            tabIndex={-1}
          >
            <header className={styles.cabecalho}>
              <div>
                <h2 id="tour-titulo" className={styles.titulo}>Bem-vindo(a) à DFC Scale</h2>
                <p id="tour-subtitulo" className={styles.subtitulo}>Três passos rápidos para o seu caixa sair do escuro.</p>
              </div>
              <button type="button" className={styles.fechar} onClick={onAdiar} aria-label="Fechar e ver depois">
                <IconeFechar />
              </button>
            </header>

            <div ref={corpoRef} className={styles.corpo}>
              <div className={styles.progresso} aria-hidden>
                {Array.from({ length: TOTAL_PASSOS }, (_, i) => (
                  <span key={i} className={i < passo ? styles.tracoAtivo : styles.traco} />
                ))}
                <span className={styles.progressoTexto}>Passo {passo} de {TOTAL_PASSOS}</span>
              </div>
              <span className={styles.srOnly} aria-live="polite">Passo {passo} de {TOTAL_PASSOS}</span>

              {passo === 1 && (
                <section className={styles.passo}>
                  <div className={styles.marca}>
                    <img src="/symbol-gold.svg" alt="" className={styles.simbolo} />
                    <span>DFC <strong>Scale</strong></span>
                  </div>
                  <h3 className={styles.passoTitulo}>Todo resultado<br />começa pelo caixa.</h3>
                  <p className={styles.passoTexto}>
                    A DFC mostra, mês a mês, quanto entrou, quanto saiu e o que sobrou. Com cada
                    lançamento no grupo certo, você enxerga margem de contribuição, EBITDA e para
                    onde o dinheiro está indo.
                  </p>
                  <div className={styles.equacao} aria-label="Entradas menos saídas é igual ao resultado">
                    <span>Entradas</span>
                    <span className={styles.operador}>−</span>
                    <span>Saídas</span>
                    <span className={styles.operador}>=</span>
                    <span className={styles.resultado}>Resultado</span>
                  </div>
                  <p className={styles.selo}><IconeHexCheck /> Método ClinicScale</p>
                </section>
              )}

              {passo === 2 && (
                <section className={styles.passo}>
                  <h3 className={styles.passoTitulo}>O que você faz nesta tela</h3>
                  <p className={styles.passoTexto}>
                    Quatro botões dão conta do dia a dia. Os filtros de ano e meses mudam tudo de uma
                    vez: cards, gráficos e tabela.
                  </p>
                  <ul className={styles.recursos}>
                    {RECURSOS.map(r => (
                      <li key={r.titulo} className={styles.recurso}>
                        <span className={styles.recursoIcone}>{r.icone}</span>
                        <div>
                          <p className={styles.recursoTitulo}>{r.titulo}</p>
                          <p className={styles.recursoTexto}>{r.texto}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {passo === 3 && (
                <section className={styles.passo}>
                  <h3 className={styles.passoTitulo}>Como você quer começar?</h3>
                  <p className={styles.passoTexto}>Dá no mesmo: os dois caminhos alimentam a mesma DFC.</p>
                  <div className={styles.opcoes}>
                    <button type="button" className={styles.opcao} onClick={() => escolher(onImportar)}>
                      <span className={styles.opcaoIconeEscuro}><IconeUpload /></span>
                      <span className={styles.opcaoTitulo}>Importar meu extrato</span>
                      <span className={styles.opcaoTexto}>Traga o extrato do banco e deixe a IA classificar os lançamentos.</span>
                    </button>
                    <button type="button" className={styles.opcao} onClick={() => escolher(onNovoLancamento)}>
                      <span className={styles.opcaoIcone}><IconeSeta /></span>
                      <span className={styles.opcaoTitulo}>Lançar manualmente</span>
                      <span className={styles.opcaoTexto}>Registre uma receita ou despesa e veja a DFC se montar.</span>
                    </button>
                  </div>
                  <button type="button" className={styles.link} onClick={onConcluir}>
                    Só quero explorar a tela
                  </button>
                </section>
              )}
            </div>

            <footer className={styles.rodape}>
              <button type="button" className={styles.link} onClick={onAdiar}>Ver depois</button>
              <div className={styles.rodapeAcoes}>
                {passo > 1 && (
                  <button type="button" className={styles.btnSecundario} onClick={() => setPasso(p => p - 1)}>
                    Voltar
                  </button>
                )}
                {passo < TOTAL_PASSOS && (
                  <button type="button" className={styles.btnPrimario} onClick={() => setPasso(p => p + 1)}>
                    Continuar <IconeSeta />
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      )}
    </ModalTransition>
  )
}
