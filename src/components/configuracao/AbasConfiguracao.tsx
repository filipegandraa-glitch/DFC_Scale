import type { ReactNode } from 'react'
import styles from './AbasConfiguracao.module.css'

// Menu lateral da "Configuração geral" (à esquerda do conteúdo, no corpo marfim).
// Cada item é uma tela com rota própria; trocar de item passa pelo App, que pergunta
// antes de sair com alterações não salvas. Para uma seção nova: some um item em ITENS,
// uma rota no App e passe o menu (abas) para a tela nova.
export type AbaConfiguracao = 'referencias' | 'estrutura' | 'funcionarios'

const Icone = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

const ITENS: { id: AbaConfiguracao; rotulo: string; icone: ReactNode }[] = [
  {
    id: 'referencias',
    rotulo: 'Referências do DRE',
    icone: (
      <Icone>
        <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
        <circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" />
      </Icone>
    ),
  },
  {
    id: 'estrutura',
    rotulo: 'Estrutura do DRE',
    icone: (
      <Icone>
        <rect x="3" y="3" width="7" height="5" rx="1.2" />
        <rect x="14" y="10" width="7" height="5" rx="1.2" />
        <rect x="14" y="17" width="7" height="4" rx="1.2" />
        <path d="M6.5 8v10.5H14M6.5 12.5H14" />
      </Icone>
    ),
  },
  {
    id: 'funcionarios',
    rotulo: 'Funcionários',
    icone: (
      <Icone>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
      </Icone>
    ),
  },
]

export function AbasConfiguracao({ atual, onAbrir, mostrarFuncionarios = false }: {
  atual: AbaConfiguracao
  onAbrir: (aba: AbaConfiguracao) => void
  /** Funcionários só aparece para quem pode ter equipe (titular ou administrador). */
  mostrarFuncionarios?: boolean
}) {
  const itens = ITENS.filter(item => item.id !== 'funcionarios' || mostrarFuncionarios)
  return (
    <nav className={styles.menu} aria-label="Configuração geral">
      <p className={styles.titulo}>Configuração geral</p>
      <ul className={styles.lista}>
        {itens.map(item => (
          <li key={item.id}>
            <button
              type="button"
              className={`${styles.item} ${item.id === atual ? styles.itemAtivo : ''}`}
              aria-current={item.id === atual ? 'page' : undefined}
              onClick={() => { if (item.id !== atual) onAbrir(item.id) }}
            >
              <span className={styles.icone}>{item.icone}</span>
              {item.rotulo}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
