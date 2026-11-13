import { supabase } from './supabase'

// Leitura e gravação de um valor da tabela `configuracoes` (chave → texto JSON).
// RLS: qualquer usuário logado lê; só profiles.role = 'admin' grava.
// A gravação só sobrescreve a versão carregada (updated_at), para um ADM não
// apagar sem querer o que outro acabou de salvar.

export interface ConfiguracaoLida {
  valor: string | null
  /** updated_at da linha; null enquanto ninguém salvou. */
  atualizadoEm: string | null
}

export async function lerConfiguracao(chave: string): Promise<ConfiguracaoLida> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor, updated_at')
    .eq('chave', chave)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return { valor: data?.valor ?? null, atualizadoEm: data?.updated_at ?? null }
}

/** Outra pessoa salvou entre o carregamento e o "Salvar". */
export class ConflitoConfiguracao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ConflitoConfiguracao'
  }
}

export interface MensagensGravacao {
  conflito: string
  semPermissao: string
}

/** Grava o valor e devolve o novo updated_at. */
export async function gravarConfiguracao(
  chave: string,
  valor: string,
  versaoCarregada: string | null,
  mensagens: MensagensGravacao,
): Promise<string> {
  const agora = new Date().toISOString()

  if (versaoCarregada) {
    const { data, error } = await supabase
      .from('configuracoes')
      .update({ valor, updated_at: agora })
      .eq('chave', chave)
      .eq('updated_at', versaoCarregada)
      .select('updated_at')
    if (error) throw new Error(error.message)
    if (data && data.length > 0) return data[0].updated_at

    // Nada mudou: ou outra pessoa salvou antes, ou o RLS barrou (sem cargo de ADM).
    const { data: atual } = await supabase
      .from('configuracoes')
      .select('updated_at')
      .eq('chave', chave)
      .maybeSingle()
    if (!atual || atual.updated_at !== versaoCarregada) throw new ConflitoConfiguracao(mensagens.conflito)
    throw new Error(mensagens.semPermissao)
  }

  const { data, error } = await supabase
    .from('configuracoes')
    .insert({ chave, valor, updated_at: agora })
    .select('updated_at')
    .single()
  if (error) {
    if (error.code === '23505') throw new ConflitoConfiguracao(mensagens.conflito)
    if (error.code === '42501') throw new Error(mensagens.semPermissao)
    throw new Error(error.message)
  }
  return data.updated_at
}
