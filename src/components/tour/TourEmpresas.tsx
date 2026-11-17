import { useEffect, useRef, useState, type ReactNode } from 'react'
import ModalTransition from '../ModalTransition'
import styles from './TourBoasVindas.module.css'

// Tutorial do primeiro acesso à escolha de empresa. Mesmo visual do tour da DFC;
// quem controla quando aparece é useTourBoasVindas(TOUR_EMPRESAS_CHAVE).
export const TOUR_EMPRESAS_CHAVE = 'dfc_tour_empresas_concluido'

// ── Ícones em linha (outline), conforme o guia de marca ──────────────────────
const Icone = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
const IconeEmpresa = () => <Icone><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4" /></Icone>
const IconeMais = () => <Icone><path d="M12 5v14M5 12h14" /></Icone>
// Mesma engrenagem dos cards da lista de empresas.
const IconeEngrenagem = () => (
  <Icone>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icone>
)
const IconeConta = () => <Icone><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icone>
const IconeSeta = () => <Icone><path d="M5 12h14M13 6l6 6-6 6" /></Icone>
const IconeFechar = () => <Icone><path d="M6 6l12 12M18 6L6 18" /></Icone>
const IconeHexCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" /><path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
)

const TOTAL_PASSOS = 3

interface TourEmpresasProps {
  aberto: boolean
  onConcluir: () => void
  onAdiar: () => void
  /** Titular ou ADM: pode cadastrar empresas */
  podeCriar: boolean
  /** Empresa que o último passo oferece abrir (a primeira da lista) */
  empresaSugerida: string | null
  onCriarEmpresa: () => void
  onAbrirEmpresa: () => void
}

export function TourEmpresas({
  aberto, onConcluir, onAdiar, podeCriar, empresaSugerida, onCriarEmpresa, onAbrirEmpresa,
}: TourEmpresasProps) {
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
    // Trava a rolagem da página atrás do tutorial enquanto ele está aberto.
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

  const recursos = [
    {
      icone: <IconeEmpresa />,
      titulo: 'Abrir a DFC de uma empresa',
      texto: 'Clique no card da empresa. A última que você abriu aparece primeiro, com o selo “Último acesso”.',
    },
    ...(podeCriar ? [{
      icone: <IconeMais />,
      titulo: 'Nova empresa',
      texto: 'Só precisa do nome e do CNPJ. Cadastre uma para cada clínica.',
    }] : []),
    {
      icone: <IconeEngrenagem />,
      titulo: 'Configurar (engrenagem)',
      texto: 'Edite nome, CNPJ e logo, veja quem tem acesso ou exclua a empresa. Aparece para quem administra a empresa.',
    },
    {
      icone: <IconeConta />,
      titulo: 'Menu da conta',
      texto: 'No canto superior direito: Referências e Estrutura do DRE, e o botão Sair.',
    },
  ]

  return (
    <ModalTransition open={aberto}>
      {aberto && (
        <div className={styles.overlay}>
          <div
            ref={painelRef}
            className={styles.painel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-empresas-titulo"
            aria-describedby="tour-empresas-subtitulo"
            tabIndex={-1}
          >
            <header className={styles.cabecalho}>
              <div>
                <h2 id="tour-empresas-titulo" className={styles.titulo}>Comece pela sua empresa</h2>
                <p id="tour-empresas-subtitulo" className={styles.subtitulo}>Três passos rápidos para entender esta tela.</p>
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
                  <h3 className={styles.passoTitulo}>Cada empresa,<br />a sua própria DFC.</h3>
                  <p className={styles.passoTexto}>
                    Lançamentos, extratos e relatórios ficam separados por empresa. Se você tem mais de
                    uma clínica, cadastre cada uma e alterne entre elas quando quiser, sem misturar os números.
                  </p>
                  <div className={styles.equacao} aria-label="Empresa, depois lançamentos, depois a DFC">
                    <span>Empresa</span>
                    <span className={styles.operador}>→</span>
                    <span>Lançamentos</span>
                    <span className={styles.operador}>→</span>
                    <span className={styles.resultado}>DFC</span>
                  </div>
                  <p className={styles.selo}><IconeHexCheck /> Método ClinicScale</p>
                </section>
              )}

              {passo === 2 && (
                <section className={styles.passo}>
                  <h3 className={styles.passoTitulo}>O que você faz nesta tela</h3>
                  <p className={styles.passoTexto}>
                    Tudo o que você precisa para chegar à DFC certa está aqui.
                  </p>
                  <ul className={styles.recursos}>
                    {recursos.map(r => (
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
                  {empresaSugerida || podeCriar ? (
                    <>
                      <h3 className={styles.passoTitulo}>Como você quer começar?</h3>
                      <p className={styles.passoTexto}>
                        {empresaSugerida
                          ? 'Abra a DFC de uma empresa que você já tem ou cadastre outra.'
                          : 'Cadastre a sua primeira empresa para abrir a DFC.'}
                      </p>
                      <div className={styles.opcoes}>
                        {empresaSugerida && (
                          <button type="button" className={styles.opcao} onClick={() => escolher(onAbrirEmpresa)}>
                            <span className={styles.opcaoIconeEscuro}><IconeSeta /></span>
                            <span className={styles.opcaoTitulo}>Abrir {empresaSugerida}</span>
                            <span className={styles.opcaoTexto}>Vá direto para a DFC desta empresa.</span>
                          </button>
                        )}
                        {podeCriar && (
                          <button type="button" className={styles.opcao} onClick={() => escolher(onCriarEmpresa)}>
                            <span className={empresaSugerida ? styles.opcaoIcone : styles.opcaoIconeEscuro}><IconeMais /></span>
                            <span className={styles.opcaoTitulo}>{empresaSugerida ? 'Cadastrar outra empresa' : 'Criar minha primeira empresa'}</span>
                            <span className={styles.opcaoTexto}>Informe o nome e o CNPJ. Leva menos de um minuto.</span>
                          </button>
                        )}
                      </div>
                      <button type="button" className={styles.link} onClick={onConcluir}>
                        Só quero ver a lista
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 className={styles.passoTitulo}>Falta só o vínculo</h3>
                      <p className={styles.passoTexto}>
                        Seu acesso está como colaborador. Assim que um titular vincular você a uma empresa,
                        ela aparece nesta lista e você já pode abrir a DFC.
                      </p>
                      <button type="button" className={styles.btnPrimario} onClick={onConcluir}>
                        Entendi
                      </button>
                    </>
                  )}
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
