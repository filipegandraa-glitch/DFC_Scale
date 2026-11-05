import { useState } from 'react'
import styles from './GraficosDfc.module.css'

export interface SerieMes {
  chave: string     // YYYY-MM
  label: string     // "jan", "jan/26"
  receitas: number
  despesas: number
}

export interface ItemTotal {
  nome: string
  total: number
  lancamentos: number
}

export interface DadosRosca {
  itens: ItemTotal[]        // recorte atual (filtros da tela)
  ordemGlobal: string[]     // nomes do maior para o menor em todo o histórico da empresa
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const pct = (v: number) => `${v.toFixed(1)}%`

function Dica({ titulo, linhas, lado }: {
  titulo: string
  linhas: { valor: string; nome: string; serie?: 'receita' | 'despesa' }[]
  lado: 'esquerda' | 'direita'
}) {
  return (
    <div className={`${styles.dica} ${lado === 'direita' ? styles.dicaDireita : styles.dicaEsquerda}`} role="tooltip">
      <span className={styles.dicaTitulo}>{titulo}</span>
      {linhas.map(l => (
        <span key={l.nome} className={styles.dicaLinha}>
          {l.serie
            ? <span className={`${styles.dicaChave} ${l.serie === 'receita' ? styles.corReceita : styles.corDespesa}`} />
            : <span className={styles.dicaChaveVazia} />}
          <strong>{l.valor}</strong>
          <span className={styles.dicaNome}>{l.nome}</span>
        </span>
      ))}
    </div>
  )
}

/** Mini colunas mensais dentro dos cards de resumo (mês mais recente em destaque). */
export function MiniColunas({ serie, campo }: {
  serie: SerieMes[]
  campo: 'receitas' | 'despesas' | 'resultado'
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  if (serie.length < 2) return null

  const valores = serie.map(m => campo === 'resultado' ? m.receitas - m.despesas : m[campo])
  const maxPos = Math.max(0, ...valores)
  const maxNeg = Math.max(0, ...valores.map(v => -v))
  const amplitude = maxPos + maxNeg || 1
  // posição da linha do zero, medida a partir do topo (só há negativos no Resultado)
  const zeroTopo = (maxPos / amplitude) * 100
  const nome = campo === 'receitas' ? 'Receitas' : campo === 'despesas' ? 'Despesas' : 'Resultado'

  return (
    <div className={styles.mini} onMouseLeave={() => setAtivo(null)}>
      {campo === 'resultado' && maxNeg > 0 && <span className={styles.miniZero} style={{ top: `${zeroTopo}%` }} />}
      {valores.map((v, i) => {
        const positivo = v >= 0
        const serieCor = campo === 'despesas' || (campo === 'resultado' && !positivo) ? 'despesa' : 'receita'
        const altura = (Math.abs(v) / amplitude) * 100
        return (
          <span
            key={serie[i].chave}
            className={`${styles.miniHit} ${ativo === i ? styles.miniHitAtivo : ''}`}
            tabIndex={0}
            aria-label={`${serie[i].label}: ${nome} ${moeda(v)}`}
            onMouseEnter={() => setAtivo(i)}
            onFocus={() => setAtivo(i)}
            onBlur={() => setAtivo(null)}
          >
            <span
              className={`${styles.miniBarra} ${serieCor === 'receita' ? styles.fundoReceita : styles.fundoDespesa} ${positivo ? styles.miniBarraCima : styles.miniBarraBaixo} ${i === valores.length - 1 ? styles.miniAtual : ''}`}
              style={positivo
                ? { bottom: `${100 - zeroTopo}%`, height: `${altura}%` }
                : { top: `${zeroTopo}%`, height: `${altura}%` }}
            />
            {ativo === i && (
              <Dica
                titulo={serie[i].label}
                linhas={[{ valor: moeda(v), nome, serie: serieCor }]}
                lado={i < valores.length / 2 ? 'esquerda' : 'direita'}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

const MAX_FATIAS = 5

interface Fatia extends ItemTotal { cor: string }

/**
 * Cor fixa por entidade: as 5 maiores no histórico da empresa recebem as 5 cores,
 * na ordem da paleta — filtrar o período não repinta as fatias, e fatias vizinhas
 * são sempre cores vizinhas da paleta (pares validados). O resto vira "Outros".
 */
function montarFatias({ itens, ordemGlobal }: DadosRosca): Fatia[] {
  const slot = new Map(ordemGlobal.slice(0, MAX_FATIAS).map((nome, i) => [nome, i]))
  const positivos = itens.filter(i => i.total > 0)
  const fatias: Fatia[] = positivos
    .filter(i => slot.has(i.nome))
    .sort((a, b) => slot.get(a.nome)! - slot.get(b.nome)!)
    .map(i => ({ ...i, cor: `var(--cat-${slot.get(i.nome)! + 1})` }))
  const resto = positivos.filter(i => !slot.has(i.nome))
  if (resto.length > 0) {
    fatias.push({
      nome: resto.length === 1 ? resto[0].nome : `Outros (${resto.length})`,
      total: resto.reduce((s, i) => s + i.total, 0),
      lancamentos: resto.reduce((s, i) => s + i.lancamentos, 0),
      cor: 'var(--cat-outros)',
    })
  }
  return fatias
}

const RAIO = 54
const ESPESSURA = 16
const CIRCUNFERENCIA = 2 * Math.PI * RAIO

/** Gráfico de rosca com legenda; passar o mouse numa fatia mostra o valor dela no centro. */
export function GraficoRosca({ titulo, subtitulo, rotuloTotal, vazio, dados }: {
  titulo: string
  subtitulo: string
  rotuloTotal: string
  vazio: string
  dados: DadosRosca
}) {
  const [ativa, setAtiva] = useState<number | null>(null)
  const fatias = montarFatias(dados)
  const total = fatias.reduce((s, f) => s + f.total, 0)
  // 2px de fundo entre as fatias (a rosca é desenhada em ~1,25px por unidade)
  const folga = fatias.length > 1 ? 1.6 : 0
  const destaque = ativa !== null ? fatias[ativa] : null
  let acumulado = 0

  return (
    <figure className={styles.card}>
      <header className={styles.cardTopo}>
        <figcaption>
          <h3 className={styles.titulo}>{titulo}</h3>
          <p className={styles.subtitulo}>{subtitulo}</p>
        </figcaption>
      </header>

      {total <= 0 ? (
        <p className={styles.vazio}>{vazio}</p>
      ) : (
        <div className={styles.roscaCorpo} onMouseLeave={() => setAtiva(null)}>
          <div className={styles.rosca}>
            <svg viewBox="0 0 140 140" className={styles.roscaSvg} aria-hidden="true">
              <g transform="rotate(-90 70 70)">
                {fatias.map((f, i) => {
                  const comprimento = (f.total / total) * CIRCUNFERENCIA
                  const traco = Math.max(0, comprimento - folga)
                  const inicio = acumulado + folga / 2
                  acumulado += comprimento
                  return (
                    <circle
                      key={f.nome}
                      cx="70"
                      cy="70"
                      r={RAIO}
                      fill="none"
                      stroke={f.cor}
                      strokeWidth={ativa === i ? ESPESSURA + 5 : ESPESSURA}
                      strokeDasharray={`${traco} ${CIRCUNFERENCIA - traco}`}
                      strokeDashoffset={-inicio}
                      className={`${styles.fatia} ${ativa !== null && ativa !== i ? styles.fatiaApagada : ''}`}
                      onMouseEnter={() => setAtiva(i)}
                    />
                  )
                })}
              </g>
            </svg>
            <div className={styles.roscaCentro}>
              <strong className={styles.roscaCentroValor}>{compacto.format(destaque ? destaque.total : total)}</strong>
              <span className={styles.roscaCentroRotulo}>
                {destaque ? pct((destaque.total / total) * 100) : rotuloTotal}
              </span>
            </div>
          </div>

          <ul className={styles.roscaLegenda}>
            {fatias.map((f, i) => (
              <li
                key={f.nome}
                className={`${styles.roscaItem} ${ativa === i ? styles.roscaItemAtivo : ''}`}
                tabIndex={0}
                aria-label={`${f.nome}: ${moeda(f.total)}, ${pct((f.total / total) * 100)}, ${f.lancamentos} lançamento(s)`}
                onMouseEnter={() => setAtiva(i)}
                onFocus={() => setAtiva(i)}
                onBlur={() => setAtiva(null)}
              >
                <span className={styles.roscaChave} style={{ background: f.cor }} />
                <span className={styles.roscaNome} title={f.nome}>{f.nome}</span>
                <span className={styles.roscaNumeros}>
                  <strong className={styles.roscaValor} title={moeda(f.total)}>{compacto.format(f.total)}</strong>
                  <span className={styles.roscaPct}>{pct((f.total / total) * 100)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  )
}

/** Faixa de gráficos logo abaixo dos cards de resumo. */
export function GraficosDfc({ receitas, despesasPorGrupo, despesasPorItem }: {
  receitas: DadosRosca
  despesasPorGrupo: DadosRosca
  despesasPorItem: DadosRosca
}) {
  return (
    <section className={styles.raiz} aria-label="Gráficos do período">
      <GraficoRosca
        titulo="De onde vem o dinheiro"
        subtitulo="Receitas por forma de recebimento"
        rotuloTotal="receitas"
        vazio="Sem receitas no período."
        dados={receitas}
      />
      <GraficoRosca
        titulo="Para onde vai o dinheiro"
        subtitulo="Despesas por grupo"
        rotuloTotal="despesas"
        vazio="Sem despesas no período."
        dados={despesasPorGrupo}
      />
      <GraficoRosca
        titulo="Maiores gastos"
        subtitulo="Despesas por item"
        rotuloTotal="despesas"
        vazio="Sem despesas no período."
        dados={despesasPorItem}
      />
    </section>
  )
}
