export type NotificationTiming = "morning" | "lunch" | "dinner" | "bedtime";

export interface NotificationSlotSetting {
  enabled: boolean;
  time: string;
}

export interface LocalNotificationSettings {
  enabled: boolean;
  slots: Record<NotificationTiming, NotificationSlotSetting>;
}

export type NotificationSentRecord = Record<string, Partial<Record<NotificationTiming, boolean>>>;

export interface ScheduledNotification {
  timing: NotificationTiming;
  appDate: string;
  fireAt: Date;
}

export const NOTIFICATION_SETTINGS_STORAGE_KEY = "eye-drop-notification-settings";
export const NOTIFICATION_SENT_STORAGE_KEY = "eye-drop-notification-sent";
export const NOTIFICATION_SETTINGS_CHANGED_EVENT = "eye-drop-notification-settings-changed";
export const MEDICINE_DATA_CHANGED_EVENT = "eye-drop-medicine-data-changed";

export const NOTIFICATION_TITLE = "点眼の時間だよ";
export const NOTIFICATION_BODY = "アプリを開いて確認してね";

export const NOTIFICATION_TIMINGS: NotificationTiming[] = [
  "morning",
  "lunch",
  "dinner",
  "bedtime",
];

export const NOTIFICATION_TIMING_LABELS: Record<NotificationTiming, string> = {
  morning: "朝",
  lunch: "昼",
  dinner: "夕",
  bedtime: "就寝前",
};

export const DEFAULT_NOTIFICATION_SETTINGS: LocalNotificationSettings = {
  enabled: true,
  slots: {
    morning: { enabled: true, time: "08:00" },
    lunch: { enabled: true, time: "13:00" },
    dinner: { enabled: true, time: "18:00" },
    bedtime: { enabled: true, time: "22:00" },
  },
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const APP_DAY_START_MINUTES = 4 * 60;

const hasWindow = () => typeof window !== "undefined";

export const isNotificationSupported = () =>
  hasWindow() && "Notification" in window;

const sanitizeTime = (time: unknown, fallback: string) => {
  return typeof time === "string" && TIME_PATTERN.test(time) ? time : fallback;
};

const sanitizeSettings = (value: unknown): LocalNotificationSettings => {
  const parsed = value as Partial<LocalNotificationSettings> | null;
  const sourceSlots = (parsed?.slots ?? {}) as Partial<Record<NotificationTiming, Partial<NotificationSlotSetting>>>;

  return {
    enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : DEFAULT_NOTIFICATION_SETTINGS.enabled,
    slots: NOTIFICATION_TIMINGS.reduce((acc, timing) => {
      const source = sourceSlots[timing];
      const fallback = DEFAULT_NOTIFICATION_SETTINGS.slots[timing];
      acc[timing] = {
        enabled: typeof source?.enabled === "boolean" ? source.enabled : fallback.enabled,
        time: sanitizeTime(source?.time, fallback.time),
      };
      return acc;
    }, {} as Record<NotificationTiming, NotificationSlotSetting>),
  };
};

export const readNotificationSettings = (): LocalNotificationSettings => {
  if (!hasWindow()) return DEFAULT_NOTIFICATION_SETTINGS;

  const raw = localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;

  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
};

export const saveNotificationSettings = (settings: LocalNotificationSettings) => {
  if (!hasWindow()) return;

  localStorage.setItem(
    NOTIFICATION_SETTINGS_STORAGE_KEY,
    JSON.stringify(sanitizeSettings(settings))
  );
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
};

export const readNotificationSentRecord = (): NotificationSentRecord => {
  if (!hasWindow()) return {};

  const raw = localStorage.getItem(NOTIFICATION_SENT_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const writeNotificationSentRecord = (record: NotificationSentRecord) => {
  if (!hasWindow()) return;
  localStorage.setItem(NOTIFICATION_SENT_STORAGE_KEY, JSON.stringify(record));
};

export const markNotificationSent = (timing: NotificationTiming, appDate: string) => {
  const record = readNotificationSentRecord();
  record[appDate] = {
    ...record[appDate],
    [timing]: true,
  };
  writeNotificationSentRecord(record);
};

export const getAppDateString = (date: Date = new Date()) => {
  const adjusted = new Date(date);
  adjusted.setHours(adjusted.getHours() - 4);

  const yyyy = adjusted.getFullYear();
  const mm = String(adjusted.getMonth() + 1).padStart(2, "0");
  const dd = String(adjusted.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const addDaysToAppDate = (appDate: string, days: number) => {
  const [year, month, day] = appDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getMinutesFromTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const getFireDateForAppDate = (appDate: string, time: string) => {
  const [year, month, day] = appDate.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const fireAt = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (getMinutesFromTime(time) < APP_DAY_START_MINUTES) {
    fireAt.setDate(fireAt.getDate() + 1);
  }

  return fireAt;
};

export const getNextNotification = (
  settings: LocalNotificationSettings,
  sentRecord: NotificationSentRecord = readNotificationSentRecord(),
  now: Date = new Date()
): ScheduledNotification | null => {
  if (!settings.enabled) return null;

  const todayAppDate = getAppDateString(now);
  const candidates: ScheduledNotification[] = [];

  [todayAppDate, addDaysToAppDate(todayAppDate, 1)].forEach((appDate) => {
    NOTIFICATION_TIMINGS.forEach((timing) => {
      const slot = settings.slots[timing];
      if (!slot.enabled || sentRecord[appDate]?.[timing]) return;

      const fireAt = getFireDateForAppDate(appDate, slot.time);
      if (fireAt.getTime() > now.getTime()) {
        candidates.push({ timing, appDate, fireAt });
      }
    });
  });

  return candidates.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())[0] ?? null;
};

export const getRecentDueNotification = (
  settings: LocalNotificationSettings,
  sentRecord: NotificationSentRecord = readNotificationSentRecord(),
  now: Date = new Date(),
  lookBackMinutes = 60
): ScheduledNotification | null => {
  if (!settings.enabled) return null;

  const currentAppDate = getAppDateString(now);
  const previousAppDate = addDaysToAppDate(currentAppDate, -1);
  const lookBackMs = lookBackMinutes * 60 * 1000;
  const nowTime = now.getTime();
  const candidates: ScheduledNotification[] = [];

  [previousAppDate, currentAppDate].forEach((appDate) => {
    NOTIFICATION_TIMINGS.forEach((timing) => {
      const slot = settings.slots[timing];
      if (!slot.enabled || sentRecord[appDate]?.[timing]) return;

      const fireAt = getFireDateForAppDate(appDate, slot.time);
      const fireTime = fireAt.getTime();
      if (fireTime <= nowTime && nowTime - fireTime <= lookBackMs) {
        candidates.push({ timing, appDate, fireAt });
      }
    });
  });

  return candidates.sort((a, b) => b.fireAt.getTime() - a.fireAt.getTime())[0] ?? null;
};
