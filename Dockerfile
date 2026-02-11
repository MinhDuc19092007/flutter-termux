FROM node:18-slim

# 1. Cài đặt các công cụ cần thiết để thêm Repo
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    --no-install-recommends

# 2. Thêm Google Chrome Repo và Key
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list

# 3. Update lại và cài đặt Chrome + các dependencies khác
RUN apt-get update && apt-get install -y \
    google-chrome-stable \
    dumb-init \
    xvfb \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY --chown=node:node package*.json ./
RUN npm install

# Copy source code
COPY --chown=node:node . .

USER node

ENV DISPLAY=:99
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD Xvfb :99 -ac -screen 0 1280x1024x24 & node main.js
