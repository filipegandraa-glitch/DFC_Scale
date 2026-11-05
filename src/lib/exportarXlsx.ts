import type { Borders, Fill, Font, Workbook, Worksheet } from 'exceljs'

// Formatação padrão dos relatórios .xlsx do DFC. A ExcelJS é carregada só na
// hora de exportar (import dinâmico), para não pesar no carregamento da página.

const FORMATO_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const FORMATO_PCT = '0.0%;[Red]-0.0%'
const FORMATO_DATA = 'dd/mm/yyyy'

const COR = {
  texto: 'FF1F2937',
  suave: 'FF6B7280',
  cabecalhoFundo: 'FF1F1F1F',
  cabecalhoTexto: 'FFFFFFFF',
  dourado: 'FFC9A22A',
  totalizadorFundo: 'FFEFEFEF',
  grupoFundo: 'FFF8F8F8',
  zebra: 'FFFAFAFA',
  linha: 'FFE5E7EB',
  linhaForte: 'FFBFBFBF',
  receita: 'FF15803D',
  despesa: 'FFB91C1C',
}

const preenchimento = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const fonte = (extra: Partial<Font> = {}): Partial<Font> => ({ name: 'Calibri', size: 11, color: { argb: COR.texto }, ...extra })
const bordaInferior = (argb = COR.linha): Partial<Borders> => ({ bottom: { style: 'thin', color: { argb } } })

async function novaPlanilha(): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DFC ClinicScale'
  wb.created = new Date()
  return wb
}

