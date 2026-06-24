FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

FROM node:20-alpine

RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
    && echo "Asia/Jakarta" > /etc/timezone \
    && apk del tzdata

WORKDIR /app

RUN addgroup -S wagateway && adduser -S wagateway -G wagateway

COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

RUN mkdir -p /app/sessions /app/logs \
    && chown -R wagateway:wagateway /app

USER wagateway

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]