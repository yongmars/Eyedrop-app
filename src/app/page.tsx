"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";

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

const typeOrder: Record<MedicineType, number> = {
  water: 1,
  suspension: 2,
  gel: 3,
  ointment: 4,
};

// サンプルデータ
const initialMedicines: Medicine[] = [
  { id: 1, name: "ヒアルロン酸Na", instruction: "両目 1滴", type: "water", storage: "room", requiresWiping: false, timings: ["morning", "lunch", "dinner"] },
  { id: 3, name: "キサラタン", instruction: "両目 1滴", type: "water", storage: "cold", requiresWiping: true, timings: ["bedtime"] },
  { id: 4, name: "タリビット眼軟膏", instruction: "両目 塗布", type: "ointment", storage: "room", requiresWiping: false, timings: ["bedtime"] },
  { id: 2, name: "フルオロメトロン", instruction: "両目 1滴", type: "suspension", storage: "room", requiresWiping: false, timings: ["morning", "lunch", "dinner"] },
];

type TabTimingType = "morning" | "lunch" | "dinner" | "bedtime";

interface TimingState {
  currentIndex: number;
  status: "pending" | "ok" | "towel" | "waiting" | "good";
  timeLeft: number;
}

interface DailyHistory {
  morning?: boolean;
  lunch?: boolean;
  evening?: boolean; // dinnerに対応
  bedtime?: boolean;
}

