import { useEffect, useState } from 'react'
import { ConflitoConfiguracao, gravarConfiguracao, lerConfiguracao } from './configuracaoJson'
import type { DreLancamento } from './types'

// ── Estrutura de DRE gerencial padronizada ───────────────────────────────────
//
// As LINHAS do DRE são fixas (método ClinicScale) e iguais para todo mundo.
// O que muda por segmento é o plano de contas: cada conta pertence a uma linha
// e tem palavras-chave para reconhecer os lançamentos.
//
// Só ADM altera (pela tela "Estrutura do DRE"); usuários não mexem em nada.
// Fica salva na tabela `configuracoes` (chave dfc_estrutura_dre). Sem linha
// salva, vale ESTRUTURA_PADRAO (Odontologia = plano de contas atual).
//
// Compatibilidade: os lançamentos continuam gravados com o nome da conta em
// `classificacao` e o nome do grupo da linha em `grupo` (os mesmos nomes de
// sempre), então o PainelGestaa lê os lançamentos do DFC do mesmo jeito.

export const CHAVE_ESTRUTURA_DRE = 'dfc_estrutura_dre'
export const SEGMENTO_PADRAO = 'odontologia'

export type LinhaDreId =
  | 'receita_operacional'
  | 'deducoes'
  | 'impostos'
  | 'custos_variaveis'
  | 'pessoal'
  | 'administrativas'
  | 'comerciais_marketing'
  | 'tecnologia'
  | 'receitas_financeiras'
  | 'despesas_financeiras'
  | 'investimentos'

export type TipoLinha = 'receita' | 'despesa'

export interface LinhaDre {
  id: LinhaDreId
  rotulo: string
  /** Nome do grupo gravado nos lançamentos (o mesmo do PainelGestaa e dos indicadores). */
  grupo: string
  tipo: TipoLinha
  descricao: string
}

/** Linhas do DRE gerencial, na ordem do demonstrativo. */
export const LINHAS_DRE: readonly LinhaDre[] = [
  { id: 'receita_operacional', rotulo: 'Receita bruta', grupo: 'Receitas Operacionais', tipo: 'receita', descricao: 'Tudo o que entra pelos atendimentos: cartão, PIX, dinheiro.' },
  { id: 'deducoes', rotulo: 'Deduções da receita', grupo: 'Deduções de Receita', tipo: 'despesa', descricao: 'Tarifas de cartão, antecipação, cancelamentos e devoluções.' },
  { id: 'impostos', rotulo: 'Impostos sobre o faturamento', grupo: 'Impostos sobre Faturamento', tipo: 'despesa', descricao: 'Simples Nacional ou Lucro Presumido.' },
  { id: 'custos_variaveis', rotulo: 'Custos variáveis do atendimento', grupo: 'Despesas Operacionais', tipo: 'despesa', descricao: 'O que acompanha o volume atendido: materiais, profissionais parceiros, laboratório, comissões, royalties.' },
  { id: 'pessoal', rotulo: 'Despesas com pessoal', grupo: 'Despesas com Pessoal', tipo: 'despesa', descricao: 'Salários, pró-labore, encargos e benefícios.' },
  { id: 'administrativas', rotulo: 'Despesas administrativas e de ocupação', grupo: 'Despesas Administrativas', tipo: 'despesa', descricao: 'Aluguel, contas de consumo, serviços de apoio e despesas gerais.' },
  { id: 'comerciais_marketing', rotulo: 'Despesas comerciais e marketing', grupo: 'Despesas Comerciais e Marketing', tipo: 'despesa', descricao: 'Anúncios, agência, eventos e materiais de divulgação.' },
  { id: 'tecnologia', rotulo: 'Despesas com tecnologia', grupo: 'Despesas com TI', tipo: 'despesa', descricao: 'Sistema de gestão, internet, informática e hospedagem.' },
  { id: 'receitas_financeiras', rotulo: 'Receitas financeiras', grupo: 'Receitas Financeiras', tipo: 'receita', descricao: 'Rendimentos de aplicações e descontos obtidos.' },
  { id: 'despesas_financeiras', rotulo: 'Despesas financeiras', grupo: 'Despesas Financeiras', tipo: 'despesa', descricao: 'Tarifas bancárias, juros, empréstimos e depreciação.' },
  { id: 'investimentos', rotulo: 'Investimentos e retiradas dos sócios', grupo: 'Investimentos', tipo: 'despesa', descricao: 'Compra de equipamentos, reformas e distribuição de lucros.' },
]