async function baixar(wb: Workbook, arquivo: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = arquivo
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Nome de aba válido no Excel: até 31 caracteres, sem \ / ? * [ ] : e sem repetir. */
function nomeDeAba(nome: string, usados: Set<string>) {
  const base = nome.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Planilha'
  let aba = base
  for (let n = 2; usados.has(aba); n++) aba = `${base.slice(0, 27)} (${n})`
  usados.add(aba)
  return aba
}

const geradoEm = () => {
  const agora = new Date()
  return `Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Título, linhas de contexto e uma linha em branco; devolve a próxima linha livre. */
function escreverTopo(ws: Worksheet, totalColunas: number, titulo: string, contexto: string[]) {
  ws.getCell(1, 1).value = titulo
  ws.getCell(1, 1).font = fonte({ size: 15, bold: true })
  ws.getRow(1).height = 22
  contexto.forEach((texto, i) => {
    const cell = ws.getCell(2 + i, 1)
    cell.value = texto
    cell.font = fonte({ size: 10, color: { argb: COR.suave } })
  })
  for (let r = 1; r <= 1 + contexto.length; r++) ws.mergeCells(r, 1, r, totalColunas)
  return 2 + contexto.length + 1
}

function estiloCabecalho(ws: Worksheet, linha: number, primeiraCol: number, ultimaCol: number) {
  for (let c = primeiraCol; c <= ultimaCol; c++) {
    const cell = ws.getCell(linha, c)
    cell.fill = preenchimento(COR.cabecalhoFundo)
    cell.font = fonte({ bold: true, color: { argb: COR.cabecalhoTexto } })
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: COR.dourado } } }
  }
  ws.getRow(linha).height = 20
}

function configurarImpressao(ws: Worksheet, linhasDeTitulo: string) {
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: linhasDeTitulo,
  }
}

// ── Relatório Completo: categorias nas linhas, meses nas colunas ─────────────

export interface LinhaDfcXlsx {
  rotulo: string
  nivel: 'totalizador' | 'grupo' | 'classificacao'
  /** Um par por coluna de período (meses e, se houver, o Total). pct é fração (0,25 = 25%). */
  valores: { valor: number; pct: number | null }[]
}

export async function exportarDfcCompleto(opcoes: {
  empresa: string
  periodo: string
  colunas: string[]        // ex.: ['Jan', 'Fev', ..., 'Total']
  linhas: LinhaDfcXlsx[]
  arquivo: string
}) {
  const { empresa, periodo, colunas, linhas, arquivo } = opcoes
  const wb = await novaPlanilha()
  const ws = wb.addWorksheet('DFC', {
    properties: { outlineLevelRow: 1, outlineProperties: { summaryBelow: false, summaryRight: false } },
  })
  const totalColunas = 1 + colunas.length * 2
  const temTotal = colunas[colunas.length - 1] === 'Total'

  const linhaCab = escreverTopo(ws, totalColunas, `Análise DFC — ${empresa}`, [
    `Período: ${periodo}`,
    `${geradoEm()} · Percentuais sobre a receita operacional de cada período`,
  ])

  // Cabeçalho em dois níveis: o período em cima, "Valor" e "%" embaixo
  ws.getCell(linhaCab, 1).value = 'Categoria'
  ws.mergeCells(linhaCab, 1, linhaCab + 1, 1)
  colunas.forEach((nome, i) => {
    const col = 2 + i * 2
    ws.getCell(linhaCab, col).value = nome
    ws.mergeCells(linhaCab, col, linhaCab, col + 1)
    ws.getCell(linhaCab + 1, col).value = 'Valor'
    ws.getCell(linhaCab + 1, col + 1).value = '% Rec.'
  })
  estiloCabecalho(ws, linhaCab, 1, totalColunas)
  estiloCabecalho(ws, linhaCab + 1, 1, totalColunas)

  ws.getColumn(1).width = 46
  colunas.forEach((_, i) => {
    ws.getColumn(2 + i * 2).width = 16
    // 9 é a largura que a ExcelJS considera padrão e omite do arquivo
    ws.getColumn(3 + i * 2).width = 10
  })

  linhas.forEach((item, idx) => {
    const r = linhaCab + 2 + idx
    const row = ws.getRow(r)
    const rotulo = ws.getCell(r, 1)
    rotulo.value = item.rotulo

    item.valores.forEach(({ valor, pct }, i) => {
      const cValor = ws.getCell(r, 2 + i * 2)
      const cPct = ws.getCell(r, 3 + i * 2)
      cValor.value = Math.round(valor * 100) / 100
      cValor.numFmt = FORMATO_MOEDA
      cPct.value = pct
      cPct.numFmt = FORMATO_PCT
      cPct.font = fonte({ size: 10, color: { argb: COR.suave } })
    })

    if (item.nivel === 'totalizador') {
      for (let c = 1; c <= totalColunas; c++) {
        const cell = ws.getCell(r, c)
        cell.fill = preenchimento(COR.totalizadorFundo)
        cell.font = fonte({ bold: true, size: c % 2 === 1 && c > 1 ? 10 : 11, color: { argb: c % 2 === 1 && c > 1 ? COR.suave : COR.texto } })
        cell.border = { top: { style: 'thin', color: { argb: COR.linhaForte } }, bottom: { style: 'thin', color: { argb: COR.linhaForte } } }
      }
      rotulo.value = item.rotulo.toUpperCase()
      row.height = 18
    } else if (item.nivel === 'grupo') {
      for (let c = 1; c <= totalColunas; c++) {
        const cell = ws.getCell(r, c)
        cell.fill = preenchimento(COR.grupoFundo)
        if (c === 1 || c % 2 === 0) cell.font = fonte({ bold: true })
        cell.border = bordaInferior()
      }
    } else {
      rotulo.alignment = { indent: 2 }
      rotulo.font = fonte({ color: { argb: 'FF404040' } })
      for (let c = 1; c <= totalColunas; c++) ws.getCell(r, c).border = bordaInferior()
      // Classificações ficam num nível de tópico abaixo do grupo, mas abertas
      row.outlineLevel = 1
    }
  })

  // Coluna de Total destacada por uma linha à esquerda
  if (temTotal) {
    const colTotal = totalColunas - 1
    for (let r = linhaCab; r <= linhaCab + 1 + linhas.length; r++) {
      const cell = ws.getCell(r, colTotal)
      cell.border = { ...cell.border, left: { style: 'thin', color: { argb: COR.linhaForte } } }
      if (r > linhaCab + 1) cell.font = { ...cell.font, bold: true }
    }
  }

  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: linhaCab + 1, showGridLines: false }]
  configurarImpressao(ws, `${linhaCab}:${linhaCab + 1}`)
  await baixar(wb, arquivo)
}

// ── Relatório Analítico: uma aba por mês com os lançamentos ──────────────────

export interface LancamentoXlsx {
  data: Date
  descricao: string
  tipo: 'receita' | 'despesa'
  classificacao: string
  grupo: string
  valor: number
}

export async function exportarDfcAnalitico(opcoes: {
  empresa: string
  abas: { nome: string; titulo: string; lancamentos: LancamentoXlsx[] }[]
  arquivo: string
}) {
  const { empresa, abas, arquivo } = opcoes
  const wb = await novaPlanilha()
  const usados = new Set<string>()
  const cabecalho = ['Data', 'Descrição', 'Tipo', 'Classificação', 'Grupo', 'Valor']
  const larguras = [12, 46, 11, 38, 32, 17]

  for (const aba of abas) {
    const ws = wb.addWorksheet(nomeDeAba(aba.nome, usados))
    const linhaCab = escreverTopo(ws, cabecalho.length, aba.titulo, [
      `${empresa} · ${geradoEm()}`,
      'Receitas em positivo e despesas em negativo; os totais no fim da aba somam por tipo.',
    ])
    cabecalho.forEach((titulo, i) => { ws.getCell(linhaCab, i + 1).value = titulo })
    estiloCabecalho(ws, linhaCab, 1, cabecalho.length)
    larguras.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    const itens = aba.lancamentos.slice().sort((a, b) => a.data.getTime() - b.data.getTime())
    const primeira = linhaCab + 1

    if (itens.length === 0) {
      ws.getCell(primeira, 1).value = 'Nenhum lançamento neste mês.'
      ws.getCell(primeira, 1).font = fonte({ italic: true, color: { argb: COR.suave } })
      ws.mergeCells(primeira, 1, primeira, cabecalho.length)
    }

    itens.forEach((l, idx) => {
      const r = primeira + idx
      const sinal = l.tipo === 'despesa' ? -1 : 1
      const valores = [l.data, l.descricao, l.tipo === 'receita' ? 'Receita' : 'Despesa', l.classificacao, l.grupo, sinal * Math.round(l.valor * 100) / 100]
      valores.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1)
        cell.value = v
        cell.font = fonte()
        cell.border = bordaInferior()
        cell.alignment = { vertical: 'middle', wrapText: i === 1 }
        if (idx % 2 === 1) cell.fill = preenchimento(COR.zebra)
      })
      ws.getCell(r, 1).numFmt = FORMATO_DATA
      ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell(r, 3).font = fonte({ bold: true, color: { argb: l.tipo === 'receita' ? COR.receita : COR.despesa } })
      ws.getCell(r, 6).numFmt = FORMATO_MOEDA
    })

    const ultima = primeira + Math.max(itens.length, 1) - 1
    if (itens.length > 0) {
      ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: ultima, column: cabecalho.length } }
    }

    // Totais com fórmulas (continuam certos se a planilha for editada)
    const centavos = (v: number) => Math.round(v * 100) / 100
    const somaReceitas = centavos(itens.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0))
    const somaDespesas = centavos(itens.filter(l => l.tipo === 'despesa').reduce((s, l) => s - l.valor, 0))
    const faixaTipo = `C${primeira}:C${ultima}`
    const faixaValor = `F${primeira}:F${ultima}`
    const totais: [string, { formula: string; result: number }][] = [
      ['Total de receitas', { formula: `SUMIF(${faixaTipo},"Receita",${faixaValor})`, result: somaReceitas }],
      ['Total de despesas', { formula: `SUMIF(${faixaTipo},"Despesa",${faixaValor})`, result: somaDespesas }],
      ['Resultado do mês', { formula: `SUM(${faixaValor})`, result: centavos(somaReceitas + somaDespesas) }],
    ]
    totais.forEach(([rotulo, valor], i) => {
      const r = ultima + 2 + i
      const final = i === totais.length - 1
      ws.getCell(r, 5).value = rotulo
      ws.getCell(r, 5).font = fonte({ bold: final })
      ws.getCell(r, 5).alignment = { horizontal: 'right' }
      ws.getCell(r, 6).value = valor
      ws.getCell(r, 6).numFmt = FORMATO_MOEDA
      ws.getCell(r, 6).font = fonte({ bold: final })
      if (final) {
        for (const c of [5, 6]) {
          ws.getCell(r, c).fill = preenchimento(COR.totalizadorFundo)
          ws.getCell(r, c).border = { top: { style: 'thin', color: { argb: COR.linhaForte } } }
        }
      }
    })

    ws.views = [{ state: 'frozen', ySplit: linhaCab, showGridLines: false }]
    configurarImpressao(ws, `${linhaCab}:${linhaCab}`)
  }

  await baixar(wb, arquivo)
}
