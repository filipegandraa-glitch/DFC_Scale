// Referências do DRE: faixas Ideal / Aceitável / Atenção de cada linha, em % do
// recebimento do mês. O padrão vem da planilha do método; quem tem cargo de ADM
// ajusta pelo Perfil administrativo e o valor vale para o site todo.
//
// Fica na tabela `configuracoes` (chave/valor, compartilhada com o PainelGestaa,
// que só lê a chave `modelo_openai`). RLS: qualquer usuário logado lê; só
// profiles.role = 'admin' grava.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { DreLancamento } from './types'

export const CHAVE_REFERENCIAS_DRE = 'dfc_referencias_dre'

export type SentidoReferencia = 'menor' | 'maior'
export type CampoLimite = 'ideal' | 'aceitavel' | 'atencao'
export type FaixaReferencia = 'ideal' | 'aceitavel' | 'media' | 'atencao'

export type LinhaReferenciaId =
  | 'vendas_canceladas'
  | 'tarifa_cartao'
  | 'tarifa_antecipacao'
  | 'impostos_diretos'
  | 'gratificacoes'
  | 'materiais'
  | 'dentistas'
  | 'proteticos'
  | 'royalties_fnp'
  | 'margem_contribuicao'
  | 'despesas_pessoal'
  | 'despesas_marketing'
  | 'custo_ocupacao'

export interface LimitesReferencia {
  ideal: number
  aceitavel: number
  atencao: number
}

export type ReferenciasDre = Record<LinhaReferenciaId, LimitesReferencia>

/** Como somar a linha a partir dos lançamentos. */
type RegraLinha =
  | { tipo: 'classificacoes'; nomes: string[] }   // nomes exatos do plano de contas
  | { tipo: 'grupo'; nome: string }               // grupo inteiro do plano de contas
  | { tipo: 'margem' }                            // margem de contribuição da DFC

export interface DefinicaoLinha {
  id: LinhaReferenciaId
  rotulo: string
  /** O que entra na linha, em linguagem do aluno. */
  composicao: string
  /** 'menor': quanto menor, melhor (custos). 'maior': quanto maior, melhor (margem). */
  sentido: SentidoReferencia
  destaque?: boolean
  padrao: LimitesReferencia
  regra: RegraLinha
}