/** Subtotais do demonstrativo, cada um logo depois da linha indicada. */
export const SUBTOTAIS_DRE: readonly { depoisDe: LinhaDreId; rotulo: string; formula: string }[] = [
  { depoisDe: 'impostos', rotulo: 'Receita líquida', formula: 'Receita bruta − deduções − impostos' },
  { depoisDe: 'custos_variaveis', rotulo: 'Margem de contribuição', formula: 'Receita líquida − custos variáveis' },
  { depoisDe: 'tecnologia', rotulo: 'EBITDA', formula: 'Margem de contribuição − pessoal − administrativas − comerciais − tecnologia' },
  { depoisDe: 'despesas_financeiras', rotulo: 'EBIT', formula: 'EBITDA + receitas financeiras − despesas financeiras' },
  { depoisDe: 'investimentos', rotulo: 'Resultado final (NOPAT)', formula: 'EBIT − investimentos e retiradas' },
]

const LINHA_POR_ID = new Map(LINHAS_DRE.map(l => [l.id, l]))
const LINHA_POR_GRUPO = new Map(LINHAS_DRE.map(l => [l.grupo.toLowerCase(), l]))

export const linhaDre = (id: LinhaDreId): LinhaDre => LINHA_POR_ID.get(id)!
export const grupoDaLinha = (id: LinhaDreId) => linhaDre(id).grupo
export const tipoDaLinha = (id: LinhaDreId) => linhaDre(id).tipo
export const linhaDoGrupo = (grupo: string | null | undefined): LinhaDre | null =>
  LINHA_POR_GRUPO.get((grupo ?? '').trim().toLowerCase()) ?? null
export const ehLinhaDre = (id: unknown): id is LinhaDreId => typeof id === 'string' && LINHA_POR_ID.has(id as LinhaDreId)

export interface ContaDre {
  nome: string
  linha: LinhaDreId
  /** Palavras-chave já normalizadas (minúsculas, sem acento). */
  palavras: string[]
  ativo: boolean
}

export interface SegmentoDre {
  id: string
  nome: string
  contas: ContaDre[]
}

export interface EstruturaDre {
  segmentos: SegmentoDre[]
  /** empresa_id → id do segmento. Empresa fora da lista usa SEGMENTO_PADRAO. */
  empresas: Record<string, string>
}

/** Minúsculas, sem acento, só letras/números separados por um espaço. */
export const normalizarTexto = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ── Padrão: Odontologia (plano de contas atual, com palavras-chave) ─────────

const c = (linha: LinhaDreId, nome: string, palavras: string[] = []): ContaDre => ({ nome, linha, palavras, ativo: true })

