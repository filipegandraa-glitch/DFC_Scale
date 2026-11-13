// Supabase Edge Function: dfc-boas-vindas
// Envia, pelo Resend, o e-mail de boas-vindas do DFC Scale no PRIMEIRO acesso.
//
// "Primeiro acesso" = o usuário acabou de aceitar os termos do app
// 'dfc-clinicscale' (todo mundo aceita uma única vez, na primeira entrada).
// A função confere isso no banco: se o aceite tem mais de 30 minutos, não envia.
// Repetições dentro da janela são descartadas pelo Resend (Idempotency-Key por usuário).
// O e-mail vai só para o próprio usuário logado (tirado do JWT, nunca do corpo).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  obrigatório
//   RESEND_FROM     opcional; padrão "DFC Scale <onboarding@resend.dev>" (remetente
//                   de teste do Resend: só entrega para o e-mail dono da conta Resend)
//   DFC_SITE_URL    opcional; padrão https://dfc-scale-dfc.2sxmef.easypanel.host
//
// Só do DFC Scale: não é usada pelo PainelGestaa.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ASSUNTO_BOAS_VINDAS, htmlBoasVindas, textoBoasVindas } from './email.ts'

const APP_TERMOS = 'dfc-clinicscale'
const JANELA_PRIMEIRO_ACESSO_MS = 30 * 60 * 1000
const SITE_PADRAO = 'https://dfc-scale-dfc.2sxmef.easypanel.host'
const REMETENTE_PADRAO = 'DFC Scale <onboarding@resend.dev>'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const GENERICOS = new Set(['usuario', 'usuário', 'user', 'teste', 'test', 'admin', 'contato', 'contact', 'financeiro', 'clinica', 'clínica', 'suporte', 'dr', 'dra'])

/** Primeiro nome para a saudação: do cadastro, senão do e-mail; null se não parecer nome. */
function primeiroNome(nomeCadastro: string | null | undefined, email: string): string | null {
  const capitalizar = (p: string) => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR')
  const valido = (p: string | undefined) =>
    !!p && /^[\p{L}]{2,20}$/u.test(p) && !GENERICOS.has(p.toLocaleLowerCase('pt-BR'))

  const doCadastro = (nomeCadastro ?? '').trim().split(/\s+/).find(p => !/^dr[a]?\.?$/i.test(p))
  if (valido(doCadastro)) return capitalizar(doCadastro!)

  const doEmail = email.split('@')[0]?.split(/[._\-+0-9]+/).find(Boolean)
  if (doEmail && doEmail.length >= 3 && doEmail.length <= 12 && valido(doEmail)) return capitalizar(doEmail)
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ enviado: false, motivo: 'metodo_nao_permitido' }, 405)

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return json({ enviado: false, motivo: 'resend_nao_configurado' }, 503)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ enviado: false, motivo: 'nao_autorizado' }, 401)

    const clienteUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: erroUsuario } = await clienteUsuario.auth.getUser()
    if (erroUsuario || !user?.email) return json({ enviado: false, motivo: 'nao_autorizado' }, 401)

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: aceite, error: erroAceite } = await admin
      .from('termos_aceite')
      .select('accepted_at')
      .eq('user_id', user.id)
      .eq('app', APP_TERMOS)
      .order('accepted_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (erroAceite) {
      console.error('dfc-boas-vindas: leitura do aceite', erroAceite)
      return json({ enviado: false, motivo: 'erro_interno' }, 500)
    }
    if (!aceite) return json({ enviado: false, motivo: 'sem_aceite' })

    const idadeAceite = Date.now() - new Date(aceite.accepted_at).getTime()
    if (!(idadeAceite >= 0 && idadeAceite <= JANELA_PRIMEIRO_ACESSO_MS)) {
      return json({ enviado: false, motivo: 'nao_e_primeiro_acesso' })
    }

    const { data: perfil } = await admin.from('profiles').select('name').eq('id', user.id).maybeSingle()
    const dados = {
      primeiroNome: primeiroNome(perfil?.name, user.email),
      email: user.email,
      siteUrl: (Deno.env.get('DFC_SITE_URL') || SITE_PADRAO).replace(/\/+$/, ''),
    }

    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `dfc-boas-vindas/${user.id}`,
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') || REMETENTE_PADRAO,
        to: [user.email],
        subject: ASSUNTO_BOAS_VINDAS,
        html: htmlBoasVindas(dados),
        text: textoBoasVindas(dados),
        tags: [{ name: 'tipo', value: 'boas_vindas' }, { name: 'app', value: 'dfc_scale' }],
      }),
    })
    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
      console.error('dfc-boas-vindas: Resend recusou', resposta.status, corpo)
      return json({ enviado: false, motivo: 'falha_resend', status: resposta.status, detalhe: corpo?.message ?? null }, 502)
    }

    return json({ enviado: true, id: corpo?.id ?? null })
  } catch (erro) {
    console.error('dfc-boas-vindas: erro inesperado', erro)
    return json({ enviado: false, motivo: 'erro_interno' }, 500)
  }
})
