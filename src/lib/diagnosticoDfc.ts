// Diagnóstico do caixa: o título da faixa da Análise DFC, escrito a partir dos números
// do período (ano + meses), sem filtro de tipo ou busca. Funções puras, testáveis.

import {
  LINHAS_REFERENCIA,
  casasDaLinha,
  classificarFaixa,
  formatarLimite,
  formatarNumero,
  formatarPercentual,
  prefixoLimite,
  somarLinhas,
  type ReferenciasDre,
} from './referenciasDre'
import type { DreLancamento } from './types'

/**
 * Crítica das Referências do DRE no período:
 * - 'atencao': a linha em Atenção mais longe do ideal, já em frase;
 * - 'ok': calculada e nenhuma linha em Atenção;
 * - null: não dá para calcular (referências não carregadas ou sem recebimento).
 */
export type CriticaDiagnostico = { tipo: 'atencao'; frase: string } | { tipo: 'ok' } | null

export interface EntradaDiagnostico {
  entradas: number
  saidas: number
  /** "de 2026", "de outubro de 2026" ou "do período". */
  periodoCurto: string
  critica: CriticaDiagnostico
}

export interface Diagnostico {
  titulo: string
  frase: string
}

const NBSP = ' '

/** R$ com abreviação de mil/mi acima de 10 mil: "R$ 152,5 mil", "R$ 1,2 mi", "R$ 9.876,50". */
export function moedaCurta(valor: number): string {
  const abs = Math.abs(valor)
  const sinal = valor < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sinal}R$${NBSP}${formatarNumero(abs / 1_000_000, 1)}${NBSP}mi`
  if (abs >= 10_000) return `${sinal}R$${NBSP}${formatarNumero(abs / 1_000, 1)}${NBSP}mil`
  return `${sinal}R$${NBSP}${formatarNumero(abs, 2, 2)}`
}

const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** Período em poucas palavras: ano sem meses → "de 2026"; um mês com ano → "de outubro de 2026". */
export function periodoCurto(ano: string, meses: readonly string[]): string {
  if (ano === 'todos') return 'do período'
  if (meses.length === 0) return `de ${ano}`
  if (meses.length === 1) {
    const nome = MESES_EXTENSO[Number(meses[0]) - 1]
    if (nome) return `de ${nome} de ${ano}`
  }
  return 'do período'
}

export interface EntradaCritica {
  lancamentos: readonly DreLancamento[]
  /** Receitas operacionais do período: a base do percentual. */
  recebimento: number
  /** Margem de contribuição do período (%), a mesma dos indicadores. */
  margemPct: number
  referencias: ReferenciasDre
  grupoDaClassificacao?: (classificacao: string) => string | undefined
}

/** Linha das Referências do DRE em Atenção com o maior desvio (em p.p.) do ideal. */
export function criticaDoPeriodo({
  lancamentos, recebimento, margemPct, referencias, grupoDaClassificacao,
}: EntradaCritica): CriticaDiagnostico {
  if (!(recebimento > 0)) return null
  const somas = somarLinhas(lancamentos, grupoDaClassificacao)
  let pior: { frase: string; desvio: number } | null = null
  for (const def of LINHAS_REFERENCIA) {
    let pct: number
    if (def.regra.tipo === 'margem') {
      pct = margemPct
    } else {
      const soma = somas.get(def.id)
      if (!soma) continue
      pct = (soma.valor / recebimento) * 100
    }
    const limites = referencias[def.id]
    if (classificarFaixa(pct, limites, def.sentido) !== 'atencao') continue
    const desvio = def.sentido === 'menor' ? pct - limites.ideal : limites.ideal - pct
    if (pior && desvio <= pior.desvio) continue
    const medido = formatarPercentual(pct, casasDaLinha(limites))
    const ideal = `${prefixoLimite('ideal', def.sentido)} ${formatarLimite(limites.ideal)}`
    const frase = def.regra.tipo === 'margem'
      ? ` A margem de contribuição está em ${medido} — o ideal do método é ${ideal}.`
      : ` ${def.rotulo} consome ${medido} do recebimento — o ideal do método é ${ideal}.`
    pior = { frase, desvio }
  }
  return pior ? { tipo: 'atencao', frase: pior.frase } : { tipo: 'ok' }
}

/** Título e frase de apoio da faixa da Análise DFC. */
export function diagnosticoDoCaixa({ entradas, saidas, periodoCurto: periodo, critica }: EntradaDiagnostico): Diagnostico {
  if (entradas === 0 && saidas === 0) {
    return {
      titulo: 'Seu caixa ainda está no escuro.',
      frase: 'Importe o extrato do banco ou lance a primeira movimentação para ver o diagnóstico.',
    }
  }
  const resultado = entradas - saidas
  const textoCritica = critica?.tipo === 'atencao' ? critica.frase : ''
  if (resultado < 0) {
    return {
      titulo: `O caixa ${periodo} está no vermelho.`,
      frase: `As saídas superaram as entradas em ${moedaCurta(-resultado)}.${textoCritica}`,
    }
  }
  const pctEntradas = entradas > 0 ? `${formatarNumero((resultado / entradas) * 100, 1, 1)}%` : '0,0%'
  const complemento = critica?.tipo === 'ok'
    ? ' Todas as linhas do DRE estão dentro das referências do método.'
    : textoCritica
  return {
    titulo: `O caixa ${periodo} está no azul.`,
    frase: `Sobraram ${moedaCurta(resultado)}, ${pctEntradas} das entradas.${complemento}`,
  }
}
