"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getMedicinePhotos } from "../../lib/medicinePhotos";
import { getActiveMedicines, MedicineStatusFields } from "../../lib/medicineStatus";

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

const timingLabels: Record<TimingType, string> = {
  morning: "朝",
  lunch: "昼",
  dinner: "夕",
  bedtime: "就寝前",
  as_needed: "頓用",
};

const getEyeLabel = (medicine: Medicine) => {
  if (medicine.eyeTarget === "right") return "右眼";
  if (medicine.eyeTarget === "left") return "左眼";
  if (medicine.eyeTarget === "both") return "両眼";
  if (medicine.instruction.includes("右目")) return "右眼";
  if (medicine.instruction.includes("左目")) return "左眼";
  return "両眼";
};

const getDoseLabel = (medicine: Medicine) => {
  if (medicine.type === "ointment" || medicine.instruction.includes("塗布")) return "塗布";
  return medicine.instruction.match(/\d+滴/)?.[0] ?? "1滴";
};

const getFallbackUpdatedAt = (medicine: Medicine) => {
  const medicineDate = medicine.updatedAt ? Date.parse(medicine.updatedAt) : Number.NaN;
  if (Number.isFinite(medicineDate)) return medicineDate;

  const earliestReasonableDate = new Date("2000-01-01T00:00:00Z").getTime();
  return medicine.id >= earliestReasonableDate && medicine.id <= Date.now()
    ? medicine.id
    : Number.NaN;
};

const formatUpdatedAt = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) return "記録なし";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
};

