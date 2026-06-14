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
        .then((cache) => cache.match(base + '/api/pwa-settings'))
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
  
  // アプリへのフェッチが発生した際にバックグラウンドで未送信の通知がないかチェック
  event.waitUntil(checkAndSendNotification());

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
const STATUS_CACHE_KEY = base + '/api/pwa-notification-status';

async function getNotificationStatus() {
  try {
    const cache = await caches.open('pwa-settings-cache');
    const response = await cache.match(STATUS_CACHE_KEY);
    if (response) {
      return await response.json();
    }
  } catch (e) {
    console.error("Failed to get notification status:", e);
  }
  return {};
}

async function saveNotificationStatus(status) {
  try {
    const cache = await caches.open('pwa-settings-cache');
    await cache.put(
      new Request(STATUS_CACHE_KEY),
      new Response(JSON.stringify(status), { headers: { 'Content-Type': 'application/json' } })
    );
  } catch (e) {
    console.error("Failed to save notification status:", e);
  }
}

// 時刻文字列 "HH:MM" から Date オブジェクト（本日または明日）を生成する
function getScheduledDate(timeStr, offsetDays = 0) {
  const [hour, min] = timeStr.split(":").map(Number);
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, min, 0, 0);
  return date;
}

async function initOrUpdateSchedule(data) {
  const status = await getNotificationStatus();
  const now = new Date();
  const times = {
    morning: data.times?.morning || "08:00",
    lunch: data.times?.lunch || "13:00",
    dinner: data.times?.dinner || "18:00",
    bedtime: data.times?.bedtime || "22:00"
  };
  const timingStates = data.timingStates || {};

  let changed = false;

  for (const key of ['morning', 'lunch', 'dinner', 'bedtime']) {
    const scheduledToday = getScheduledDate(times[key], 0);
    const targetTime = scheduledToday.getTime();

    // すでに予定時刻が保存されている場合
    if (status[key]) {
      const currentTarget = status[key];
      // もし設定が変更されて、本日予定すべき時刻と現在のターゲットの時分が一致しない場合は再設定
      const currentTargetDate = new Date(currentTarget);
      const targetTimeStr = `${String(currentTargetDate.getHours()).padStart(2, "0")}:${String(currentTargetDate.getMinutes()).padStart(2, "0")}`;
      if (targetTimeStr !== times[key]) {
        if (now.getTime() < targetTime) {
          status[key] = targetTime;
        } else {
          status[key] = getScheduledDate(times[key], 1).getTime();
        }
        changed = true;
      }
      
      // フロントエンドで既に点眼が完了(good)している場合、次回を翌日に進める
      const isGood = timingStates[key] && timingStates[key].status === "good";
      if (isGood && currentTarget <= now.getTime()) {
        const tomorrowTarget = getScheduledDate(times[key], 1).getTime();
        if (currentTarget < tomorrowTarget) {
          status[key] = tomorrowTarget;
          changed = true;
        }
      }
    } else {
      // 初回設定
      const isGood = timingStates[key] && timingStates[key].status === "good";
      if (now.getTime() < targetTime) {
        status[key] = targetTime;
      } else if (isGood) {
        status[key] = getScheduledDate(times[key], 1).getTime();
      } else {
        status[key] = targetTime; // リカバリー対象として今日の時刻を設定
      }
      changed = true;
    }
  }

  if (changed) {
    await saveNotificationStatus(status);
  }
  return status;
}

async function checkAndSendNotification() {
  try {
    const cache = await caches.open('pwa-settings-cache');
    const response = await cache.match(base + '/api/pwa-settings');
    if (!response) return;

    const data = await response.json();
    if (!data || !data.enabled) return;

    // スケジュール状態の取得と更新
    const status = await initOrUpdateSchedule(data);
    const now = new Date();
    const nowTime = now.getTime();

    const times = {
      morning: data.times?.morning || "08:00",
      lunch: data.times?.lunch || "13:00",
      dinner: data.times?.dinner || "18:00",
      bedtime: data.times?.bedtime || "22:00"
    };
    const timingStates = data.timingStates || {};
    const medicines = data.medicines || [];

    for (const key of ['morning', 'lunch', 'dinner', 'bedtime']) {
      const targetTime = status[key];
      if (!targetTime) continue;

      // 予定時刻を過ぎているか？
      if (nowTime >= targetTime) {
        // その時間帯の点眼がすでに完了（good）している場合は通知をスキップし、次回予定を翌日に更新
        const isGood = timingStates[key] && timingStates[key].status === "good";
        if (isGood) {
          status[key] = getScheduledDate(times[key], 1).getTime();
          await saveNotificationStatus(status);
          continue;
        }

        // その時間帯に対応するお薬があるか確認
        const hasMedForTiming = medicines.some(med => 
          med.timings && med.timings.includes(key)
        );

        if (hasMedForTiming) {
          const title = "目薬の時間だよ！";
          let bodyText = "忘れずに点眼しましょう！";
          
          // 遅れて通知する場合（リカバリー時）のメッセージ調整
          if (nowTime - targetTime > 15 * 60 * 1000) {
            const targetDate = new Date(targetTime);
            const targetTimeStr = `${String(targetDate.getHours()).padStart(2, "0")}:${String(targetDate.getMinutes()).padStart(2, "0")}`;
            bodyText = `${targetTimeStr}の目薬の時間をお知らせします。`;
          }

          const options = {
            body: bodyText,
            icon: base + '/Daily_eyedrops192.png',
            badge: base + '/Daily_eyedrops192.png',
            tag: 'eyedrop-notification-' + key,
            renotify: true,
            data: {
              url: base + '/'
            }
          };

          await self.registration.showNotification(title, options);
        }

        // 次回予定を翌日に再スケジュール
        status[key] = getScheduledDate(times[key], 1).getTime();
        await saveNotificationStatus(status);
      }
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

// 定期バックグラウンド同期イベント
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-eyedrops') {
    event.waitUntil(checkAndSendNotification());
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