// Ordem e valores da planilha "Referências do DRE" do método.
export const LINHAS_REFERENCIA: readonly DefinicaoLinha[] = [
  {
    id: 'vendas_canceladas',
    rotulo: 'Vendas canceladas / devoluções',
    composicao: 'Vendas canceladas e devoluções a pacientes.',
    sentido: 'menor',
    padrao: { ideal: 0.5, aceitavel: 1.5, atencao: 3 },
    regra: { tipo: 'classificacoes', nomes: ['Vendas Canceladas / Devoluções'] },
  },
  {
    id: 'tarifa_cartao',
    rotulo: 'Tarifa de cartão',
    composicao: 'Tarifa padrão da maquininha, aluguel de POS e outras taxas.',
    sentido: 'menor',
    padrao: { ideal: 1, aceitavel: 1.5, atencao: 2 },
    regra: {
      tipo: 'classificacoes',
      nomes: [
        'Tarifa de Cartão / Meios de Pagamento - Padrão',
        'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas',
      ],
    },
  },
  {
    id: 'tarifa_antecipacao',
    rotulo: 'Tarifa de antecipação',
    composicao: 'Taxa cobrada para antecipar os recebíveis do cartão.',
    sentido: 'menor',
    padrao: { ideal: 0.5, aceitavel: 1.5, atencao: 3 },
    regra: { tipo: 'classificacoes', nomes: ['Tarifa de Cartão / Meios de Pagamento - Antecipação'] },
  },
  {
    id: 'impostos_diretos',
    rotulo: 'Impostos diretos',
    composicao: 'Impostos sobre a receita (Simples Nacional ou Lucro Presumido).',
    sentido: 'menor',
    padrao: { ideal: 9, aceitavel: 13.5, atencao: 18 },
    regra: { tipo: 'classificacoes', nomes: ['Impostos sobre Receitas - Presumido e Simples Nacional'] },
  },
  {
    id: 'gratificacoes',
    rotulo: 'Gratificações e premiações',
    composicao: 'Gratificações e premiações da operação (OP Gratificações).',
    sentido: 'menor',
    padrao: { ideal: 2, aceitavel: 3, atencao: 4 },
    regra: { tipo: 'classificacoes', nomes: ['OP Gratificações'] },
  },
  {
    id: 'materiais',
    rotulo: 'Materiais',
    composicao: 'Custo de materiais e insumos.',
    sentido: 'menor',
    padrao: { ideal: 4, aceitavel: 6, atencao: 8 },
    regra: { tipo: 'classificacoes', nomes: ['Custo de Materiais e Insumos'] },
  },
  {
    id: 'dentistas',
    rotulo: 'Dentistas (incl. avaliador)',
    composicao: 'Serviços de terceiros PF (dentistas), incluindo o avaliador.',
    sentido: 'menor',
    padrao: { ideal: 17, aceitavel: 18.5, atencao: 20 },
    regra: { tipo: 'classificacoes', nomes: ['Serviços Terceiros PF (dentistas)'] },
  },
  {
    id: 'proteticos',
    rotulo: 'Protéticos',
    composicao: 'Serviços técnicos de laboratório.',
    sentido: 'menor',
    padrao: { ideal: 8, aceitavel: 10, atencao: 12 },
    regra: { tipo: 'classificacoes', nomes: ['Serviços Técnicos para Laboratórios'] },
  },
  {
    id: 'royalties_fnp',
    rotulo: 'Royalties e FNP',
    composicao: 'Royalties e Fundo Nacional de Marketing.',
    sentido: 'menor',
    padrao: { ideal: 7, aceitavel: 8, atencao: 9 },
    regra: { tipo: 'classificacoes', nomes: ['Royalties', 'Fundo Nacional de Marketing'] },
  },
  {
    id: 'margem_contribuicao',
    rotulo: 'Margem de contribuição',
    composicao: 'Recebimento menos as linhas de canceladas até royalties.',
    sentido: 'maior',
    destaque: true,
    padrao: { ideal: 60, aceitavel: 50, atencao: 40 },
    regra: { tipo: 'margem' },
  },
  {
    id: 'despesas_pessoal',
    rotulo: 'Despesas com pessoal',
    composicao: 'Grupo Despesas com Pessoal: salários, pró-labore, encargos e benefícios.',
    sentido: 'menor',
    padrao: { ideal: 10, aceitavel: 12, atencao: 14 },
    regra: { tipo: 'grupo', nome: 'Despesas com Pessoal' },
  },
  {
    id: 'despesas_marketing',
    rotulo: 'Despesas com marketing',
    composicao: 'Grupo Despesas Comerciais e Marketing.',
    sentido: 'menor',
    padrao: { ideal: 5, aceitavel: 7.5, atencao: 10 },
    regra: { tipo: 'grupo', nome: 'Despesas Comerciais e Marketing' },
  },
  {
    id: 'custo_ocupacao',
    rotulo: 'Custo de ocupação',
    composicao: 'Aluguel do imóvel.',
    sentido: 'menor',
    padrao: { ideal: 6, aceitavel: 7, atencao: 9 },
    regra: { tipo: 'classificacoes', nomes: ['Aluguel'] },
  },
]

export const CAMPOS_LIMITE: readonly CampoLimite[] = ['ideal', 'aceitavel', 'atencao']

export const ROTULO_CAMPO: Record<CampoLimite, string> = {
  ideal: 'Ideal',
  aceitavel: 'Aceitável',
  atencao: 'Atenção',
}

export const ROTULO_FAIXA: Record<FaixaReferencia, string> = {
  ideal: 'Ideal',
  aceitavel: 'Aceitável',
  media: 'Na média',
  atencao: 'Atenção',
}

export const ORDEM_FAIXAS: readonly FaixaReferencia[] = ['ideal', 'aceitavel', 'media', 'atencao']

const clonar = (refs: ReferenciasDre): ReferenciasDre =>
  Object.fromEntries(LINHAS_REFERENCIA.map(d => [d.id, { ...refs[d.id] }])) as ReferenciasDre

export const REFERENCIAS_PADRAO: ReferenciasDre = Object.freeze(
  Object.fromEntries(LINHAS_REFERENCIA.map(d => [d.id, Object.freeze({ ...d.padrao })])),
) as ReferenciasDre

