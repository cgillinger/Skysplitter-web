FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY . .

ENV NODE_ENV=production
# Appen lyssnar på process.env.PORT, annars 3000
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
