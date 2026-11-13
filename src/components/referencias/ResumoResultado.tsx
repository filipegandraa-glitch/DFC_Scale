import { memo, useMemo } from 'react'
import styles from './ResumoResultado.module.css'
import { SeloFaixa } from './SeloFaixa'
import {
  LINHAS_REFERENCIA,
  ORDEM_FAIXAS,
  ROTULO_FAIXA,
  casasDaLinha,
  classificarFaixa,
  formatarLimite,
  formatarPercentual,
  prefixoLimite,
  resumoDasFaixas,
  somarLinhas,
  type DefinicaoLinha,
  type FaixaReferencia,
  type ReferenciasDre,
} from '../../lib/referenciasDre'
import type { DreLancamento } from '../../lib/types'

// Resumo do resultado na Análise DFC: as linhas do DRE no período selecionado,
// em % do recebimento, com o status (Ideal → Atenção) das Referências do DRE.

export interface RecorteResumo {
  lancamentos: readonly DreLancamento[]
  /** Receitas operacionais: a base do percentual. */
  recebimento: number
  /** Margem de contribuição calculada pela DFC (a mesma dos indicadores). */
  margemPct: number
  margemReais: number
}

interface Props {
  /** Período selecionado (ano + meses), sem filtro de tipo/busca. */
  periodo: RecorteResumo
  /** Um recorte por mês (AAAA-MM) do período, para contar os meses em atenção. */
  meses: readonly RecorteResumo[]
  referencias: ReferenciasDre
  grupoDaClassificacao: (classificacao: string) => string | undefined
  onAbrirReferencias?: () => void
  podeEditar?: boolean
}

interface LinhaResumo {
  def: DefinicaoLinha
  pct: number
  reais: number
  faixa: FaixaReferencia
  mesesAtencao: number
  mesesComDado: number
}

/** Valor em reais sem o símbolo (a coluna já diz "R$"). */
const valorReais = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ROTULO_CONTAGEM: Record<FaixaReferencia, [string, string]> = {
  ideal: ['ideal', 'ideais'],
  aceitavel: ['aceitável', 'aceitáveis'],
  media: ['na média', 'na média'],
  atencao: ['em atenção', 'em atenção'],
}

/** Percentual de cada linha num recorte; null quando não há recebimento ou lançamento na linha. */
function percentuaisDoRecorte(
  recorte: RecorteResumo,
  grupoDaClassificacao: Props['grupoDaClassificacao'],
): Map<DefinicaoLinha['id'], { pct: number; reais: number }> | null {
  if (recorte.recebimento <= 0) return null
  const somas = somarLinhas(recorte.lancamentos, grupoDaClassificacao)
  const resultado = new Map<DefinicaoLinha['id'], { pct: number; reais: number }>()
  for (const def of LINHAS_REFERENCIA) {
    if (def.regra.tipo === 'margem') {
      resultado.set(def.id, { pct: recorte.margemPct, reais: recorte.margemReais })
      continue
    }
    const soma = somas.get(def.id)
    if (soma) resultado.set(def.id, { pct: (soma.valor / recorte.recebimento) * 100, reais: soma.valor })
  }
  return resultado
}

