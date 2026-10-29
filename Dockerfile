# DFC Scale — build do site (Vite) e entrega estática pelo nginx.
FROM node:20-alpine AS build
WORKDIR /app

# As variáveis VITE_* entram no bundle durante o build. No EasyPanel, cadastre-as
# em Ambiente: o EasyPanel as repassa como build args para este Dockerfile.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" \
  || (echo "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente do serviço" && exit 1)
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
