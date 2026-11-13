// Descobre o primeiro nome para a saudação ("Olá, Filipe").
// Ordem: nome do cadastro, se parecer um nome de verdade; senão, o começo do e-mail.
// Quando nada parece um nome (ex.: "vendas.fogacci@", "Usuário Teste"), retorna null
// e a tela simplesmente não mostra a saudação.

const TITULOS = new Set(['dr', 'dra', 'drs', 'dras', 'prof', 'profa'])

const GENERICOS = new Set([
  'usuario', 'usuaria', 'teste', 'test', 'admin', 'adm', 'administrativo', 'administracao',
  'financeiro', 'financas', 'vendas', 'comercial', 'contato', 'contatos', 'atendimento',
  'recepcao', 'secretaria', 'direcao', 'diretoria', 'gerencia', 'gestao', 'suporte',
  'clinica', 'odonto', 'odontologia', 'consultorio', 'instituto', 'auxiliares', 'equipe',
  'marketing', 'faturamento', 'compras', 'rh', 'ti', 'info', 'noreply', 'sac', 'oi', 'ola',
])

const MAX_LETRAS_EMAIL = 10

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const capitalizar = (s: string) =>
  s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1).toLocaleLowerCase('pt-BR')

function doCadastro(nome: string | undefined): string | null {
  const limpo = nome?.trim()
  // Só confia em nomes com espaço ou maiúscula: "filipe.gandraa" é cópia do e-mail.
  if (!limpo || !/\s|\p{Lu}/u.test(limpo) || /[@.\d_]/.test(limpo)) return null
  const palavras = limpo
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2') // "MarceloFranceschi" -> "Marcelo Franceschi"
    .split(/\s+/)
    .filter(p => !TITULOS.has(semAcento(p).replace(/\.$/, '')))
  const primeira = palavras[0]
  if (!primeira || primeira.length < 2 || GENERICOS.has(semAcento(primeira))) return null
  return capitalizar(primeira)
}

function doEmail(email: string | undefined): string | null {
  const local = email?.split('@')[0]
  if (!local) return null
  const partes = local
    .split(/[._\-+\d]+/)
    .filter(p => p && !TITULOS.has(p.toLowerCase()))
  const primeira = partes[0]
  if (!primeira || !/^\p{L}+$/u.test(primeira)) return null
  // Nomes grudados ("brunnapenhaaaaa") não dá para separar: melhor não chutar.
  if (primeira.length < 3 || primeira.length > MAX_LETRAS_EMAIL) return null
  if (GENERICOS.has(semAcento(primeira))) return null
  return capitalizar(primeira)
}

export function primeiroNome(nomeCadastro?: string, email?: string): string | null {
  return doCadastro(nomeCadastro) ?? doEmail(email)
}
