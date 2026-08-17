"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  isNotificationSupported,
  LocalNotificationSettings,
  MEDICINE_DATA_CHANGED_EVENT,
  NOTIFICATION_TIMINGS,
  NOTIFICATION_TIMING_LABELS,
  NotificationTiming,
  readNotificationSettings,
  saveNotificationSettings,
} from "../../lib/localNotifications";
import {
  DEFAULT_TIMER_CHIME_SETTINGS,
  playTimerChime,
  readTimerChimeSettings,
  saveTimerChimeSettings,
  TimerChimeSettings,
} from "../../lib/timerChime";
import {
  clearMedicinePhotos,
  compressMedicinePhoto,
  deleteMedicinePhoto,
  getMedicinePhoto,
  MedicinePhotoRecord,
  saveMedicinePhoto,
} from "../../lib/medicinePhotos";
import {
  getActiveMedicines,
  getArchivedMedicines,
  MedicineStatusFields,
} from "../../lib/medicineStatus";

type MedicineType = "water" | "suspension" | "gel" | "ointment";
type StorageType = "room" | "cold";
type TimingType = "morning" | "lunch" | "dinner" | "bedtime" | "as_needed";

interface Medicine extends MedicineStatusFields {
  id: number;
  name: string;
  instruction: string;
  type: MedicineType;
  storage: StorageType;
  requiresWiping: boolean;
  eyeTarget?: "both" | "right" | "left";
  timings?: TimingType[];
  updatedAt?: string;
}

interface SnackbarState {
  visible: boolean;
  message: string;
  actionType: "delete" | "edit" | null;
  prevData: Medicine | null;
  prevPhoto: MedicinePhotoRecord | null;
  photoChanged: boolean;
}

interface CSVMedicine {
  name: string;
  kana: string;
  type: string;
  storage: string;
  shake: string;
  wiping: string;
}

const typeOrder: Record<MedicineType, number> = {
  water: 1,
  suspension: 2,
  gel: 3,
  ointment: 4,
};

const initialMedicines: Medicine[] = [];
const UPDATE_VERSION = "v1.3.4";

const sortMedicines = (list: Medicine[]): Medicine[] => {
  return [...list].sort((a, b) => {
    const diff = typeOrder[a.type] - typeOrder[b.type];
    if (diff === 0) {
      return a.id - b.id;
    }
    return diff;
  });
};

