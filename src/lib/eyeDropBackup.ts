import JSZip from "jszip";
import { APP_VERSION } from "./appVersion";
import {
  getAllMedicinePhotos,
  getMedicinePhotos,
  MedicinePhotoRecord,
  replaceMedicinePhotos,
} from "./medicinePhotos";
import {
  LocalNotificationSettings,
  MEDICINE_DATA_CHANGED_EVENT,
  NOTIFICATION_SENT_STORAGE_KEY,
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  NOTIFICATION_TIMINGS,
  readNotificationSettings,
} from "./localNotifications";
import {
  readTimerChimeSettings,
  TIMER_CHIME_SETTINGS_CHANGED_EVENT,
  TIMER_CHIME_SETTINGS_STORAGE_KEY,
  TimerChimeSettings,
} from "./timerChime";

export const BACKUP_VERSION = 1;
export const MEDICINES_STORAGE_KEY = "my_medication_data";
export const HISTORY_STORAGE_KEY = "eye-drop-history";

const IMAGE_PATH_PATTERN = /^images\/medicine-(\d+)\.(jpg|png|webp)$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MEDICINE_TYPES = ["water", "suspension", "gel", "ointment"] as const;
const STORAGE_TYPES = ["room", "cold"] as const;
const EYE_TARGETS = ["both", "right", "left"] as const;
const MEDICINE_TIMINGS = ["morning", "lunch", "dinner", "bedtime", "as_needed"] as const;

const TEMPORARY_STORAGE_KEYS = [
  "eye-drop-selectedTiming",
  "eye-drop-timingStates",
  "eye-drop-lastSavedDate",
  "eye-drop-currentIndex",
  "eye-drop-status",
  "eye-drop-pending-timer-finished",
  "eye-drop-timer-endTime-morning",
  "eye-drop-timer-endTime-lunch",
  "eye-drop-timer-endTime-dinner",
  "eye-drop-timer-endTime-bedtime",
  NOTIFICATION_SENT_STORAGE_KEY,
] as const;

const MANAGED_STORAGE_KEYS = [
  MEDICINES_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  TIMER_CHIME_SETTINGS_STORAGE_KEY,
  ...TEMPORARY_STORAGE_KEYS,
] as const;

type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";
type MedicineType = (typeof MEDICINE_TYPES)[number];
type StorageType = (typeof STORAGE_TYPES)[number];
type EyeTarget = (typeof EYE_TARGETS)[number];
type MedicineTiming = (typeof MEDICINE_TIMINGS)[number];

export interface EyeDropMedicine {
  id: number;
  name: string;
  instruction: string;
  type: MedicineType;
  storage: StorageType;
  requiresWiping: boolean;
  eyeTarget?: EyeTarget;
  timings?: MedicineTiming[];
  updatedAt?: string;
  status?: "active" | "archived";
  endedAt?: string;
}

export interface DailyEyeDropHistory {
  morning?: boolean;
  lunch?: boolean;
  evening?: boolean;
  bedtime?: boolean;
}

export type EyeDropHistory = Record<string, DailyEyeDropHistory>;

interface BackupImageManifest {
  medicineId: number;
  path: string;
  mimeType: SupportedImageMime;
  updatedAt: string;
  size: number;
}

export interface EyeDropBackupV1 {
  backupVersion: 1;
  appVersion: string;
  createdAt: string;
  data: {
    medicines: EyeDropMedicine[];
    history: EyeDropHistory;
    notificationSettings: LocalNotificationSettings;
    timerChimeSettings: TimerChimeSettings;
  };
  images: BackupImageManifest[];
}

export interface CreatedEyeDropBackup {
  fileName: string;
  blob: Blob;
  medicineCount: number;
  imageCount: number;
}

export interface PreparedEyeDropRestore {
  manifest: EyeDropBackupV1;
  photos: MedicinePhotoRecord[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CreateDependencies {
  storage?: StorageLike;
  getPhotos?: (ids: number[]) => Promise<Map<number, MedicinePhotoRecord>>;
  readNotifications?: () => LocalNotificationSettings;
  readTimerChime?: () => TimerChimeSettings;
}

interface RestoreDependencies {
  storage?: StorageLike;
  readPhotos?: () => Promise<MedicinePhotoRecord[]>;
  replacePhotos?: (records: MedicinePhotoRecord[]) => Promise<void>;
  dispatchChanges?: () => void;
}

export class EyeDropBackupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EyeDropBackupError";
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isValidIsoDate = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));

