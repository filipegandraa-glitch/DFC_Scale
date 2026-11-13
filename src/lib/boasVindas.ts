import { supabase } from './supabase'

/**
 * Pede o e-mail de boas-vindas (Edge Function `dfc-boas-vindas`, via Resend).
 * Chamado logo depois do aceite dos termos, que acontece só no primeiro acesso.
 * A função confere no servidor se é mesmo o primeiro acesso e não repete o envio.
 * Nunca trava a entrada: qualquer falha fica só no console.
 */
export function enviarBoasVindas(): void {
  supabase.functions
    .invoke('dfc-boas-vindas', { body: {} })
    .then(({ data, error }) => {
      if (error) console.warn('Boas-vindas: não foi possível enviar o e-mail.', error)
      else if (data && data.enviado === false && data.motivo !== 'nao_e_primeiro_acesso') {
        console.warn('Boas-vindas: e-mail não enviado.', data)
      }
    })
    .catch(err => console.warn('Boas-vindas: não foi possível enviar o e-mail.', err))
}
