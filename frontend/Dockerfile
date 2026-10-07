FROM node:22-alpine

WORKDIR /app

# Instalar dependencias (incluyendo devDependencies para Tailwind)
COPY package*.json ./
RUN npm install

# Copiar todo el código
COPY . .

# Compilar Tailwind CSS para producción
RUN npx tailwindcss \
    -i ./css/tailwind-main.css \
    -o ./public/css/main.css \
    --minify \
    --config tailwind.config.js

# Versionar JS/CSS por hash de contenido (evita caché viejo en el navegador)
RUN node scripts/cachebust.js

EXPOSE 3001

CMD ["npm", "run", "start"]
