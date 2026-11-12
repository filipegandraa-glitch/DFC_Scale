import { useEffect } from 'react'
import styles from './LandingPage.module.css'

interface LandingPageProps {
  onEntrar: () => void
}

const DESTAQUES = [
  { valor: 'Mês a mês', legenda: 'entradas, saídas e resultado' },
  { valor: 'IA', legenda: 'classifica o extrato por você' },
  { valor: '.xlsx', legenda: 'relatório pronto para o contador' },
]

export default function LandingPage({ onEntrar }: LandingPageProps) {
  useEffect(() => {
    const anterior = document.title
    document.title = 'DFC Scale — o caixa da sua clínica, mês a mês'
    return () => { document.title = anterior }
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.topo}>
        <a href="/" className={styles.marca} aria-label="DFC Scale, início">
          <img src="/symbol-gold.svg" alt="" className={styles.simbolo} />
          <span>DFC <strong>Scale</strong></span>
        </a>
        <button type="button" className={styles.btnTopo} onClick={onEntrar}>
          Entrar
        </button>
      </header>

      <main className={styles.hero}>
        <p className={styles.eyebrow}>Acesso exclusivo · Alunos da mentoria</p>
        <h1 className={styles.titulo}>
          O caixa da sua clínica,<br />sem improviso.
        </h1>
        <p className={styles.texto}>
          Importe o extrato do banco, deixe a IA classificar cada lançamento e veja,
          mês a mês, de onde vem e para onde vai o dinheiro.
        </p>

        <button type="button" className={styles.cta} onClick={onEntrar}>
          Entrar na ferramenta
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className={styles.nota}>Seu acesso é criado por nós.</p>

        <ul className={styles.destaques}>
          {DESTAQUES.map(d => (
            <li key={d.valor} className={styles.destaque}>
              <span className={styles.destaqueValor}>{d.valor}</span>
              <span className={styles.destaqueLegenda}>{d.legenda}</span>
            </li>
          ))}
        </ul>
      </main>

      <footer className={styles.rodape}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" />
          <path d="M8.5 12.5l2.5 2.5 4.5-5" />
        </svg>
        Método ClinicScale
      </footer>
    </div>
  )
}
