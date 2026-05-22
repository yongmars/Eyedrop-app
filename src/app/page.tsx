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

export default function Home() {
  const getTimingLabel = (t: TimingType) => {
    switch (t) {
      case "morning": return { label: "朝", icon: "/morning.png", color: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900/30" };
      case "lunch": return { label: "昼", icon: "/lunch.png", color: "bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-955/20 dark:text-sky-400 dark:border-sky-900/30" };
      case "dinner": return { label: "夕", icon: "/dinner.png", color: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-955/20 dark:text-orange-400 dark:border-orange-900/30" };
      case "bedtime": return { label: "就寝前", icon: "/bedtime.png", color: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-955/20 dark:text-indigo-400 dark:border-indigo-900/30" };
      case "as_needed": return { label: "頓用", icon: "/as_needed.png", color: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-955/20 dark:text-purple-400 dark:border-purple-900/30" };
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
  const [character, setCharacter] = useState<"noct" | "lux">("lux");
  const [shaken, setShaken] = useState(false);

  // デバッグ用ログ
  const [debugLog, setDebugLog] = useState<string[]>(["App Started"]);
  const addDebug = (msg: string) => {
    setDebugLog((prev) => [...prev, msg].slice(-5));
  };

  const getInitialTiming = (): TabTimingType => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return "morning";
    if (hour >= 11 && hour < 16) return "lunch";
    if (hour >= 16 && hour < 20) return "dinner";
    return "bedtime";
  };

  // localStorageからのハイドレーション安全なデータ読み込み
  useEffect(() => {
    setIsMounted(true);
    
    const savedMed = localStorage.getItem("my_medication_data");
    if (savedMed) {
      try {
        setMedicines(JSON.parse(savedMed));
      } catch (e) {
        console.error("Failed to parse medicines", e);
      }
    } else {
      setMedicines(sortMedicines(initialMedicines));
    }

    const savedTiming = localStorage.getItem("eye-drop-selectedTiming");
    if (savedTiming && ["morning", "lunch", "dinner", "bedtime"].includes(savedTiming)) {
      setSelectedTiming(savedTiming as TabTimingType);
    } else {
      setSelectedTiming(getInitialTiming());
    }

    const savedStates = localStorage.getItem("eye-drop-timingStates");
    if (savedStates) {
      try {
        setTimingStates(JSON.parse(savedStates));
      } catch (e) {
        console.error("Failed to parse timingStates", e);
      }
    }
  }, []);

  // ステート保存
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("my_medication_data", JSON.stringify(medicines));
    }
  }, [medicines, isMounted]);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("eye-drop-selectedTiming", selectedTiming);
    }
  }, [selectedTiming, isMounted]);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("eye-drop-timingStates", JSON.stringify(timingStates));
    }
  }, [timingStates, isMounted]);

  // 時間帯によるキャラクター初期設定・切り替え
  useEffect(() => {
    if (selectedTiming === "morning" || selectedTiming === "lunch") {
      setCharacter("lux");
    } else {
      setCharacter("noct");
    }
  }, [selectedTiming]);

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

    if (currentState.status === "good" || currentState.currentIndex >= sortedNormal.length) {
      setMessage(`お疲れ様！\n${timingLabel}の点眼は全部終わったよ！`);
    } else if (currentState.status === "waiting") {
      setMessage("次の目薬まで5分待とう！");
    } else if (currentState.status === "towel") {
      setMessage("⚠️ 点眼後は周りを拭き取ってね！");
    } else if (currentState.status === "ok") {
      setMessage("いいね！");
    } else if (currentState.status === "pending") {
      if (currentMed) {
        if (currentMed.type === "suspension") {
          setMessage(`次は ${currentMed.name} だよ！\nよく振ってからさしてね！`);
        } else {
          setMessage(`次は ${currentMed.name} だよ！`);
        }
      } else {
        setMessage(`${timingLabel}に登録されている目薬はないよ。`);
      }
    }
  }, [selectedTiming, timingStates, medicines]);

  // キャラクター画像取得
  const getCharacterImage = () => {
    const currentState = timingStates[selectedTiming];
    if (currentState.status === "waiting") {
      return character === "noct" ? "/noct_5min.png" : "/lux_5min.png";
    }

    if (currentState.status === "pending") {
      const tNormalMeds = medicines.filter(
        (m) => m.timings?.includes(selectedTiming) && !m.timings?.includes("as_needed")
      );
      const sortedNormal = sortMedicines(tNormalMeds);
      const currentMed = sortedNormal[currentState.currentIndex];
      
      if (currentMed?.type === "suspension") {
        return `/${character}_sus.png`;
      }
      return `/${character}_main.png`;
    }

    return `/${character}_${currentState.status}.png`; // ok, good, towel
  };

  const getAnimationClass = () => {
    return character === "lux" ? "animate-slide-in-fast" : "animate-float-in-soft";
  };

  const handleNormalDrop = (med: Medicine) => {
    addDebug("1. handleNormalDrop start");
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
    { type: "morning", label: "朝", icon: "/morning.png", activeColor: "bg-amber-500 text-white shadow-amber-500/30" },
    { type: "lunch", label: "昼", icon: "/lunch.png", activeColor: "bg-sky-500 text-white shadow-sky-500/30" },
    { type: "dinner", label: "夕", icon: "/dinner.png", activeColor: "bg-orange-500 text-white shadow-orange-500/30" },
    { type: "bedtime", label: "就寝前", icon: "/bedtime.png", activeColor: "bg-indigo-500 text-white shadow-indigo-500/30" },
  ];

  return (
    <div className="flex flex-col min-h-full bg-gray-50 dark:bg-gray-900">
      {/* 画面上部にデバッグログを強制表示（最前面） */}
      <div className="fixed top-0 left-0 w-full bg-black/80 text-green-400 font-mono text-[10px] p-2 z-[9999] pointer-events-none">
        {debugLog.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>

      {/* 画面上部：ガイドエリア（固定） */}
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm pt-14 pb-4 px-6 flex-shrink-0 border-b border-gray-200 dark:border-gray-800 shadow-sm animate-slide-in-fast">
        <header className="w-full mb-4 text-center flex justify-between items-center">
          <div className="w-12"></div>
          
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            今日の点眼予定
          </h1>

          {/* Debug skip button if waiting */}
          {timingStates[selectedTiming].status === "waiting" ? (
            <button onClick={skipTimer} className="text-xs text-blue-500 font-bold bg-blue-100 px-2 py-1 rounded touch-manipulation cursor-pointer">スキップ</button>
          ) : <div className="w-12"></div>}
        </header>

        {/* Character Area */}
        <div
          className="flex flex-col items-center justify-center h-[200px] relative cursor-pointer touch-manipulation"
          onClick={() => {
            addDebug("Char clicked(click)");
            setCharacter((prev) => (prev === "lux" ? "noct" : "lux"));
          }}
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const diff = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
            if (diff < 10) {
              e.preventDefault();
              addDebug("Char clicked(touch)");
              setCharacter((prev) => (prev === "lux" ? "noct" : "lux"));
            }
          }}
        >
          <div className="mr-24"> {/* 吹き出しと被らないようにキャラをさらに左にずらす */}
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
          {/* Chat Bubble */}
          <div className="absolute top-2 right-2 md:right-6 bg-white dark:bg-slate-700 shadow-md rounded-2xl rounded-bl-none p-3 px-4 transform rotate-2 max-w-[150px]">
            <p className="text-sm font-bold text-blue-600 dark:text-blue-300 whitespace-pre-line">{message}</p>
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
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300 flex items-center gap-1">
                        <img src="/as_needed.png" alt="" className="w-3.5 h-3.5 object-contain" />
                        頓用
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                        {getTypeLabel(med.type)}
                      </span>
                      {med.storage === "cold" ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-cyan-600 bg-cyan-100 flex items-center gap-1" title="冷所保存">
                          <img src="/cold.png" alt="" className="w-3.5 h-3.5 object-contain" />
                          冷所
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-orange-600 bg-orange-100 flex items-center gap-1" title="室温保存">
                          <img src="/room.png" alt="" className="w-3.5 h-3.5 object-contain" />
                          室温
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold mt-1 text-slate-800 dark:text-white">
                      {med.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{med.instruction}</p>
                    
                    {med.timings && med.timings.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
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
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                        {idxInNormal + 1}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                        {getTypeLabel(med.type)}
                      </span>
                      {med.storage === "cold" ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-cyan-600 bg-cyan-100 flex items-center gap-1" title="冷所保存">
                          <img src="/cold.png" alt="" className="w-3.5 h-3.5 object-contain" />
                          冷所
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-orange-600 bg-orange-100 flex items-center gap-1" title="室温保存">
                          <img src="/room.png" alt="" className="w-3.5 h-3.5 object-contain" />
                          室温
                        </span>
                      )}
                    </div>
                    <h2 className={`text-xl font-bold mt-1 ${isPast ? "line-through text-gray-400" : "text-slate-800 dark:text-white"}`}>
                      {med.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{med.instruction}</p>

                    {med.timings && med.timings.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
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
    </div>
  );
}
