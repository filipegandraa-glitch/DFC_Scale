import { useEffect, useSyncExternalStore } from 'react'

// Modo claro/escuro do DFC Scale (mesma ideia do LabControl, com padrão invertido).
// Padrão: CLARO, que é o visual de sempre (faixa escura no topo + corpo marfim).
// O modo escuro troca só o corpo marfim por grafite: as regras ficam sob
// html[data-tema="escuro"] em cada módulo de CSS, então o modo claro não muda nada.
// Vale para as telas depois do login; landing e login têm visual próprio.
// A escolha fica salva neste navegador (o index.html aplica antes de pintar).
export type Tema = 'claro' | 'escuro'

const CHAVE = 'dfc_tema'
const ATRIBUTO = 'data-tema'
const ouvintes = new Set<() => void>()

function lerTemaSalvo(): Tema {
  try { return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro' } catch { return 'claro' }
}

let temaAtual: Tema = lerTemaSalvo()

function definirTema(tema: Tema) {
  temaAtual = tema
  try { localStorage.setItem(CHAVE, tema) } catch { /* modo privado etc. */ }
  ouvintes.forEach(ouvinte => ouvinte())
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => { ouvintes.delete(ouvinte) }
}

export function useTema() {
  const tema = useSyncExternalStore(assinar, () => temaAtual)
  const alternar = () => definirTema(tema === 'claro' ? 'escuro' : 'claro')
  return { tema, alternar }
}

/** Aplica o tema escolhido enquanto o componente estiver montado. */
export function useAplicarTema() {
  const { tema } = useTema()
  useEffect(() => {
    const html = document.documentElement
    if (tema === 'escuro') html.setAttribute(ATRIBUTO, 'escuro')
    else html.removeAttribute(ATRIBUTO)
    return () => html.removeAttribute(ATRIBUTO)
  }, [tema])
}
