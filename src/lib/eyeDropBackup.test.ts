import "fake-indexeddb/auto";
import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_VERSION,
  createEyeDropBackup,
  EyeDropBackupV1,
  EyeDropMedicine,
  HISTORY_STORAGE_KEY,
  MEDICINES_STORAGE_KEY,
  prepareEyeDropRestore,
  PreparedEyeDropRestore,
  restoreEyeDropBackup,
} from "./eyeDropBackup";
import { getAllMedicinePhotos, replaceMedicinePhotos } from "./medicinePhotos";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SENT_STORAGE_KEY,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
} from "./localNotifications";
import { TIMER_CHIME_SETTINGS_STORAGE_KEY } from "./timerChime";

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

const copyToArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const activeMedicine: EyeDropMedicine = {
  id: 1,
  name: "朝の点眼薬",
  instruction: "右目に1滴",
  type: "suspension",
  storage: "room",
  requiresWiping: true,
  eyeTarget: "right",
  timings: ["morning", "bedtime"],
  updatedAt: "2026-08-24T00:00:00.000Z",
};

const archivedMedicine: EyeDropMedicine = {
  id: 2,
  name: "過去の点眼薬",
  instruction: "両目に1滴",
  type: "water",
  storage: "cold",
  requiresWiping: false,
  eyeTarget: "both",
  timings: ["lunch"],
  status: "archived",
  endedAt: "2026-08-20T00:00:00.000Z",
};

const timerChimeSettings = { enabled: false, volume: 0.25 };

const baseManifest = (): EyeDropBackupV1 => ({
  backupVersion: BACKUP_VERSION,
  appVersion: "1.3.5",
  createdAt: "2026-08-24T03:00:00.000Z",
  data: {
    medicines: [activeMedicine, archivedMedicine],
    history: {
      "2026-08-23": { morning: true, lunch: false, evening: true, bedtime: true },
    },
    notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
    timerChimeSettings,
  },
  images: [],
});