const readStoredJson = (storage: StorageLike, key: string, fallback: unknown) => {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new EyeDropBackupError("保存中のデータに破損があるため、バックアップを作成できません。", { cause: error });
  }
};

const validateMedicines = (value: unknown): EyeDropMedicine[] => {
  if (!Array.isArray(value)) throw new EyeDropBackupError("点眼薬データの形式が正しくありません。");

  const ids = new Set<number>();
  return value.map((item) => {
    if (
      !isPlainObject(item) ||
      typeof item.id !== "number" || !Number.isFinite(item.id) ||
      typeof item.name !== "string" || !item.name.trim() ||
      typeof item.instruction !== "string" ||
      !MEDICINE_TYPES.includes(item.type as MedicineType) ||
      !STORAGE_TYPES.includes(item.storage as StorageType) ||
      typeof item.requiresWiping !== "boolean"
    ) {
      throw new EyeDropBackupError("点眼薬データに読み込めない項目があります。");
    }
    if (ids.has(item.id)) throw new EyeDropBackupError("同じIDの点眼薬が重複しています。");
    ids.add(item.id);

    if (item.eyeTarget !== undefined && !EYE_TARGETS.includes(item.eyeTarget as EyeTarget)) {
      throw new EyeDropBackupError("対象の目の設定が正しくありません。");
    }
    if (item.timings !== undefined && (
      !Array.isArray(item.timings) ||
      item.timings.some((timing) => !MEDICINE_TIMINGS.includes(timing as MedicineTiming))
    )) {
      throw new EyeDropBackupError("点眼時間帯の設定が正しくありません。");
    }
    if (item.status !== undefined && item.status !== "active" && item.status !== "archived") {
      throw new EyeDropBackupError("点眼薬の使用状態が正しくありません。");
    }
    if (item.updatedAt !== undefined && !isValidIsoDate(item.updatedAt)) {
      throw new EyeDropBackupError("点眼薬の更新日時が正しくありません。");
    }
    if (item.endedAt !== undefined && !isValidIsoDate(item.endedAt)) {
      throw new EyeDropBackupError("点眼終了日時が正しくありません。");
    }

    return item as unknown as EyeDropMedicine;
  });
};

const validateHistory = (value: unknown): EyeDropHistory => {
  if (!isPlainObject(value)) throw new EyeDropBackupError("点眼履歴の形式が正しくありません。");
  const result: EyeDropHistory = {};
  for (const [date, dailyValue] of Object.entries(value)) {
    if (!DATE_KEY_PATTERN.test(date) || !isPlainObject(dailyValue)) {
      throw new EyeDropBackupError("点眼履歴に不正な日付または内容があります。");
    }
    const daily: DailyEyeDropHistory = {};
    for (const timing of ["morning", "lunch", "evening", "bedtime"] as const) {
      const completed = dailyValue[timing];
      if (completed !== undefined && typeof completed !== "boolean") {
        throw new EyeDropBackupError("点眼履歴の完了状態が正しくありません。");
      }
      if (completed !== undefined) daily[timing] = completed;
    }
    result[date] = daily;
  }
  return result;
};

const validateNotificationSettings = (value: unknown): LocalNotificationSettings => {
  if (!isPlainObject(value) || typeof value.enabled !== "boolean" || !isPlainObject(value.slots)) {
    throw new EyeDropBackupError("通知設定の形式が正しくありません。");
  }
  const sourceSlots = value.slots;
  const slots = {} as LocalNotificationSettings["slots"];
  NOTIFICATION_TIMINGS.forEach((timing) => {
    const slot = sourceSlots[timing];
    if (!isPlainObject(slot) || typeof slot.enabled !== "boolean" || typeof slot.time !== "string" || !TIME_PATTERN.test(slot.time)) {
      throw new EyeDropBackupError("通知時刻の設定が正しくありません。");
    }
    slots[timing] = { enabled: slot.enabled, time: slot.time };
  });
  return { enabled: value.enabled, slots };
};

const validateTimerChimeSettings = (value: unknown): TimerChimeSettings => {
  if (
    !isPlainObject(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.volume !== "number" || !Number.isFinite(value.volume) ||
    value.volume < 0 || value.volume > 1
  ) {
    throw new EyeDropBackupError("５分タイマー終了音の設定が正しくありません。");
  }
  return { enabled: value.enabled, volume: value.volume };
};

const detectImageMimeType = (bytes: Uint8Array): SupportedImageMime | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
};

const getImageExtension = (mimeType: SupportedImageMime) =>
  mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";

const copyToArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const readBlobBytes = async (blob: Blob) => {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(new Uint8Array(reader.result))
      : reject(new EyeDropBackupError("写真データを読み込めませんでした。"));
    reader.onerror = () => reject(new EyeDropBackupError("写真データを読み込めませんでした。", { cause: reader.error }));
    reader.readAsArrayBuffer(blob);
  });
};

const validateManifest = (value: unknown): EyeDropBackupV1 => {
  if (!isPlainObject(value)) throw new EyeDropBackupError("backup.jsonの形式が正しくありません。");
  if (value.backupVersion !== BACKUP_VERSION) {
    throw new EyeDropBackupError(`このバックアップ形式（Version ${String(value.backupVersion)}）には対応していません。`);
  }
  if (typeof value.appVersion !== "string" || !value.appVersion || !isValidIsoDate(value.createdAt) || !isPlainObject(value.data) || !Array.isArray(value.images)) {
    throw new EyeDropBackupError("backup.jsonに必要な情報がありません。");
  }

  const medicines = validateMedicines(value.data.medicines);
  const medicineIds = new Set(medicines.map((medicine) => medicine.id));
  const imageIds = new Set<number>();
  const imagePaths = new Set<string>();
  const images: BackupImageManifest[] = [];

  value.images.forEach((item) => {
    if (
      !isPlainObject(item) ||
      typeof item.medicineId !== "number" || !Number.isFinite(item.medicineId) ||
      typeof item.path !== "string" || !IMAGE_PATH_PATTERN.test(item.path) ||
      !["image/jpeg", "image/png", "image/webp"].includes(String(item.mimeType)) ||
      !isValidIsoDate(item.updatedAt) ||
      typeof item.size !== "number" || !Number.isInteger(item.size) || item.size <= 0
    ) {
      throw new EyeDropBackupError("写真の対応情報が正しくありません。");
    }
    const match = IMAGE_PATH_PATTERN.exec(item.path);
    const mimeType = item.mimeType as SupportedImageMime;
    if (
      !match || Number(match[1]) !== item.medicineId || match[2] !== getImageExtension(mimeType) ||
      !medicineIds.has(item.medicineId) || imageIds.has(item.medicineId) || imagePaths.has(item.path)
    ) {
      throw new EyeDropBackupError("写真と点眼薬の対応関係が正しくありません。");
    }
    imageIds.add(item.medicineId);
    imagePaths.add(item.path);
    images.push({ medicineId: item.medicineId, path: item.path, mimeType, updatedAt: item.updatedAt, size: item.size });
  });

  return {
    backupVersion: 1,
    appVersion: value.appVersion,
    createdAt: value.createdAt,
    data: {
      medicines,
      history: validateHistory(value.data.history),
      notificationSettings: validateNotificationSettings(value.data.notificationSettings),
      timerChimeSettings: validateTimerChimeSettings(value.data.timerChimeSettings),
    },
    images,
  };
};

const getLocalDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const createEyeDropBackup = async (dependencies: CreateDependencies = {}): Promise<CreatedEyeDropBackup> => {
  const storage = dependencies.storage ?? localStorage;
  const medicines = validateMedicines(readStoredJson(storage, MEDICINES_STORAGE_KEY, []));
  const history = validateHistory(readStoredJson(storage, HISTORY_STORAGE_KEY, {}));
  const notificationSettings = validateNotificationSettings((dependencies.readNotifications ?? readNotificationSettings)());
  const timerChimeSettings = validateTimerChimeSettings((dependencies.readTimerChime ?? readTimerChimeSettings)());
  const photoMap = await (dependencies.getPhotos ?? getMedicinePhotos)(medicines.map((medicine) => medicine.id));
  const zip = new JSZip();
  const images: BackupImageManifest[] = [];

  for (const medicine of medicines) {
    const photo = photoMap.get(medicine.id);
    if (!photo) continue;
    const bytes = await readBlobBytes(photo.blob);
    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) throw new EyeDropBackupError(`${medicine.name}の写真形式を確認できないため、バックアップを作成できません。`);
    const path = `images/medicine-${medicine.id}.${getImageExtension(mimeType)}`;
    zip.file(path, bytes);
    images.push({
      medicineId: medicine.id,
      path,
      mimeType,
      updatedAt: isValidIsoDate(photo.updatedAt) ? photo.updatedAt : new Date().toISOString(),
      size: bytes.byteLength,
    });
  }

  const manifest: EyeDropBackupV1 = {
    backupVersion: 1,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    data: { medicines, history, notificationSettings, timerChimeSettings },
    images,
  };
  zip.file("backup.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return {
    fileName: `eye-drops-backup-${getLocalDate()}.zip`,
    blob,
    medicineCount: medicines.length,
    imageCount: images.length,
  };
};