/** "até" / "acima de" / "abaixo de", como na planilha. */
export function prefixoLimite(campo: CampoLimite, sentido: SentidoReferencia): string {
  if (sentido === 'menor') return campo === 'atencao' ? 'acima de' : 'até'
  return campo === 'atencao' ? 'abaixo de' : 'acima de'
}

// ── Números ──────────────────────────────────────────────────────────────────

export const MAX_CASAS = 2

export function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas
  return Math.round((valor + Number.EPSILON * Math.sign(valor)) * fator) / fator
}

function casasDe(valor: number): number {
  const texto = String(arredondar(valor, MAX_CASAS))
  const ponto = texto.indexOf('.')
  return ponto === -1 ? 0 : texto.length - ponto - 1
}

/** Casas para exibir e classificar a linha: 1, ou 2 quando algum limite usa centésimos. */
export function casasDaLinha(limites: LimitesReferencia): number {
  return Math.max(1, casasDe(limites.ideal), casasDe(limites.aceitavel), casasDe(limites.atencao))
}

const formatadores = new Map<string, Intl.NumberFormat>()

export function formatarNumero(valor: number, casasMax = MAX_CASAS, casasMin = 0): string {
  const chave = `${casasMin}:${casasMax}`
  let fmt = formatadores.get(chave)
  if (!fmt) {
    fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casasMin, maximumFractionDigits: casasMax })
    formatadores.set(chave, fmt)
  }
  return fmt.format(valor)
}

/** 0.5 → "0,5%"; 17 → "17%". */
export const formatarLimite = (valor: number) => `${formatarNumero(valor)}%`

/** Percentual medido, com casas fixas: 0.4 → "0,4%". Arredonda igual a classificarFaixa. */
export const formatarPercentual = (valor: number, casas = 1) =>
  `${formatarNumero(arredondar(valor, casas), casas, casas)}%`

export const ERRO_VAZIO = 'vazio'

export type LeituraLimite = { valor: number; erro?: undefined } | { valor?: undefined; erro: string }

/** Lê o que foi digitado ("13,5", "13.5", "9 %"). */
export function lerLimite(texto: string): LeituraLimite {
  const limpo = texto.trim().replace(/%$/, '').trim().replace(',', '.')
  if (limpo === '') return { erro: ERRO_VAZIO }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(limpo)) return { erro: 'use só números, como 1,5' }
  const ponto = limpo.indexOf('.')
  const casas = ponto === -1 ? 0 : limpo.length - ponto - 1
  if (casas > MAX_CASAS) return { erro: 'use no máximo 2 casas decimais' }
  const valor = Number(limpo)
  if (!Number.isFinite(valor) || valor > 100) return { erro: 'use valores de 0% a 100%' }
  return { valor }
}

export function ordemValida(limites: LimitesReferencia, sentido: SentidoReferencia): boolean {
  const { ideal, aceitavel, atencao } = limites
  return sentido === 'menor'
    ? ideal <= aceitavel && aceitavel <= atencao
    : ideal >= aceitavel && aceitavel >= atencao
}

export interface ResultadoLinha {
  limites: LimitesReferencia | null
  erro: string | null
  camposInvalidos: CampoLimite[]
}

/** Valida os três campos de uma linha do formulário do ADM. */
export function validarLinha(def: DefinicaoLinha, textos: Record<CampoLimite, string>): ResultadoLinha {
  const leituras = CAMPOS_LIMITE.map(campo => ({ campo, leitura: lerLimite(textos[campo]) }))
  const comErro = leituras.filter(l => l.leitura.erro !== undefined)

  if (comErro.length > 0) {
    const vazio = comErro.some(l => l.leitura.erro === ERRO_VAZIO)
    const primeiro = comErro.find(l => l.leitura.erro !== ERRO_VAZIO)
    const erro = vazio
      ? 'Preencha as três faixas.'
      : `${ROTULO_CAMPO[primeiro!.campo]}: ${primeiro!.leitura.erro}.`
    return { limites: null, erro, camposInvalidos: comErro.map(l => l.campo) }
  }

  const [ideal, aceitavel, atencao] = leituras.map(l => l.leitura.valor as number)
  const limites = { ideal, aceitavel, atencao }
  if (!ordemValida(limites, def.sentido)) {
    const crescente = def.sentido === 'menor'
    const fora = (a: number, b: number) => (crescente ? a > b : a < b)
    const campos = new Set<CampoLimite>()
    if (fora(ideal, aceitavel)) { campos.add('ideal'); campos.add('aceitavel') }
    if (fora(aceitavel, atencao)) { campos.add('aceitavel'); campos.add('atencao') }
    if (fora(ideal, atencao)) { campos.add('ideal'); campos.add('atencao') }
    return {
      limites: null,
      erro: crescente
        ? 'Os valores precisam subir da esquerda para a direita: Ideal ≤ Aceitável ≤ Atenção.'
        : 'Na margem, os valores precisam descer: Ideal ≥ Aceitável ≥ Atenção.',
      camposInvalidos: CAMPOS_LIMITE.filter(c => campos.has(c)),
    }
  }

  return { limites, erro: null, camposInvalidos: [] }
}

