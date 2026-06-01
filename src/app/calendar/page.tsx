"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import pawImg from "../../../public/paw.webp";


type TabTimingType = "morning" | "lunch" | "dinner" | "bedtime";
type HistoryTimingType = "morning" | "lunch" | "evening" | "bedtime";

interface DailyHistory {
  morning?: boolean;
  lunch?: boolean;
  evening?: boolean; // dinnerに対応
  bedtime?: boolean;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  key: string;
}

export default function CalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [history, setHistory] = useState<Record<string, DailyHistory>>({});
  const [isMounted, setIsMounted] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // マウント時に LocalStorage からデータをロード
  useEffect(() => {
    setIsMounted(true);
    const savedHistory = localStorage.getItem("eye-drop-history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse eye-drop-history", e);
      }
    }
  }, []);

  // 前の月に切り替え
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  // 次の月に切り替え
  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // カレンダーの日付グリッドを生成 (6週間分 = 42マス)
  const getCalendarDays = (): CalendarDay[] => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    const days: CalendarDay[] = [];

    // 前月の埋め合わせ
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevTotalDays - i;
      const prevMonthDate = new Date(year, month - 1, d);
      const key = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        date: prevMonthDate,
        isCurrentMonth: false,
        key,
      });
    }

    // 当月の日付
    for (let i = 1; i <= totalDays; i++) {
      const currDate = new Date(year, month, i);
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        date: currDate,
        isCurrentMonth: true,
        key,
      });
    }

    // 翌月の埋め合わせ
    const remainingSlots = 42 - days.length;
    for (let i = 1; i <= remainingSlots; i++) {
      const nextMonthDate = new Date(year, month + 1, i);
      const key = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        date: nextMonthDate,
        isCurrentMonth: false,
        key,
      });
    }

    return days;
  };

  // 今日の日付文字列を取得 (YYYY-MM-DD)
  const getTodayString = (): string => {
    const d = new Date();
    d.setHours(d.getHours() - 4);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayString();
  const calendarDays = getCalendarDays();
  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

  if (!isMounted) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 justify-center items-center">
        <div className="text-slate-500 font-bold animate-pulse text-base">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* 画面上部ヘッダー（固定） */}
      <header className="sticky top-0 z-20 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm pt-4 pb-4 px-6 border-b border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center">
        <div className="w-full flex justify-between items-center relative min-h-[40px]">
          <button
            onClick={() => router.push("/")}
            className="text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 px-3.5 py-2 rounded-xl touch-manipulation cursor-pointer min-h-[40px] flex items-center justify-center"
          >
            戻る
          </button>
          
          <h1 className="text-xl font-bold text-slate-800 dark:text-white absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
            点眼履歴カレンダー
          </h1>

          <div className="w-12"></div>
        </div>
        <p className="text-xs text-slate-400 mt-2">日々の点眼が完了した時間帯に🐾が押されます</p>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* 月の切り替えコントロール */}
        <div className="flex items-center justify-between bg-white dark:bg-slate-850 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
          <button
            onClick={handlePrevMonth}
            className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none"
            aria-label="前月"
          >
            ◀
          </button>
          
          <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-wide">
            {year}年 {month + 1}月
          </h2>
          
          <button
            onClick={handleNextMonth}
            className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none"
            aria-label="翌月"
          >
            ▶
          </button>
        </div>

        {/* カレンダー本体のカード */}
        <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700/60 rounded-3xl shadow-md p-4 transition-all">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {weekDays.map((wd, index) => {
              let textClass = "text-slate-600 dark:text-slate-400";
              if (index === 0) textClass = "text-red-500 font-bold"; // 日曜日
              if (index === 6) textClass = "text-blue-500 font-bold"; // 土曜日
              return (
                <div key={wd} className={`text-xs font-bold py-1.5 ${textClass}`}>
                  {wd}
                </div>
              );
            })}
          </div>

          {/* 日付グリッド */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const dateRecord = history[day.key] || {};
              const isToday = day.key === todayStr;
              
              const isMorningDone = dateRecord.morning === true;
              const isLunchDone = dateRecord.lunch === true;
              const isEveningDone = dateRecord.evening === true;
              const isBedtimeDone = dateRecord.bedtime === true;

              return (
                <div
                  key={day.key}
                  className={`flex flex-col rounded-xl border p-1 min-h-[64px] transition-all relative overflow-hidden select-none
                    ${day.isCurrentMonth 
                      ? isToday
                        ? "bg-blue-50/50 dark:bg-blue-955/20 border-blue-400 dark:border-blue-500 shadow-sm ring-1 ring-blue-100 dark:ring-blue-950/20"
                        : "bg-gray-50/40 dark:bg-slate-800/40 border-gray-100 dark:border-slate-700 hover:bg-gray-100/30 dark:hover:bg-slate-700/20"
                      : "bg-gray-100/50 dark:bg-slate-900/30 border-transparent opacity-40"
                    }`}
                >
                  {/* 日付ラベル */}
                  <div className="flex justify-between items-center px-0.5 mb-1.5">
                    <span
                      className={`text-[10px] font-extrabold tracking-tighter leading-none
                        ${isToday 
                          ? "text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1 rounded" 
                          : "text-slate-600 dark:text-slate-400"
                        }`}
                    >
                      {day.date.getDate()}
                    </span>
                  </div>

                  {/* 2×2 田の字スタンプエリア */}
                  <div className="grid grid-cols-2 grid-rows-2 gap-y-1 gap-x-0.5 text-center flex-1 justify-items-center items-center">
                    {/* 左上: 朝 */}
                    <div className="w-5 h-5 flex items-center justify-center select-none text-[10px] leading-none">
                      {isMorningDone ? (
                        <Image src={pawImg} alt="朝" width={20} height={20} className="object-contain animate-scale-up" />
                      ) : (
                        <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 transition-colors">朝</span>
                      )}
                    </div>

                    {/* 右上: 昼 */}
                    <div className="w-5 h-5 flex items-center justify-center select-none text-[10px] leading-none">
                      {isLunchDone ? (
                        <Image src={pawImg} alt="昼" width={20} height={20} className="object-contain animate-scale-up" />
                      ) : (
                        <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 transition-colors">昼</span>
                      )}
                    </div>

                    {/* 左下: 夕 */}
                    <div className="w-5 h-5 flex items-center justify-center select-none text-[10px] leading-none">
                      {isEveningDone ? (
                        <Image src={pawImg} alt="夕" width={20} height={20} className="object-contain animate-scale-up" />
                      ) : (
                        <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 transition-colors">夕</span>
                      )}
                    </div>

                    {/* 右下: 就寝前 */}
                    <div className="w-5 h-5 flex items-center justify-center select-none text-[10px] leading-none">
                      {isBedtimeDone ? (
                        <Image src={pawImg} alt="就" width={20} height={20} className="object-contain animate-scale-up" />
                      ) : (
                        <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 transition-colors">就</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 凡例カード */}
        <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700/60 rounded-3xl shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-gray-50 dark:border-slate-700 pb-1.5">スタンプの見方</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 flex items-center justify-center text-sm">
                <Image src={pawImg} alt="点眼完了" width={24} height={24} className="object-contain" />
              </div>
              <div>
                <p className="font-bold text-slate-700 dark:text-slate-300">点眼完了</p>
                <p className="text-[10px] text-slate-400">すべての薬を点眼済み</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 flex items-center justify-center text-[10px] font-bold text-gray-300 dark:text-gray-600">朝</div>
              <div>
                <p className="font-bold text-slate-700 dark:text-slate-300">未完了</p>
                <p className="text-[10px] text-slate-400">点眼が残っています</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 共通ナビゲーションバー */}
      <Navbar />
    </div>
  );
}