const CONTAS_ODONTOLOGIA: ContaDre[] = [
  c('receita_operacional', 'Receita Cartão', ['getnet', 'cielo', 'stone', 'pagseguro', 'sumup', 'pagbank', 'mercadopago', 'mercado pago', 'subadquir', 'adquirente', 'venda cartao', 'venda credito', 'venda debito', 'credito cartao', 'cartao']),
  c('receita_operacional', 'Receita PIX / Transferências', ['pix', 'transferencia', 'ted', 'doc']),
  c('receita_operacional', 'Receita Dinheiro', ['dinheiro', 'especie']),
  c('receita_operacional', 'Receita Subadquirência (BT)'),
  c('receita_operacional', 'Receita Financeiras'),

  c('deducoes', 'Tarifa de Cartão / Meios de Pagamento - Padrão', ['tarifa cartao', 'taxa cartao', 'tarifa credito', 'tarifa debito', 'tarifa venda', 'taxa maquininha', 'tarifa maquininha', 'mdr']),
  c('deducoes', 'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas', ['aluguel pos', 'aluguel maquin', 'maquininha', 'pos']),
  c('deducoes', 'Tarifa de Cartão / Meios de Pagamento - Antecipação', ['antecipacao', 'antecip']),
  c('deducoes', 'Vendas Canceladas / Devoluções', ['cancelamento', 'devolucao', 'estorno']),

  c('impostos', 'Impostos sobre Receitas - Presumido e Simples Nacional', ['simples nacional', 'lucro presumido', 'darf', 'issqn', 'iss', 'pis', 'cofins', 'irpj', 'csll', 'imposto', 'tributo']),

  c('custos_variaveis', 'Custo de Materiais e Insumos', ['insumo', 'implante', 'material odont', 'materiais odont', 'componente', 'dental cremer', 'dental speed', 'dentalspeed']),
  c('custos_variaveis', 'Serviços Terceiros PF (dentistas)', ['dentista', 'terceiro pf', 'prestador', 'autonomo', 'rpa']),
  c('custos_variaveis', 'Serviços Técnicos para Laboratórios', ['laboratorio', 'protetico', 'protese', 'tecnico dental', 'lab']),
  c('custos_variaveis', 'OP Gratificações', ['gratificacao', 'comissao', 'bonus']),
  c('custos_variaveis', 'Royalties', ['royalt']),
  c('custos_variaveis', 'Fundo Nacional de Marketing', ['fnp', 'fundo nacional', 'fundo de marketing', 'fundo de publicidade']),

  c('pessoal', 'Salários e Ordenados', ['salario', 'ordenado', 'folha de pagamento', 'folha pagamento', 'fopag']),
  c('pessoal', 'Pró-labore', ['pro labore', 'prolabore']),
  c('pessoal', '13° Salário', ['13 salario', '13o salario', 'decimo terceiro']),
  c('pessoal', 'Rescisões', ['rescisao', 'aviso previo', 'verbas rescisorias']),
  c('pessoal', 'INSS', ['inss', 'gps']),
  c('pessoal', 'FGTS', ['fgts']),
  c('pessoal', 'Vale Transporte', ['vale transporte', 'vt']),
  c('pessoal', 'Vale Refeição', ['vale refeicao', 'vale alimentacao', 'alelo', 'sodexo', 'ticket', 'vr', 'va', 'flash beneficio']),
  c('pessoal', 'Combustível', ['combustivel', 'gasolina', 'etanol', 'abastecimento', 'posto']),
  c('pessoal', 'Outras Despesas Com Funcionários', ['plano de saude', 'plano odonto', 'unimed', 'amil', 'hapvida', 'convenio medico']),

  c('administrativas', 'Aluguel', ['aluguel', 'locacao', 'condominio']),
  c('administrativas', 'Energia Elétrica', ['energia', 'enel', 'cemig', 'copel', 'cpfl', 'coelba', 'celpe', 'energisa', 'elektro']),
  c('administrativas', 'Água e Esgoto', ['agua', 'esgoto', 'sabesp', 'sanepar', 'cedae', 'copasa', 'caesb', 'embasa', 'saneamento']),
  c('administrativas', 'Telefonia', ['telefonia', 'telefone', 'celular', 'vivo', 'claro', 'tim', 'nextel', 'algar']),
  c('administrativas', 'Contabilidade', ['contabilidade', 'contador', 'contabil', 'contabeis', 'honorarios contabeis']),
  c('administrativas', 'Jurídico', ['advogado', 'advocacia', 'juridico']),
  c('administrativas', 'Consultoria', ['consultoria']),
  c('administrativas', 'Limpeza', ['limpeza', 'faxina', 'higienizacao']),
  c('administrativas', 'Material de Limpeza', ['material de limpeza', 'produto de limpeza', 'desinfetante']),
  c('administrativas', 'Material de Escritório', ['material de escritorio', 'papelaria', 'toner', 'cartucho', 'kalunga']),
  c('administrativas', 'Copa e Cozinha', ['copa e cozinha', 'cafe', 'supermercado', 'padaria']),
  c('administrativas', 'Manutenção e Reparos', ['manutencao', 'reparo', 'conserto']),
  c('administrativas', 'Manutenção e Conservação Predial', ['manutencao predial', 'conservacao predial']),
  c('administrativas', 'Segurança e Vigilância', ['seguranca', 'vigilancia', 'monitoramento', 'alarme']),
  c('administrativas', 'Seguros', ['seguro', 'seguradora']),
  c('administrativas', 'Uniformes', ['uniforme', 'jaleco', 'epi']),
  c('administrativas', 'Exames Ocupacionais', ['exame admissional', 'exame demissional', 'exame periodico', 'medicina do trabalho', 'aso']),
  c('administrativas', 'Uber e Táxi', ['uber', 'taxi', '99 pop', '99app', 'cabify']),
  c('administrativas', 'Estacionamento', ['estacionamento', 'parking', 'estapar']),
  c('administrativas', 'Viagens e Estadias', ['viagem', 'hotel', 'passagem', 'estadia', 'airbnb']),
  c('administrativas', 'Serviço de Motoboy', ['motoboy', 'motofrete', 'loggi', 'lalamove']),
  c('administrativas', 'Taxas e Emolumentos', ['taxa', 'emolumento', 'alvara']),
  c('administrativas', 'Cartórios', ['cartorio']),
  c('administrativas', 'Custas Processuais', ['custas processuais', 'custas judiciais']),
  c('administrativas', 'IOF', ['iof']),
  c('administrativas', 'Multa e Juros s/ Contas Pagas em Atraso', ['multa', 'juros', 'mora', 'encargos atraso']),
  c('administrativas', 'Bens de Pequeno Valor'),
  c('administrativas', 'Adiantamento a Fornecedor', ['adiantamento fornecedor', 'adiantamento a fornecedor']),
  c('administrativas', 'Outras Despesas'),

  c('comerciais_marketing', 'Marketing Digital', ['marketing', 'google ads', 'meta ads', 'facebook', 'instagram', 'anuncio', 'trafego pago', 'midia']),
  c('comerciais_marketing', 'Agência e Assessoria', ['agencia', 'assessoria', 'agencia de marketing']),
  c('comerciais_marketing', 'Feiras e Eventos', ['feira', 'evento', 'congresso']),
  c('comerciais_marketing', 'Produção de Material', ['grafica', 'impressao', 'panfleto', 'banner']),
  c('comerciais_marketing', 'Refeições e Lanches', ['restaurante', 'refeicao', 'almoco', 'lanche', 'ifood']),
  c('comerciais_marketing', 'Outras Despesas com Vendas'),

  c('tecnologia', 'Sistema de Gestão', ['software', 'sistema', 'licenca', 'assinatura', 'clinicorp', 'dental office', 'easydental', 'simples dental']),
  c('tecnologia', 'Internet', ['internet', 'banda larga', 'fibra']),
  c('tecnologia', 'Informática e Software', ['informatica']),
  c('tecnologia', 'Hospedagem de Dados', ['hospedagem', 'servidor', 'aws', 'google cloud', 'azure', 'digitalocean']),

  c('receitas_financeiras', 'Rendimento de Aplicação Financeira', ['rendimento', 'aplicacao', 'invest facil', 'cdb', 'lci', 'lca']),
  c('receitas_financeiras', 'Descontos Obtidos', ['desconto obtido', 'descontos obtidos']),

  c('despesas_financeiras', 'Despesas Bancárias', ['tarifa bancaria', 'taxa bancaria', 'manutencao conta', 'tarifa pacote', 'cesta de servicos', 'tarifa pix', 'tarifa ted', 'taxa transferencia', 'taxa pix']),
  c('despesas_financeiras', 'Juros Passivos', ['juros emprestimo', 'juros financiamento', 'juros passivos']),
  c('despesas_financeiras', 'Financiamentos / Empréstimos', ['financiamento', 'emprestimo', 'consorcio']),
  c('despesas_financeiras', 'Depreciação e Amortização', ['depreciacao', 'amortizacao']),

  c('investimentos', 'Investimento - Máquinas e Equipamentos', ['equipamento', 'maquina', 'autoclave', 'cadeira odontologica', 'raio x', 'scanner intraoral']),
  c('investimentos', 'Investimento - Computadores e Periféricos', ['computador', 'notebook', 'impressora', 'monitor']),
  c('investimentos', 'Investimento - Móveis e Utensílios', ['moveis', 'movel', 'mobilia', 'mesa', 'cadeira']),
  c('investimentos', 'Investimento - Instalações de Terceiros', ['reforma', 'obra', 'instalacao', 'construcao']),
  c('investimentos', 'Dividendos e Despesas dos Sócios', ['dividendo', 'distribuicao de lucro', 'retirada socio', 'retirada de socio']),
]