export default function MedicineListPage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const router = useRouter();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [photoUpdatedAt, setPhotoUpdatedAt] = useState<Record<number, number>>({});
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    let loadedMedicines: Medicine[] = [];
    const saved = localStorage.getItem("my_medication_data");
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) loadedMedicines = getActiveMedicines(parsed as Medicine[]);
      } catch (error) {
        console.error("Failed to parse medicines", error);
      }
    }

    let cancelled = false;
    const createdUrls: string[] = [];

    const loadData = async () => {
      try {
        const records = await getMedicinePhotos(loadedMedicines.map((medicine) => medicine.id));
        const nextUrls: Record<number, string> = {};
        const nextUpdatedAt: Record<number, number> = {};

        records.forEach((record, medicineId) => {
          const url = URL.createObjectURL(record.blob);
          createdUrls.push(url);
          nextUrls[medicineId] = url;
          const timestamp = Date.parse(record.updatedAt);
          if (Number.isFinite(timestamp)) nextUpdatedAt[medicineId] = timestamp;
        });

        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setPhotoUrls(nextUrls);
        setPhotoUpdatedAt(nextUpdatedAt);
      } catch (error) {
        console.error("Failed to load medicine photos", error);
        if (!cancelled) {
          setPhotoNotice("写真を読み込めませんでした。薬の登録内容は引き続き確認できます。");
        }
      } finally {
        if (!cancelled) {
          setMedicines(loadedMedicines);
          setIsLoaded(true);
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!expandedPhoto) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedPhoto(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedPhoto]);

  const displayMedicines = useMemo(() => medicines, [medicines]);

  return (
    <div className="flex min-h-full flex-col bg-gray-50 dark:bg-gray-900">
      <div className="w-full bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 py-3 px-4 flex items-center gap-2">
        <Image
          src={`${basePath}/Daily_eyedrops192.png`}
          alt="ロゴ"
          width={28}
          height={28}
          className="object-contain"
        />
        <span className="font-bold text-base text-slate-800 dark:text-white">まいにち点眼</span>
      </div>

      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm py-4 px-5 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="min-h-10 rounded-xl bg-gray-100 dark:bg-gray-800 px-3.5 text-sm font-bold text-gray-600 dark:text-gray-300 cursor-pointer touch-manipulation"
          >
            戻る
          </button>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-white">使用中の目薬一覧</h1>
          <div className="w-14" aria-hidden="true" />
        </header>
      </div>

      <main className="w-full max-w-md mx-auto px-5 py-5 pb-24 space-y-4 animate-slide-in-fast">
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm font-medium leading-relaxed text-amber-900 dark:text-amber-100">
          この画面は、使用中の点眼薬を確認するための補助記録です。処方内容の証明や、お薬手帳・処方箋の代わりになるものではありません。
        </div>

        {photoNotice && (
          <div role="status" className="rounded-2xl bg-sky-50 dark:bg-sky-950/30 p-4 text-sm text-sky-800 dark:text-sky-200">
            {photoNotice}
          </div>
        )}

        {isLoaded && displayMedicines.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 p-7 text-center shadow-sm">
            <p className="font-bold text-slate-700 dark:text-slate-200">登録されている目薬はありません。</p>
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="mt-4 min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white cursor-pointer touch-manipulation"
            >
              設定画面で目薬を登録する
            </button>
          </div>
        ) : (
          displayMedicines.map((medicine) => {
            const photoUrl = photoUrls[medicine.id];
            const medicineUpdatedAt = getFallbackUpdatedAt(medicine);
            const lastUpdatedAt = Math.max(
              Number.isFinite(medicineUpdatedAt) ? medicineUpdatedAt : 0,
              photoUpdatedAt[medicine.id] ?? 0
            );

            return (
              <article
                key={medicine.id}
                className="overflow-hidden rounded-3xl border border-blue-200 dark:border-blue-800/60 bg-white dark:bg-slate-800 shadow-sm"
              >
                <div className="flex gap-4 p-5 border-b border-gray-100 dark:border-gray-700">
                  {photoUrl ? (
                    <button
                      type="button"
                      onClick={() => setExpandedPhoto({ name: medicine.name, url: photoUrl })}
                      className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-slate-900 cursor-pointer touch-manipulation"
                      aria-label={`${medicine.name}の写真を拡大表示`}
                    >
                      <Image
                        src={photoUrl}
                        alt={`${medicine.name}の写真`}
                        width={96}
                        height={96}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="h-24 w-24 flex-shrink-0 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-900 flex items-center justify-center px-2 text-center text-xs font-bold text-gray-400 dark:text-gray-500">
                      写真未登録
                    </div>
                  )}
                  <div className="min-w-0 flex-1 self-center">
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">点眼薬名・濃度</p>
                    <h2 className="break-words text-xl font-extrabold leading-snug text-slate-900 dark:text-white">
                      {medicine.name}
                    </h2>
                  </div>
                </div>

                <dl className="grid grid-cols-[7.5rem_1fr] gap-y-3 px-5 py-4 text-sm leading-relaxed">
                  <dt className="font-bold text-slate-500 dark:text-slate-400">対象眼</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{getEyeLabel(medicine)}</dd>
                  <dt className="font-bold text-slate-500 dark:text-slate-400">点眼する時間帯</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">
                    {medicine.timings?.length
                      ? medicine.timings.map((timing) => timingLabels[timing]).join("・")
                      : "未設定"}
                  </dd>
                  <dt className="font-bold text-slate-500 dark:text-slate-400">1回の滴数</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{getDoseLabel(medicine)}</dd>
                  <dt className="font-bold text-slate-500 dark:text-slate-400">保管方法</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">
                    {medicine.storage === "cold" ? "冷所保存" : "室温保存"}
                  </dd>
                  <dt className="font-bold text-slate-500 dark:text-slate-400">最終更新日</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">
                    {formatUpdatedAt(lastUpdatedAt || Number.NaN)}
                  </dd>
                </dl>
              </article>
            );
          })
        )}
      </main>

      {expandedPhoto && (
        <div
          className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={`${expandedPhoto.name}の写真`}
          onClick={() => setExpandedPhoto(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-800 p-4 shadow-2xl animate-scale-up"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3 px-1">
              <h2 className="font-bold text-slate-800 dark:text-white truncate">{expandedPhoto.name}</h2>
              <button
                type="button"
                onClick={() => setExpandedPhoto(null)}
                className="w-10 h-10 flex-shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold cursor-pointer touch-manipulation"
                aria-label="写真を閉じる"
              >
                ✕
              </button>
            </div>
            <Image
              src={expandedPhoto.url}
              alt={`${expandedPhoto.name}の拡大写真`}
              width={1280}
              height={1280}
              unoptimized
              className="w-full max-h-[75vh] object-contain rounded-2xl bg-gray-50 dark:bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
}
