"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type MedicineType = "water" | "suspension" | "gel" | "ointment";
type StorageType = "room" | "cold";
type TimingType = "morning" | "lunch" | "dinner" | "bedtime" | "as_needed";

interface Medicine {
  id: number;
  name: string;
  instruction: string;
  type: MedicineType;
  storage: StorageType;
  requiresWiping: boolean;
  eyeTarget?: "both" | "right" | "left";
  timings?: TimingType[];
}

interface SnackbarState {
  visible: boolean;
  message: string;
  actionType: "delete" | "edit" | null;
  prevData: Medicine | null;
}

const typeOrder: Record<MedicineType, number> = {
  water: 1,
  suspension: 2,
  gel: 3,
  ointment: 4,
};

const initialMedicines: Medicine[] = [
  { id: 1, name: "ヒアルロン酸Na", instruction: "両目 1滴", type: "water", storage: "room", requiresWiping: false, timings: ["morning", "lunch", "dinner"] },
  { id: 3, name: "キサラタン", instruction: "両目 1滴", type: "water", storage: "cold", requiresWiping: true, timings: ["bedtime"] },
  { id: 4, name: "タリビット眼軟膏", instruction: "両目 塗布", type: "ointment", storage: "room", requiresWiping: false, timings: ["bedtime"] },
  { id: 2, name: "フルオロメトロン", instruction: "両目 1滴", type: "suspension", storage: "room", requiresWiping: false, timings: ["morning", "lunch", "dinner"] },
];

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

  // スナックバー用ステートとタイマー
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    visible: false,
    message: "",
    actionType: null,
    prevData: null,
  });
  const snackbarTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 登録済みの目薬リスト用のステート
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // ヘルプ・アップデート・ライセンス用モーダルステート
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);

  // アンマウント時にタイマーをクリーンアップ
  useEffect(() => {
    return () => {
      if (snackbarTimerRef.current) {
        clearTimeout(snackbarTimerRef.current);
      }
    };
  }, []);

  // マウント時にlocalStorageからロード
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("my_medication_data");
    if (saved) {
      try {
        setMedicines(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse medicines", e);
      }
    } else {
      setMedicines(sortMedicines(initialMedicines));
    }
  }, []);

  const handleTimingChange = (timing: TimingType) => {
    setNewTimings((prev) =>
      prev.includes(timing)
        ? prev.filter((t) => t !== timing)
        : [...prev, timing]
    );
  };

  // スナックバー表示処理
  const showSnackbar = (message: string, actionType: "delete" | "edit", prevData: Medicine) => {
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current);
    }

    setSnackbar({
      visible: true,
      message,
      actionType,
      prevData,
    });

    snackbarTimerRef.current = setTimeout(() => {
      setSnackbar((prev) => ({ ...prev, visible: false }));
    }, 5000);
  };

  // 操作取り消し (Undo) 処理
  const handleUndo = () => {
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

    setMedicines(updated);
    localStorage.setItem("my_medication_data", JSON.stringify(updated));

    // スナックバー非表示にしてタイマークリア
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current);
    }
    setSnackbar({
      visible: false,
      message: "",
      actionType: null,
      prevData: null,
    });
  };

  // 編集開始処理
  const handleEditClick = (med: Medicine) => {
    setEditingId(med.id);
    setNewName(med.name);
    setEyeTarget(med.eyeTarget || "both");
    setNewType(med.type);
    setNewStorage(med.storage);
    setNewRequiresWiping(med.requiresWiping);
    setNewTimings(med.timings || []);
    
    // 入力フォーム（目薬の名前）にフォーカスし、そこへスムーズにスクロール
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  // フォームクリア
  const resetForm = () => {
    setNewName("");
    setEyeTarget("both");
    setNewType("water");
    setNewStorage("room");
    setNewRequiresWiping(false);
    setNewTimings([]);
    setEditingId(null);
  };

  // 編集キャンセル
  const handleCancelEdit = () => {
    resetForm();
  };

  // 削除処理
  const handleDeleteMedicine = (id: number, name: string) => {
    if (!confirm(`本当に「${name}」を削除してもよろしいですか？`)) {
      return;
    }

    const medToDelete = medicines.find((med) => med.id === id);
    if (!medToDelete) return;

    const updated = medicines.filter((med) => med.id !== id);
    setMedicines(updated);
    localStorage.setItem("my_medication_data", JSON.stringify(updated));

    // 操作取り消し用のスナックバーを表示
    showSnackbar(`「${name}」を削除しました`, "delete", medToDelete);

    // 現在の進捗インデックスの安全調整
    const savedIndex = localStorage.getItem("eye-drop-currentIndex");
    if (savedIndex) {
      const idx = parseInt(savedIndex, 10);
      if (idx >= updated.length) {
        localStorage.setItem("eye-drop-currentIndex", "0");
        localStorage.setItem("eye-drop-status", "pending");
      }
    }
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

  // ソートロジック
  const sortMedicines = (list: Medicine[]): Medicine[] => {
    return [...list].sort((a, b) => {
      const diff = typeOrder[a.type] - typeOrder[b.type];
      if (diff === 0) {
        return a.id - b.id;
      }
      return diff;
    });
  };

  // 目薬の登録・更新処理
  const handleAddMedicine = (e: React.FormEvent) => {
    e.preventDefault();
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

    if (editingId !== null) {
      const medToEdit = medicines.find((med) => med.id === editingId);
      if (!medToEdit) return;

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
          };
        }
        return med;
      });

      const sorted = sortMedicines(updatedMedicines);
      setMedicines(sorted);
      localStorage.setItem("my_medication_data", JSON.stringify(sorted));

      // 操作取り消し用のスナックバーを表示
      showSnackbar(`「${newName.trim()}」の変更を保存しました`, "edit", medToEdit);

      // 編集完了後はフォームをリセットし、設定画面に留まる
      resetForm();
    } else {
      // 新規登録処理
      const newMed: Medicine = {
        id: Date.now(),
        name: newName.trim(),
        instruction: instructionText,
        type: newType,
        storage: newStorage,
        requiresWiping: newRequiresWiping,
        eyeTarget: eyeTarget,
        timings: newTimings,
      };

      // 追加してソート
      const updatedMedicines = sortMedicines([...medicines, newMed]);

      // ステートとlocalStorageに保存
      setMedicines(updatedMedicines);
      localStorage.setItem("my_medication_data", JSON.stringify(updatedMedicines));

      // フォームリセット
      resetForm();

      // 新規登録時はホームに戻る
      router.push("/");
    }
  };

  // アプリの全データを初期状態に戻す処理
  const handleResetAllData = () => {
    if (!confirm("登録されているすべての目薬データが消去されます。本当に初期化してもよろしいですか？")) {
      return;
    }
    if (!confirm("本当に元に戻せませんが、よろしいですか？")) {
      return;
    }

    // ① LocalStorage に空配列を設定して初期化
    localStorage.setItem("my_medication_data", JSON.stringify([]));

    // ② 関連する一時ステートなどを削除
    localStorage.removeItem("eye-drop-selectedTiming");
    localStorage.removeItem("eye-drop-timingStates");
    localStorage.removeItem("eye-drop-currentIndex");
    localStorage.removeItem("eye-drop-status");

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

      {/* 設定画面（入力フォーム） */}
      <div className="px-6 py-6 max-w-md mx-auto w-full animate-slide-in-fast">
        <form onSubmit={handleAddMedicine} className="space-y-6 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          {/* フォームタイトル（動的切り替え） */}
          <h2 className="text-base font-bold text-slate-800 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-3 mb-2 flex items-center gap-2">
            {editingId !== null ? "✏️ 目薬の情報を修正する" : "＋ 新しく目薬を登録する"}
          </h2>

          {/* 1. 目薬の名前 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              目薬の名前
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例：ヒアレイン点眼液"
              className="w-full p-4 text-base border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 min-h-[48px]"
              required
            />
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
                  className="flex-grow bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base py-4 rounded-2xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  更新内容を保存する
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
                className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-base py-4 rounded-2xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                目薬をリストに追加する
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 登録済みの目薬一覧 */}
      {isMounted && (
        <div className="px-6 pb-20 max-w-md mx-auto w-full animate-slide-in-fast">
          <div className="border-t border-gray-200 dark:border-gray-800 my-8 pt-8">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
              登録済みの目薬一覧 ({medicines.length})
            </h2>

            {medicines.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-gray-700">
                登録されている目薬はありません。
              </div>
            ) : (
              <div className="space-y-4">
                {medicines.map((med) => (
                  <div
                    key={med.id}
                    className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between gap-4"
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

                    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 flex justify-end gap-3">
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
                        onClick={() => handleDeleteMedicine(med.id, med.name)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-955/20 dark:text-red-400 dark:hover:bg-red-900/30 font-bold text-xs px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation min-h-[38px]"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        この目薬を削除する
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* アプリ初期化ボタン */}
            <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800 text-center">
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

            {/* アプリ情報エリア（フッター） */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-4">
              <button
                type="button"
                onClick={() => setIsUpdateOpen(true)}
                className="w-full py-3.5 px-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 border border-gray-200 dark:border-gray-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-2xl transition-all cursor-pointer min-h-[44px] flex items-center justify-between shadow-sm"
              >
                <span className="flex items-center gap-2">🆙 アップデート情報</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Ver. 1.1.1</span>
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
            </div>
          </div>
        </div>
      )}

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
              <h3 className="text-lg font-black text-slate-800 dark:text-white">目薬の登録・編集・削除の方法</h3>
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
                  <p className="font-extrabold text-slate-800 dark:text-white">■ Ver. 1.1.1</p>
                  <p className="pl-2 text-xs text-slate-500 mt-1">・設定画面の下にいつでも見られる「使い方ボタン」等を新設。</p>
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