export const ESTRUTURA_PADRAO: EstruturaDre = Object.freeze({
  segmentos: [{ id: SEGMENTO_PADRAO, nome: 'Odontologia', contas: CONTAS_ODONTOLOGIA }],
  empresas: {},
}) as EstruturaDre

export const clonarEstrutura = (e: EstruturaDre): EstruturaDre => ({
  segmentos: e.segmentos.map(s => ({ ...s, contas: s.contas.map(conta => ({ ...conta, palavras: [...conta.palavras] })) })),
  empresas: { ...e.empresas },
})

// ── Regras de edição (ADM) ───────────────────────────────────────────────────

export const MAX_PALAVRAS = 40

/** "Google Ads; meta ads, Anúncio" → ["google ads", "meta ads", "anuncio"] (sem repetidas). */
export function palavrasDoTexto(texto: string): string[] {
  const vistas = new Set<string>()
  for (const parte of texto.split(/[,;\n]/)) {
    const p = normalizarTexto(parte)
    if (p.length >= 2 && p.length <= 60) vistas.add(p)
  }
  return [...vistas].slice(0, MAX_PALAVRAS)
}

/** Erro do nome de uma conta nova, ou null. */
export function validarNomeConta(nome: string, segmento: SegmentoDre): string | null {
  const limpo = nome.trim().replace(/\s+/g, ' ')
  if (limpo.length < 2) return 'Digite o nome da conta.'
  if (limpo.length > 120) return 'Use no máximo 120 caracteres.'
  const chave = normalizarTexto(limpo)
  if (!chave) return 'Use letras ou números no nome.'
  if (segmento.contas.some(conta => normalizarTexto(conta.nome) === chave)) return 'Já existe uma conta com esse nome neste segmento.'
  return null
}

