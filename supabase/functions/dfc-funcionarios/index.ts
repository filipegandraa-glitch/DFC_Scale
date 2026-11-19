// Supabase Edge Function: dfc-funcionarios
// Área "Funcionários" do DFC Scale: o titular libera as empresas dele para quem trabalha
// com ele (leitor ou editor) e o sistema manda o link para a pessoa.
//
// O titular NÃO cria contas nem define senha: só libera empresas para quem JÁ tem login.
// Criar login continua sendo coisa só dos administradores, no Painel.
//
// Quem pode liberar o quê é decidido no banco, pelas funções SECURITY DEFINER chamadas
// com o JWT do próprio titular (dfc_vincular_funcionario, dfc_listar_funcionarios).
// Esta função só faz o que exige a chave de serviço: gerar o link de senha e mandar o e-mail.
//
// Ações (POST, JSON):
//   { acao: 'adicionar', nome, email, acessos: [{ empresa_id, permissao: 'leitor' | 'editor' }] }
//     - e-mail já tem conta: vincula e avisa por e-mail (modo 'vinculado');
//     - conta criada por um administrador que nunca entrou: vincula e manda o link para criar
//       a senha (modo 'convidado');
//     - não tem conta: recusa (404, codigo 'sem_conta'), sem criar nada.
//   { acao: 'reenviar', user_id }
//     - manda um link novo para quem ainda não entrou nenhuma vez.
//
// Secrets (os mesmos da dfc-boas-vindas): RESEND_API_KEY, RESEND_FROM, DFC_SITE_URL.
// Só do DFC Scale: não é usada pelo PainelGestaa.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  assuntoAcesso, assuntoConvite, htmlAcesso, htmlConvite, textoAcesso, textoConvite,
  type AcessoEmail, type DadosConvite, type Permissao,
} from './email.ts'

const SITE_PADRAO = 'https://dfc.clinicscale.com.br'
const REMETENTE_PADRAO = 'DFC Scale <nao-responda@clinicscale.com.br>'
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ACESSOS = 50

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

interface Acesso { empresa_id: string; permissao: Permissao }

interface LinhaVinculo { status: 'vinculado' | 'nao_encontrado'; user_id: string | null; pendente: boolean | null }

interface Contexto {
  titular: SupabaseClient
  admin: SupabaseClient
  titularId: string
  titularEmail: string
  siteUrl: string
}

/** Mensagens das funções do banco já vêm em português e prontas para a tela. */
function mensagemDoBanco(erro: { message?: string } | null, padrao: string) {
  const texto = erro?.message?.trim()
  if (!texto || /permission denied|violates|syntax|function .* does not exist/i.test(texto)) return padrao
  return texto
}

function primeiroNome(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0]
  return primeiro && /^[\p{L}'-]{2,30}$/u.test(primeiro)
    ? primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1)
    : null
}

function lerAcessos(valor: unknown): Acesso[] | null {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAX_ACESSOS) return null
  const vistos = new Set<string>()
  const acessos: Acesso[] = []
  for (const item of valor) {
    const empresa_id = String((item as Record<string, unknown>)?.empresa_id ?? '')
    const permissao = (item as Record<string, unknown>)?.permissao
    if (!UUID_VALIDO.test(empresa_id) || vistos.has(empresa_id)) return null
    if (permissao !== 'leitor' && permissao !== 'editor') return null
    vistos.add(empresa_id)
    acessos.push({ empresa_id, permissao })
  }
  return acessos
}

async function nomeDoTitular(ctx: Contexto) {
  const { data } = await ctx.admin.from('profiles').select('name').eq('id', ctx.titularId).maybeSingle()
  return data?.name?.trim() || ctx.titularEmail.split('@')[0] || 'O titular'
}

