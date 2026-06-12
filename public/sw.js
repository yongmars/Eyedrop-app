const CACHE_NAME = 'eyedrop-app-v1';
const base = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/'));

const ASSETS_TO_CACHE = [
  base + '/',
  base + '/manifest.webmanifest',
  base + '/Daily_eyedrops192.png',
  base + '/Daily_eyedrops512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Precache error:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === base + '/api/pwa-settings') {
    event.respondWith(
      caches.open('pwa-settings-cache')
        .then((cache) => cache.match('/api/pwa-settings'))
        .then((response) => response || new Response(JSON.stringify({ enabled: false }), { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // GETリクエスト以外、API、外部ドメインはキャッシュ対象外にして即時fetch
  if (
    event.request.method !== 'GET' || 
    url.pathname.startsWith(base + '/api') || 
    !url.origin.startsWith(self.location.origin)
  ) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match(base + '/');
        });
      })
  );
});

// --- 通知監視タイマー処理 ---
let notificationInterval = null;
let lastNotifiedMinute = ""; // 同じ分に複数回通知が飛ぶのを防止

async function checkAndSendNotification() {
  try {
    const cache = await caches.open('pwa-settings-cache');
    const response = await cache.match('/api/pwa-settings');
    if (!response) return;

    const data = await response.json();
    if (!data || !data.enabled) return;

    const now = new Date();
    const currentHourStr = String(now.getHours()).padStart(2, "0");
    const currentMinStr = String(now.getMinutes()).padStart(2, "0");
    const currentTimeStr = `${currentHourStr}:${currentMinStr}`;
    const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const uniqueMinuteKey = `${todayStr}-${currentTimeStr}`;

    // すでにこの分に通知済みならスキップ
    if (lastNotifiedMinute === uniqueMinuteKey) return;

    // 時間帯の定義と設定時間
    const timeKeys = {
      morning: data.times?.morning || "08:00",
      lunch: data.times?.lunch || "13:00",
      dinner: data.times?.dinner || "18:00",
      bedtime: data.times?.bedtime || "22:00"
    };

    // 現在時刻と合致する時間帯があるかチェック
    let matchedTiming = null;
    for (const [timing, timeVal] of Object.entries(timeKeys)) {
      if (timeVal === currentTimeStr) {
        matchedTiming = timing;
        break;
      }
    }

    if (!matchedTiming) return;

    // すでにその時間帯の点眼が完了（good）している場合は通知をスキップ
    const timingStates = data.timingStates || {};
    const timingState = timingStates[matchedTiming];
    if (timingState && timingState.status === "good") {
      return;
    }

    // その時間帯に対応する目薬が1つ以上あるかチェック
    const medicines = data.medicines || [];
    const hasMedForTiming = medicines.some(med => 
      med.timings && med.timings.includes(matchedTiming)
    );

    if (hasMedForTiming) {
      lastNotifiedMinute = uniqueMinuteKey;
      
      const title = "目薬の時間だよ！";
      const options = {
        body: "忘れずに点眼しましょう！",
        icon: base + '/Daily_eyedrops192.png',
        badge: base + '/Daily_eyedrops192.png',
        tag: 'eyedrop-notification-' + matchedTiming,
        renotify: true,
        data: {
          url: base + '/'
        }
      };

      self.registration.showNotification(title, options);
    }
  } catch (err) {
    console.error("Error in PWA notification checker:", err);
  }
}

function startTimer() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }
  // 1分ごとにチェック (60000ms)
  notificationInterval = setInterval(checkAndSendNotification, 60000);
  
  // 開始時にも即時1回確認
  checkAndSendNotification();
}

// タイマー開始
startTimer();

// メッセージイベント受信時にタイマーを再起動して設定更新を促す
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SETTINGS_UPDATED') {
    startTimer();
  }
});

// 通知をクリックした時の動作（アプリを開く）
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || (base + '/');
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
