FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 3000

CMD ["node", "src/index.js"]