export const prepareEyeDropRestore = async (file: Blob): Promise<PreparedEyeDropRestore> => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readBlobBytes(file), { checkCRC32: true });
  } catch (error) {
    throw new EyeDropBackupError("ZIPファイルが壊れているか、点眼アプリのバックアップ形式ではありません。", { cause: error });
  }

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    const unsafeOriginalName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName;
    if (unsafeOriginalName && unsafeOriginalName !== entry.name) throw new EyeDropBackupError("ZIP内に安全でないファイル名があります。");
    if (entry.dir) {
      if (entry.name !== "images/") throw new EyeDropBackupError("ZIP内に不要なフォルダーがあります。");
    } else if (entry.name !== "backup.json" && !IMAGE_PATH_PATTERN.test(entry.name)) {
      throw new EyeDropBackupError("ZIP内にバックアップ対象外のファイルがあります。");
    }
  }

  const manifestEntry = zip.file("backup.json");
  if (!manifestEntry) throw new EyeDropBackupError("backup.jsonが見つかりません。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await manifestEntry.async("string"));
  } catch (error) {
    throw new EyeDropBackupError("backup.jsonを読み込めません。", { cause: error });
  }
  const manifest = validateManifest(parsed);
  const expectedPaths = new Set(manifest.images.map((image) => image.path));
  const actualImagePaths = entries.filter((entry) => !entry.dir && IMAGE_PATH_PATTERN.test(entry.name)).map((entry) => entry.name);
  if (actualImagePaths.length !== expectedPaths.size || actualImagePaths.some((path) => !expectedPaths.has(path))) {
    throw new EyeDropBackupError("backup.jsonと写真ファイルの内容が一致しません。");
  }

  const photos: MedicinePhotoRecord[] = [];
  for (const image of manifest.images) {
    const imageEntry = zip.file(image.path);
    if (!imageEntry) throw new EyeDropBackupError(`必要な写真（${image.path}）が見つかりません。`);
    const bytes = await imageEntry.async("uint8array");
    if (bytes.byteLength !== image.size || detectImageMimeType(bytes) !== image.mimeType) {
      throw new EyeDropBackupError(`写真（${image.path}）が破損しているか、形式が一致しません。`);
    }
    photos.push({
      medicineId: image.medicineId,
      blob: new Blob([copyToArrayBuffer(bytes)], { type: image.mimeType }),
      updatedAt: image.updatedAt,
    });
  }
  return { manifest, photos };
};

const snapshotStorage = (storage: StorageLike) =>
  new Map(MANAGED_STORAGE_KEYS.map((key) => [key, storage.getItem(key)] as const));

const restoreStorageSnapshot = (storage: StorageLike, snapshot: Map<string, string | null>) => {
  snapshot.forEach((value, key) => {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  });
};

export const restoreEyeDropBackup = async (prepared: PreparedEyeDropRestore, dependencies: RestoreDependencies = {}) => {
  const storage = dependencies.storage ?? localStorage;
  const readPhotos = dependencies.readPhotos ?? getAllMedicinePhotos;
  const replacePhotos = dependencies.replacePhotos ?? replaceMedicinePhotos;
  const dispatchChanges = dependencies.dispatchChanges ?? (() => {
    window.dispatchEvent(new Event(MEDICINE_DATA_CHANGED_EVENT));
    window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
    window.dispatchEvent(new Event(TIMER_CHIME_SETTINGS_CHANGED_EVENT));
  });
  const previousStorage = snapshotStorage(storage);
  const previousPhotos = await readPhotos();

  try {
    await replacePhotos(prepared.photos);
    storage.setItem(MEDICINES_STORAGE_KEY, JSON.stringify(prepared.manifest.data.medicines));
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(prepared.manifest.data.history));
    storage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(prepared.manifest.data.notificationSettings));
    storage.setItem(TIMER_CHIME_SETTINGS_STORAGE_KEY, JSON.stringify(prepared.manifest.data.timerChimeSettings));
    TEMPORARY_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
    dispatchChanges();
  } catch (error) {
    try {
      await replacePhotos(previousPhotos);
      restoreStorageSnapshot(storage, previousStorage);
      dispatchChanges();
    } catch (rollbackError) {
      throw new EyeDropBackupError("復元と元データへの差し戻しに失敗しました。アプリを閉じずに再度お試しください。", { cause: rollbackError });
    }
    throw new EyeDropBackupError("復元に失敗したため、復元前のデータに戻しました。", { cause: error });
  }
};