/** Id do segmento a partir do nome ("Estética e Harmonização" → "estetica_e_harmonizacao"). */
export function idDoSegmento(nome: string, existentes: readonly SegmentoDre[]): string {
  const base = normalizarTexto(nome).replace(/ /g, '_').slice(0, 36) || 'segmento'
  let id = base.length >= 2 ? base : `seg_${base}`
  let n = 2
  while (existentes.some(s => s.id === id)) id = `${base}_${n++}`
  return id
}

// ── Leitura e gravação ───────────────────────────────────────────────────────

function contaDoBanco(bruto: unknown): ContaDre | null {
  if (!bruto || typeof bruto !== 'object') return null
  const o = bruto as Record<string, unknown>
  if (typeof o.nome !== 'string') return null
  const nome = o.nome.trim().replace(/\s+/g, ' ')
  if (nome.length < 2 || nome.length > 120 || !ehLinhaDre(o.linha)) return null
  const palavras = Array.isArray(o.palavras)
    ? palavrasDoTexto(o.palavras.filter((p): p is string => typeof p === 'string').join(','))
    : []
  return { nome, linha: o.linha, palavras, ativo: o.ativo !== false }
}

function segmentoDoBanco(bruto: unknown): SegmentoDre | null {
  if (!bruto || typeof bruto !== 'object') return null
  const o = bruto as Record<string, unknown>
  if (typeof o.id !== 'string' || !/^[a-z0-9_]{2,40}$/.test(o.id)) return null
  if (typeof o.nome !== 'string' || o.nome.trim().length < 2) return null
  const contas: ContaDre[] = []
  const nomes = new Set<string>()
  for (const item of Array.isArray(o.contas) ? o.contas : []) {
    const conta = contaDoBanco(item)
    if (!conta) continue
    const chave = normalizarTexto(conta.nome)
    if (!chave || nomes.has(chave)) continue
    nomes.add(chave)
    contas.push(conta)
  }
  return { id: o.id, nome: o.nome.trim().slice(0, 60), contas }
}

