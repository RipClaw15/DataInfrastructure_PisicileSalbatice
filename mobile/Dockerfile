# Build from the repository root: docker compose --profile mobile up --build
FROM node:26-slim
WORKDIR /app/mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ ./
EXPOSE 8081
CMD ["sh", "./docker-start.sh"]