export default function Home() {
  const greetingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLoaded = useRef(false);

  const startGreeting = () => {
    if (greetingTimerRef.current) {
      clearTimeout(greetingTimerRef.current);
    }
    setShowGreeting(true);
    greetingTimerRef.current = setTimeout(() => {
      setShowGreeting(false);
    }, 3000);
  };

  const stopGreeting = () => {
    if (greetingTimerRef.current) {
      clearTimeout(greetingTimerRef.current);
      greetingTimerRef.current = null;
    }
    setShowGreeting(false);
  };

  const getTimingLabel = (t: TimingType) => {
    switch (t) {
      case "morning": return { label: "朝", icon: "/morning.webp", color: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900/30" };
      case "lunch": return { label: "昼", icon: "/lunch.webp", color: "bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-955/20 dark:text-sky-400 dark:border-sky-900/30" };
      case "dinner": return { label: "夕", icon: "/dinner.webp", color: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-955/20 dark:text-orange-400 dark:border-orange-900/30" };
      case "bedtime": return { label: "就寝前", icon: "/bedtime.webp", color: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-955/20 dark:text-indigo-400 dark:border-indigo-900/30" };
      case "as_needed": return { label: "頓用", icon: "/as_needed.webp", color: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-955/20 dark:text-purple-400 dark:border-purple-900/30" };
    }
  };

  const sortMedicines = (list: Medicine[]): Medicine[] => {
    return [...list].sort((a, b) => {
      const diff = typeOrder[a.type] - typeOrder[b.type];
      if (diff === 0) {
        return a.id - b.id;
      }
      return diff;
    });
  };

  // ステート初期値
  const [medicines, setMedicines] = useState<Medicine[]>(initialMedicines);
  const [isMounted, setIsMounted] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const [selectedTiming, setSelectedTiming] = useState<TabTimingType>("morning");
  const [timingStates, setTimingStates] = useState<Record<TabTimingType, TimingState>>({
    morning: { currentIndex: 0, status: "pending", timeLeft: 300 },
    lunch: { currentIndex: 0, status: "pending", timeLeft: 300 },
    dinner: { currentIndex: 0, status: "pending", timeLeft: 300 },
    bedtime: { currentIndex: 0, status: "pending", timeLeft: 300 },
  });

  const [asNeededShaken, setAsNeededShaken] = useState<Record<number, boolean>>({});
  const [asNeededStatus, setAsNeededStatus] = useState<Record<number, "pending" | "ok" | "towel">>({});
  const [asNeededProcessing, setAsNeededProcessing] = useState<Record<number, boolean>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const touchStartY = useRef(0); // スマホ用タップ判定

  const [message, setMessage] = useState("忘れずに目薬をさしましょう！");
  const [character, setCharacter] = useState<"saku" | "lux" | "noct">("lux");
  const [showGreeting, setShowGreeting] = useState(false);
  const [shaken, setShaken] = useState(false);

  // デバッグ用ログ
  const [debugLog, setDebugLog] = useState<string[]>(["App Started"]);
  const addDebug = (msg: string) => {
    setDebugLog((prev) => [...prev, msg].slice(-5));
  };

  // 現在の時間帯で次にさす予定の薬名を取得するヘルパー関数
  const getNextMedicineName = (timing: TabTimingType): string => {
    const tNormalMeds = medicines.filter(
      (med) => med.timings?.includes(timing) && !med.timings?.includes("as_needed")
    );
    const sortedNormal = sortMedicines(tNormalMeds);
    const currentState = timingStates[timing];
    const currentMed = sortedNormal[currentState?.currentIndex ?? 0];
    if (currentMed) {
      return currentMed.name;
    }
    if (medicines.length > 0) {
      return medicines[0].name;
    }
    return "目薬";
  };

  const getInitialTiming = (): TabTimingType => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 11) return "morning";
    if (hour >= 11 && hour < 16) return "lunch";
    if (hour >= 16 && hour < 20) return "dinner";
    return "bedtime";
  };

  const getTodayString = (): string => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // localStorageからのハイドレーション安全なデータ読み込み
  useEffect(() => {
    const savedMed = localStorage.getItem("my_medication_data");
    let currentMeds = initialMedicines;
    if (savedMed) {
      try {
        currentMeds = JSON.parse(savedMed);
        setMedicines(currentMeds);
      } catch (e) {
        console.error("Failed to parse medicines", e);
        setMedicines(sortMedicines(initialMedicines));
      }
    } else {
      setMedicines(sortMedicines(initialMedicines));
    }

    setSelectedTiming(getInitialTiming());

    const todayStr = getTodayString();
    const lastSavedDate = localStorage.getItem("eye-drop-lastSavedDate");
    const savedStates = localStorage.getItem("eye-drop-timingStates");

    if (lastSavedDate !== todayStr) {
      // 日付が切り替わっているため、タイミングの状態をリセット
      const resetStates: Record<TabTimingType, TimingState> = {
        morning: { currentIndex: 0, status: "pending", timeLeft: 300 },
        lunch: { currentIndex: 0, status: "pending", timeLeft: 300 },
        dinner: { currentIndex: 0, status: "pending", timeLeft: 300 },
        bedtime: { currentIndex: 0, status: "pending", timeLeft: 300 },
      };

      // お薬がない時間帯は自動で good にする
      (Object.keys(resetStates) as TabTimingType[]).forEach((t) => {
        const tNormalMeds = currentMeds.filter(
          (m) => m.timings?.includes(t) && !m.timings?.includes("as_needed")
        );
        if (tNormalMeds.length === 0) {
          resetStates[t] = { currentIndex: 0, status: "good", timeLeft: 0 };
        }
      });

      setTimingStates(resetStates);
      localStorage.setItem("eye-drop-timingStates", JSON.stringify(resetStates));
      localStorage.setItem("eye-drop-lastSavedDate", todayStr);
    } else if (savedStates) {
      try {
        setTimingStates(JSON.parse(savedStates));
      } catch (e) {
        console.error("Failed to parse timingStates", e);
      }
    } else {
      localStorage.setItem("eye-drop-lastSavedDate", todayStr);
    }

    // ロード完了をマーク
    isLoaded.current = true;
    setIsMounted(true);
  }, []);

  // 起動時の初期化および挨拶タイマー（pending状態のみ）
  useEffect(() => {
    if (isMounted) {
      const hour = new Date().getHours();

      const getCharacterByTime = (h: number): "saku" | "lux" | "noct" => {
        if (h >= 6 && h < 11) return "saku";
        if (h >= 11 && h < 16) return "lux";
        return "noct";
      };

      const initialChar = getCharacterByTime(hour);
      setCharacter(initialChar);

      // 起動時は常に現在時刻に対応したタブに強制移動
      const currentTab = getInitialTiming();
      setSelectedTiming(currentTab);

      // timingStatesの初期値をlocalStorageから読み取った値で確認
      let localStates = timingStates;
      const savedStates = localStorage.getItem("eye-drop-timingStates");
      if (savedStates) {
        try {
          localStates = JSON.parse(savedStates);
        } catch (e) {
          console.error("Failed to parse timingStates", e);
        }
      }

      const currentState = localStates[currentTab];
      const isInitialPending = currentState ? (currentState.currentIndex === 0 && currentState.status === "pending") : true;

      if (isInitialPending) {
        startGreeting();
      } else {
        stopGreeting();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  // Service Workerの登録
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered with scope:', reg.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    }
  }, []);

  // ステート保存と整合性の維持
  useEffect(() => {
    // ロード完了前、またはマウント前は上書きを防ぐためスキップ
    if (!isMounted || !isLoaded.current) return;

    localStorage.setItem("my_medication_data", JSON.stringify(medicines));

    // お薬データの変更に合わせて timingStates の整合性を検証・補正
    setTimingStates((prev) => {
      let changed = false;
      const next = { ...prev };

      (Object.keys(next) as TabTimingType[]).forEach((t) => {
        const tNormalMeds = medicines.filter(
          (m) => m.timings?.includes(t) && !m.timings?.includes("as_needed")
        );
        const sortedNormal = sortMedicines(tNormalMeds);

        // お薬が登録されていない場合 -> 自動的に good にする
        if (sortedNormal.length === 0) {
          if (next[t].status !== "good") {
            next[t] = { currentIndex: 0, status: "good", timeLeft: 0 };
            changed = true;
          }
        } else {
          // お薬が登録されているが、インデックスがオーバーしている場合は範囲内に調整し、かつ完了状態にする
          if (next[t].currentIndex >= sortedNormal.length) {
            next[t] = { currentIndex: sortedNormal.length - 1, status: "good", timeLeft: 0 };
            changed = true;
          } else {
            // お薬が追加されたケースの判定：
            // status が good（完了）になっているが、現在のインデックスが最終お薬インデックスに達していない場合
            // 新しいお薬が最後に追加されたとみなして、追加分を点眼させるために pending（未完了）に戻します。
            if (next[t].status === "good" && next[t].currentIndex < sortedNormal.length - 1) {
              next[t] = { currentIndex: next[t].currentIndex + 1, status: "pending", timeLeft: 300 };
              changed = true;
            }
          }
        }
      });

      return changed ? next : prev;
    });
  }, [medicines, isMounted]);

  useEffect(() => {
    // ロード完了前、またはマウント前は上書きを防ぐためスキップ
    if (!isMounted || !isLoaded.current) return;

    localStorage.setItem("eye-drop-selectedTiming", selectedTiming);
  }, [selectedTiming, isMounted]);

  useEffect(() => {
    // ロード完了前、またはマウント前は上書きを防ぐためスキップ
    if (!isMounted || !isLoaded.current) return;

    localStorage.setItem("eye-drop-timingStates", JSON.stringify(timingStates));
    localStorage.setItem("eye-drop-lastSavedDate", getTodayString());

    // 各時間帯の status が "good" かどうかを判定して eye-drop-history に反映
    const todayStr = getTodayString();
    const savedHistory = localStorage.getItem("eye-drop-history");
    let history: Record<string, DailyHistory> = {};

    if (savedHistory) {
      try {
        history = JSON.parse(savedHistory);
      } catch (e) {
        console.error("Failed to parse eye-drop-history", e);
      }
    }

    // 今日の履歴を取得または初期化
    const todayHistory: DailyHistory = history[todayStr] || {};

    // 各時間帯が完了(good)しているかどうかをチェック
    // dinner は DailyHistory の evening に対応
    const newMorning = timingStates.morning.status === "good";
    const newLunch = timingStates.lunch.status === "good";
    const newEvening = timingStates.dinner.status === "good";
    const newBedtime = timingStates.bedtime.status === "good";

    // 変化があった場合のみ履歴を更新して保存
    if (
      todayHistory.morning !== newMorning ||
      todayHistory.lunch !== newLunch ||
      todayHistory.evening !== newEvening ||
      todayHistory.bedtime !== newBedtime
    ) {
      history[todayStr] = {
        ...todayHistory,
        morning: newMorning,
        lunch: newLunch,
        evening: newEvening,
        bedtime: newBedtime,
      };
      localStorage.setItem("eye-drop-history", JSON.stringify(history));
    }
  }, [timingStates, isMounted]);

  // 時間帯（タブ）選択によるキャラクター切り替え
  useEffect(() => {
    if (!isMounted) return;

    if (selectedTiming === "morning") {
      setCharacter("saku");
    } else if (selectedTiming === "lunch") {
      setCharacter("lux");
    } else {
      setCharacter("noct");
    }

    const currentState = timingStates[selectedTiming];
    if (currentState && currentState.currentIndex === 0 && currentState.status === "pending") {
      startGreeting();
    } else {
      stopGreeting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTiming, isMounted]);

  // タイマー処理 (すべての時間帯をバックグラウンドで毎秒監視)
  useEffect(() => {
    const timer = setInterval(() => {
      setTimingStates((prev) => {
        let changed = false;
        const next = { ...prev };

        (Object.keys(next) as TabTimingType[]).forEach((t) => {
          const state = next[t];
          if (state.status === "waiting") {
            changed = true;
            if (state.timeLeft > 0) {
              next[t] = {
                ...state,
                timeLeft: state.timeLeft - 1,
              };
            } else {
              // 待機終了 -> 次の目薬へ進む
              const tNormalMeds = medicines.filter(
                (med) => med.timings?.includes(t) && !med.timings?.includes("as_needed")
              );
              const sortedNormal = sortMedicines(tNormalMeds);
              const nextIndex = state.currentIndex + 1;

              if (nextIndex >= sortedNormal.length) {
                next[t] = {
                  currentIndex: nextIndex,
                  status: "good",
                  timeLeft: 0,
                };
              } else {
                next[t] = {
                  currentIndex: nextIndex,
                  status: "pending",
                  timeLeft: 300,
                };
              }
            }
          }
        });

        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [medicines]);

  // セリフ（メッセージ）の自動更新
  useEffect(() => {
    const currentState = timingStates[selectedTiming];
    const tNormalMeds = medicines.filter(
      (med) => med.timings?.includes(selectedTiming) && !med.timings?.includes("as_needed")
    );
    const sortedNormal = sortMedicines(tNormalMeds);
    const currentMed = sortedNormal[currentState.currentIndex];

    let timingLabel = "";
    switch (selectedTiming) {
      case "morning": timingLabel = "朝"; break;
      case "lunch": timingLabel = "昼"; break;
      case "dinner": timingLabel = "夕"; break;
      case "bedtime": timingLabel = "就寝前"; break;
    }

    // 最初の挨拶フェーズ中
    if (showGreeting) {
      if (selectedTiming === "morning") {
        setMessage("おはようございます。朝の時間の点眼です。");
      } else if (selectedTiming === "lunch") {
        setMessage("こんにちは。昼の時間の点眼だよ");
      } else if (selectedTiming === "dinner") {
        setMessage("こんばんは。夕の時間の点眼だよ");
      } else { // bedtime
        setMessage("今日もおつかれさま。就寝前の時間の点眼だよ");
      }
      return;
    }

    if (currentState.status === "good" || currentState.currentIndex >= sortedNormal.length) {
      setMessage("おつかれさま、全部終わったよ");
    } else if (currentState.status === "waiting") {
      setMessage("次の点眼まで５分待とう");
    } else if (currentState.status === "towel") {
      setMessage("⚠️ 点眼後は周りを拭き取ってね！");
    } else if (currentState.status === "ok") {
      setMessage("いいね");
    } else if (currentState.status === "pending") {
      if (currentMed) {
        if (currentMed.type === "suspension") {
          setMessage(`次は ${currentMed.name} だよ！\nよく振ってからさしてね！`);
        } else {
          setMessage(`次は ${currentMed.name} だよ`);
        }
      } else {
        setMessage(`${timingLabel}に登録されている目薬はないよ。`);
      }
    }
  }, [selectedTiming, timingStates, medicines, showGreeting, character]);

  // キャラクター画像取得
  const getCharacterImage = () => {
    if (showGreeting) {
      return `/${character}_main.webp`;
    }

    const currentState = timingStates[selectedTiming];
    if (currentState.status === "waiting") {
      return `/${character}_5min.webp`;
    }

    if (currentState.status === "pending") {
      const tNormalMeds = medicines.filter(
        (m) => m.timings?.includes(selectedTiming) && !m.timings?.includes("as_needed")
      );
      const sortedNormal = sortMedicines(tNormalMeds);
      const currentMed = sortedNormal[currentState.currentIndex];

      if (currentMed?.type === "suspension") {
        return `/${character}_sus.webp`;
      }
      return `/${character}_ed.webp`;
    }

    return `/${character}_${currentState.status}.webp`; // ok, good, towel
  };

  const getAnimationClass = () => {
    return character === "lux" ? "animate-slide-in-fast" : "animate-float-in-soft";
  };

  const handleNormalDrop = (med: Medicine) => {
    addDebug("1. handleNormalDrop start");
    stopGreeting();
    const currentState = timingStates[selectedTiming];
    if (isProcessing) {
      addDebug("2. return early: isProcessing is true");
      return;
    }

    if (med.type === "suspension" && !shaken) {
      addDebug("2. return: suspension alert");
      alert("点眼の前に目薬を振ってください！");
      return;
    }

    addDebug("3. setIsProcessing(true)");
    setIsProcessing(true);

    try {
      addDebug("4. fetching API...");
      fetch("/api/log-drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "drop",
          timestamp: new Date().toISOString(),
          medicine: med.name,
          timing: selectedTiming,
        }),
      }).catch(error => addDebug(`Fetch err: ${error.message}`));
    } catch (err) {
      addDebug(`Sync err: ${err}`);
    }

    const needsWiping = med.requiresWiping;
    addDebug(`5. setting status (wipe:${needsWiping})`);

    setTimingStates((prev) => ({
      ...prev,
      [selectedTiming]: {
        ...prev[selectedTiming],
        status: needsWiping ? "towel" : "ok",
      },
    }));

    addDebug("6. setTimeout scheduled");

    // 3秒後に次の状態へ
    setTimeout(() => {
      const tNormalMeds = medicines.filter(
        (m) => m.timings?.includes(selectedTiming) && !m.timings?.includes("as_needed")
      );
      const sortedNormal = sortMedicines(tNormalMeds);

      setTimingStates((prev) => {
        const state = prev[selectedTiming];
        const nextIndex = state.currentIndex;
        const hasNext = nextIndex < sortedNormal.length - 1;

        return {
          ...prev,
          [selectedTiming]: {
            ...prev[selectedTiming],
            status: hasNext ? "waiting" : "good",
            timeLeft: hasNext ? 300 : 0,
          },
        };
      });
      setShaken(false);
      setIsProcessing(false);
    }, 3000);
  };

  const handleAsNeededDrop = (med: Medicine) => {
    addDebug("1. handleAsNeededDrop start");
    stopGreeting();
    if (asNeededProcessing[med.id]) {
      addDebug("2. return early: already processing this ID");
      return;
    }

    if (med.type === "suspension" && !asNeededShaken[med.id]) {
      addDebug("2. return: suspension alert");
      alert("点眼の前に目薬を振ってください！");
      return;
    }

    addDebug("3. setAsNeededProcessing(true)");
    setAsNeededProcessing((prev) => ({ ...prev, [med.id]: true }));

    try {
      addDebug("4. fetching API...");
      fetch("/api/log-drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "drop",
          timestamp: new Date().toISOString(),
          medicine: med.name,
          timing: "as_needed",
        }),
      }).catch(error => addDebug(`Fetch err: ${error.message}`));
    } catch (err) {
      addDebug(`Sync err: ${err}`);
    }

    const needsWiping = med.requiresWiping;
    addDebug(`5. setting status (wipe:${needsWiping})`);

    setAsNeededStatus((prev) => ({
      ...prev,
      [med.id]: needsWiping ? "towel" : "ok",
    }));

    // 3秒後にリセット
    setTimeout(() => {
      setAsNeededStatus((prev) => ({
        ...prev,
        [med.id]: "pending",
      }));
      setAsNeededShaken((prev) => ({ ...prev, [med.id]: false }));
      setAsNeededProcessing((prev) => ({ ...prev, [med.id]: false }));
    }, 3000);
  };

  // デバッグ用タイマースキップ
  const skipTimer = () => {
    setTimingStates((prev) => ({
      ...prev,
      [selectedTiming]: {
        ...prev[selectedTiming],
        timeLeft: 0,
      }
    }));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
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

  const getFormattedDate = () => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const date = today.getDate();
    const dayNames = ["日", "月", "火", "放", "金", "土"];
    // 日月火水木金土ですね。タイポ防止で：
    // ["日", "月", "火", "水", "木", "金", "土"]
    const dayNamesCorrect = ["日", "月", "火", "水", "木", "金", "土"];
    const day = dayNamesCorrect[today.getDay()];
    return `${month}月${date}日（${day}）の点眼予定`;
  };

  const getFilteredMedicines = (): Medicine[] => {
    const normalMeds = medicines.filter(
      (med) => med.timings?.includes(selectedTiming) && !med.timings?.includes("as_needed")
    );
    const asNeededMeds = medicines.filter(
      (med) => med.timings?.includes("as_needed")
    );

    const sortedNormal = sortMedicines(normalMeds);
    const sortedAsNeeded = sortMedicines(asNeededMeds);

    return [...sortedNormal, ...sortedAsNeeded];
  };

  const timingTabs: { type: TabTimingType; label: string; icon: string; activeColor: string }[] = [
    { type: "morning", label: "朝", icon: "/morning.webp", activeColor: "bg-amber-500 text-white shadow-amber-500/30" },
    { type: "lunch", label: "昼", icon: "/lunch.webp", activeColor: "bg-sky-500 text-white shadow-sky-500/30" },
    { type: "dinner", label: "夕", icon: "/dinner.webp", activeColor: "bg-orange-500 text-white shadow-orange-500/30" },
    { type: "bedtime", label: "就寝前", icon: "/bedtime.webp", activeColor: "bg-indigo-500 text-white shadow-indigo-500/30" },
  ];

  return (
    <div className="flex flex-col min-h-full bg-gray-50 dark:bg-gray-900">
      {/* 画面最上部：独立したヘッダーエリア */}
      <div className="w-full bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 py-3 px-4 flex justify-between items-center z-30">
        <div className="flex items-center gap-2">
          <Image
            src="/Daily_eyedrops192.png"
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
        <header className="w-full mb-4 relative flex justify-center items-center min-h-[32px]">
          <h1 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white whitespace-nowrap text-center">
            {getFormattedDate()}
          </h1>

          {/* Debug skip button if waiting */}
          {timingStates[selectedTiming].status === "waiting" ? (
            <button onClick={skipTimer} className="absolute right-0 text-xs text-blue-500 font-bold bg-blue-100 px-2 py-1 rounded touch-manipulation cursor-pointer">スキップ</button>
          ) : null}
        </header>

        <div
          className="flex flex-col items-center justify-center h-[200px] relative cursor-pointer touch-manipulation"
          onClick={() => {
            addDebug("Char clicked(click)");
            stopGreeting();
            setCharacter((prev) => (prev === "lux" ? "noct" : prev === "noct" ? "saku" : "lux"));
          }}
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const diff = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
            if (diff < 10) {
              e.preventDefault();
              addDebug("Char clicked(touch)");
              stopGreeting();
              setCharacter((prev) => (prev === "lux" ? "noct" : prev === "noct" ? "saku" : "lux"));
            }
          }}
        >
          {/* キャラクター画像を中央から左寄りに配置 */}
          <div className="mr-24 sm:mr-32">
            <Image
              key={`${character}-${selectedTiming}`}
              src={getCharacterImage()}
              alt="キャラクター"
              width={180}
              height={180}
              className={`drop-shadow-lg object-contain ${getAnimationClass()}`}
              priority
            />
          </div>
          {/* Chat Bubble（画面右端寄りに absolute 配置） */}
          <div className="pop-speech-bubble select-none">
            <p className="text-sm font-bold text-[#0284c7] whitespace-pre-line text-center leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {/* 待機中のタイマー表示 */}
        {timingStates[selectedTiming].status === "waiting" && (
          <div className="mt-4 text-center animate-pulse bg-blue-50 dark:bg-blue-955/20 py-2.5 rounded-2xl border border-blue-100 dark:border-blue-900/30">
            <p className="text-3xl font-black text-blue-500 tracking-widest">{formatTime(timingStates[selectedTiming].timeLeft)}</p>
            <p className="text-xs text-slate-500 font-bold">次の目薬まで待機中...</p>
          </div>
        )}

        {/* Timing Tabs */}
        <div className="mt-6 flex justify-between gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl">
          {timingTabs.map((tab) => {
            const isActive = selectedTiming === tab.type;
            const tState = timingStates[tab.type];
            const tNormalMeds = medicines.filter(
              (m) => m.timings?.includes(tab.type) && !m.timings?.includes("as_needed")
            );
            const isTabDone = tNormalMeds.length > 0 && (tState.status === "good" || tState.currentIndex >= tNormalMeds.length);

            return (
              <button
                key={tab.type}
                onClick={() => setSelectedTiming(tab.type)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl transition-all duration-300 touch-manipulation cursor-pointer relative
                  ${isActive
                    ? `${tab.activeColor} scale-[1.03] shadow-md font-bold`
                    : "text-slate-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                  }`}
              >
                <img src={tab.icon} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
                <span className="text-xs sm:text-sm tracking-tight">{tab.label}</span>
                {isTabDone && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-slate-800">
                    ✓
                  </span>
                )}
                {!isTabDone && tState.status === "waiting" && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-slate-800 animate-pulse">
                    ⏱️
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 画面下部：目薬リスト（チラ見せレイアウト） */}
      <div className="px-6 py-6 space-y-4">
        {getFilteredMedicines().map((med) => {
          const isAsNeeded = med.timings?.includes("as_needed");

          if (isAsNeeded) {
            const medStatus = asNeededStatus[med.id] || "pending";
            const isProcessingThis = !!asNeededProcessing[med.id];
            const isDoneFeedback = medStatus === "ok" || medStatus === "towel";
            const isShakenChecked = !!asNeededShaken[med.id];

            return (
              <div
                key={med.id}
                className="w-full rounded-3xl shadow-sm border p-5 relative transition-all duration-300 bg-white dark:bg-slate-800 border-purple-200 dark:border-purple-900/40 ring-2 ring-purple-50 dark:ring-purple-950/20"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-full">
                    {/* カード最上部：スラッシュ区切りの属性・タイミング並び */}
                    <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3 border-b border-gray-100 dark:border-gray-700/50 pb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300 flex items-center gap-1">
                        <img src="/as_needed.webp" alt="" className="w-3.5 h-3.5 object-contain" />
                        頓用
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                        {getTypeLabel(med.type)}
                      </span>
                      {med.storage === "cold" ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-cyan-600 bg-cyan-100 flex items-center gap-1" title="冷所保存">
                          <img src="/cold.webp" alt="" className="w-3.5 h-3.5 object-contain" />
                          冷所
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-orange-600 bg-orange-100 flex items-center gap-1" title="室温保存">
                          <img src="/room.webp" alt="" className="w-3.5 h-3.5 object-contain" />
                          室温
                        </span>
                      )}
                      
                      <span className="text-gray-300 dark:text-gray-600 px-0.5">/</span>

                      {med.timings && med.timings.length > 0 && (
                        <div className="flex flex-wrap gap-1">
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

                    {/* 縦並びの2行配置 */}
                    <div className="mt-2 space-y-1.5">
                      {/* 1行目：お薬の名前 */}
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                        {med.name}
                      </h2>
                      {/* 2行目：点眼部位（薬名と同じくらいのサイズ、見やすい紫色） */}
                      <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                        <span>💧</span>
                        <span>{getEyeTargetLabel(med)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {med.requiresWiping && (
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 p-2 rounded-lg">
                    ⚠️ <span>点眼後は拭き取り・洗顔が必要</span>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  {med.type === "suspension" && !isDoneFeedback && (
                    <label className="flex items-center gap-3 mb-4 p-3.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl cursor-pointer touch-manipulation min-h-[44px]">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={isShakenChecked}
                        onChange={(e) => setAsNeededShaken((prev) => ({ ...prev, [med.id]: e.target.checked }))}
                      />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        目薬をよく振りましたか？
                      </span>
                    </label>
                  )}

                  <button
                    onClick={() => handleAsNeededDrop(med)}
                    disabled={isProcessingThis}
                    className={`w-full font-bold text-base py-3.5 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]
                      ${isProcessingThis
                        ? "bg-purple-400 text-white cursor-default pointer-events-none"
                        : isDoneFeedback
                          ? "bg-green-500 text-white shadow-green-500/30"
                          : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-purple-600/30"}`}
                  >
                    {isDoneFeedback ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        {medStatus === "towel" ? "拭き取り完了！" : "いいね！"}
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="m9 12 2 2 4-4" /></svg>
                        点眼した！
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          } else {
            const tNormalMeds = medicines.filter(
              (m) => m.timings?.includes(selectedTiming) && !m.timings?.includes("as_needed")
            );
            const sortedNormal = sortMedicines(tNormalMeds);
            const idxInNormal = sortedNormal.findIndex(m => m.id === med.id);
            const currentState = timingStates[selectedTiming];

            const isActive = idxInNormal === currentState.currentIndex && currentState.status !== "waiting" && currentState.status !== "good";
            const isProcessingThis = isActive && isProcessing;
            const isPast = idxInNormal < currentState.currentIndex || currentState.status === "good";

            return (
              <div
                key={med.id}
                className={`w-full rounded-3xl shadow-sm border p-5 relative transition-all duration-300 ${isActive
                  ? "bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-500 scale-100 opacity-100 ring-4 ring-blue-100 dark:ring-blue-900/50"
                  : isPast
                    ? "bg-gray-100 dark:bg-slate-800/50 border-transparent opacity-60 scale-[0.98]"
                    : "bg-white/80 dark:bg-slate-800/80 border-gray-100 dark:border-gray-700 opacity-90 scale-[0.98]"
                  }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-full">
                    {/* カード最上部：スラッシュ区切りの属性・タイミング並び */}
                    <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3 border-b border-gray-100 dark:border-gray-700/50 pb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                        {idxInNormal + 1}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                        {getTypeLabel(med.type)}
                      </span>
                      {med.storage === "cold" ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-cyan-600 bg-cyan-100 flex items-center gap-1" title="冷所保存">
                          <img src="/cold.webp" alt="" className="w-3.5 h-3.5 object-contain" />
                          冷所
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-orange-600 bg-orange-100 flex items-center gap-1" title="室温保存">
                          <img src="/room.webp" alt="" className="w-3.5 h-3.5 object-contain" />
                          室温
                        </span>
                      )}
                      
                      <span className="text-gray-300 dark:text-gray-600 px-0.5">/</span>

                      {med.timings && med.timings.length > 0 && (
                        <div className="flex flex-wrap gap-1">
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

                    {/* 縦並びの2行配置 */}
                    <div className="mt-2 space-y-1.5">
                      {/* 1行目：お薬の名前 */}
                      <h2 className={`text-2xl font-bold ${isPast ? "line-through text-gray-400" : "text-slate-800 dark:text-white"}`}>
                        {med.name}
                      </h2>
                      {/* 2行目：点眼部位（薬名と同じくらいのサイズ、見やすい青色、点眼済みの場合は薄く） */}
                      <div className={`text-2xl font-extrabold flex items-center gap-2 ${isPast ? "text-gray-400" : "text-blue-600 dark:text-blue-400"}`}>
                        <span>💧</span>
                        <span>{getEyeTargetLabel(med)}</span>
                      </div>
                    </div>
                  </div>
                  {isPast && (
                    <div className="bg-green-100 text-green-600 rounded-full p-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </div>
                  )}
                </div>

                {med.requiresWiping && (isActive || idxInNormal > currentState.currentIndex) && (
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 p-2 rounded-lg">
                    ⚠️ <span>点眼後は拭き取り・洗顔が必要</span>
                  </div>
                )}

                {isActive && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    {med.type === "suspension" && (
                      <label className="flex items-center gap-3 mb-4 p-3.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl cursor-pointer touch-manipulation min-h-[44px]">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={shaken}
                          onChange={(e) => setShaken(e.target.checked)}
                        />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          目薬をよく振りましたか？
                        </span>
                      </label>
                    )}

                    <button
                      onClick={() => handleNormalDrop(med)}
                      disabled={isProcessingThis}
                      className={`w-full font-bold text-base py-3.5 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]
                        ${isProcessingThis ? "bg-blue-400 text-white cursor-default pointer-events-none" : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-blue-500/30"}`}
                    >
                      {currentState.status === "ok" || currentState.status === "towel" ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                          {currentState.status === "towel" ? "拭き取り完了！" : "いいね！"}
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="m9 12 2 2 4-4" /></svg>
                          点眼した！
                        </>
                      )}
                    </button>
                  </div>
                )}

                {isProcessingThis && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-center text-sm font-bold text-blue-500 animate-pulse">
                    記録中...
                  </div>
                )}
              </div>
            );
          }
        })}
        {/* チラ見せ用の余白（最後の要素の後ろ） */}
        <div className="h-20"></div>
      </div>

      {/* アプリの使い方モーダル（全体スクロール方式） */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto custom-scrollbar animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg my-8 flex flex-col shadow-2xl relative overflow-hidden animate-scale-up">
            {/* モーダルヘッダー */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                <span>📖</span> アプリの使い方
              </h2>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-bold text-sm cursor-pointer touch-manipulation"
              >
                ✕
              </button>
            </div>

            {/* モーダルコンテンツ */}
            <div className="p-6 space-y-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {/* 項目1 */}
              <div className="bg-blue-50/50 dark:bg-blue-955/10 p-4 rounded-2xl border border-blue-100/50 dark:border-blue-900/30">
                <h3 className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mb-1.5">
                  <span>1️⃣</span> 順番に目薬をさして、ボタンをポン！
                </h3>
                <p>
                  目薬をさしたら「点眼した！」ボタンをタップします。終わった目薬のカードは自動的にうっすら薄くなり、緑のチェック（✓）がつきます。
                </p>
              </div>

              {/* 項目⚠️ */}
              <div className="bg-amber-50/50 dark:bg-amber-955/10 p-4 rounded-2xl border border-amber-100/50 dark:border-amber-900/30">
                <h3 className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1.5">
                  <span>⚠️</span> 【大切】よく振る目薬のちゅうい！
                </h3>
                <p>
                  「フルオロメトロン」などのよく振る目薬のときは、画面に「目薬をよく振りましたか？」という確認が出ます。ここにチェックを入れないとボタンが押せない安心安全システムです。
                </p>
              </div>

              {/* 項目⏳ */}
              <div className="bg-sky-50/50 dark:bg-sky-955/10 p-4 rounded-2xl border border-sky-100/50 dark:border-sky-900/30">
                <h3 className="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 mb-1.5">
                  <span>⏳</span> 2つ目の目薬は「5分タイマー」の後で！
                </h3>
                <p>
                  1つ目をさし終えると、ノクトたちが「5分待ってね」とカウントダウンを始めます。5分経つと、自動的に次の目薬のボタンがパッと押せるように切り替わります。
                </p>
              </div>

              {/* 項目2 */}
              <div className="bg-emerald-50/50 dark:bg-emerald-955/10 p-4 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/30">
                <h3 className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                  <span>2️⃣</span> 夜が明けると自動リセット！
                </h3>
                <p>
                  次の日になると、チェックは自動できれいに消えるので、毎朝新しくスタートできます。
                </p>
              </div>

              {/* 項目3 */}
              <div className="bg-rose-50/50 dark:bg-rose-955/10 p-4 rounded-2xl border border-rose-100/50 dark:border-rose-900/30">
                <h3 className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mb-1.5">
                  <span>3️⃣</span> ご褒美は肉球スタンプ🐾
                </h3>
                <p>
                  カレンダーを押すと、お薬をさした時間にかわいいピンクの肉球スタンプが自動で押されます。
                </p>
              </div>
            </div>

            {/* モーダルフッター */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-slate-800/50 sticky bottom-0 z-10 w-full">
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
    </div>
  );
}
