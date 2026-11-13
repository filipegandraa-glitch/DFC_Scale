import styles from './SeloFaixa.module.css'
import { ROTULO_FAIXA, type FaixaReferencia } from '../../lib/referenciasDre'

/** Selo da faixa das Referências do DRE (card de Margem e Resumo do resultado). */
export function SeloFaixa({ faixa, dica, className }: { faixa: FaixaReferencia; dica?: string; className?: string }) {
  return (
    <span className={`${styles.selo} ${styles[`faixa_${faixa}`]}${className ? ` ${className}` : ''}`} title={dica}>
      {ROTULO_FAIXA[faixa]}
    </span>
  )
}
