"use client";

import { useState, useRef } from "react";
import Image from "next/image";

export default function CameraPage() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCaptureClick = () => {
    // ファイル入力（カメラ）を起動
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 選択された画像をプレビュー用に読み込む
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageSrc(e.target?.result as string);
        setAnalysisResult(null); // 前回の結果をクリア
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!imageSrc) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      // プレビュー用のBase64文字列（"data:image/jpeg;base64,..."）から
      // 画像データ部分のみを抽出してAPIに送信することもできますが、
      // 今回はそのまま送ってAPI側で処理する形にします。
      const response = await fetch('/api/analyze-drop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageSrc }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setAnalysisResult(data.result || "解析が完了しました！");
      } else {
        setAnalysisResult("解析に失敗しました。");
        console.error(data.error);
      }
    } catch (error) {
      console.error('API呼び出しエラー:', error);
      setAnalysisResult("エラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-full items-center px-6 pt-12 pb-6">
      <header className="w-full mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">目薬の読み取り</h1>
        <p className="text-sm text-slate-500 mt-2">目薬の写真を撮って登録しよう</p>
      </header>

      {/* 隠しファイル入力（スマホならこれでカメラが起動することが多い） */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 画像プレビューエリア */}
      <div className="flex-1 w-full bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center overflow-hidden mb-6 relative border-2 border-dashed border-slate-300 dark:border-slate-600">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt="撮影した写真"
            fill
            className="object-contain"
          />
        ) : (
          <div className="text-slate-400 flex flex-col items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            <p className="text-sm">写真がありません</p>
          </div>
        )}
      </div>

      {/* 解析結果表示エリア */}
      {analysisResult && (
        <div className="w-full bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-4 rounded-xl mb-6 text-center text-sm font-medium">
          {analysisResult}
        </div>
      )}

      {/* 操作ボタン */}
      <div className="w-full space-y-4">
        <button
          onClick={handleCaptureClick}
          className="w-full bg-white dark:bg-slate-700 text-slate-800 dark:text-white font-bold py-3 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-600 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
          {imageSrc ? "撮り直す" : "カメラを起動する"}
        </button>

        {/* 開発中（未実装）の注意書き */}
        <p className="text-xs text-center text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-955/20 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30">
          ⚠️ 画像解析・自動登録機能は現在開発中（未実装）です
        </p>

        {imageSrc && (
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className={`w-full font-bold text-lg py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 ${
              isAnalyzing
                ? "bg-blue-300 text-white cursor-wait"
                : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white active:scale-95 shadow-blue-500/30"
            }`}
          >
            {isAnalyzing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                解析中...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H5.5"/><path d="M14 2h2"/><path d="M22 10h-2"/></svg>
                目薬を読み取る
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
