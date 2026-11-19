// Variante do e-mail de boas-vindas para funcionários (profiles.tipo_usuario = 'colaborador').
// Funcionário não cadastra empresa: entra nas que o titular liberou, como leitor (só consulta)
// ou editor (consulta e altera). Mesmo visual do e-mail dos titulares (email.ts).

import type { DadosBoasVindas } from './email.ts'

export interface EmpresaLiberada {
  nome: string
  permissao: 'leitor' | 'editor'
}

export interface DadosBoasVindasFuncionario extends DadosBoasVindas {
  titular: string
  empresas: EmpresaLiberada[]
}

const escapar = (texto: string) =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const ROTULO_PERMISSAO: Record<EmpresaLiberada['permissao'], string> = {
  leitor: 'Leitor: só consulta',
  editor: 'Editor: consulta e altera',
}

function passos(empresas: EmpresaLiberada[]) {
  const algumEditor = empresas.some(e => e.permissao === 'editor')
  return [
    { titulo: 'Escolha a empresa', texto: 'Na lista aparecem só as empresas que o titular liberou para você.' },
    { titulo: 'Acompanhe o caixa', texto: 'Entradas, saídas e o resultado, mês a mês, com os indicadores do método.' },
    algumEditor
      ? { titulo: 'Mantenha os lançamentos em dia', texto: 'Onde você é editor, importe o extrato do banco e lance o que faltar.' }
      : { titulo: 'Exporte quando precisar', texto: 'Baixe a DFC do período em planilha, pronta para o contador.' },
  ]
}

export function assuntoBoasVindasFuncionario(d: DadosBoasVindasFuncionario) {
  return `${d.titular} liberou o seu acesso ao DFC Scale`
}

export function textoBoasVindasFuncionario(d: DadosBoasVindasFuncionario): string {
  return [
    d.primeiroNome ? `Olá, ${d.primeiroNome}!` : 'Olá!',
    '',
    `${d.titular} liberou para você o acesso ao DFC Scale, a ferramenta de fluxo de caixa da clínica:`,
    ...d.empresas.map(e => `- ${e.nome} (${ROTULO_PERMISSAO[e.permissao]})`),
    '',
    'Para começar:',
    ...passos(d.empresas).map((p, i) => `${i + 1}. ${p.titulo}: ${p.texto}`),
    '',
    `Acessar o DFC Scale: ${d.siteUrl}`,
    '',
    `Para entrar, use este e-mail: ${d.email}`,
    'Esqueceu a senha? Na tela de entrada, clique em "Esqueci minha senha".',
    '',
    'Você recebeu esta mensagem porque acabou de acessar o DFC Scale pela primeira vez.',
    'ClinicScale · avaliar, fechar, escalar',
  ].join('\n')
}

export function htmlBoasVindasFuncionario(d: DadosBoasVindasFuncionario): string {
  const nome = d.primeiroNome ? escapar(d.primeiroNome) : null
  const titular = escapar(d.titular)
  const site = escapar(d.siteUrl)
  const emailSeguro = escapar(d.email)
  const fonteTitulo = "'Sora', 'Hanken Grotesk', Arial, Helvetica, sans-serif"
  const fonteCorpo = "'Hanken Grotesk', Arial, Helvetica, sans-serif"

  const empresas = d.empresas.map(e => `
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #2A261C;font-family:${fonteCorpo};font-size:15px;font-weight:700;color:#F4EFE3;">${escapar(e.nome)}</td>
                  <td align="right" style="padding:12px 0;border-bottom:1px solid #2A261C;font-family:${fonteCorpo};font-size:13px;color:#C2A063;white-space:nowrap;">${ROTULO_PERMISSAO[e.permissao]}</td>
                </tr>`).join('')

  const listaPassos = passos(d.empresas).map((p, i) => `
              <tr>
                <td valign="top" width="40" style="padding:0 0 18px 0;">
                  <div style="width:28px;height:28px;line-height:28px;border:1px solid #C2A063;border-radius:50%;text-align:center;font-family:${fonteCorpo};font-size:13px;font-weight:700;color:#C2A063;">${i + 1}</div>
                </td>
                <td valign="top" style="padding:3px 0 18px 0;font-family:${fonteCorpo};">
                  <div style="font-size:15px;font-weight:700;color:#F4EFE3;line-height:1.4;">${p.titulo}</div>
                  <div style="font-size:14px;color:#B9B2A1;line-height:1.5;margin-top:2px;">${p.texto}</div>
                </td>
              </tr>`).join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapar(assuntoBoasVindasFuncionario(d))}</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;700&family=Sora:wght@200;400&display=swap" rel="stylesheet">
<style>
  @media (max-width: 600px) {
    .cartao { padding: 32px 22px !important; }
    .titulo { font-size: 26px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#000000;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#000000;">
    ${titular} liberou o seu acesso ao DFC Scale. Veja como começar.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 28px 4px;">
              <img src="${site}/logo.png" width="168" alt="ClinicScale" style="display:block;width:168px;max-width:168px;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td class="cartao" style="background:#16140F;border:1px solid #2A261C;border-radius:16px;padding:40px 36px;">
              <div style="height:2px;width:56px;background:#C2A063;background-image:linear-gradient(90deg,#7E6234,#EFE0B6);margin-bottom:24px;"></div>
              <div style="font-family:${fonteCorpo};font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#C2A063;">DFC Scale</div>
              <h1 class="titulo" style="margin:12px 0 0 0;font-family:${fonteTitulo};font-size:30px;font-weight:400;line-height:1.25;color:#F4EFE3;">
                ${nome ? `Olá, ${nome}.<br>` : ''}Boas-vindas ao DFC Scale.
              </h1>
              <p style="margin:18px 0 0 0;font-family:${fonteCorpo};font-size:16px;line-height:1.6;color:#D9D2C1;">
                <strong style="color:#F4EFE3;">${titular}</strong> liberou para você o fluxo de caixa destas empresas:
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0 0;border-top:1px solid #2A261C;">${empresas}
              </table>

              <div style="margin:32px 0 16px 0;font-family:${fonteCorpo};font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#C2A063;">Para começar</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${listaPassos}
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0 0;">
                <tr>
                  <td align="center" bgcolor="#C2A063" style="border-radius:10px;">
                    <a href="${site}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:${fonteCorpo};font-size:15px;font-weight:700;color:#16140F;text-decoration:none;border-radius:10px;">Acessar o DFC Scale &rarr;</a>
                  </td>
                </tr>
              </table>

              <div style="margin:32px 0 0 0;padding:18px 0 0 0;border-top:1px solid #2A261C;font-family:${fonteCorpo};font-size:14px;line-height:1.6;color:#B9B2A1;">
                Para entrar, use este e-mail: <strong style="color:#F4EFE3;">${emailSeguro}</strong><br>
                Esqueceu a senha? Na tela de entrada, clique em <strong style="color:#F4EFE3;">“Esqueci minha senha”</strong>.
              </div>
              <div style="margin:14px 0 0 0;font-family:${fonteCorpo};font-size:12px;line-height:1.6;color:#8E8778;">
                Se o botão não funcionar, copie e cole no navegador:<br>
                <a href="${site}" target="_blank" style="color:#C2A063;text-decoration:underline;word-break:break-all;">${site}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 4px 0 4px;font-family:${fonteCorpo};font-size:12px;line-height:1.6;color:#8E8778;">
              Você recebeu esta mensagem porque acabou de acessar o DFC Scale pela primeira vez.<br>
              ClinicScale · avaliar, fechar, escalar
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