export interface LeituraEstrutura {
  estrutura: EstruturaDre
  autorId: string | null
}

/** Interpreta o JSON salvo; o que estiver inválido volta ao padrão (nunca fica sem estrutura). */
export function lerEstrutura(valor: string | null | undefined): LeituraEstrutura {
  const padrao = { estrutura: clonarEstrutura(ESTRUTURA_PADRAO), autorId: null }
  if (!valor) return padrao
  let bruto: unknown
  try {
    bruto = JSON.parse(valor)
  } catch {
    return padrao
  }
  if (!bruto || typeof bruto !== 'object') return padrao
  const o = bruto as Record<string, unknown>

  const segmentos: SegmentoDre[] = []
  for (const item of Array.isArray(o.segmentos) ? o.segmentos : []) {
    const seg = segmentoDoBanco(item)
    if (seg && seg.contas.length > 0 && !segmentos.some(s => s.id === seg.id)) segmentos.push(seg)
  }
  if (!segmentos.some(s => s.id === SEGMENTO_PADRAO)) {
    segmentos.unshift(clonarEstrutura(ESTRUTURA_PADRAO).segmentos[0])
  }

  const empresas: Record<string, string> = {}
  if (o.empresas && typeof o.empresas === 'object') {
    for (const [empresaId, segId] of Object.entries(o.empresas as Record<string, unknown>)) {
      if (typeof segId === 'string' && segmentos.some(s => s.id === segId)) empresas[empresaId] = segId
    }
  }

  const autor = typeof o.atualizado_por_id === 'string' && o.atualizado_por_id.trim() ? o.atualizado_por_id.trim() : null
  return { estrutura: { segmentos, empresas }, autorId: autor }
}

export function serializarEstrutura(estrutura: EstruturaDre, autorId: string | null): string {
  return JSON.stringify({
    versao: 1,
    segmentos: estrutura.segmentos.map(s => ({
      id: s.id,
      nome: s.nome,
      contas: s.contas.map(conta => ({ nome: conta.nome, linha: conta.linha, palavras: conta.palavras, ativo: conta.ativo })),
    })),
    empresas: estrutura.empresas,
    atualizado_por_id: autorId,
  })
}

export interface EstruturaSalva extends LeituraEstrutura {
  atualizadoEm: string | null
}

export async function carregarEstrutura(): Promise<EstruturaSalva> {
  const { valor, atualizadoEm } = await lerConfiguracao(CHAVE_ESTRUTURA_DRE)
  return { ...lerEstrutura(valor), atualizadoEm }
}

export { ConflitoConfiguracao as ConflitoEstrutura }

export function salvarEstrutura(
  estrutura: EstruturaDre,
  opcoes: { versaoCarregada: string | null; autorId: string | null },
): Promise<string> {
  return gravarConfiguracao(CHAVE_ESTRUTURA_DRE, serializarEstrutura(estrutura, opcoes.autorId), opcoes.versaoCarregada, {
    conflito: 'Outra pessoa salvou a estrutura enquanto você editava. Recarregue para ver a versão atual.',
    semPermissao: 'Sua conta não tem o cargo de ADM, então não pode alterar a estrutura do DRE.',
  })
}

// ── Plano da empresa: reconhecer e organizar lançamentos ─────────────────────

export interface PlanoEmpresa {
  segmento: SegmentoDre
  /** Contas que podem receber lançamentos novos. */
  contasAtivas: ContaDre[]
  /** Todas as contas (inclusive desativadas), por nome normalizado: organiza lançamentos antigos. */
  porNome: Map<string, ContaDre>
}

export function segmentoDaEmpresa(estrutura: EstruturaDre, empresaId: string): SegmentoDre {
  const id = estrutura.empresas[empresaId] ?? SEGMENTO_PADRAO
  return estrutura.segmentos.find(s => s.id === id)
    ?? estrutura.segmentos.find(s => s.id === SEGMENTO_PADRAO)
    ?? estrutura.segmentos[0]
}

