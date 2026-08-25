import { beforeEach, describe, expect, it } from "vitest";
import {
  EyeDropSnapshotMedicineSource,
  getEyeDropAppDateString,
  markEyeDropSnapshotCompleted,
  readEyeDropSnapshotStore,
  reconcileCurrentEyeDropSnapshot,
  syncEyeDropSnapshots,
} from "./eyeDropSnapshots";

const medicine = (overrides: Partial<EyeDropSnapshotMedicineSource> = {}): EyeDropSnapshotMedicineSource => ({
  id: 1,
  name: "A点眼薬",
  type: "water",
  timings: ["morning"],
  status: "active",
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe("eye drop snapshots", () => {
  it("午前4時を日付境界として扱う", () => {
    expect(getEyeDropAppDateString(new Date(2026, 7, 25, 3, 59))).toBe("2026-08-24");
    expect(getEyeDropAppDateString(new Date(2026, 7, 25, 4, 0))).toBe("2026-08-25");
  });

  it("初回起動では当日だけを作成して過去日を推測しない", () => {
    const store = syncEyeDropSnapshots({ medicines: [medicine()], progressDate: "2026-08-24", currentDate: "2026-08-25", storage: localStorage });
    expect(store.trackingStartedOn).toBe("2026-08-25");
    expect(Object.keys(store.days)).toEqual(["2026-08-25"]);
    expect(store.days["2026-08-25"].timings.morning?.medicines[0].completed).toBe(false);
  });

  it.each([
    ["pending", 1, [true, false, false]],
    ["ok", 1, [true, true, false]],
    ["towel", 1, [true, true, false]],
    ["waiting", 1, [true, true, false]],
    ["good", 0, [true, true, true]],
  ] as const)("%s状態を薬別の完了結果へ変換する", (status, currentIndex, expected) => {
    const medicines = [medicine(), medicine({ id: 2, name: "B点眼薬" }), medicine({ id: 3, name: "C点眼薬" })];
    const store = syncEyeDropSnapshots({ medicines, progressDate: "2026-08-25", currentDate: "2026-08-25", progressStates: { morning: { currentIndex, status, timeLeft: 0 } }, storage: localStorage });
    expect(store.days["2026-08-25"].timings.morning?.medicines.map((item) => item.completed)).toEqual(expected);
  });

  it("複数日未起動時は最終日を確定し、中間日を記録なしで補完する", () => {
    syncEyeDropSnapshots({ medicines: [medicine()], progressDate: "2026-08-25", currentDate: "2026-08-25", progressStates: { morning: { currentIndex: 0, status: "good", timeLeft: 0 } }, storage: localStorage });
    const store = syncEyeDropSnapshots({ medicines: [medicine()], progressDate: "2026-08-25", currentDate: "2026-08-28", progressStates: { morning: { currentIndex: 0, status: "good", timeLeft: 0 } }, storage: localStorage, now: new Date("2026-08-28T00:00:00Z") });
    expect(store.days["2026-08-25"].finalizedAt).toBeTruthy();
    expect(store.days["2026-08-26"].timings.morning?.medicines[0].completed).toBe(false);
    expect(store.days["2026-08-27"].finalizedAt).toBeTruthy();
    expect(store.days["2026-08-28"].finalizedAt).toBeUndefined();
  });

  it("点眼操作を即時保存し、古い進捗で未完了へ戻さない", () => {
    syncEyeDropSnapshots({ medicines: [medicine()], progressDate: "2026-08-25", currentDate: "2026-08-25", progressStates: { morning: { currentIndex: 0, status: "pending", timeLeft: 300 } }, storage: localStorage });
    expect(readEyeDropSnapshotStore()?.days["2026-08-25"].timings.morning?.medicines).toHaveLength(1);
    markEyeDropSnapshotCompleted(1, "morning", "2026-08-25", localStorage);
    const store = syncEyeDropSnapshots({ medicines: [medicine()], progressDate: "2026-08-25", currentDate: "2026-08-25", progressStates: { morning: { currentIndex: 0, status: "pending", timeLeft: 300 } }, storage: localStorage });
    expect(store.days["2026-08-25"].timings.morning?.medicines[0].completed).toBe(true);
  });

  it("薬名・時間帯・終了・削除・ID再利用でも過去日を変えない", () => {
    syncEyeDropSnapshots({ medicines: [medicine()], progressDate: "2026-08-24", currentDate: "2026-08-24", storage: localStorage });
    syncEyeDropSnapshots({ medicines: [medicine()], progressDate: "2026-08-24", currentDate: "2026-08-25", storage: localStorage });
    reconcileCurrentEyeDropSnapshot([medicine({ name: "変更後", timings: ["bedtime"] })], "2026-08-25", localStorage);
    reconcileCurrentEyeDropSnapshot([], "2026-08-25", localStorage);
    reconcileCurrentEyeDropSnapshot([medicine({ name: "再利用されたID" })], "2026-08-25", localStorage);
    const store = readEyeDropSnapshotStore();
    expect(store?.days["2026-08-24"].timings.morning?.medicines[0].name).toBe("A点眼薬");
    expect(store?.days["2026-08-25"].timings.morning?.medicines[0].name).toBe("再利用されたID");
  });
});