export const limitesIguais = (a: LimitesReferencia, b: LimitesReferencia) =>
  a.ideal === b.ideal && a.aceitavel === b.aceitavel && a.atencao === b.atencao

// ── Faixas ───────────────────────────────────────────────────────────────────

/**
 * Em qual faixa cai o percentual medido. O valor é arredondado nas mesmas casas
 * em que aparece na tela, para a cor nunca contradizer o número exibido.
 * Custos: até Ideal → Ideal; até Aceitável → Aceitável; até Atenção → na média; acima → Atenção.
 * Margem: acima de Ideal → Ideal; acima de Aceitável → Aceitável; de Atenção para cima → na média; abaixo → Atenção.
 */
export function classificarFaixa(
  percentual: number,
  limites: LimitesReferencia,
  sentido: SentidoReferencia,
): FaixaReferencia {
  const v = arredondar(percentual, casasDaLinha(limites))
  if (sentido === 'menor') {
    if (v <= limites.ideal) return 'ideal'
    if (v <= limites.aceitavel) return 'aceitavel'
    if (v <= limites.atencao) return 'media'
    return 'atencao'
  }
  if (v > limites.ideal) return 'ideal'
  if (v > limites.aceitavel) return 'aceitavel'
  if (v >= limites.atencao) return 'media'
  return 'atencao'
}

export interface TrechoFaixa {
  faixa: FaixaReferencia
  texto: string
}

/** Cada faixa com o seu intervalo, na ordem Ideal → Atenção (omite faixas vazias). */
export function trechosDasFaixas(def: DefinicaoLinha, limites: LimitesReferencia): TrechoFaixa[] {
  const f = formatarLimite
  const { ideal, aceitavel, atencao } = limites
  const trechos: TrechoFaixa[] = []
  if (def.sentido === 'menor') {
    trechos.push({ faixa: 'ideal', texto: `até ${f(ideal)}` })
    if (aceitavel > ideal) trechos.push({ faixa: 'aceitavel', texto: `acima de ${f(ideal)} até ${f(aceitavel)}` })
    if (atencao > aceitavel) trechos.push({ faixa: 'media', texto: `acima de ${f(aceitavel)} até ${f(atencao)}` })
    trechos.push({ faixa: 'atencao', texto: `acima de ${f(atencao)}` })
  } else {
    trechos.push({ faixa: 'ideal', texto: `acima de ${f(ideal)}` })
    if (aceitavel < ideal) trechos.push({ faixa: 'aceitavel', texto: `acima de ${f(aceitavel)} até ${f(ideal)}` })
    if (atencao < aceitavel) trechos.push({ faixa: 'media', texto: `de ${f(atencao)} até ${f(aceitavel)}` })
    else trechos.push({ faixa: 'media', texto: `igual a ${f(atencao)}` })
    trechos.push({ faixa: 'atencao', texto: `abaixo de ${f(atencao)}` })
  }
  return trechos
}

/** Frase única para dicas (title): "Ideal até 1% · Aceitável … · Atenção acima de 2%". */
export function resumoDasFaixas(def: DefinicaoLinha, limites: LimitesReferencia): string {
  return trechosDasFaixas(def, limites)
    .map(t => `${ROTULO_FAIXA[t.faixa]} ${t.texto}`)
    .join(' · ')
}

