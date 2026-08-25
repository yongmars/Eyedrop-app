export const EYE_DROP_SNAPSHOTS_STORAGE_KEY = "eye-drop-daily-snapshots-v1";
export const EYE_DROP_SNAPSHOTS_VERSION = 1;

export type EyeDropTiming = "morning" | "lunch" | "dinner" | "bedtime";
export type EyeDropProgressStatus = "pending" | "ok" | "towel" | "waiting" | "good";

export interface EyeDropSnapshotMedicineSource {
  id: number;
  name: string;
  type: "water" | "suspension" | "gel" | "ointment";
  timings?: Array<EyeDropTiming | "as_needed">;
  status?: "active" | "archived";
}

export interface EyeDropTimingProgress {
  currentIndex: number;
  status: EyeDropProgressStatus;
  timeLeft: number;
}

export type EyeDropProgressStates = Partial<Record<EyeDropTiming, EyeDropTimingProgress>>;

export interface EyeDropSnapshotMedicine {
  medicineId: number;
  name: string;
  scheduled: true;
  completed: boolean;
}

export interface EyeDropTimingSnapshot {
  medicines: EyeDropSnapshotMedicine[];
}

export interface DailyEyeDropSnapshot {
  finalizedAt?: string;
  timings: Partial<Record<EyeDropTiming, EyeDropTimingSnapshot>>;
}

