FROM node:18-slim

# Cài đặt dumb-init để quản lý process và các dependencies cho Chrome
RUN apt-get update \
    && apt-get install -y \
        wget \
        gnupg \
        ca-certificates \
        dumb-init \
        google-chrome-stable \
        xvfb \
        fonts-ipafont-gothic \
        fonts-wqy-zenhei \
        fonts-thai-tlwg \
        fonts-kacst \
        fonts-freefont-ttf \
        libxss1 \
        --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && rm -rf /var/lib/apt/lists/*

# Tạo thư mục làm việc
WORKDIR /app

# Copy package files và cài đặt với quyền user 'node'
COPY --chown=node:node package*.json ./
RUN npm install

# Copy toàn bộ code và phân quyền cho user 'node'
COPY --chown=node:node . .

# Sử dụng user 'node' (UID 1000) có sẵn trong image
USER node

# Thiết lập biến môi trường cho Display
ENV DISPLAY=:99

# Sử dụng dumb-init để chạy nhiều lệnh đồng thời một cách an toàn
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Lệnh khởi động: Chạy Xvfb ở background và sau đó chạy bot
CMD Xvfb :99 -ac -screen 0 1280x1024x24 & node main.js
