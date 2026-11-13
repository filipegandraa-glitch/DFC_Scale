import styles from './SeloFaixa.module.css'
import { ROTULO_FAIXA, type FaixaReferencia } from '../../lib/referenciasDre'

/** Selo da faixa das Referências do DRE (usado no card de Margem de contribuição). */
export function SeloFaixa({ faixa, dica }: { faixa: FaixaReferencia; dica?: string }) {
  return (
    <span className={`${styles.selo} ${styles[`faixa_${faixa}`]}`} title={dica}>
      {ROTULO_FAIXA[faixa]}
    </span>
  )
}