// ── Soma das linhas a partir dos lançamentos ─────────────────────────────────

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const LINHA_POR_CLASSIFICACAO = new Map<string, LinhaReferenciaId>()
const LINHA_POR_GRUPO = new Map<string, LinhaReferenciaId>()
for (const def of LINHAS_REFERENCIA) {
  if (def.regra.tipo === 'classificacoes') {
    for (const nome of def.regra.nomes) LINHA_POR_CLASSIFICACAO.set(normalizar(nome), def.id)
  } else if (def.regra.tipo === 'grupo') {
    LINHA_POR_GRUPO.set(normalizar(def.regra.nome), def.id)
  }
}

/**
 * Linha de referência de um lançamento de despesa. A classificação manda (é o que
 * o aluno escolhe); para as linhas de grupo vale o grupo gravado no lançamento e,
 * sem ele, o do plano de contas — a mesma prioridade da DFC e da margem.
 */
export function linhaDoLancamento(
  lancamento: Pick<DreLancamento, 'tipo' | 'classificacao' | 'grupo'>,
  grupoDaClassificacao?: (classificacao: string) => string | undefined,
): LinhaReferenciaId | null {
  if (lancamento.tipo === 'receita') return null
  const classificacao = lancamento.classificacao ?? ''
  const porClassificacao = LINHA_POR_CLASSIFICACAO.get(normalizar(classificacao))
  if (porClassificacao) return porClassificacao
  const grupo = lancamento.grupo?.trim() || grupoDaClassificacao?.(classificacao) || ''
  return LINHA_POR_GRUPO.get(normalizar(grupo)) ?? null
}

export interface SomaLinha {
  valor: number
  lancamentos: number
}

/** Soma (R$) e quantidade de lançamentos de cada linha de custo. */
export function somarLinhas(
  lancamentos: readonly DreLancamento[],
  grupoDaClassificacao?: (classificacao: string) => string | undefined,
): Map<LinhaReferenciaId, SomaLinha> {
  const somas = new Map<LinhaReferenciaId, SomaLinha>()
  // Poucas combinações classificação/grupo se repetem em milhares de lançamentos:
  // resolve cada uma uma vez só (a normalização de texto é a parte cara).
  const cache = new Map<string, LinhaReferenciaId | null>()
  for (const l of lancamentos) {
    const chave = `${l.tipo === 'receita' ? 'r' : 'd'}\u0000${l.classificacao ?? ''}\u0000${l.grupo ?? ''}`
    let linha = cache.get(chave)
    if (linha === undefined) {
      linha = linhaDoLancamento(l, grupoDaClassificacao)
      cache.set(chave, linha)
    }
    if (!linha) continue
    const atual = somas.get(linha) ?? { valor: 0, lancamentos: 0 }
    atual.valor += Number(l.valor) || 0
    atual.lancamentos += 1
    somas.set(linha, atual)
  }
  return somas
}

// ── Leitura e gravação ───────────────────────────────────────────────────────

function limitesDoBanco(bruto: unknown, sentido: SentidoReferencia): LimitesReferencia | null {
  if (!bruto || typeof bruto !== 'object') return null
  const o = bruto as Record<string, unknown>
  const valores = [o.ideal, o.aceitavel, o.atencao]
  if (!valores.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)) return null
  const limites = {
    ideal: arredondar(o.ideal as number, MAX_CASAS),
    aceitavel: arredondar(o.aceitavel as number, MAX_CASAS),
    atencao: arredondar(o.atencao as number, MAX_CASAS),
  }
  return ordemValida(limites, sentido) ? limites : null
}

export interface LeituraReferencias {
  referencias: ReferenciasDre
  /** auth uid de quem salvou por último (o nome é buscado na tela do ADM). */
  autorId: string | null
}

/** Interpreta o JSON salvo; linha ausente ou inválida volta ao padrão do método. */
export function lerReferencias(valor: string | null | undefined): LeituraReferencias {
  const referencias = clonar(REFERENCIAS_PADRAO)
  if (!valor) return { referencias, autorId: null }

  let bruto: unknown
  try {
    bruto = JSON.parse(valor)
  } catch {
    return { referencias, autorId: null }
  }
  if (!bruto || typeof bruto !== 'object') return { referencias, autorId: null }

  const { linhas, atualizado_por_id } = bruto as { linhas?: unknown; atualizado_por_id?: unknown }
  if (linhas && typeof linhas === 'object') {
    for (const def of LINHAS_REFERENCIA) {
      const limites = limitesDoBanco((linhas as Record<string, unknown>)[def.id], def.sentido)
      if (limites) referencias[def.id] = limites
    }
  }
  return { referencias, autorId: typeof atualizado_por_id === 'string' && atualizado_por_id.trim() ? atualizado_por_id.trim() : null }
}