export default function SettingsPage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const router = useRouter();

  // 登録フォーム用のステート
  const [newName, setNewName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [eyeTarget, setEyeTarget] = useState<"both" | "right" | "left">("both");
  const [newType, setNewType] = useState<MedicineType>("water");
  const [newStorage, setNewStorage] = useState<StorageType>("room");
  const [newRequiresWiping, setNewRequiresWiping] = useState(false);
  const [newTimings, setNewTimings] = useState<TimingType[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const galleryPhotoInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoInputRef = useRef<HTMLInputElement>(null);
  const originalPhotoRef = useRef<MedicinePhotoRecord | null>(null);
  const photoLoadTokenRef = useRef(0);
  const photoPreviewUrlRef = useRef<string | null>(null);
  const pastPhotoUrlRef = useRef<string | null>(null);
  const pastPhotoLoadTokenRef = useRef(0);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null);
  const [photoRemovalPending, setPhotoRemovalPending] = useState(false);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [isPhotoProcessing, setIsPhotoProcessing] = useState(false);
  const [isSavingMedicine, setIsSavingMedicine] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [pastDetailId, setPastDetailId] = useState<number | null>(null);
  const [pastPhotoUrl, setPastPhotoUrl] = useState<string | null>(null);
  const [isPastPhotoLoading, setIsPastPhotoLoading] = useState(false);

  // フォームのアコーディオン開閉状態
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);
  const [isPastMedicinesOpen, setIsPastMedicinesOpen] = useState(false);

  // オートコンプリート用のステート
  const [csvMedicines, setCsvMedicines] = useState<CSVMedicine[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // スナックバー用ステートとタイマー
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    visible: false,
    message: "",
    actionType: null,
    prevData: null,
    prevPhoto: null,
    photoChanged: false,
  });
  const snackbarTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 登録済みの目薬リスト用のステート
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const activeMedicines = useMemo(() => getActiveMedicines(medicines), [medicines]);
  const archivedMedicines = useMemo(() => getArchivedMedicines(medicines), [medicines]);

  // ヘルプ・アップデート・ライセンス用モーダルステート
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);
  const [hasReadUpdate, setHasReadUpdate] = useState(true);
  const [notificationSettings, setNotificationSettings] =
    useState<LocalNotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  );
  const [timerChimeSettings, setTimerChimeSettings] =
    useState<TimerChimeSettings>(DEFAULT_TIMER_CHIME_SETTINGS);

  // アンマウント時にタイマーをクリーンアップ
  useEffect(() => {
    return () => {
      if (snackbarTimerRef.current) {
        clearTimeout(snackbarTimerRef.current);
      }
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current);
      }
      if (pastPhotoUrlRef.current) {
        URL.revokeObjectURL(pastPhotoUrlRef.current);
      }
    };
  }, []);

  // medicines.csvのフェッチとパース
  useEffect(() => {
    const fetchCSV = async () => {
      try {
        const res = await fetch(`${basePath}/medicines.csv`);
        if (!res.ok) throw new Error("Failed to fetch medicines.csv");
        const text = await res.text();
        const lines = text.split(/\r?\n/);
        const parsed: CSVMedicine[] = [];
        
        // 1行目はヘッダーなのでスキップ
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(",");
          if (cols.length >= 6 && cols[0].trim()) {
            parsed.push({
              name: cols[0].trim(),
              kana: cols[1].trim(),
              type: cols[2].trim(),
              storage: cols[3].trim(),
              shake: cols[4].trim(),
              wiping: cols[5].trim(),
            });
          }
        }
        setCsvMedicines(parsed);
      } catch (err) {
        console.error("Error loading medicines.csv:", err);
      }
    };
    fetchCSV();
  }, [basePath]);

  // サジェストエリア外のクリックを検知して閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 入力値に基づいてサジェストをフィルタリング
  const suggestions = useMemo(() => {
    if (!newName.trim() || csvMedicines.length === 0) {
      return [];
    }

    const query = newName.trim().toLowerCase();
    const filtered = csvMedicines.filter((med) => {
      const name = med.name.toLowerCase();
      const kana = med.kana.toLowerCase();
      return name.includes(query) || kana.includes(query);
    });

    // 前方一致を優先してソート (販売名、またはよみがなのいずれかが前方一致する場合)
    const sorted = [...filtered].sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(query) || a.kana.toLowerCase().startsWith(query);
      const bStarts = b.name.toLowerCase().startsWith(query) || b.kana.toLowerCase().startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    });

    return sorted.slice(0, 8); // 最大8件表示
  }, [newName, csvMedicines]);

  // サジェスト選択時の連動処理
  const handleSelectSuggestion = (med: CSVMedicine) => {
    setNewName(med.name);
    setShowSuggestions(false);

    // 1. 薬のタイプ自動選択
    const typeStr = med.type;
    if (typeStr.includes("懸濁")) {
      setNewType("suspension");
    } else if (typeStr.includes("ゲル")) {
      setNewType("gel");
    } else if (typeStr.includes("軟膏")) {
      setNewType("ointment");
    } else {
      setNewType("water"); // デフォルトは水性
    }

    // 2. 保管場所自動選択
    const storageStr = med.storage;
    if (storageStr.includes("冷所")) {
      setNewStorage("cold");
    } else {
      setNewStorage("room");
    }

    // 3. 点眼後の拭き取り・洗顔が必要の自動チェック
    const wipingStr = med.wiping;
    if (wipingStr.includes("必要")) {
      setNewRequiresWiping(true);
    } else {
      setNewRequiresWiping(false);
    }
  };

  // マウント時にlocalStorageからロード
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("my_medication_data");
    let currentMeds = [];
    if (saved) {
      try {
        currentMeds = JSON.parse(saved);
        setMedicines(currentMeds);
      } catch (e) {
        console.error("Failed to parse medicines", e);
      }
    } else {
      currentMeds = sortMedicines(initialMedicines);
      setMedicines(currentMeds);
    }

    // アップデート情報既読確認
    const readRecord = localStorage.getItem(`read_update_${UPDATE_VERSION}`);
    if (readRecord === "true") {
      setHasReadUpdate(true);
    } else {
      setHasReadUpdate(false);
    }

    setNotificationSettings(readNotificationSettings());
    setNotificationPermission(isNotificationSupported() ? Notification.permission : "unsupported");
    setTimerChimeSettings(readTimerChimeSettings());
  }, []);

  // アップデート情報ボタンクリック時の処理
  const handleUpdateClick = () => {
    setIsUpdateOpen(true);
    localStorage.setItem(`read_update_${UPDATE_VERSION}`, "true");
    setHasReadUpdate(true);
  };

  const handleTimingChange = (timing: TimingType) => {
    setNewTimings((prev) =>
      prev.includes(timing)
        ? prev.filter((t) => t !== timing)
        : [...prev, timing]
    );
  };

  const updateNotificationSettings = (nextSettings: LocalNotificationSettings) => {
    setNotificationSettings(nextSettings);
    saveNotificationSettings(nextSettings);
  };

  const notifyMedicineDataChanged = () => {
    window.dispatchEvent(new Event(MEDICINE_DATA_CHANGED_EVENT));
  };

  const handleNotificationMasterToggle = (enabled: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      enabled,
    });
  };

  const handleNotificationSlotToggle = (timing: NotificationTiming, enabled: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      slots: {
        ...notificationSettings.slots,
        [timing]: {
          ...notificationSettings.slots[timing],
          enabled,
        },
      },
    });
  };

  const handleNotificationTimeChange = (timing: NotificationTiming, time: string) => {
    updateNotificationSettings({
      ...notificationSettings,
      slots: {
        ...notificationSettings.slots,
        [timing]: {
          ...notificationSettings.slots[timing],
          time,
        },
      },
    });
  };

  const handleNotificationPermissionRequest = async () => {
    if (!isNotificationSupported()) {
      setNotificationPermission("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const handleTimerChimeToggle = (enabled: boolean) => {
    const nextSettings = {
      ...timerChimeSettings,
      enabled,
    };
    setTimerChimeSettings(nextSettings);
    saveTimerChimeSettings(nextSettings);
  };

  const handleTimerChimeVolumeChange = (volume: number) => {
    const nextSettings = {
      ...timerChimeSettings,
      volume,
    };
    setTimerChimeSettings(nextSettings);
    saveTimerChimeSettings(nextSettings);
  };

  const handleTimerChimeTest = () => {
    void playTimerChime({ force: true });
  };

  const replacePhotoPreview = (blob: Blob | null) => {
    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current);
    }
    const nextUrl = blob ? URL.createObjectURL(blob) : null;
    photoPreviewUrlRef.current = nextUrl;
    setPhotoPreviewUrl(nextUrl);
  };

  const handlePhotoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsPhotoProcessing(true);
    try {
      const compressedBlob = await compressMedicinePhoto(file);
      setPendingPhotoBlob(compressedBlob);
      setPhotoRemovalPending(false);
      replacePhotoPreview(compressedBlob);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "写真を処理できませんでした。");
    } finally {
      setIsPhotoProcessing(false);
    }
  };

  const handleRemovePhoto = () => {
    setPendingPhotoBlob(null);
    setPhotoRemovalPending(true);
    setPhotoError(null);
    replacePhotoPreview(null);
  };

  // スナックバー表示処理
  const showSnackbar = (
    message: string,
    actionType: "delete" | "edit",
    prevData: Medicine,
    prevPhoto: MedicinePhotoRecord | null = null,
    photoChanged = false
  ) => {
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current);
    }

    setSnackbar({
      visible: true,
      message,
      actionType,
      prevData,
      prevPhoto,
      photoChanged,
    });

    snackbarTimerRef.current = setTimeout(() => {
      setSnackbar((prev) => ({ ...prev, visible: false }));
    }, 5000);
  };

  // 操作取り消し (Undo) 処理
  const handleUndo = async () => {
    if (!snackbar.prevData || !snackbar.actionType) return;

    let updated: Medicine[] = [];

    if (snackbar.actionType === "delete") {
      // 削除の取り消し: 配列に戻してソート
      updated = sortMedicines([...medicines, snackbar.prevData]);
    } else if (snackbar.actionType === "edit") {
      // 編集の取り消し: 編集前のデータに置換してソート
      updated = medicines.map((med) => {
        if (med.id === snackbar.prevData!.id) {
          return snackbar.prevData!;
        }
        return med;
      });
      updated = sortMedicines(updated);
    }

    if (snackbar.actionType === "delete" || snackbar.photoChanged) {
      try {
        if (snackbar.prevPhoto) {
          await saveMedicinePhoto(
            snackbar.prevPhoto.medicineId,
            snackbar.prevPhoto.blob,
            snackbar.prevPhoto.updatedAt
          );
        } else {
          await deleteMedicinePhoto(snackbar.prevData.id);
        }
      } catch (error) {
        console.error("Failed to restore medicine photo", error);
        alert("写真を復元できませんでした。もう一度お試しください。");
        return;
      }
    }
    setMedicines(updated);
    localStorage.setItem("my_medication_data", JSON.stringify(updated));
    notifyMedicineDataChanged();

    // スナックバー非表示にしてタイマークリア
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current);
    }
    setSnackbar({
      visible: false,
      message: "",
      actionType: null,
      prevData: null,
      prevPhoto: null,
      photoChanged: false,
    });
  };

  // 編集開始処理
  const handleEditClick = async (med: Medicine, restarting = false) => {
    setIsFormOpen(true); // フォームアコーディオンを開く
    setIsRestarting(restarting);
    setEditingId(med.id);
    setNewName(med.name);
    setEyeTarget(med.eyeTarget || "both");
    setNewType(med.type);
    setNewStorage(med.storage);
    setNewRequiresWiping(med.requiresWiping);
    setNewTimings(med.timings || []);
    setPendingPhotoBlob(null);
    setPhotoRemovalPending(false);
    setPhotoError(null);
    replacePhotoPreview(null);
    const loadToken = ++photoLoadTokenRef.current;
    setIsPhotoLoading(true);
    try {
      const photo = await getMedicinePhoto(med.id);
      if (photoLoadTokenRef.current === loadToken) {
        originalPhotoRef.current = photo;
        replacePhotoPreview(photo?.blob ?? null);
      }
    } catch (error) {
      if (photoLoadTokenRef.current === loadToken) {
        originalPhotoRef.current = null;
        setPhotoError(error instanceof Error ? error.message : "写真を読み込めませんでした。");
      }
    } finally {
      if (photoLoadTokenRef.current === loadToken) {
        setIsPhotoLoading(false);
      }
    }
    
    // 入力フォーム（目薬の名前）にフォーカスし、そこへスムーズにスクロール
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  };

  // フォームクリア
  const resetForm = () => {
    photoLoadTokenRef.current += 1;
    setNewName("");
    setEyeTarget("both");
    setNewType("water");
    setNewStorage("room");
    setNewRequiresWiping(false);
    setNewTimings([]);
    setEditingId(null);
    setIsRestarting(false);
    originalPhotoRef.current = null;
    setPendingPhotoBlob(null);
    setPhotoRemovalPending(false);
    setIsPhotoLoading(false);
    setIsPhotoProcessing(false);
    setIsSavingMedicine(false);
    setPhotoError(null);
    replacePhotoPreview(null);
  };

  // 編集キャンセル
  const handleCancelEdit = () => {
    resetForm();
    setIsFormOpen(false); // フォームアコーディオンを閉じる
  };

  const resetCurrentProgressIfNeeded = (activeCount: number) => {
    const savedIndex = localStorage.getItem("eye-drop-currentIndex");
    if (!savedIndex) return;

    const idx = parseInt(savedIndex, 10);
    if (idx >= activeCount) {
      localStorage.setItem("eye-drop-currentIndex", "0");
      localStorage.setItem("eye-drop-status", "pending");
    }
  };

  const handleEndMedicine = (id: number, name: string) => {
    if (!confirm(`「${name}」の点眼を終了し、過去の点眼薬に保存しますか？`)) return;

    const endedAt = new Date().toISOString();
    const updated = medicines.map((medicine): Medicine => (
      medicine.id === id
        ? { ...medicine, status: "archived", endedAt }
        : medicine
    ));

    try {
      localStorage.setItem("my_medication_data", JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to archive medicine", error);
      alert("点眼終了の状態を保存できませんでした。端末の空き容量をご確認ください。");
      return;
    }
    setMedicines(updated);
    notifyMedicineDataChanged();
    resetCurrentProgressIfNeeded(getActiveMedicines(updated).length);
  };

  const closePastDetails = () => {
    pastPhotoLoadTokenRef.current += 1;
    if (pastPhotoUrlRef.current) {
      URL.revokeObjectURL(pastPhotoUrlRef.current);
      pastPhotoUrlRef.current = null;
    }
    setPastPhotoUrl(null);
    setPastDetailId(null);
    setIsPastPhotoLoading(false);
  };

  const handlePastDetails = async (med: Medicine) => {
    if (pastDetailId === med.id) {
      closePastDetails();
      return;
    }

    closePastDetails();
    const loadToken = pastPhotoLoadTokenRef.current;
    setPastDetailId(med.id);
    setIsPastPhotoLoading(true);
    try {
      const photo = await getMedicinePhoto(med.id);
      if (photo && pastPhotoLoadTokenRef.current === loadToken) {
        const url = URL.createObjectURL(photo.blob);
        pastPhotoUrlRef.current = url;
        setPastPhotoUrl(url);
      }
    } catch (error) {
      console.error("Failed to load archived medicine photo", error);
    } finally {
      if (pastPhotoLoadTokenRef.current === loadToken) {
        setIsPastPhotoLoading(false);
      }
    }
  };

  // 薬本体と写真を元に戻せない形で削除
  const handleDeleteMedicine = async (id: number, name: string) => {
    if (!confirm(`この点眼薬を完全に削除しますか？\n写真や登録情報も削除され、元に戻せません。\n\n「${name}」`)) {
      return;
    }

    const medToDelete = medicines.find((med) => med.id === id);
    if (!medToDelete) return;

    let photoToDelete: MedicinePhotoRecord | null = null;
    try {
      photoToDelete = await getMedicinePhoto(id);
      await deleteMedicinePhoto(id);
    } catch (error) {
      console.error("Failed to delete medicine photo", error);
      alert("写真を削除できなかったため、点眼薬は削除していません。もう一度お試しください。");
      return;
    }

    const updated = medicines.filter((med) => med.id !== id);
    try {
      localStorage.setItem("my_medication_data", JSON.stringify(updated));
    } catch (error) {
      if (photoToDelete) {
        try {
          await saveMedicinePhoto(photoToDelete.medicineId, photoToDelete.blob, photoToDelete.updatedAt);
        } catch (rollbackError) {
          console.error("Failed to restore medicine photo", rollbackError);
        }
      }
      console.error("Failed to delete medicine", error);
      alert("点眼薬を削除できませんでした。端末の空き容量をご確認ください。");
      return;
    }
    setMedicines(updated);
    notifyMedicineDataChanged();

    resetCurrentProgressIfNeeded(getActiveMedicines(updated).length);
    if (pastDetailId === id) closePastDetails();
  };

  const getTypeLabel = (type: MedicineType) => {
    switch (type) {
      case "water": return "水性";
      case "suspension": return "懸濁性";
      case "gel": return "ゲル";
      case "ointment": return "軟膏";
    }
  };

  const getEyeTargetLabel = (med: Medicine): string => {
    const isOintment = med.type === "ointment" || med.instruction.includes("塗布");
    const actionLabel = isOintment ? "塗布" : "点眼";
    
    if (med.eyeTarget) {
      switch (med.eyeTarget) {
        case "both": return `両目${actionLabel}`;
        case "right": return `右目${actionLabel}`;
        case "left": return `左目${actionLabel}`;
      }
    }
    
    if (med.instruction.includes("両目")) return `両目${actionLabel}`;
    if (med.instruction.includes("右目")) return `右目${actionLabel}`;
    if (med.instruction.includes("left") || med.instruction.includes("左目")) return `左目${actionLabel}`;
    
    return `両目${actionLabel}`;
  };

  const getTimingLabel = (t: TimingType) => {
    switch (t) {
      case "morning": return { label: "朝", icon: `${basePath}/morning.webp`, color: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900/30" };
      case "lunch": return { label: "昼", icon: `${basePath}/lunch.webp`, color: "bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-955/20 dark:text-sky-400 dark:border-sky-900/30" };
      case "dinner": return { label: "夕", icon: `${basePath}/dinner.webp`, color: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-955/20 dark:text-orange-400 dark:border-orange-900/30" };
      case "bedtime": return { label: "就寝前", icon: `${basePath}/bedtime.webp`, color: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-955/20 dark:text-indigo-400 dark:border-indigo-900/30" };
      case "as_needed": return { label: "頓用", icon: `${basePath}/as_needed.webp`, color: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-955/20 dark:text-purple-400 dark:border-purple-900/30" };
    }
  };

  // 目薬の登録・更新処理
  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingMedicine) return;
    if (!newName.trim()) {
      alert("目薬の名前を入力してください！");
      return;
    }

    const eyeLabel = {
      both: "両目",
      right: "右目",
      left: "左目",
    }[eyeTarget];

    const actionLabel = {
      water: "1滴",
      suspension: "1滴 (よく振る)",
      gel: "1滴",
      ointment: "塗布",
    }[newType];

    const instructionText = `${eyeLabel} ${actionLabel}`;

    if (isPhotoLoading || isPhotoProcessing) {
      setPhotoError("写真の処理が終わるまでお待ちください。");
      return;
    }

    setPhotoError(null);
    setIsSavingMedicine(true);

    try {
    if (editingId !== null) {
      const medToEdit = medicines.find((med) => med.id === editingId);
      if (!medToEdit) return;
      const photoChanged = pendingPhotoBlob !== null || photoRemovalPending;
      const previousPhoto = originalPhotoRef.current;

      if (photoChanged) {
        try {
          if (pendingPhotoBlob) {
            await saveMedicinePhoto(editingId, pendingPhotoBlob);
          } else {
            await deleteMedicinePhoto(editingId);
          }
        } catch (error) {
          setPhotoError(error instanceof Error ? error.message : "写真を保存できませんでした。");
          return;
        }
      }

      // 編集（上書き）処理
      const updatedMedicines = medicines.map((med) => {
        if (med.id === editingId) {
          return {
            ...med,
            name: newName.trim(),
            instruction: instructionText,
            type: newType,
            storage: newStorage,
            requiresWiping: newRequiresWiping,
            eyeTarget: eyeTarget,
            timings: newTimings,
            updatedAt: new Date().toISOString(),
            status: isRestarting ? "active" : med.status,
            endedAt: isRestarting ? undefined : med.endedAt,
          };
        }
        return med;
      });

      const sorted = sortMedicines(updatedMedicines);
      try {
        localStorage.setItem("my_medication_data", JSON.stringify(sorted));
      } catch (error) {
        if (photoChanged) {
          try {
            if (previousPhoto) {
              await saveMedicinePhoto(previousPhoto.medicineId, previousPhoto.blob, previousPhoto.updatedAt);
            } else {
              await deleteMedicinePhoto(editingId);
            }
          } catch (rollbackError) {
            console.error("Failed to roll back medicine photo", rollbackError);
          }
        }
        setPhotoError("登録内容を保存できませんでした。端末の空き容量をご確認ください。");
        console.error("Failed to save medicine", error);
        return;
      }
      setMedicines(sorted);
      notifyMedicineDataChanged();

      // 操作取り消し用のスナックバーを表示
      showSnackbar(
        isRestarting
          ? `「${newName.trim()}」を使用中の目薬として再開しました`
          : `「${newName.trim()}」の変更を保存しました`,
        "edit",
        medToEdit,
        previousPhoto,
        photoChanged
      );

      // 編集完了後はフォームをリセットし、フォームアコーディオンを閉じる
      resetForm();
      setIsFormOpen(false);
    } else {
      // 新規登録処理
      const newMedicineId = new Date().getTime();
      const newMed: Medicine = {
        id: newMedicineId,
        name: newName.trim(),
        instruction: instructionText,
        type: newType,
        storage: newStorage,
        requiresWiping: newRequiresWiping,
        eyeTarget: eyeTarget,
        timings: newTimings,
        updatedAt: new Date().toISOString(),
        status: "active",
      };

      // 追加してソート
      const updatedMedicines = sortMedicines([...medicines, newMed]);

      if (pendingPhotoBlob) {
        try {
          await saveMedicinePhoto(newMedicineId, pendingPhotoBlob);
        } catch (error) {
          setPhotoError(error instanceof Error ? error.message : "写真を保存できませんでした。");
          return;
        }
      }

      // ステートとlocalStorageに保存
      try {
        localStorage.setItem("my_medication_data", JSON.stringify(updatedMedicines));
      } catch (error) {
        if (pendingPhotoBlob) {
          try {
            await deleteMedicinePhoto(newMedicineId);
          } catch (rollbackError) {
            console.error("Failed to roll back medicine photo", rollbackError);
          }
        }
        setPhotoError("登録内容を保存できませんでした。端末の空き容量をご確認ください。");
        console.error("Failed to save medicine", error);
        return;
      }
      setMedicines(updatedMedicines);
      notifyMedicineDataChanged();

      // フォームリセットとクローズ
      resetForm();
      setIsFormOpen(false);

      // 新規登録時はホームに戻る
      router.push("/");
    }
    } finally {
      setIsSavingMedicine(false);
    }
  };

  // アプリの全データを初期状態に戻す処理
  const handleResetAllData = async () => {
    if (!confirm("登録されているすべての目薬データが消去されます。本当に初期化してもよろしいですか？")) {
      return;
    }
    if (!confirm("本当に元に戻せませんが、よろしいですか？")) {
      return;
    }

    try {
      await clearMedicinePhotos();
    } catch (error) {
      console.error("Failed to clear medicine photos", error);
    }

    // ① LocalStorage に空配列を設定して初期化
    localStorage.setItem("my_medication_data", JSON.stringify([]));
    notifyMedicineDataChanged();

    // ② 関連する一時ステートなどを削除
    localStorage.removeItem("eye-drop-selectedTiming");
    localStorage.removeItem("eye-drop-timingStates");
    localStorage.removeItem("eye-drop-currentIndex");
    localStorage.removeItem("eye-drop-status");
    localStorage.removeItem("eye-drop-history");

    // ③ アプリ内の目薬リストを空にする
    setMedicines([]);

    // ④ アラートを表示してメイン画面へ戻る
    alert("アプリを初期化しました。");
    router.push("/");
  };

  return (
    <div className="flex flex-col min-h-full bg-gray-50 dark:bg-gray-900">
      {/* 画面最上部：独立したヘッダーエリア */}
      <div className="w-full bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 py-3 px-4 flex justify-between items-center z-30">
        <div className="flex items-center gap-2">
          <Image
            src={`${basePath}/Daily_eyedrops192.png`}
            alt="ロゴ"
            width={28}
            height={28}
            className="object-contain"
          />
          <span className="font-bold text-base text-slate-800 dark:text-white">
            まいにち点眼
          </span>
        </div>
        <button
          onClick={() => setIsHelpOpen(true)}
          className="text-xs font-bold text-slate-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 px-3 py-1.5 rounded-xl border border-gray-250 dark:border-gray-700 transition-all cursor-pointer touch-manipulation min-h-[32px] flex items-center justify-center gap-1"
          title="アプリの使い方"
        >
          <span>？</span>使い方
        </button>
      </div>

      {/* 画面上部：ガイドエリア（固定） */}
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm pt-4 pb-4 px-6 flex-shrink-0 border-b border-gray-200 dark:border-gray-800 shadow-sm animate-slide-in-fast">
        <header className="w-full text-center flex justify-between items-center">
          <button
            onClick={() => router.push("/")}
            className="text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 px-3.5 py-2 rounded-xl touch-manipulation cursor-pointer min-h-[40px] flex items-center justify-center"
          >
            戻る
          </button>
          
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            目薬の管理
          </h1>

          <div className="w-12"></div>
        </header>
      </div>

      {/* 設定画面コンテンツ */}
      <div className="px-6 py-6 max-w-md mx-auto w-full space-y-6 pb-20 animate-slide-in-fast">
        <button
          type="button"
          onClick={() => router.push("/medicine-list")}
          className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-3xl p-5 shadow-md hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer touch-manipulation text-left"
        >
          <span className="block text-lg font-extrabold">使用中の目薬一覧</span>
          <span className="block mt-1 text-sm text-sky-50 leading-relaxed">
            受診・調剤時や、もしものときの確認に使えます
          </span>
        </button>
        
        {/* 1. 登録済みの目薬一覧（最上部に配置） */}
        {isMounted && (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
              現在使用中の目薬 ({activeMedicines.length})
            </h2>

            {activeMedicines.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-900 rounded-3xl border border-gray-150 dark:border-gray-750">
                登録されている目薬はありません。
              </div>
            ) : (
              <div className="space-y-4">
                {activeMedicines.map((med) => (
                  <div
                    key={med.id}
                    className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-blue-400 dark:border-blue-500 flex flex-col justify-between gap-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                          {getTypeLabel(med.type)}
                        </span>
                        {med.storage === "cold" ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-cyan-600 bg-cyan-100 flex items-center gap-1" title="冷所保存">
                            <img src={`${basePath}/cold.webp`} alt="" className="w-3.5 h-3.5 object-contain" />
                            冷所
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-orange-600 bg-orange-100 flex items-center gap-1" title="室温保存">
                            <img src={`${basePath}/room.webp`} alt="" className="w-3.5 h-3.5 object-contain" />
                            室温
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                          {med.name}
                        </h3>
                        <div className={`text-lg font-extrabold flex items-center gap-1.5 ${med.timings?.includes("as_needed") ? "text-purple-600 dark:text-purple-400" : "text-blue-600 dark:text-blue-400"}`}>
                          <span>💧</span>
                          <span>{getEyeTargetLabel(med)}</span>
                        </div>
                      </div>

                      {/* タイミングバッジの表示 */}
                      {med.timings && med.timings.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {med.timings.map((t) => {
                            const info = getTimingLabel(t);
                            if (!info) return null;
                            return (
                              <span
                                key={t}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${info.color}`}
                              >
                                <img src={info.icon} alt="" className="w-3.5 h-3.5 object-contain" />
                                <span>{info.label}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditClick(med)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-955/20 dark:text-blue-400 dark:hover:bg-blue-900/30 font-bold text-xs px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-900/30 transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation min-h-[38px]"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        編集する
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEndMedicine(med.id, med.name)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-900/30 font-bold text-xs px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/30 transition-all cursor-pointer touch-manipulation min-h-[38px]"
                      >
                        点眼終了
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMedicine(med.id, med.name)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-955/20 dark:text-red-400 dark:hover:bg-red-900/30 font-bold text-xs px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation min-h-[38px]"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        完全に削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. 新しく目薬を登録する（アコーディオン形式） */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="w-full px-6 py-5 flex justify-between items-center font-bold text-slate-800 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
          >
            <span className="flex items-center gap-2 text-base">
              {isRestarting
                ? "↩️ 過去の点眼薬を再開する"
                : editingId !== null
                  ? "✏️ 目薬の情報を修正する"
                  : "＋ 新しく目薬を登録する"}
            </span>
            <span className="text-sm text-gray-400">
              {isFormOpen ? "▲ 閉じる" : "▼ 開く"}
            </span>
          </button>

          {isFormOpen && (
            <form onSubmit={handleAddMedicine} className="px-6 pb-6 pt-2 space-y-6 border-t border-gray-50 dark:border-gray-750/50">
          <div className="relative" ref={autocompleteRef}>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              目薬の名前
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="例：ヒアレイン点眼液"
              className="w-full p-4 text-base border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 min-h-[48px]"
              required
            />

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-gray-100 dark:border-gray-700 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-700/50">
                {suggestions.map((med, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSelectSuggestion(med)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors flex justify-between items-center cursor-pointer touch-manipulation"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">
                        {med.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300">
                          {med.type}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${med.storage === "冷所" ? "text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/20" : "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/20"}`}>
                          {med.storage}保存
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-blue-500 font-bold bg-blue-50 dark:bg-blue-955/30 px-2.5 py-1 rounded-xl">
                      選択
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 薬の写真（端末内だけに保存） */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              薬の写真（任意・1枚）
            </label>
            <input
              ref={galleryPhotoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoFileChange}
              disabled={isSavingMedicine}
              className="hidden"
            />
            <input
              ref={cameraPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoFileChange}
              disabled={isSavingMedicine}
              className="hidden"
            />

            {isPhotoLoading ? (
              <div className="min-h-28 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 flex items-center justify-center text-sm font-bold text-slate-500">
                写真を読み込んでいます…
              </div>
            ) : photoPreviewUrl ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 p-4">
                <img
                  src={photoPreviewUrl}
                  alt="登録する薬の写真"
                  className="w-full max-h-64 object-contain rounded-xl bg-white dark:bg-slate-800"
                />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => cameraPhotoInputRef.current?.click()}
                    disabled={isPhotoProcessing || isSavingMedicine}
                    className="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20 dark:border-emerald-900/40 dark:text-emerald-400 text-sm font-bold disabled:opacity-50 cursor-pointer"
                  >
                    📷 カメラで撮り直す
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryPhotoInputRef.current?.click()}
                    disabled={isPhotoProcessing || isSavingMedicine}
                    className="min-h-[44px] rounded-xl border border-blue-200 bg-blue-50 text-blue-600 dark:bg-blue-955/20 dark:border-blue-900/40 dark:text-blue-400 text-sm font-bold disabled:opacity-50 cursor-pointer"
                  >
                    🖼️ 端末から変更
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={isPhotoProcessing || isSavingMedicine}
                    className="col-span-2 min-h-[44px] rounded-xl border border-red-200 bg-red-50 text-red-600 dark:bg-red-955/20 dark:border-red-900/40 dark:text-red-400 text-sm font-bold disabled:opacity-50 cursor-pointer"
                  >
                    写真を削除
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraPhotoInputRef.current?.click()}
                  disabled={isPhotoProcessing || isSavingMedicine}
                  className="min-h-[56px] rounded-2xl border-2 border-dashed border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-955/10 text-emerald-700 dark:text-emerald-400 font-bold disabled:opacity-50 cursor-pointer"
                >
                  {isPhotoProcessing ? "処理中…" : "📷 カメラで撮影"}
                </button>
                <button
                  type="button"
                  onClick={() => galleryPhotoInputRef.current?.click()}
                  disabled={isPhotoProcessing || isSavingMedicine}
                  className="min-h-[56px] rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-955/10 text-blue-600 dark:text-blue-400 font-bold disabled:opacity-50 cursor-pointer"
                >
                  {isPhotoProcessing ? "処理中…" : "🖼️ 端末から選択"}
                </button>
              </div>
            )}

            {photoError && (
              <p role="alert" className="mt-2 text-sm font-bold text-red-600 dark:text-red-400">
                {photoError}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              写真は外部へ送信せず、この端末内だけに保存します。ブラウザデータやPWAの削除、機種変更などで消える場合があります。
            </p>
          </div>

          {/* 対象の目 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              対象の目
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["both", "left", "right"] as const).map((target) => {
                const label = { both: "両目", left: "左目", right: "右目" }[target];
                const isActive = eyeTarget === target;
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setEyeTarget(target)}
                    className={`py-4 px-2 text-base font-bold rounded-2xl border transition-all cursor-pointer min-h-[48px] flex items-center justify-center
                      ${isActive
                        ? "bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20"
                        : "bg-gray-50 text-slate-700 border-gray-200 dark:bg-slate-900 dark:text-slate-300 dark:border-gray-700 hover:border-blue-300"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 薬のタイプ */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              薬のタイプ
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as MedicineType)}
              className="w-full p-4 text-base border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-white min-h-[48px]"
            >
              <option value="water">水性点眼液 (通常の目薬)</option>
              <option value="suspension">懸濁性点眼液 (よく振る目薬)</option>
              <option value="gel">ゲル化製剤</option>
              <option value="ointment">眼軟膏 (最後に使用)</option>
            </select>
          </div>

          {/* 3. 保管場所 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              保管場所
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["room", "cold"] as const).map((storage) => {
                const label = { room: "室温保存", cold: "冷所保存" }[storage];
                const icon = { room: `${basePath}/room.webp`, cold: `${basePath}/cold.webp` }[storage];
                const isActive = newStorage === storage;
                return (
                  <button
                    key={storage}
                    type="button"
                    onClick={() => setNewStorage(storage)}
                    className={`py-4 px-2 text-base font-bold rounded-2xl border transition-all cursor-pointer min-h-[48px] flex items-center justify-center gap-2
                      ${isActive
                        ? "bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20"
                        : "bg-gray-50 text-slate-700 border-gray-200 dark:bg-slate-900 dark:text-slate-300 dark:border-gray-700 hover:border-blue-300"
                      }`}
                  >
                    <img src={icon} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 点眼タイミング */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
              点眼タイミング (複数選択可)
            </label>
            <div className="space-y-3">
              {([
                { value: "morning", label: "朝（起床時）", icon: "/morning.webp" },
                { value: "lunch", label: "昼", icon: "/lunch.webp" },
                { value: "dinner", label: "夕", icon: "/dinner.webp" },
                { value: "bedtime", label: "就寝前", icon: "/bedtime.webp" },
                { value: "as_needed", label: "頓用（症状に合わせて）", icon: "/as_needed.webp" },
              ] as const).map((opt) => {
                const isChecked = newTimings.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer transition-all touch-manipulation
                      ${isChecked
                        ? "bg-blue-50/50 border-blue-300 dark:bg-blue-955/20 dark:border-blue-800"
                        : "bg-gray-50 border-gray-200 dark:bg-slate-900 dark:border-gray-700 hover:border-blue-200"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTimingChange(opt.value)}
                      className="w-6 h-6 rounded border-gray-300 dark:border-gray-750 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex items-center gap-2">
                      <img src={opt.icon} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
                      <span className="text-base font-bold text-slate-700 dark:text-slate-200">
                        {opt.label}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 4. 特別な注意 */}
          <div className="pt-2">
            <label className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-955/30 border border-amber-100 dark:border-amber-900/50 rounded-2xl cursor-pointer touch-manipulation">
              <input
                type="checkbox"
                checked={newRequiresWiping}
                onChange={(e) => setNewRequiresWiping(e.target.checked)}
                className="w-6 h-6 rounded border-gray-300 dark:border-gray-750 text-amber-600 focus:ring-amber-500 mt-0.5 cursor-pointer flex-shrink-0"
              />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  点眼後の拭き取り・洗顔が必要
                </span>
                <span className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  皮膚への刺激やただれを防ぐための注意書きを表示します。
                </span>
              </div>
            </label>
          </div>

          {/* 送信ボタン・キャンセルボタン */}
          <div className="pt-4">
            {editingId !== null ? (
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isSavingMedicine}
                  className="flex-grow bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base py-4 rounded-2xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {isSavingMedicine
                    ? "保存中…"
                    : isRestarting
                      ? "処方内容を確認して再開する"
                      : "更新内容を保存する"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 dark:active:bg-slate-500 text-slate-700 dark:text-slate-200 font-bold text-base py-4 px-6 rounded-2xl transition-all flex items-center justify-center cursor-pointer min-h-[48px]"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSavingMedicine}
                className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-base py-4 rounded-2xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                {isSavingMedicine ? "保存中…" : "目薬をリストに追加する"}
              </button>
            )}
          </div>
        </form>
      )}
    </div>

        {/* 3. 通知設定 */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsNotificationSettingsOpen(!isNotificationSettingsOpen)}
            className="w-full px-6 py-5 flex justify-between items-center font-bold text-slate-800 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
          >
            <span className="flex items-center gap-2 text-base">通知設定</span>
            <span className="text-sm text-gray-400">
              {isNotificationSettingsOpen ? "▲ 閉じる" : "▼ 開く"}
            </span>
          </button>

          {isNotificationSettingsOpen && (
          <div className="px-6 py-5 space-y-4 border-t border-gray-50 dark:border-gray-750/50">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 p-4">
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-white">通知機能</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  決まった時間に点眼をお知らせします。
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <span>{notificationSettings.enabled ? "ON" : "OFF"}</span>
                <input
                  type="checkbox"
                  checked={notificationSettings.enabled}
                  onChange={(e) => handleNotificationMasterToggle(e.target.checked)}
                  className="w-6 h-6 rounded border-gray-300 dark:border-gray-750 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </label>
            </div>
            {NOTIFICATION_TIMINGS.map((timing) => {
              const slot = notificationSettings.slots[timing];
              return (
                <div
                  key={timing}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 p-4"
                >
                  <label className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(e) => handleNotificationSlotToggle(timing, e.target.checked)}
                      disabled={!notificationSettings.enabled}
                      className="w-6 h-6 rounded border-gray-300 dark:border-gray-750 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 flex-shrink-0"
                    />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      {NOTIFICATION_TIMING_LABELS[timing]}
                    </span>
                  </label>
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) => handleNotificationTimeChange(timing, e.target.value)}
                    disabled={!notificationSettings.enabled || !slot.enabled}
                    className="w-28 p-3 text-base font-bold border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-950 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-white disabled:opacity-50"
                  />
                </div>
              );
            })}

            <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-955/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-800 dark:text-white">通知の許可</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    現在の状態: {
                      notificationPermission === "granted"
                        ? "許可されています"
                        : notificationPermission === "denied"
                          ? "ブロックされています"
                          : notificationPermission === "default"
                            ? "未設定です"
                            : "このブラウザでは使えません"
                    }
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleNotificationPermissionRequest}
                  disabled={notificationPermission === "granted" || notificationPermission === "unsupported"}
                  className="shrink-0 px-4 py-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 text-white disabled:text-slate-500 dark:disabled:text-slate-400 text-xs font-black rounded-2xl transition-all cursor-pointer disabled:cursor-not-allowed min-h-[44px]"
                >
                  許可する
                </button>
              </div>

              {notificationPermission === "denied" && (
                <p className="text-xs font-bold text-red-600 dark:text-red-400">
                  通知がブロックされています。端末またはブラウザの設定から、このアプリの通知を許可してください。
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-955/20 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 dark:text-white">5分タイマー終了音</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    アプリが開いている時、または復帰時に終了済みなら音で知らせます。
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between sm:justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleTimerChimeTest}
                    className="px-4 py-3 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-xs font-black rounded-2xl transition-all cursor-pointer min-h-[44px]"
                  >
                    テスト再生
                  </button>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                    <span>{timerChimeSettings.enabled ? "ON" : "OFF"}</span>
                    <input
                      type="checkbox"
                      checked={timerChimeSettings.enabled}
                      onChange={(e) => handleTimerChimeToggle(e.target.checked)}
                      className="w-6 h-6 rounded border-gray-300 dark:border-gray-750 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              <label className="block">
                <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-700 dark:text-slate-200">
                  <span>音量</span>
                  <span>{Math.round(timerChimeSettings.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(timerChimeSettings.volume * 100)}
                  onChange={(e) => handleTimerChimeVolumeChange(Number(e.target.value) / 100)}
                  className="mt-2 w-full accent-emerald-500 cursor-pointer"
                />
              </label>
            </div>

            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 bg-amber-50 dark:bg-amber-955/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-4">
              通知や終了音は、端末やブラウザの状態によって遅れたり届かないことがあります。アプリがバックグラウンドまたは終了している間に、必ず鳴るものではありません。
            </p>
          </div>
          )}
        </div>

        {/* 4. 過去の点眼薬 */}
        {isMounted && (
          <div className="bg-slate-100/70 dark:bg-slate-800/70 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (isPastMedicinesOpen) closePastDetails();
                setIsPastMedicinesOpen(!isPastMedicinesOpen);
              }}
              className="w-full px-6 py-5 flex justify-between items-center gap-3 text-left text-slate-800 dark:text-white cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/30 transition-colors"
              aria-expanded={isPastMedicinesOpen}
              aria-controls="past-medicines-list"
            >
              <span>
                <span className="block text-base font-black">過去の点眼薬 ({archivedMedicines.length})</span>
                <span className="block mt-1 text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                  点眼を終了した薬です。ホーム・今日の点眼・通知には表示されません。
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-slate-400">
                {isPastMedicinesOpen ? "▲ 閉じる" : "▼ 開く"}
              </span>
            </button>

            {isPastMedicinesOpen && (
              <div id="past-medicines-list" className="border-t border-slate-200 dark:border-slate-700 px-4 pb-4 pt-4">
                {archivedMedicines.length === 0 ? (
                  <div className="text-center py-7 text-sm text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                    過去の点眼薬はありません。
                  </div>
                ) : (
                  <div className="space-y-4">
                    {archivedMedicines.map((med) => {
                      const isDetailOpen = pastDetailId === med.id;
                      return (
                        <div key={med.id} className="rounded-2xl border border-slate-300 dark:border-slate-600 p-4 bg-white dark:bg-slate-800">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-base font-extrabold text-slate-800 dark:text-white">{med.name}</h3>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                点眼終了日：{med.endedAt ? new Date(med.endedAt).toLocaleDateString("ja-JP") : "記録なし"}
                              </p>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              点眼終了
                            </span>
                          </div>

                          {isDetailOpen && (
                            <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                              <div className="flex gap-4 items-start">
                                <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-white dark:bg-slate-800 flex items-center justify-center">
                                  {isPastPhotoLoading ? (
                                    <span className="text-xs text-slate-400">読込中…</span>
                                  ) : pastPhotoUrl ? (
                                    <img src={pastPhotoUrl} alt={`${med.name}の写真`} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs text-slate-400">写真未登録</span>
                                  )}
                                </div>
                                <dl className="min-w-0 grid grid-cols-[5.5rem_1fr] gap-y-2 text-xs leading-relaxed">
                                  <dt className="font-bold text-slate-500">対象</dt>
                                  <dd className="font-bold text-slate-800 dark:text-slate-100">{getEyeTargetLabel(med)}</dd>
                                  <dt className="font-bold text-slate-500">性状</dt>
                                  <dd className="font-bold text-slate-800 dark:text-slate-100">{getTypeLabel(med.type)}</dd>
                                  <dt className="font-bold text-slate-500">保管</dt>
                                  <dd className="font-bold text-slate-800 dark:text-slate-100">{med.storage === "cold" ? "冷所" : "室温"}</dd>
                                </dl>
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                                <p><strong>時間帯：</strong>{med.timings?.length ? med.timings.map((timing) => getTimingLabel(timing)?.label).filter(Boolean).join("・") : "未設定"}</p>
                                <p><strong>点眼後：</strong>{med.requiresWiping ? "拭き取り・洗顔が必要" : "特別な設定なし"}</p>
                              </div>
                            </div>
                          )}

                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditClick(med, true)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl min-h-[40px]"
                            >
                              再開する
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePastDetails(med)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 font-bold text-xs px-4 py-2.5 rounded-xl min-h-[40px]"
                            >
                              {isDetailOpen ? "詳細を閉じる" : "詳細を見る"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteMedicine(med.id, med.name)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 font-bold text-xs px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 min-h-[40px]"
                            >
                              完全に削除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* アプリ情報エリア（フッター） */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-4">
        <button
          type="button"
          onClick={handleUpdateClick}
          className="w-full py-3.5 px-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 border border-gray-200 dark:border-gray-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-2xl transition-all cursor-pointer min-h-[44px] flex items-center justify-between shadow-sm"
        >
          <span className="flex items-center gap-2">
            🆙 アップデート情報
            {!hasReadUpdate && (
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded text-red-600 bg-red-100 dark:bg-red-955/30 dark:text-red-400 border border-red-200 dark:border-red-900/30 ml-1">
                NEW!
              </span>
            )}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Ver. 1.3.4</span>
        </button>

        <button
          type="button"
          onClick={() => setIsLicenseOpen(true)}
          className="w-full py-3.5 px-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 border border-gray-200 dark:border-gray-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-2xl transition-all cursor-pointer min-h-[44px] flex items-center justify-between shadow-sm"
        >
          <span className="flex items-center gap-2">📄 ライセンス情報</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">▶</span>
        </button>

        {/* 製作者情報とリンク */}
        <div className="text-center pt-4 text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
          <span>作った人：</span>
          <a
            href="https://note.com/note_yongmars"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline font-extrabold flex items-center gap-1"
          >
            視能訓練士 ゆうまるす
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>

        {/* 免責事項 */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed text-left max-w-sm mx-auto space-y-1.5">
          <p className="font-bold text-center mb-1 text-slate-500 dark:text-slate-400">【免責事項】</p>
          <p>・本アプリは点眼の記録をサポートする補助ツールであり、<br />&nbsp;&nbsp;医療機器ではありません。</p>
          <p>・アプリ内の情報よりも、必ず医師の指示やお薬の添付文書を優先してください。</p>
          <p>・本アプリの利用によって生じたトラブルについて、<br />&nbsp;&nbsp;開発者は一切の責任を負いかねます。</p>
          <div className="pt-2">
            <p className="font-bold text-slate-500 dark:text-slate-400">・点眼薬の写真について</p>
            <p>登録した点眼薬の写真は、使用中の点眼薬を確認するための補助記録です。</p>
            <p>処方内容を証明するものではなく、お薬手帳や処方箋の代わりにはなりません。</p>
            <p>医療機関や薬局では、必要に応じてお薬手帳や処方箋などもあわせてご確認ください。</p>
          </div>
        </div>

        {/* アプリ初期化ボタン (免責事項の下に移動) */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3">
            ※初期化すると、すべての登録データが完全に消去され、元に戻せません。
          </p>
          <button
            type="button"
            onClick={handleResetAllData}
            className="w-full py-3.5 px-4 border border-red-300 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-955/20 active:bg-red-100 dark:active:bg-red-900/30 text-red-600 dark:text-red-400 font-bold text-xs rounded-2xl transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-1.5 mb-8"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            ⚠️ アプリの全データを初期化する
          </button>
        </div>
      </div>
    </div>

      {/* 操作取り消しスナックバー */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 transition-all duration-300 ease-out transform
          ${snackbar.visible 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 translate-y-4 pointer-events-none"
          }`}
      >
        <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-sm text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between gap-4 border border-slate-800">
          <span className="text-sm font-medium">
            {snackbar.message}
          </span>
          <button
            onClick={handleUndo}
            className="flex-shrink-0 text-blue-400 hover:text-blue-300 font-bold text-sm bg-blue-500/10 px-3 py-1.5 rounded-xl hover:bg-blue-500/20 active:scale-95 transition-all cursor-pointer"
          >
            元に戻す
          </button>
        </div>
      </div>

      {/* 1. アプリの使い方（？ボタン）モーダル */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto custom-scrollbar animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg my-8 flex flex-col shadow-2xl relative overflow-hidden animate-scale-up">
            {/* モーダルヘッダー */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-slate-800 sticky top-0 z-10">
              <h3 className="text-lg font-black text-slate-800 dark:text-white">目薬の管理方法・ホーム画面への追加</h3>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 font-bold cursor-pointer"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            {/* モーダルコンテンツ */}
            <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar bg-white dark:bg-slate-800">
              <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-left space-y-4">
                <p className="font-extrabold text-blue-600 dark:text-blue-400">■ 1. 新しく目薬を追加する</p>
                <p className="pl-2">
                  画面最上部の「＋新しく目薬を登録する」に入力していきます。
                  「目薬の名前」にお薬の名前を入力します。次に「対象の目（両目・右目・左目）」と「点眼する時間帯（朝・昼・夕・就寝前）」にチェックを入れて登録してください。
                </p>
                
                <p className="font-extrabold text-blue-600 dark:text-blue-400 mt-4">■ 2. 登録した目薬の内容を変える</p>
                <p className="pl-2">
                  「登録済みの目薬一覧」のリストに, 登録した目薬があります。その中の編集したい目薬の「編集する」を押します。すると上部の編集画面に移動します。
                  編集したい部分を修正し「更新内容を保存する」を押して保存します。
                </p>
                
                <p className="font-extrabold text-blue-600 dark:text-blue-400 mt-4">■ ３. 登録した目薬を消す</p>
                <p className="pl-2">
                  「登録済みの目薬一覧」のリストの削除したい目薬の「この目薬を削除する」を押します。
                  すると確認画面がでますので、「OK」を押すと削除されます。
                </p>

                <p className="font-extrabold text-blue-600 dark:text-blue-400 mt-4">■ 4. スマホのホーム画面に追加する</p>
                <p className="pl-2">
                  本アプリをホーム画面に追加（インストール）すると、通常のブラウザよりアプリらしく使えます。
                  <br /><br />
                  <strong className="font-bold text-slate-850 dark:text-white">・LINEの中で開いている場合：</strong><br />
                  画面の端（右上、または右下）にあるメニューやコンパスのマークをタップして、一度通常のブラウザ（ChromeやSafari）で開き直してください。
                  <br /><br />
                  <strong className="font-bold text-slate-850 dark:text-white">・Androidをご利用の場合：</strong><br />
                  ブラウザで開き直すと画面に出現する「アプリをインストール」ボタンをタップしてください。
                  <br /><br />
                  <strong className="font-bold text-slate-850 dark:text-white">・iPhoneをご利用の場合：</strong><br />
                  Safariの画面下部にある『共有ボタン（四角から矢印が出るマーク）』をタップし、メニューから『ホーム画面に追加』を選んでください。
                </p>
              </div>
            </div>
            {/* モーダルフッター */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-slate-800/50 sticky bottom-0 z-10">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-sm rounded-2xl transition-all shadow-md shadow-blue-500/20 cursor-pointer min-h-[44px]"
              >
                使い方を閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. アップデート情報モーダル */}
      {isUpdateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto custom-scrollbar animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg my-8 flex flex-col shadow-2xl relative overflow-hidden animate-scale-up">
            {/* モーダルヘッダー */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-slate-800 sticky top-0 z-10">
              <h3 className="text-lg font-black text-slate-800 dark:text-white">アップデート履歴</h3>
              <button
                onClick={() => setIsUpdateOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 font-bold cursor-pointer"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            {/* モーダルコンテンツ */}
            <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar bg-white dark:bg-slate-800">
              <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-left space-y-4">
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.3.4（2026年8月17日）</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・「過去の点眼薬」機能を追加しました。<br />
                    ・使用しなくなった点眼薬を削除せず、「点眼終了」として写真や登録内容を残せるようになりました。<br />
                    ・過去の点眼薬は一覧から確認でき、再び使用することになった場合は、登録内容を引き継いで再開できます。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.3.3（2026年8月16日）</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・「使用中の目薬一覧」を追加しました。<br />
                    ・登録している点眼薬の写真や薬名、対象眼、点眼時間帯などを一覧で確認できるようになりました。<br />
                    ・点眼時の目薬確認や、災害時・受診時・調剤時などに、使用中の点眼薬を確認しやすくなりました。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.3.2（2026年8月3日）</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・写真登録機能を追加しました。<br />
                    &nbsp;&nbsp;&nbsp;登録した点眼薬に、写真を1枚保存できるようになりました。<br />
                    ・カメラで撮影するか、端末内の画像を選んで登録できます。<br />
                    ・登録した写真はホーム画面の点眼カードに表示され、タップすると拡大して確認できます。<br />
                    ・点眼薬の候補表示を改善しました<br />
                    &nbsp;&nbsp;&nbsp;候補に表示される点眼薬の品名を追加しました。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.3.1</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・5分待機タイマーの終了時に、お知らせ音が鳴る機能を追加しました。<br />
                    ・音のオン／オフを設定できるようにしました。<br />
                    ・アプリを開いている状態で、次の点眼タイミングに気づきやすくなりました。<br />
                    &nbsp;&nbsp;&nbsp;端末のスリープやバックグラウンド状態では、音が鳴らない場合があります。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.3.0 (2026年7月)</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・点眼薬の候補表示を改善しました<br />
                    &nbsp;&nbsp;&nbsp;候補に表示される点眼薬の品名を追加しました。<br />
                    ・通知機能を追加しました<br />
                    &nbsp;&nbsp;&nbsp;通知機能を試験的に追加しましたが、端末のスリープやバックグラウンド制限により、<br />
                    &nbsp;&nbsp;&nbsp;安定して通知が届かない場合があります。<br />
                    &nbsp;&nbsp;&nbsp;今後の課題として、引き続き調整していきます。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.2.1 (2026年6月16日)</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・LINE内ブラウザで開いている場合に外部ブラウザ（ChromeやSafari）への切り替えを促す案内バナーを最上部に表示する機能を追加しました。<br />
                    ・使い方ダイアログの内容を拡充し、PWAのホーム画面追加手順とLINE対策を追加しました。<br />
                    ・設定画面のレイアウトを整理し、登録済みの目薬一覧を最上部に配置。<br />
                    &nbsp;&nbsp;&nbsp;登録・編集フォームをアコーディオン形式にまとめました。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.2.0 (2026年6月10日)</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・目薬名のオートコンプリート機能を実装し、<br />
                    &nbsp;&nbsp;&nbsp;文字入力時に代表的な点眼薬の候補リストが表示され、<br />
                    &nbsp;&nbsp;&nbsp;選択できるようになりました。<br />
                    ・項目の自動入力連動にも対応し、目薬名を選択すると、<br />
                    &nbsp;&nbsp;&nbsp;その性状（タイプ）、保管場所、拭き取り・洗顔の要否が<br />
                    &nbsp;&nbsp;&nbsp;自動的に判定・選択されます。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.1.3 (2026年6月1日)</p>
                  <p className="pl-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ・日付の更新タイミングを朝4:00に変更し、<br />
                    &nbsp;&nbsp;&nbsp;深夜の点眼も前日の就寝前として正しく記録できるようになりました。<br />
                    ・各点眼時間帯の判定ルールを1分単位で最適化しました。
                  </p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.1.2</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・画面遷移・アプリ終了時に５分タイマーが止まらないように修正。</p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.1.1</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・設定画面に、いつでも見られる「使い方ボタン」とアプリ情報エリアを新設。</p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.1.0 (2026年5月)</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・点眼した履歴を表示する肉球スタンプカレンダーを実装。</p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.0.4</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・PWAに対応。</p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.0.3</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・画面の右上にいつでも見られる「使い方（？）ボタン」を新設。</p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.0.2 (2026年5月)</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・朝昼夕就寝前の時間で自動で画面の遷移を実装</p>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.0.1 (2026年4月)</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・目薬が混ざるのを防ぐ「5分待機タイマー」機能を搭載。</p>
                </div>
                <div className="pb-1">
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.0.0 (2026年3月)</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">
                    ・『ノクトのまいにち点眼管理アプリ』が誕生！<br />
                    ・毎日の点眼チェックと、2種類以上の複数点眼に対応。<br />
                    ・１つ目の目薬の点眼が終わったら、つぎの目薬の表示になるさし忘れ防止UIに改善。<br />
                    ・目薬の指す順番を自動で変更する機能を搭載。
                  </p>
                </div>
              </div>
            </div>
            {/* モーダルフッター */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-slate-800/50 sticky bottom-0 z-10">
              <button
                onClick={() => setIsUpdateOpen(false)}
                className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-sm rounded-2xl transition-all shadow-md shadow-blue-500/20 cursor-pointer min-h-[44px]"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ライセンス情報モーダル */}
      {isLicenseOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto custom-scrollbar animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg my-8 flex flex-col shadow-2xl relative overflow-hidden animate-scale-up">
            {/* モーダルヘッダー */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-slate-800 sticky top-0 z-10">
              <h3 className="text-lg font-black text-slate-800 dark:text-white">ライセンス・著作権について</h3>
              <button
                onClick={() => setIsLicenseOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 font-bold cursor-pointer"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            {/* モーダルコンテンツ */}
            <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar bg-white dark:bg-slate-800">
              <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-left space-y-4">
                <p className="font-extrabold text-slate-800 dark:text-white">© 2026 ゆうまるす/yongmars. All rights reserved.</p>
                <p className="mt-4">
                  本アプリに登場するキャラクター「ノクト」「ルクス」「朔」、およびその他のイラスト、アプリアイコン等は、すべて製作者「ゆうまるす」のオリジナル著作物です。画像の無断転載・複製・商用利用は固くお断りいたします。
                </p>
              </div>
            </div>
            {/* モーダルフッター */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-slate-800/50 sticky bottom-0 z-10">
              <button
                onClick={() => setIsLicenseOpen(false)}
                className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-sm rounded-2xl transition-all shadow-md shadow-blue-500/20 cursor-pointer min-h-[44px]"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
