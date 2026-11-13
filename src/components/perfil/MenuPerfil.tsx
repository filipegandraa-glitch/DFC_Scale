import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import styles from './MenuPerfil.module.css'

// Menu de perfil no canto superior direito (modelo: menu da conta da Precificação Scale).
// Todos veem "Referências do DRE"; só o ADM edita lá dentro.

export interface MenuPerfilProps {
  nome: string
  email: string
  /** Rótulo do cargo: Administrador, Titular, Colaborador... */
  cargo: string
  podeEditarReferencias: boolean
  onAbrirReferencias: () => void
  onAbrirEstrutura: () => void
  onSair: () => void
}

const apelidoDoEmail = (email: string, nome: string) => email.split('@')[0] || nome

export function MenuPerfil({ nome, email, cargo, podeEditarReferencias, onAbrirReferencias, onAbrirEstrutura, onSair }: MenuPerfilProps) {
  const [aberto, setAberto] = useState(false)
  const raizRef = useRef<HTMLDivElement>(null)
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const focarPrimeiro = useRef(false)
  const idMenu = useId()

  const itens = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

  // Fecha ao clicar fora ou com Esc (mesmo com o foco ainda no gatilho).
  useEffect(() => {
    if (!aberto) return
    const aoClicar = (e: PointerEvent) => {
      if (!raizRef.current?.contains(e.target as Node)) setAberto(false)
    }
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setAberto(false)
      gatilhoRef.current?.focus()
    }
    document.addEventListener('pointerdown', aoClicar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('pointerdown', aoClicar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  // Abriu pelo teclado: o foco vai para o primeiro item.
  useEffect(() => {
    if (aberto && focarPrimeiro.current) {
      focarPrimeiro.current = false
      itens()[0]?.focus()
    }
  }, [aberto])

  const aoTeclarGatilho = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (aberto) {
        itens()[0]?.focus()
        return
      }
      focarPrimeiro.current = true
      setAberto(true)
    }
  }

  const aoTeclarMenu = (e: KeyboardEvent<HTMLDivElement>) => {
    const lista = itens()
    const atual = lista.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const passo = e.key === 'ArrowDown' ? 1 : -1
      lista[(atual + passo + lista.length) % lista.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      lista[e.key === 'Home' ? 0 : lista.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setAberto(false)
    }
  }

  const escolher = (acao: () => void) => () => {
    setAberto(false)
    acao()
  }

  const apelido = apelidoDoEmail(email, nome)

  return (
    <div className={styles.raiz} ref={raizRef}>
      <button
        ref={gatilhoRef}
        type="button"
        className={`${styles.gatilho} ${aberto ? styles.gatilhoAberto : ''}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        aria-label={`Menu da conta de ${nome}`}
        onClick={() => setAberto(a => !a)}
        onKeyDown={aoTeclarGatilho}
      >
        <span className={styles.ponto} aria-hidden />
        <span className={styles.apelido}>{apelido}</span>
        <svg className={styles.seta} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div id={idMenu} ref={menuRef} className={styles.menu} role="menu" aria-label="Conta" onKeyDown={aoTeclarMenu}>
          <div className={styles.cabecalho}>
            <p className={styles.nome}>{nome}</p>
            <p className={styles.email}>{email}</p>
            <p className={styles.cargo}>{cargo}</p>
          </div>

          <hr className={styles.divisor} />

          <button type="button" role="menuitem" className={styles.item} onClick={escolher(onAbrirReferencias)}>
            <svg className={styles.icone} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
              <circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" />
            </svg>
            <span className={styles.itemTexto}>
              <span>Referências do DRE</span>
              <span className={styles.itemDetalhe}>
                {podeEditarReferencias ? 'Ver e editar as faixas' : 'Consultar as faixas do método'}
              </span>
            </span>
          </button>

          <button type="button" role="menuitem" className={styles.item} onClick={escolher(onAbrirEstrutura)}>
            <svg className={styles.icone} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="5" rx="1.2" />
              <rect x="14" y="10" width="7" height="5" rx="1.2" />
              <rect x="14" y="17" width="7" height="4" rx="1.2" />
              <path d="M6.5 8v10.5H14M6.5 12.5H14" />
            </svg>
            <span className={styles.itemTexto}>
              <span>Estrutura do DRE</span>
              <span className={styles.itemDetalhe}>
                {podeEditarReferencias ? 'Linhas, contas e segmentos' : 'Consultar linhas e contas'}
              </span>
            </span>
          </button>

          <hr className={styles.divisor} />

          <button type="button" role="menuitem" className={styles.item} onClick={escolher(onSair)}>
            <svg className={styles.icone} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
              <path d="M14 8l4 4-4 4M18 12H9" />
            </svg>
            <span className={styles.itemTexto}><span>Sair</span></span>
          </button>
        </div>
      )}
    </div>
  )
}
