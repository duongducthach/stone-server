// Khi bấm nút OK ở /10proxy.html
async function submitKey() {
  const key = document.getElementById('keyInput').value;

  if (!key) {
    alert("❌ Bạn chưa nhập key!");
    return;
  }

  try {
    const res = await fetch(`/api/10proxy?key=${key}`);
    const data = await res.json();
    const div = document.getElementById('proxyResult');

    if (res.status === 200) {
      let http = data.http.join('\n');
      let socks = data.socks5.join('\n');
      div.innerText = `http:\n${http}\n\nsocks5:\n${socks}`;
    } else {
      div.innerText = `❌ Lỗi: ${data.error}`;
    }
  } catch (err) {
    console.error('Lỗi khi lấy 10 proxy:', err);
    alert("❌ Đã xảy ra lỗi khi lấy proxy!");
  }
}

function togglePassword() {
  const input = document.getElementById('keyInput');
  input.type = input.type === 'password' ? 'text' : 'password';
}
// Xử lý form nhập HWID ở genkey.html
function postHWID(hwid) {
  fetch('/api/genkey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hwid })
  })
    .then(res => res.json())
    .then(data => {
      const result = document.getElementById('result');
      if (data.error) {
        result.innerText = '❌ ' + data.error;
        result.style.color = 'red';
      } else {
        result.innerText = `✅Kích hoạt thành công`;
        result.style.color = 'green';
      }
    })
    .catch(err => {
      document.getElementById('result').innerText = '❌ Lỗi kết nối server!';
      console.error('Lỗi khi gửi HWID:', err);
    });
}

// Gắn event cho form trong genkey.html
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('genKeyForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const hwid = document.getElementById('hwidInput').value.trim();
      if (hwid.length >= 5) {
        postHWID(hwid);
      } else {
        document.getElementById('result').innerText = '❌ HWID không hợp lệ!';
      }
    });
  }
});

// === Proxy share xoay 15 phút ===
let guesNextChange = 0;

function loadGuesProxy() {
  fetch('/api/guesproxy')
    .then(res => res.json())
    .then(data => {
      document.getElementById('gues-http').textContent = data.http || 'Không có';
      document.getElementById('gues-socks5').textContent = data.socks5 || 'Không có';

      if (data.next_change_in) {
        guesNextChange = parseInt(data.next_change_in); // đơn vị: giây
      }
    })
    .catch(() => {
      document.getElementById('gues-http').textContent = 'Lỗi';
      document.getElementById('gues-socks5').textContent = 'Lỗi';
    });
}

// Cập nhật đếm ngược mỗi giây
setInterval(() => {
  if (guesNextChange > 0) {
    guesNextChange--;
    const m = Math.floor(guesNextChange / 60);
    const s = guesNextChange % 60;
    const countdown = document.getElementById('countdown');
    if (countdown) {
      countdown.textContent = `Proxy share đổi sau: ${m} phút ${s < 10 ? '0' : ''}${s} giây`;
    }
  }
}, 1000);

// Load lần đầu và auto reload proxy mỗi 15s
document.addEventListener('DOMContentLoaded', () => {
  loadGuesProxy();
  setInterval(loadGuesProxy, 15000);
});


document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('keyInput') || document.getElementById('hwidInput');
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault(); // không submit form mặc định
        submitKey(); // gọi hàm submit
      }
    });
  }
});