export interface EyeDropSnapshotStore {
  version: 1;
  trackingStartedOn: string;
  lastProcessedDate: string;
  days: Record<string, DailyEyeDropSnapshot>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EYE_DROP_TIMINGS: EyeDropTiming[] = ["morning", "lunch", "dinner", "bedtime"];
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TYPE_ORDER: Record<EyeDropSnapshotMedicineSource["type"], number> = { water: 1, suspension: 2, gel: 3, ointment: 4 };
const VALID_STATUSES = new Set<EyeDropProgressStatus>(["pending", "ok", "towel", "waiting", "good"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isValidIsoDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export const getEyeDropAppDateString = (date: Date = new Date()) => {
  const adjusted = new Date(date);
  adjusted.setHours(adjusted.getHours() - 4);
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, "0")}-${String(adjusted.getDate()).padStart(2, "0")}`;
};

const addAppDateDays = (appDate: string, days: number) => {
  const [year, month, day] = appDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const scheduledMedicines = (medicines: EyeDropSnapshotMedicineSource[], timing: EyeDropTiming) =>
  medicines
    .filter((medicine) => medicine.status !== "archived" && medicine.timings?.includes(timing) && !medicine.timings.includes("as_needed"))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id - b.id);

const isCompletedAtIndex = (state: EyeDropTimingProgress | undefined, index: number, total: number) => {
  if (!state) return false;
  if (state.status === "good") return total > 0;
  if (state.status === "pending") return index < state.currentIndex;
  return index <= state.currentIndex;
};

const buildDaySnapshot = (
  medicines: EyeDropSnapshotMedicineSource[],
  progressStates: EyeDropProgressStates | undefined,
  existing?: DailyEyeDropSnapshot,
): DailyEyeDropSnapshot => {
  const timings: DailyEyeDropSnapshot["timings"] = {};
  EYE_DROP_TIMINGS.forEach((timing) => {
    const scheduled = scheduledMedicines(medicines, timing);
    if (scheduled.length === 0) return;
    const existingItems = existing?.timings[timing]?.medicines ?? [];
    timings[timing] = {
      medicines: scheduled.map((medicine, index) => ({
        medicineId: medicine.id,
        name: medicine.name,
        scheduled: true,
        completed: existingItems.find((item) => item.medicineId === medicine.id)?.completed === true ||
          isCompletedAtIndex(progressStates?.[timing], index, scheduled.length),
      })),
    };
  });
  return { finalizedAt: existing?.finalizedAt, timings };
};

const normalizeProgressStates = (value: unknown): EyeDropProgressStates => {
  if (!isPlainObject(value)) return {};
  const states: EyeDropProgressStates = {};
  EYE_DROP_TIMINGS.forEach((timing) => {
    const state = value[timing];
    if (!isPlainObject(state) || typeof state.currentIndex !== "number" || !Number.isInteger(state.currentIndex) || state.currentIndex < 0 || typeof state.status !== "string" || !VALID_STATUSES.has(state.status as EyeDropProgressStatus) || typeof state.timeLeft !== "number" || !Number.isFinite(state.timeLeft)) return;
    states[timing] = { currentIndex: state.currentIndex, status: state.status as EyeDropProgressStatus, timeLeft: state.timeLeft };
  });
  return states;
};

export const normalizeEyeDropSnapshotStore = (value: unknown): EyeDropSnapshotStore | null => {
  if (!isPlainObject(value) || value.version !== EYE_DROP_SNAPSHOTS_VERSION || !DATE_KEY_PATTERN.test(String(value.trackingStartedOn)) || !DATE_KEY_PATTERN.test(String(value.lastProcessedDate)) || !isPlainObject(value.days)) return null;
  const days: EyeDropSnapshotStore["days"] = {};
  for (const [date, dayValue] of Object.entries(value.days)) {
    if (!DATE_KEY_PATTERN.test(date) || !isPlainObject(dayValue) || !isPlainObject(dayValue.timings)) return null;
    if (dayValue.finalizedAt !== undefined && !isValidIsoDate(dayValue.finalizedAt)) return null;
    const timings: DailyEyeDropSnapshot["timings"] = {};
    for (const [timing, timingValue] of Object.entries(dayValue.timings)) {
      if (!EYE_DROP_TIMINGS.includes(timing as EyeDropTiming) || !isPlainObject(timingValue) || !Array.isArray(timingValue.medicines)) return null;
      const ids = new Set<number>();
      const snapshotMedicines: EyeDropSnapshotMedicine[] = [];
      for (const medicine of timingValue.medicines) {
        if (!isPlainObject(medicine) || typeof medicine.medicineId !== "number" || !Number.isFinite(medicine.medicineId) || ids.has(medicine.medicineId) || typeof medicine.name !== "string" || !medicine.name.trim() || medicine.scheduled !== true || typeof medicine.completed !== "boolean") return null;
        ids.add(medicine.medicineId);
        snapshotMedicines.push({ medicineId: medicine.medicineId, name: medicine.name.trim(), scheduled: true, completed: medicine.completed });
      }
      if (snapshotMedicines.length === 0) return null;
      timings[timing as EyeDropTiming] = { medicines: snapshotMedicines };
    }
    days[date] = { finalizedAt: dayValue.finalizedAt as string | undefined, timings };
  }
  return { version: 1, trackingStartedOn: String(value.trackingStartedOn), lastProcessedDate: String(value.lastProcessedDate), days };
};

export const readEyeDropSnapshotStore = (storage: StorageLike = localStorage): EyeDropSnapshotStore | null => {
  const raw = storage.getItem(EYE_DROP_SNAPSHOTS_STORAGE_KEY);
  if (!raw) return null;
  try { return normalizeEyeDropSnapshotStore(JSON.parse(raw)); } catch { return null; }
};

export const saveEyeDropSnapshotStore = (store: EyeDropSnapshotStore, storage: StorageLike = localStorage) => {
  storage.setItem(EYE_DROP_SNAPSHOTS_STORAGE_KEY, JSON.stringify(store));
};

export const syncEyeDropSnapshots = ({
  medicines,
  progressStates,
  progressDate,
  currentDate = getEyeDropAppDateString(),
  storage = localStorage,
  now = new Date(),
}: {
  medicines: EyeDropSnapshotMedicineSource[];
  progressStates?: EyeDropProgressStates;
  progressDate?: string | null;
  currentDate?: string;
  storage?: StorageLike;
  now?: Date;
}) => {
  const existingStore = readEyeDropSnapshotStore(storage);
  if (!existingStore) {
    const store: EyeDropSnapshotStore = {
      version: 1,
      trackingStartedOn: currentDate,
      lastProcessedDate: currentDate,
      days: { [currentDate]: buildDaySnapshot(medicines, progressDate === currentDate ? progressStates : undefined) },
    };
    saveEyeDropSnapshotStore(store, storage);
    return store;
  }

  const store: EyeDropSnapshotStore = { ...existingStore, days: { ...existingStore.days } };
  if (progressDate && progressDate >= store.trackingStartedOn && progressDate <= store.lastProcessedDate && store.days[progressDate] && !store.days[progressDate].finalizedAt) {
    store.days[progressDate] = buildDaySnapshot(medicines, progressStates, store.days[progressDate]);
  }

  if (store.lastProcessedDate < currentDate) {
    const finalizedAt = now.toISOString();
    let date = store.lastProcessedDate;
    while (date < currentDate) {
      const previous = store.days[date];
      if (previous && !previous.finalizedAt) store.days[date] = { ...previous, finalizedAt };
      date = addAppDateDays(date, 1);
      if (!store.days[date]) store.days[date] = buildDaySnapshot(medicines, undefined);
    }
    store.lastProcessedDate = currentDate;
  }

  if (currentDate >= store.trackingStartedOn) {
    store.days[currentDate] = buildDaySnapshot(medicines, progressDate === currentDate ? progressStates : undefined, store.days[currentDate]);
  }
  saveEyeDropSnapshotStore(store, storage);
  return store;
};

export const syncEyeDropSnapshotsFromStorage = (
  medicines: EyeDropSnapshotMedicineSource[],
  currentDate: string = getEyeDropAppDateString(),
  storage: StorageLike = localStorage,
) => {
  const progressDate = storage.getItem("eye-drop-lastSavedDate");
  let progressStates: EyeDropProgressStates = {};
  const rawStates = storage.getItem("eye-drop-timingStates");
  if (rawStates) {
    try { progressStates = normalizeProgressStates(JSON.parse(rawStates)); } catch { progressStates = {}; }
  }
  return syncEyeDropSnapshots({ medicines, progressStates, progressDate, currentDate, storage });
};

export const reconcileCurrentEyeDropSnapshot = (
  medicines: EyeDropSnapshotMedicineSource[],
  currentDate: string = getEyeDropAppDateString(),
  storage: StorageLike = localStorage,
) => {
  const store = readEyeDropSnapshotStore(storage);
  if (!store || currentDate < store.trackingStartedOn) return syncEyeDropSnapshots({ medicines, currentDate, storage });
  if (store.days[currentDate]?.finalizedAt) return store;
  const next: EyeDropSnapshotStore = {
    ...store,
    days: { ...store.days, [currentDate]: buildDaySnapshot(medicines, undefined, store.days[currentDate]) },
  };
  saveEyeDropSnapshotStore(next, storage);
  return next;
};

export const markEyeDropSnapshotCompleted = (
  medicineId: number,
  timing: EyeDropTiming,
  currentDate: string = getEyeDropAppDateString(),
  storage: StorageLike = localStorage,
) => {
  const store = readEyeDropSnapshotStore(storage);
  const day = store?.days[currentDate];
  const timingSnapshot = day?.timings[timing];
  if (!store || !day || day.finalizedAt || !timingSnapshot) return store;
  const nextMedicines = timingSnapshot.medicines.map((medicine) =>
    medicine.medicineId === medicineId ? { ...medicine, completed: true } : medicine
  );
  const next: EyeDropSnapshotStore = {
    ...store,
    days: {
      ...store.days,
      [currentDate]: {
        ...day,
        timings: {
          ...day.timings,
          [timing]: { medicines: nextMedicines },
        },
      },
    },
  };
  saveEyeDropSnapshotStore(next, storage);
  return next;
};
