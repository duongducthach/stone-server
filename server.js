const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// ====== CONFIG ======
const PROXY_PATH = path.join(__dirname, '../Stonemap');
const IP_USAGE_FILE = path.join(__dirname, 'ip_usage.json');
const KEYS_FILE = path.join(__dirname, 'keys.json');
const KEYS_GEN_FILE = '/root/license-server/keys.json';
const USERS_FILE = path.join(__dirname, 'users.json');

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// ====== UTILS ======
function readLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.trim() !== '');
  } catch (err) {
    console.error(`❌ Lỗi đọc file ${filePath}:`, err);
    return [];
  }
}

function getRandomLines(filePath, count) {
  const lines = readLines(filePath);
  return lines.sort(() => 0.5 - Math.random()).slice(0, count);
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    ''
  ).replace(/^.*:/, '');
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ====== 1. TẠO KEY TỪ HWID ======
const genkeyUsage = {}; // IP hạn chế spam tạo key

app.post('/api/genkey', (req, res) => {
  const hwid = (req.body.hwid || '').trim().toUpperCase();
  const ip = getClientIp(req);
  const now = Date.now();

  if (!genkeyUsage[ip]) genkeyUsage[ip] = [];
  genkeyUsage[ip] = genkeyUsage[ip].filter(ts => now - ts < 10 * 60 * 1000); // 10 phút

  if (genkeyUsage[ip].length >= 3) {
    return res.status(429).json({ error: 'Spam quá rồi, thử lại sau 10 phút' });
  }

  genkeyUsage[ip].push(now);

  if (!hwid || hwid.length < 5) {
    return res.status(400).json({ error: 'HWID không hợp lệ' });
  }

  const keys = loadJson(KEYS_GEN_FILE);

  if (keys[hwid]) {
    return res.json({ key: hwid, info: 'HWID đã tồn tại' });
  }

  keys[hwid] = {
    hwid,
    expire: '2030-12-31'
  };

  saveJson(KEYS_GEN_FILE, keys);
  res.json({ key: hwid });
});

// ====== 2. NHẬN PROXY BẰNG KEY ======
app.get('/api/10proxy', (req, res) => {
  const key = (req.query.key || '').trim();
  const ip = getClientIp(req);
  const now = Date.now();

  const keys = loadJson(KEYS_FILE);
  const ipUsage = loadJson(IP_USAGE_FILE);
  const keyRole = keys[key];

  if (!keyRole) return res.status(403).json({ error: 'Key không hợp lệ' });

  // === ADMIN: trả toàn bộ
  if (keyRole === 'admin') {
    return res.json({
      role: 'admin',
      http: readLines(path.join(PROXY_PATH, 'xoayhttp.txt')),
      socks5: readLines(path.join(PROXY_PATH, 'xoaysocks5.txt'))
    });
  }

 

  // === USER: random 4 HTTP + 2 SOCKS5, giới hạn IP
  if (!ipUsage[ip]) ipUsage[ip] = [];
  ipUsage[ip] = ipUsage[ip].filter(ts => now - ts < 30 * 60 * 1000); // 30 phút

  if (ipUsage[ip].length >= 2) {
    return res.status(429).json({ error: 'Bạn đã làm 2 nháy rồi, thử lại sau 30 phút' });
  }

  ipUsage[ip].push(now);
  saveJson(IP_USAGE_FILE, ipUsage);

  res.json({
    role: 'user',
    http: getRandomLines(path.join(PROXY_PATH, 'xoayhttp.txt'), 4),
    socks5: getRandomLines(path.join(PROXY_PATH, 'xoaysocks5.txt'), 2)
  });
});


// ====== 3. API TOKEN RIÊNG: LẤY 1 HTTP PROXY ======
app.get('/u/:token/proxyxoayhttp', (req, res) => {
  const token = req.params.token;
  const ip = getClientIp(req);
  const users = loadJson(USERS_FILE);
  const now = Date.now();

  const user = users[token];
  if (!user) return res.status(403).json({ error: 'Token không hợp lệ' });

  if (user.ip_whitelist.length > 0 && !user.ip_whitelist.includes(ip)) {
    return res.status(403).json({ error: 'IP không được phép truy cập' });
  }

  user.requests = user.requests.filter(ts => now - ts < 60 * 60 * 1000); // 1h
  if (user.requests.length >= user.limit_per_hour) {
    return res.status(429).json({ error: 'Hết lượt sử dụng trong 1 giờ' });
  }

  user.requests.push(now);
  saveJson(USERS_FILE, users);

  const proxy = getRandomLines(path.join(PROXY_PATH, 'xoayhttp.txt'), 1);
  res.send(proxy[0] || 'Không có proxy nào sẵn');
});

// ====== 4. API TOKEN RIÊNG: LẤY 1 SOCKS5 PROXY ======
app.get('/u/:token/proxyxoaysocks5', (req, res) => {
  const token = req.params.token;
  const ip = getClientIp(req);
  const users = loadJson(USERS_FILE);
  const now = Date.now();

  const user = users[token];
  if (!user) return res.status(403).json({ error: 'Token không hợp lệ' });

  if (user.ip_whitelist.length > 0 && !user.ip_whitelist.includes(ip)) {
    return res.status(403).json({ error: 'IP không được phép truy cập' });
  }

  user.requests = user.requests.filter(ts => now - ts < 60 * 60 * 1000);
  if (user.requests.length >= user.limit_per_hour) {
    return res.status(429).json({ error: 'Hết lượt sử dụng trong 1 giờ' });
  }

  user.requests.push(now);
  saveJson(USERS_FILE, users);

  const proxy = getRandomLines(path.join(PROXY_PATH, 'xoaysocks5.txt'), 1);
  res.send(proxy[0] ? `socks5://${proxy[0]}` : 'Không có proxy nào sẵn');
});

// ProxyShare 15 phut
app.get('/api/guesproxy', (req, res) => {
  const PROXY_PATH = path.join(__dirname, '../Stonemap');
  const CACHE_FILE = path.join(__dirname, 'limited_cache.json');
  const blockDuration = 15 * 60 * 1000;
  const now = Date.now();
  const currentBlock = Math.floor(now / blockDuration) * blockDuration;

  if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, JSON.stringify({}));

  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Lỗi đọc cache' });
  }

  if (!cache || cache.block_time !== currentBlock || !cache.http || !cache.socks5) {
    const httpList = readLines(path.join(PROXY_PATH, 'xoayhttp.txt'));
    const socks5List = readLines(path.join(PROXY_PATH, 'xoaysocks5.txt'));

    if (httpList.length === 0 || socks5List.length === 0) {
      return res.status(500).json({ error: 'Không có proxy' });
    }

    cache = {
      block_time: currentBlock,
      http: httpList[Math.floor(Math.random() * httpList.length)],
      socks5: socks5List[Math.floor(Math.random() * socks5List.length)]
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  }

  const timeLeft = Math.floor((cache.block_time + blockDuration - now) / 1000); // giây còn lại

  res.json({
    http: cache.http,
    socks5: cache.socks5,
    next_change_in: timeLeft
  });
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});