// Guarda só o id de quem salvou: a linha é lida por qualquer usuário logado.
export function serializarReferencias(referencias: ReferenciasDre, autorId: string | null): string {
  const linhas = Object.fromEntries(LINHAS_REFERENCIA.map(d => [d.id, { ...referencias[d.id] }]))
  return JSON.stringify({ versao: 1, linhas, atualizado_por_id: autorId })
}

export interface ReferenciasSalvas extends LeituraReferencias {
  /** updated_at da linha; null enquanto ninguém salvou (valem os padrões). */
  atualizadoEm: string | null
}

export async function carregarReferencias(): Promise<ReferenciasSalvas> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor, updated_at')
    .eq('chave', CHAVE_REFERENCIAS_DRE)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return { ...lerReferencias(data?.valor), atualizadoEm: data?.updated_at ?? null }
}

/** Outra pessoa salvou entre o carregamento e o "Salvar". */
export class ConflitoReferencias extends Error {
  constructor() {
    super('Outra pessoa salvou as referências enquanto você editava. Recarregue para ver a versão atual.')
    this.name = 'ConflitoReferencias'
  }
}

const SEM_PERMISSAO = 'Sua conta não tem o cargo de ADM, então não pode salvar as referências.'

/**
 * Grava as referências. Só sobrescreve a versão que foi carregada (updated_at),
 * para um ADM não apagar sem querer o que outro acabou de salvar.
 * Retorna o novo updated_at.
 */
export async function salvarReferencias(
  referencias: ReferenciasDre,
  opcoes: { versaoCarregada: string | null; autorId: string | null },
): Promise<string> {
  const valor = serializarReferencias(referencias, opcoes.autorId)
  const agora = new Date().toISOString()

  if (opcoes.versaoCarregada) {
    const { data, error } = await supabase
      .from('configuracoes')
      .update({ valor, updated_at: agora })
      .eq('chave', CHAVE_REFERENCIAS_DRE)
      .eq('updated_at', opcoes.versaoCarregada)
      .select('updated_at')
    if (error) throw new Error(error.message)
    if (data && data.length > 0) return data[0].updated_at

    // Nada mudou: ou outra pessoa salvou antes, ou o RLS barrou (sem cargo de ADM).
    const { data: atual } = await supabase
      .from('configuracoes')
      .select('updated_at')
      .eq('chave', CHAVE_REFERENCIAS_DRE)
      .maybeSingle()
    if (!atual || atual.updated_at !== opcoes.versaoCarregada) throw new ConflitoReferencias()
    throw new Error(SEM_PERMISSAO)
  }

  const { data, error } = await supabase
    .from('configuracoes')
    .insert({ chave: CHAVE_REFERENCIAS_DRE, valor, updated_at: agora })
    .select('updated_at')
    .single()
  if (error) {
    if (error.code === '23505') throw new ConflitoReferencias()
    if (error.code === '42501') throw new Error(SEM_PERMISSAO)
    throw new Error(error.message)
  }
  return data.updated_at
}

interface EstadoReferencias {
  referencias: ReferenciasDre
  carregado: boolean
  /** A leitura falhou: a DFC esconde o painel em vez de mostrar faixas que podem não ser as do ADM. */
  erro: boolean
}

/** Referências em vigor, para quem só lê (DFC). */
export function useReferenciasDre(): EstadoReferencias {
  const [estado, setEstado] = useState<EstadoReferencias>(
    () => ({ referencias: REFERENCIAS_PADRAO, carregado: false, erro: false }),
  )

  useEffect(() => {
    let ativo = true
    carregarReferencias()
      .then(r => { if (ativo) setEstado({ referencias: r.referencias, carregado: true, erro: false }) })
      .catch(() => { if (ativo) setEstado({ referencias: REFERENCIAS_PADRAO, carregado: false, erro: true }) })
    return () => { ativo = false }
  }, [])

  return estado
}