async function acessosParaEmail(ctx: Contexto, acessos: Acesso[]): Promise<AcessoEmail[]> {
  const { data } = await ctx.admin.from('empresas').select('id, nome').in('id', acessos.map(a => a.empresa_id))
  const nomes = new Map((data ?? []).map(e => [e.id as string, (e.nome as string) ?? 'Empresa']))
  return acessos.map(a => ({ nome: nomes.get(a.empresa_id) ?? 'Empresa', permissao: a.permissao }))
}

async function enviarEmail(ctx: Contexto, para: string, assunto: string, html: string, texto: string, chave: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false
  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': chave,
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') || REMETENTE_PADRAO,
        to: [para],
        reply_to: ctx.titularEmail || undefined,
        subject: assunto,
        html,
        text: texto,
        tags: [{ name: 'tipo', value: 'funcionario' }, { name: 'app', value: 'dfc_scale' }],
      }),
    })
    if (!resposta.ok) {
      console.error('dfc-funcionarios: Resend recusou', resposta.status, await resposta.text().catch(() => ''))
      return false
    }
    return true
  } catch (erro) {
    console.error('dfc-funcionarios: falha ao enviar e-mail', erro)
    return false
  }
}

/** Link para criar a senha: convite (conta ainda não confirmada) ou redefinição de senha. */
async function gerarLinkDeSenha(ctx: Contexto, email: string, nome: string | null) {
  const convite = await ctx.admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: ctx.siteUrl, ...(nome ? { data: { full_name: nome } } : {}) },
  })
  if (!convite.error && convite.data?.properties?.action_link) {
    return { link: convite.data.properties.action_link }
  }
  const recuperacao = await ctx.admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${ctx.siteUrl}/reset-password` },
  })
  if (!recuperacao.error && recuperacao.data?.properties?.action_link) {
    return { link: recuperacao.data.properties.action_link }
  }
  console.error('dfc-funcionarios: não gerou link', convite.error, recuperacao.error)
  return null
}

async function adicionar(ctx: Contexto, corpo: Record<string, unknown>) {
  const email = String(corpo.email ?? '').trim().toLowerCase()
  const nome = String(corpo.nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
  const acessos = lerAcessos(corpo.acessos)

  if (!EMAIL_VALIDO.test(email)) return json({ error: 'Informe um e-mail válido.' }, 400)
  if (!acessos) return json({ error: 'Escolha ao menos uma empresa, como leitor ou editor.' }, 400)
  if (email === ctx.titularEmail.toLowerCase()) return json({ error: 'Você não pode se adicionar como funcionário.' }, 400)

  // 1) Conta que já existe: o banco confere tudo (titularidade, permissões) e vincula.
  const vinculo = await ctx.titular.rpc('dfc_vincular_funcionario', { p_email: email, p_acessos: acessos })
  if (vinculo.error) return json({ error: mensagemDoBanco(vinculo.error, 'Não foi possível liberar o acesso.') }, 400)
  const linha = (vinculo.data as LinhaVinculo[] | null)?.[0]

  let modo: 'vinculado' | 'convidado' = 'vinculado'
  let link = ctx.siteUrl

  if (linha?.status === 'nao_encontrado') {
    // Titular não cria conta: login novo é só com os administradores, no Painel.
    return json({
      error: 'Este e-mail ainda não tem login no DFC Scale. Peça a um administrador para criar o acesso da pessoa e depois libere as empresas aqui.',
      codigo: 'sem_conta',
    }, 404)
  }

  if (linha?.status === 'vinculado' && linha.pendente && linha.user_id) {
    // Conta criada por um administrador que ainda não entrou nenhuma vez: manda o link de senha.
    const gerado = await gerarLinkDeSenha(ctx, email, nome || null)
    if (gerado) {
      modo = 'convidado'
      link = gerado.link
    }
  }

  if (!linha?.user_id) return json({ error: 'Não foi possível liberar o acesso.' }, 500)

  // 2) Avisa a pessoa por e-mail.
  const { data: perfil } = await ctx.admin.from('profiles').select('name').eq('id', linha.user_id).maybeSingle()
  const dados: DadosConvite = {
    titular: await nomeDoTitular(ctx),
    primeiroNome: primeiroNome(nome || perfil?.name),
    email,
    acessos: await acessosParaEmail(ctx, acessos),
    link,
    siteUrl: ctx.siteUrl,
  }
  const emailEnviado = modo === 'convidado'
    ? await enviarEmail(ctx, email, assuntoConvite(dados), htmlConvite(dados), textoConvite(dados), `dfc-convite/${linha.user_id}/${Date.now()}`)
    : await enviarEmail(ctx, email, assuntoAcesso(dados), htmlAcesso(dados), textoAcesso(dados), `dfc-acesso/${linha.user_id}/${Date.now()}`)

  return json({ ok: true, modo, email_enviado: emailEnviado, user_id: linha.user_id })
}

async function reenviar(ctx: Contexto, corpo: Record<string, unknown>) {
  const alvoId = String(corpo.user_id ?? '')
  if (!UUID_VALIDO.test(alvoId)) return json({ error: 'Funcionário inválido.' }, 400)

  // Só funcionários do próprio titular (o banco filtra pelo JWT dele).
  const { data: lista, error } = await ctx.titular.rpc('dfc_listar_funcionarios')
  if (error) return json({ error: mensagemDoBanco(error, 'Não foi possível conferir o funcionário.') }, 400)
  const linhas = ((lista ?? []) as { user_id: string; email: string; nome: string | null; empresa_id: string; permissao: Permissao }[])
    .filter(l => l.user_id === alvoId)
  if (linhas.length === 0) return json({ error: 'Funcionário não encontrado nas suas empresas.' }, 404)

  const { data: alvo, error: erroAlvo } = await ctx.admin.auth.admin.getUserById(alvoId)
  if (erroAlvo || !alvo?.user?.email) return json({ error: 'Funcionário não encontrado.' }, 404)
  if (alvo.user.last_sign_in_at) {
    return json({ error: 'Esta pessoa já criou a senha e entra normalmente. Se esqueceu, ela pode usar "Esqueci minha senha".' }, 409)
  }

  const gerado = await gerarLinkDeSenha(ctx, alvo.user.email, linhas[0].nome)
  if (!gerado) return json({ error: 'Não foi possível gerar um link novo. Tente de novo em instantes.' }, 502)

  const dados: DadosConvite = {
    titular: await nomeDoTitular(ctx),
    primeiroNome: primeiroNome(linhas[0].nome),
    email: alvo.user.email,
    acessos: await acessosParaEmail(ctx, linhas.map(l => ({ empresa_id: l.empresa_id, permissao: l.permissao }))),
    link: gerado.link,
    siteUrl: ctx.siteUrl,
  }
  const emailEnviado = await enviarEmail(
    ctx, alvo.user.email, assuntoConvite(dados), htmlConvite(dados), textoConvite(dados), `dfc-reenvio/${alvoId}/${Date.now()}`,
  )
  return json({ ok: true, email_enviado: emailEnviado })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const titular = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: erroUsuario } = await titular.auth.getUser()
    if (erroUsuario || !user?.email) return json({ error: 'Não autorizado.' }, 401)

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const ctx: Contexto = {
      titular,
      admin,
      titularId: user.id,
      titularEmail: user.email,
      siteUrl: (Deno.env.get('DFC_SITE_URL') || SITE_PADRAO).replace(/\/+$/, ''),
    }

    const corpo = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!corpo) return json({ error: 'Pedido inválido.' }, 400)

    if (corpo.acao === 'adicionar') return await adicionar(ctx, corpo)
    if (corpo.acao === 'reenviar') return await reenviar(ctx, corpo)
    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (erro) {
    console.error('dfc-funcionarios: erro inesperado', erro)
    return json({ error: 'Erro inesperado. Tente de novo.' }, 500)
  }
})