const makeZip = async (manifest: unknown, additions: Record<string, Uint8Array | string> = {}) => {
  const zip = new JSZip();
  zip.file("backup.json", typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  Object.entries(additions).forEach(([path, contents]) => zip.file(path, contents));
  return new Blob([copyToArrayBuffer(await zip.generateAsync({ type: "uint8array" }))], { type: "application/zip" });
};

const expectRejectedWithoutChanges = async (file: Blob, message: RegExp) => {
  localStorage.setItem(MEDICINES_STORAGE_KEY, "existing-data");
  await expect(prepareEyeDropRestore(file)).rejects.toThrow(message);
  expect(localStorage.getItem(MEDICINES_STORAGE_KEY)).toBe("existing-data");
};

beforeEach(async () => {
  localStorage.clear();
  await replaceMedicinePhotos([]);
});

describe("eye drop backup", () => {
  it("使用中・終了済みの点眼薬、履歴、設定、写真をZIPで往復できる", async () => {
    const history = baseManifest().data.history;
    localStorage.setItem(MEDICINES_STORAGE_KEY, JSON.stringify([activeMedicine, archivedMedicine]));
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    localStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS));
    localStorage.setItem(TIMER_CHIME_SETTINGS_STORAGE_KEY, JSON.stringify(timerChimeSettings));
    const linkedPhotos = new Map([
      [1, { medicineId: 1, blob: new Blob([copyToArrayBuffer(jpegBytes)], { type: "image/jpeg" }), updatedAt: "2026-08-24T01:00:00.000Z" }],
      [2, { medicineId: 2, blob: new Blob([copyToArrayBuffer(jpegBytes)], { type: "image/jpeg" }), updatedAt: "2026-08-24T02:00:00.000Z" }],
      [999, { medicineId: 999, blob: new Blob([copyToArrayBuffer(jpegBytes)], { type: "image/jpeg" }), updatedAt: "2026-08-24T02:00:00.000Z" }],
    ]);

    const created = await createEyeDropBackup({
      getPhotos: async (ids) => new Map([...linkedPhotos].filter(([id]) => ids.includes(id))),
    });
    expect(created.fileName).toMatch(/^eye-drops-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(created.medicineCount).toBe(2);
    expect(created.imageCount).toBe(2);
    const zip = await JSZip.loadAsync(await created.blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      "backup.json",
      "images/",
      "images/medicine-1.jpg",
      "images/medicine-2.jpg",
    ]);

    localStorage.setItem(MEDICINES_STORAGE_KEY, JSON.stringify([{ ...activeMedicine, name: "置換前" }]));
    localStorage.setItem(NOTIFICATION_SENT_STORAGE_KEY, JSON.stringify({ stale: true }));
    localStorage.setItem("eye-drop-timingStates", JSON.stringify({ stale: true }));
    await replaceMedicinePhotos([]);
    const prepared = await prepareEyeDropRestore(created.blob);
    await restoreEyeDropBackup(prepared);

    expect(JSON.parse(localStorage.getItem(MEDICINES_STORAGE_KEY) ?? "[]")).toEqual([activeMedicine, archivedMedicine]);
    expect(JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? "{}")).toEqual(history);
    expect(JSON.parse(localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY) ?? "{}")).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(JSON.parse(localStorage.getItem(TIMER_CHIME_SETTINGS_STORAGE_KEY) ?? "{}")).toEqual(timerChimeSettings);
    expect(localStorage.getItem(NOTIFICATION_SENT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("eye-drop-timingStates")).toBeNull();
    const photos = await getAllMedicinePhotos();
    expect(photos.map((photo) => photo.medicineId).sort()).toEqual([1, 2]);
    expect(prepared.manifest.data.medicines[1].status).toBe("archived");
    expect(prepared.manifest.data.medicines[0].status).toBeUndefined();
  });

  it("壊れたZIPとbackup.jsonがないZIPを拒否する", async () => {
    await expectRejectedWithoutChanges(new Blob(["not-a-zip"]), /ZIPファイルが壊れている/);
    const zip = new JSZip();
    zip.file("images/medicine-1.jpg", jpegBytes);
    await expectRejectedWithoutChanges(new Blob([copyToArrayBuffer(await zip.generateAsync({ type: "uint8array" }))]), /backup\.jsonが見つかりません/);
  });

  it("対応外backupVersionと不正JSONを拒否する", async () => {
    await expectRejectedWithoutChanges(await makeZip({ ...baseManifest(), backupVersion: 2 }), /対応していません/);
    await expectRejectedWithoutChanges(await makeZip("{broken"), /backup\.jsonを読み込めません/);
  });

  it("重複した薬IDと不正な写真パスを拒否する", async () => {
    const duplicate = baseManifest();
    duplicate.data.medicines = [activeMedicine, { ...archivedMedicine, id: 1 }];
    await expectRejectedWithoutChanges(await makeZip(duplicate), /重複/);

    const invalidPath = baseManifest();
    invalidPath.images = [{ medicineId: 1, path: "../medicine-1.jpg", mimeType: "image/jpeg", updatedAt: "2026-08-24T00:00:00.000Z", size: jpegBytes.byteLength }];
    await expectRejectedWithoutChanges(await makeZip(invalidPath, { "../medicine-1.jpg": jpegBytes }), /安全でない|不要なフォルダー|対応情報/);
  });

  it("写真の欠落と破損を拒否する", async () => {
    const missing = baseManifest();
    missing.images = [{ medicineId: 1, path: "images/medicine-1.jpg", mimeType: "image/jpeg", updatedAt: "2026-08-24T00:00:00.000Z", size: jpegBytes.byteLength }];
    await expectRejectedWithoutChanges(await makeZip(missing), /内容が一致|見つかりません/);
    await expectRejectedWithoutChanges(await makeZip(missing, { "images/medicine-1.jpg": new Uint8Array([1, 2, 3]) }), /破損/);
  });

  it("localStorage書込み失敗時は写真と保存値を復元前へ戻す", async () => {
    const values = new Map<string, string>([[MEDICINES_STORAGE_KEY, "before"]]);
    let shouldFail = true;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === MEDICINES_STORAGE_KEY && shouldFail) { shouldFail = false; throw new Error("quota"); }
        values.set(key, value);
      },
      removeItem: (key: string) => { values.delete(key); },
    };
    const oldPhotos = [{ medicineId: 9, blob: new Blob([copyToArrayBuffer(jpegBytes)], { type: "image/jpeg" }), updatedAt: "2026-08-24T00:00:00.000Z" }];
    let currentPhotos = oldPhotos;
    const prepared: PreparedEyeDropRestore = { manifest: baseManifest(), photos: [] };
    await expect(restoreEyeDropBackup(prepared, {
      storage,
      readPhotos: async () => oldPhotos,
      replacePhotos: async (records) => { currentPhotos = records; },
      dispatchChanges: () => undefined,
    })).rejects.toThrow(/復元前のデータに戻しました/);
    expect(values.get(MEDICINES_STORAGE_KEY)).toBe("before");
    expect(currentPhotos).toBe(oldPhotos);
  });

  it("写真書込み失敗時はlocalStorageを変更しない", async () => {
    localStorage.setItem(MEDICINES_STORAGE_KEY, "before");
    let calls = 0;
    await expect(restoreEyeDropBackup({ manifest: baseManifest(), photos: [] }, {
      readPhotos: async () => [],
      replacePhotos: async () => { calls += 1; if (calls === 1) throw new Error("photo failure"); },
      dispatchChanges: () => undefined,
    })).rejects.toThrow(/復元前のデータに戻しました/);
    expect(localStorage.getItem(MEDICINES_STORAGE_KEY)).toBe("before");
  });
});
