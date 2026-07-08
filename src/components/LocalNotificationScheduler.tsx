"use client";

import { useEffect, useRef } from "react";
import {
  getNextNotification,
  getRecentDueNotification,
  isNotificationSupported,
  markNotificationSent,
  MEDICINE_DATA_CHANGED_EVENT,
  NOTIFICATION_BODY,
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  NOTIFICATION_TITLE,
  NotificationTiming,
  readNotificationSentRecord,
  readNotificationSettings,
  ScheduledNotification,
} from "../lib/localNotifications";

const MAX_TIMEOUT_MS = 2_147_000_000;
const MEDICINE_STORAGE_KEY = "my_medication_data";

interface StoredMedicine {
  timings?: string[];
}

export default function LocalNotificationScheduler() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const isShowingRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    const clearScheduledTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const getIconPath = () => `${basePath}/Daily_eyedrops192.png`;

    const showNotification = async (scheduled: ScheduledNotification) => {
      if (!isNotificationSupported() || Notification.permission !== "granted") return;
      if (isShowingRef.current) return;

      isShowingRef.current = true;
      try {
        const options: NotificationOptions = {
          body: NOTIFICATION_BODY,
          icon: getIconPath(),
          badge: getIconPath(),
          tag: `eye-drop-${scheduled.appDate}-${scheduled.timing}`,
        };

        const registration = registrationRef.current;
        if (registration?.showNotification) {
          await registration.showNotification(NOTIFICATION_TITLE, options);
        } else {
          new Notification(NOTIFICATION_TITLE, options);
        }

        markNotificationSent(scheduled.timing, scheduled.appDate);
      } finally {
        isShowingRef.current = false;
      }
    };

    const scheduleNext = () => {
      clearScheduledTimeout();
      if (!isActive || !isNotificationSupported()) return;

      const settings = getSettingsForRegisteredMedicines();
      const next = getNextNotification(settings, readNotificationSentRecord());
      if (!next) return;

      const delay = Math.max(0, next.fireAt.getTime() - Date.now());
      timeoutRef.current = setTimeout(async () => {
        await showNotification(next);
        scheduleNext();
      }, Math.min(delay, MAX_TIMEOUT_MS));
    };

    const checkRecentDueNotification = async () => {
      if (!isActive || !isNotificationSupported()) return;

      const settings = getSettingsForRegisteredMedicines();
      const recent = getRecentDueNotification(settings, readNotificationSentRecord());
      if (recent) {
        await showNotification(recent);
      }
      scheduleNext();
    };

    const registerServiceWorker = async () => {
      if (!("serviceWorker" in navigator)) return;

      try {
        registrationRef.current = await navigator.serviceWorker.register(`${basePath}/sw.js`);
      } catch (error) {
        console.error("Service Worker registration failed:", error);
      }
    };

    const handleSettingsChanged = () => {
      scheduleNext();
    };

    const readStoredMedicines = (): StoredMedicine[] => {
      const raw = localStorage.getItem(MEDICINE_STORAGE_KEY);
      if (!raw) return [];

      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const hasMedicineForTiming = (timing: NotificationTiming) => {
      return readStoredMedicines().some((medicine) => {
        return medicine.timings?.includes(timing) && !medicine.timings?.includes("as_needed");
      });
    };

    const getSettingsForRegisteredMedicines = () => {
      const settings = readNotificationSettings();
      return {
        ...settings,
        slots: {
          morning: {
            ...settings.slots.morning,
            enabled: settings.slots.morning.enabled && hasMedicineForTiming("morning"),
          },
          lunch: {
            ...settings.slots.lunch,
            enabled: settings.slots.lunch.enabled && hasMedicineForTiming("lunch"),
          },
          dinner: {
            ...settings.slots.dinner,
            enabled: settings.slots.dinner.enabled && hasMedicineForTiming("dinner"),
          },
          bedtime: {
            ...settings.slots.bedtime,
            enabled: settings.slots.bedtime.enabled && hasMedicineForTiming("bedtime"),
          },
        },
      };
    };

    const handleStorageChanged = (event: StorageEvent) => {
      if (event.key === NOTIFICATION_SETTINGS_STORAGE_KEY || event.key === MEDICINE_STORAGE_KEY) {
        scheduleNext();
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void checkRecentDueNotification();
      }
    };

    void registerServiceWorker().finally(scheduleNext);

    window.addEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    window.addEventListener(MEDICINE_DATA_CHANGED_EVENT, handleSettingsChanged);
    window.addEventListener("storage", handleStorageChanged);
    window.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      isActive = false;
      clearScheduledTimeout();
      window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
      window.removeEventListener(MEDICINE_DATA_CHANGED_EVENT, handleSettingsChanged);
      window.removeEventListener("storage", handleStorageChanged);
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [basePath]);

  return null;
}
