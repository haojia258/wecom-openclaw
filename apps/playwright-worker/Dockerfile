FROM mcr.microsoft.com/playwright:v1.40.1-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --production

# 安装 Playwright 浏览器（仅 Chromium）
RUN npx playwright install chromium

COPY src/ ./src/

EXPOSE 3002

CMD ["node", "src/index.js"]
