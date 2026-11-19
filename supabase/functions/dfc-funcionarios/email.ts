// E-mails da área de Funcionários do DFC Scale (identidade ClinicScale V1.0:
// fundo Onyx/Grafite, dourado #C2A063 com parcimônia, Sora nos títulos e
// Hanken Grotesk no corpo). HTML em tabelas e estilos inline para funcionar
// no Gmail, Outlook e Apple Mail. Mesmo visual do e-mail de boas-vindas.

export type Permissao = 'leitor' | 'editor'

export interface AcessoEmail {
  nome: string
  permissao: Permissao
}

export interface DadosConvite {
  /** Quem liberou o acesso (nome do titular) */
  titular: string
  /** Primeiro nome do funcionário, se houver */
  primeiroNome: string | null
  email: string
  acessos: AcessoEmail[]
  /** Link para criar a senha (convite) ou para abrir o DFC (acesso liberado) */
  link: string
  siteUrl: string
}

const escapar = (texto: string) =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const ROTULO: Record<Permissao, string> = {
  leitor: 'Leitor: só consulta',
  editor: 'Editor: consulta e altera',
}

const listaEmpresas = (acessos: AcessoEmail[]) =>
  acessos.length === 1 ? acessos[0].nome : `${acessos.length} empresas`

export function assuntoConvite(d: DadosConvite) {
  return `${d.titular} convidou você para o DFC Scale`
}

export function assuntoAcesso(d: DadosConvite) {
  return `Você recebeu acesso a ${listaEmpresas(d.acessos)} no DFC Scale`
}

export function textoConvite(d: DadosConvite): string {
  return [
    d.primeiroNome ? `Olá, ${d.primeiroNome}!` : 'Olá!',
    '',
    `${d.titular} liberou para você o acesso ao DFC Scale, a ferramenta de fluxo de caixa da clínica:`,
    ...d.acessos.map(a => `- ${a.nome} (${ROTULO[a.permissao]})`),
    '',
    'Para começar, crie a sua senha neste link:',
    d.link,
    '',
    `Depois, para entrar, use este e-mail: ${d.email}`,
    `Se o link expirar, peça um novo convite a ${d.titular}.`,
    '',
    'Não esperava este convite? Pode ignorar esta mensagem.',
    'ClinicScale · avaliar, fechar, escalar',
  ].join('\n')
}

export function textoAcesso(d: DadosConvite): string {
  return [
    d.primeiroNome ? `Olá, ${d.primeiroNome}!` : 'Olá!',
    '',
    `${d.titular} liberou para você o acesso a:`,
    ...d.acessos.map(a => `- ${a.nome} (${ROTULO[a.permissao]})`),
    '',
    `Entre com o seu e-mail de sempre (${d.email}) em: ${d.link}`,
    'Esqueceu a senha? Na tela de entrada, clique em "Esqueci minha senha".',
    '',
    'ClinicScale · avaliar, fechar, escalar',
  ].join('\n')
}

function html(d: DadosConvite, opcoes: { titulo: string; abertura: string; botao: string; rodapeAcesso: string; previa: string; motivo: string }) {
  const fonteTitulo = "'Sora', 'Hanken Grotesk', Arial, Helvetica, sans-serif"
  const fonteCorpo = "'Hanken Grotesk', Arial, Helvetica, sans-serif"
  const site = escapar(d.siteUrl)
  const link = escapar(d.link)

  const linhas = d.acessos.map(a => `
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #2A261C;font-family:${fonteCorpo};font-size:15px;font-weight:700;color:#F4EFE3;">${escapar(a.nome)}</td>
                  <td align="right" style="padding:12px 0;border-bottom:1px solid #2A261C;font-family:${fonteCorpo};font-size:13px;color:#C2A063;white-space:nowrap;">${ROTULO[a.permissao]}</td>
                </tr>`).join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapar(opcoes.titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;700&family=Sora:wght@200;400&display=swap" rel="stylesheet">
<style>
  @media (max-width: 600px) {
    .cartao { padding: 32px 22px !important; }
    .titulo { font-size: 26px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#000000;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#000000;">${escapar(opcoes.previa)}</div>
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
              <h1 class="titulo" style="margin:12px 0 0 0;font-family:${fonteTitulo};font-size:30px;font-weight:400;line-height:1.25;color:#F4EFE3;">${opcoes.titulo}</h1>
              <p style="margin:18px 0 0 0;font-family:${fonteCorpo};font-size:16px;line-height:1.6;color:#D9D2C1;">${opcoes.abertura}</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0 0;border-top:1px solid #2A261C;">${linhas}
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0;">
                <tr>
                  <td align="center" bgcolor="#C2A063" style="border-radius:10px;">
                    <a href="${link}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:${fonteCorpo};font-size:15px;font-weight:700;color:#16140F;text-decoration:none;border-radius:10px;">${opcoes.botao} &rarr;</a>
                  </td>
                </tr>
              </table>

              <div style="margin:32px 0 0 0;padding:18px 0 0 0;border-top:1px solid #2A261C;font-family:${fonteCorpo};font-size:14px;line-height:1.6;color:#B9B2A1;">${opcoes.rodapeAcesso}</div>
              <div style="margin:14px 0 0 0;font-family:${fonteCorpo};font-size:12px;line-height:1.6;color:#8E8778;">
                Se o botão não funcionar, copie e cole no navegador:<br>
                <a href="${link}" target="_blank" style="color:#C2A063;text-decoration:underline;word-break:break-all;">${link}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 4px 0 4px;font-family:${fonteCorpo};font-size:12px;line-height:1.6;color:#8E8778;">
              ${escapar(opcoes.motivo)}<br>
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

export function htmlConvite(d: DadosConvite): string {
  const titular = escapar(d.titular)
  const nome = d.primeiroNome ? escapar(d.primeiroNome) : null
  return html(d, {
    titulo: `${nome ? `Olá, ${nome}.<br>` : ''}Você foi convidado(a) para o DFC Scale.`,
    abertura: `<strong style="color:#F4EFE3;">${titular}</strong> liberou para você o acesso ao fluxo de caixa da clínica. Veja o que você pode fazer em cada empresa:`,
    botao: 'Criar minha senha',
    rodapeAcesso: `Depois de criar a senha, entre com este e-mail: <strong style="color:#F4EFE3;">${escapar(d.email)}</strong><br>Se o link expirar, peça um novo convite a ${titular}.`,
    previa: `${d.titular} liberou para você o acesso ao DFC Scale. Crie sua senha para entrar.`,
    motivo: 'Você recebeu esta mensagem porque o titular de uma clínica liberou o seu acesso. Não esperava? Pode ignorar.',
  })
}

export function htmlAcesso(d: DadosConvite): string {
  const titular = escapar(d.titular)
  const nome = d.primeiroNome ? escapar(d.primeiroNome) : null
  return html(d, {
    titulo: `${nome ? `Olá, ${nome}.<br>` : ''}Você recebeu um novo acesso.`,
    abertura: `<strong style="color:#F4EFE3;">${titular}</strong> liberou para você, no DFC Scale:`,
    botao: 'Abrir o DFC Scale',
    rodapeAcesso: `Entre com o seu e-mail de sempre: <strong style="color:#F4EFE3;">${escapar(d.email)}</strong><br>Esqueceu a senha? Na tela de entrada, clique em <strong style="color:#F4EFE3;">“Esqueci minha senha”</strong>.`,
    previa: `${d.titular} liberou para você o acesso a ${listaEmpresas(d.acessos)} no DFC Scale.`,
    motivo: 'Você recebeu esta mensagem porque o titular de uma clínica liberou o seu acesso.',
  })
}
