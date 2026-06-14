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
const supportsNotificationTriggers = (typeof TimestampTrigger !== 'undefined');

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

// Notification Triggers (TimestampTrigger) のスケジュール同期
async function syncNotificationTriggers(data) {
  if (!supportsNotificationTriggers) return;

  const times = {
    morning: data.times?.morning || "08:00",
    lunch: data.times?.lunch || "13:00",
    dinner: data.times?.dinner || "18:00",
    bedtime: data.times?.bedtime || "22:00"
  };
  const timingStates = data.timingStates || {};
  const medicines = data.medicines || [];
  const enabled = !!data.enabled;

  const status = await getNotificationStatus();
  const now = new Date();
  const nowTime = now.getTime();

  let changed = false;

  for (const key of ['morning', 'lunch', 'dinner', 'bedtime']) {
    const tag = 'eyedrop-notification-' + key;

    const hasMedForTiming = medicines.some(med => 
      med.timings && med.timings.includes(key)
    );

    if (!enabled || !hasMedForTiming) {
      // スケジュール済み通知があればキャンセル
      const activeNotifications = await self.registration.getNotifications({ tag });
      for (const notif of activeNotifications) {
        notif.close();
      }
      if (status[key]) {
        delete status[key];
        changed = true;
      }
      continue;
    }

    const scheduledToday = getScheduledDate(times[key], 0);
    const targetTodayTime = scheduledToday.getTime();
    const isGood = timingStates[key] && timingStates[key].status === "good";

    let nextScheduledTime = 0;

    if (isGood) {
      nextScheduledTime = getScheduledDate(times[key], 1).getTime();
    } else {
      if (nowTime < targetTodayTime) {
        nextScheduledTime = targetTodayTime;
      } else {
        if (status[key] && status[key] > nowTime) {
          nextScheduledTime = status[key];
        } else {
          // 過去時刻で点眼未完了の場合は即時通知を送信し、次回を明日に更新
          const title = "目薬の時間だよ！";
          let bodyText = "忘れずに点眼しましょう！";
          
          if (nowTime - targetTodayTime > 15 * 60 * 1000) {
            const targetTimeStr = `${String(scheduledToday.getHours()).padStart(2, "0")}:${String(scheduledToday.getMinutes()).padStart(2, "0")}`;
            bodyText = `${targetTimeStr}の目薬の時間をお知らせします。`;
          }

          const options = {
            body: bodyText,
            icon: base + '/Daily_eyedrops192.png',
            badge: base + '/Daily_eyedrops192.png',
            tag: tag,
            renotify: true,
            data: {
              url: base + '/'
            }
          };

          await self.registration.showNotification(title, options);
          nextScheduledTime = getScheduledDate(times[key], 1).getTime();
        }
      }
    }

    if (nextScheduledTime > nowTime) {
      if (status[key] !== nextScheduledTime) {
        try {
          const title = "目薬の時間だよ！";
          const options = {
            body: "忘れずに点眼しましょう！",
            icon: base + '/Daily_eyedrops192.png',
            badge: base + '/Daily_eyedrops192.png',
            tag: tag,
            renotify: true,
            // @ts-ignore
            showTrigger: new TimestampTrigger(nextScheduledTime),
            data: {
              url: base + '/'
            }
          };

          await self.registration.showNotification(title, options);
          status[key] = nextScheduledTime;
          changed = true;
          console.log(`Notification scheduled for ${key} at ${new Date(nextScheduledTime).toLocaleString()}`);
        } catch (err) {
          console.error(`Failed to register TimestampTrigger for ${key}:`, err);
        }
      }
    }
  }

  if (changed) {
    await saveNotificationStatus(status);
  }
}

async function checkAndSendNotification() {
  try {
    const cache = await caches.open('pwa-settings-cache');
    const response = await cache.match(base + '/api/pwa-settings');
    if (!response) return;

    const data = await response.json();
    if (!data || !data.enabled) return;

    if (supportsNotificationTriggers) {
      await syncNotificationTriggers(data);
      return;
    }

    // --- 以下、TimestampTrigger 非対応ブラウザ用のフォールバック処理 ---
    const status = await getNotificationStatus();
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

    let changed = false;

    for (const key of ['morning', 'lunch', 'dinner', 'bedtime']) {
      const scheduledToday = getScheduledDate(times[key], 0);
      const targetTime = scheduledToday.getTime();

      if (!status[key]) {
        const isGood = timingStates[key] && timingStates[key].status === "good";
        if (nowTime < targetTime) {
          status[key] = targetTime;
        } else if (isGood) {
          status[key] = getScheduledDate(times[key], 1).getTime();
        } else {
          status[key] = targetTime;
        }
        changed = true;
      } else {
        const currentTargetDate = new Date(status[key]);
        const targetTimeStr = `${String(currentTargetDate.getHours()).padStart(2, "0")}:${String(currentTargetDate.getMinutes()).padStart(2, "0")}`;
        if (targetTimeStr !== times[key]) {
          if (nowTime < targetTime) {
            status[key] = targetTime;
          } else {
            status[key] = getScheduledDate(times[key], 1).getTime();
          }
          changed = true;
        }
      }

      const isGood = timingStates[key] && timingStates[key].status === "good";
      if (isGood && status[key] <= nowTime) {
        const tomorrowTarget = getScheduledDate(times[key], 1).getTime();
        if (status[key] < tomorrowTarget) {
          status[key] = tomorrowTarget;
          changed = true;
        }
      }

      const targetTimeFinal = status[key];
      if (nowTime >= targetTimeFinal) {
        if (isGood) {
          status[key] = getScheduledDate(times[key], 1).getTime();
          changed = true;
          continue;
        }

        const hasMedForTiming = medicines.some(med => 
          med.timings && med.timings.includes(key)
        );

        if (hasMedForTiming) {
          const title = "目薬の時間だよ！";
          let bodyText = "忘れずに点眼しましょう！";
          
          if (nowTime - targetTimeFinal > 15 * 60 * 1000) {
            const targetDate = new Date(targetTimeFinal);
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

        status[key] = getScheduledDate(times[key], 1).getTime();
        changed = true;
      }
    }

    if (changed) {
      await saveNotificationStatus(status);
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
