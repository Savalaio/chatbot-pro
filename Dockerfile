FROM node:18-alpine

# Instalar dependências do sistema (para sharp, canvas, etc se necessário)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copiar dependências primeiro (cache otimizado)
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY . .

# Criar diretório public se não existir
RUN mkdir -p public

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expor porta
EXPOSE 3001

# Não rodar como root (segurança)
USER node

# Comando de inicialização
CMD ["node", "server.js"]