export function planoDaEmpresa(estrutura: EstruturaDre, empresaId: string): PlanoEmpresa {
  const segmento = segmentoDaEmpresa(estrutura, empresaId)
  return {
    segmento,
    contasAtivas: segmento.contas.filter(conta => conta.ativo),
    porNome: new Map(segmento.contas.map(conta => [normalizarTexto(conta.nome), conta])),
  }
}

export const contaDoLancamento = (plano: PlanoEmpresa, classificacao: string | null | undefined) =>
  plano.porNome.get(normalizarTexto(classificacao ?? ''))

/**
 * A conta manda na linha do DRE: um lançamento com conta conhecida passa a usar o
 * grupo da linha dessa conta, mesmo que tenha sido gravado com outro grupo.
 * Lançamento fora da estrutura fica como está.
 */
export function organizarLancamento<T extends Pick<DreLancamento, 'classificacao' | 'grupo'>>(lancamento: T, plano: PlanoEmpresa): T {
  const conta = contaDoLancamento(plano, lancamento.classificacao)
  if (!conta) return lancamento
  const grupo = grupoDaLinha(conta.linha)
  return lancamento.grupo === grupo ? lancamento : { ...lancamento, grupo }
}

/** Lista no formato que a IA e os seletores já usam: { nome, tipo, grupo }. */
export const catalogoDoPlano = (plano: PlanoEmpresa) =>
  plano.contasAtivas.map(conta => ({ nome: conta.nome, tipo: tipoDaLinha(conta.linha), grupo: grupoDaLinha(conta.linha) }))

/** Texto de busca: normalizado e sem o "s" final das palavras ("tarifas bancarias" = "tarifa bancaria"). */
const textoDeBusca = (texto: string) =>
  normalizarTexto(texto).split(' ').map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)).join(' ')

const regexCache = new Map<string, { re: RegExp; tamanho: number }>()
function regexDaPalavra(palavra: string): { re: RegExp; tamanho: number } {
  let item = regexCache.get(palavra)
  if (!item) {
    const busca = textoDeBusca(palavra)
    const escapada = busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Começo de palavra; termos curtos (até 3 letras) precisam ser a palavra inteira.
    item = { re: new RegExp(`(?:^| )${escapada}${busca.length <= 3 ? '(?= |$)' : ''}`), tamanho: busca.length }
    regexCache.set(palavra, item)
  }
  return item
}

/**
 * Reconhece a conta pela descrição do lançamento usando as palavras-chave do plano.
 * Vale a palavra-chave mais longa encontrada; empate entre contas diferentes = não reconhece.
 */
export function reconhecerConta(plano: PlanoEmpresa, descricao: string, tipo: TipoLinha): ContaDre | null {
  const texto = textoDeBusca(descricao)
  if (!texto) return null
  let melhor: ContaDre | null = null
  let tamanho = 0
  let empate = false
  for (const conta of plano.contasAtivas) {
    if (tipoDaLinha(conta.linha) !== tipo) continue
    for (const palavra of conta.palavras) {
      const busca = regexDaPalavra(palavra)
      if (busca.tamanho < tamanho || !busca.re.test(texto)) continue
      if (busca.tamanho > tamanho) {
        melhor = conta
        tamanho = busca.tamanho
        empate = false
      } else if (melhor !== conta) {
        empate = true
      }
    }
  }
  return empate ? null : melhor
}

// ── Hook: estrutura em vigor (DFC) ───────────────────────────────────────────

interface EstadoEstrutura {
  estrutura: EstruturaDre
  carregado: boolean
  /** A leitura falhou: a DFC segue com o plano de contas antigo do banco. */
  erro: boolean
}

export function useEstruturaDre(): EstadoEstrutura {
  const [estado, setEstado] = useState<EstadoEstrutura>(
    () => ({ estrutura: ESTRUTURA_PADRAO, carregado: false, erro: false }),
  )
  useEffect(() => {
    let ativo = true
    carregarEstrutura()
      .then(r => { if (ativo) setEstado({ estrutura: r.estrutura, carregado: true, erro: false }) })
      .catch(() => { if (ativo) setEstado({ estrutura: ESTRUTURA_PADRAO, carregado: false, erro: true }) })
    return () => { ativo = false }
  }, [])
  return estado
}
