FROM node:20-slim

# Prisma cần openssl
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 3000

# Tạo bảng, seed, rồi chạy server
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node server.js"]