export const ResumoResultado = memo(function ResumoResultado({
  periodo, meses, referencias, grupoDaClassificacao, onAbrirReferencias, podeEditar = false,
}: Props) {
  const resumo = useMemo(() => {
    const doPeriodo = percentuaisDoRecorte(periodo, grupoDaClassificacao)
    if (!doPeriodo) return null
    const porMes = meses
      .map(m => percentuaisDoRecorte(m, grupoDaClassificacao))
      .filter((m): m is NonNullable<typeof m> => m !== null)

    const linhas: LinhaResumo[] = []
    const semLancamentos: DefinicaoLinha[] = []
    for (const def of LINHAS_REFERENCIA) {
      const valor = doPeriodo.get(def.id)
      if (!valor) {
        semLancamentos.push(def)
        continue
      }
      const limites = referencias[def.id]
      let mesesAtencao = 0
      let mesesComDado = 0
      for (const mes of porMes) {
        const v = mes.get(def.id)
        if (!v) continue
        mesesComDado += 1
        if (classificarFaixa(v.pct, limites, def.sentido) === 'atencao') mesesAtencao += 1
      }
      linhas.push({
        def,
        pct: valor.pct,
        reais: valor.reais,
        faixa: classificarFaixa(valor.pct, limites, def.sentido),
        mesesAtencao,
        mesesComDado,
      })
    }
    // A margem de contribuição abre o resumo; o resto segue a ordem do DRE.
    linhas.sort((a, b) => Number(!!b.def.destaque) - Number(!!a.def.destaque))

    const contagem = Object.fromEntries(ORDEM_FAIXAS.map(f => [f, 0])) as Record<FaixaReferencia, number>
    for (const l of linhas) contagem[l.faixa] += 1
    return { linhas, semLancamentos, contagem }
  }, [periodo, meses, referencias, grupoDaClassificacao])

  return (
    <section className={styles.resumo} aria-labelledby="resumo-resultado-titulo">
      <div className={styles.topo}>
        <div className={styles.topoTexto}>
          <h3 id="resumo-resultado-titulo" className={styles.titulo}>Resumo do resultado</h3>
          <p className={styles.subtitulo}>
            Cada linha em % do recebimento do período, comparada com as Referências do DRE.
          </p>
        </div>
        <div className={styles.topoDir}>
          {resumo && (
            <ul className={styles.contagem} aria-label="Quantas linhas em cada faixa">
              {[...ORDEM_FAIXAS].reverse().map(faixa => {
                const n = resumo.contagem[faixa]
                if (n === 0) return null
                const [um, varios] = ROTULO_CONTAGEM[faixa]
                return (
                  <li key={faixa} className={`${styles.contagemItem} ${styles[`contagem_${faixa}`]}`}>
                    <span className={styles.contagemPonto} aria-hidden />
                    <strong>{n}</strong> {n === 1 ? um : varios}
                  </li>
                )
              })}
            </ul>
          )}
          {onAbrirReferencias && (
            <button type="button" className={styles.btnReferencias} onClick={onAbrirReferencias}>
              {podeEditar ? 'Editar referências' : 'Ver referências'}
            </button>
          )}
        </div>
      </div>

      {!resumo ? (
        <p className={styles.vazio}>
          Sem receitas operacionais no período: não dá para calcular os percentuais das linhas.
        </p>
      ) : (
        <>
          <table className={styles.lista}>
            <thead>
              <tr>
                <th scope="col">Linha do DRE</th>
                <th scope="col" className={styles.colNum}>% do recebimento</th>
                <th scope="col" className={styles.colNum}>Valor (R$)</th>
                <th scope="col">Referência</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {resumo.linhas.map(({ def, pct, reais, faixa, mesesAtencao, mesesComDado }) => {
                const limites = referencias[def.id]
                const faixas = resumoDasFaixas(def, limites)
                return (
                  <tr
                    key={def.id}
                    className={def.destaque ? styles.linhaDestaque : undefined}
                    title={`${def.composicao}\n${faixas}`}
                  >
                    <th scope="row" className={styles.colLinha}>
                      <span className={styles.rotulo}>{def.rotulo}</span>
                      {mesesAtencao > 0 && mesesComDado > 1 && (
                        <span className={styles.meses}>
                          {ROTULO_FAIXA.atencao} em {mesesAtencao} de {mesesComDado} meses
                        </span>
                      )}
                    </th>
                    <td className={`${styles.colNum} ${styles.colPct}`}>
                      {formatarPercentual(pct, casasDaLinha(limites))}
                    </td>
                    <td className={`${styles.colNum} ${styles.colValor}`}>{valorReais(reais)}</td>
                    <td className={styles.colRef}>
                      ideal {prefixoLimite('ideal', def.sentido)} {formatarLimite(limites.ideal)}
                    </td>
                    <td className={styles.colStatus}>
                      <SeloFaixa faixa={faixa} className={styles.selo} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {resumo.semLancamentos.length > 0 && (
            <p className={styles.nota}>
              Sem lançamentos no período: {resumo.semLancamentos.map(d => d.rotulo).join(', ')}.
            </p>
          )}
          <p className={styles.nota}>
            Considera todos os lançamentos do período selecionado, mesmo com filtro de tipo ou busca.
            Passe o mouse sobre uma linha para ver o que entra nela e todas as faixas.
          </p>
        </>
      )}
    </section>
  )
})
