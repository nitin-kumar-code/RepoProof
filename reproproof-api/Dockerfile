FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]
