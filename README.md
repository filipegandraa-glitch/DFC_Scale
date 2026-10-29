# DFC Scale

Fork do [PainelGestaa](https://github.com/pliniogiglioti/PainelGestaa) contendo **apenas a Análise DFC**
(login, seleção de empresa, termos de uso, Análise DFC, Assistente de DFC e importação de extrato).

- Usa o **mesmo Supabase** do PainelGestaa: os dados, as funções (edge functions) e o cadastro de
  classificações DFC continuam sendo mantidos pelo PainelGestaa. Este repositório não tem pasta `supabase/`
  de propósito — mudanças de banco não saem daqui.
- Rotas: `/` (DFC), `/termos`, `/reset-password`.

## Rodar localmente

```bash
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Deploy (EasyPanel)

Serviço do tipo App apontando para este repositório, com build pelo `Dockerfile` (porta 80).
Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em **Ambiente** — elas entram no build.
