# 1. Base image (Node.js)
FROM node:20-slim

# 2. Working directory set karein
WORKDIR /app

# 3. Dependencies copy aur install karein
COPY package*.json ./
RUN npm install

# 4. Prisma client generate karein
COPY prisma ./prisma
RUN npx prisma generate

# 5. Baqi saara code copy karein
COPY . .

# 6. TypeScript ko compile karein (Dist folder banayega)
RUN npm run build

# 7. Port 5000 ko expose karein
EXPOSE 5000

# 8. App start karne ki command
CMD ["npm", "start"]