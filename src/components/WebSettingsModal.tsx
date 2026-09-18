// src/components/WebSettingsModal.tsx
import React, { useState, useEffect } from 'react';
import { X, Settings, Info, Clock, Type } from 'lucide-react';

interface WebSettingsModalProps {
    onClose: () => void;
    lastSyncTime: number | null;
}

export const WebSettingsModal: React.FC<WebSettingsModalProps> = ({ onClose, lastSyncTime }) => {
    // 改為數字型態儲存基準像素大小，預設為 16
    const [fontSize, setFontSize] = useState<number>(16);

    // 載入時讀取使用者的字體設定，並兼容舊版的字串設定
    useEffect(() => {
        const saved = localStorage.getItem('ecolog_web_fontsize');
        if (saved) {
            if (saved === 'small') setFontSize(14);
            else if (saved === 'medium') setFontSize(16);
            else if (saved === 'large') setFontSize(18);
            else {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed)) setFontSize(parsed);
            }
        }
    }, []);

    // 處理拉霸變更，即時寫入根元素以觸發全域 REM 縮放
    const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const size = parseInt(e.target.value, 10);
        setFontSize(size);
        localStorage.setItem('ecolog_web_fontsize', size.toString());
        document.documentElement.style.fontSize = `${size}px`;
    };

    // 格式化最後同步時間
    const formatTime = (ts: number | null) => {
        if (!ts) return '尚未同步';
        const d = new Date(ts);
        return d.toLocaleString('zh-TW', { hour12: false });
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white dark:bg-stone-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">                       
                {/* 標頭 */}
                    <div className="flex justify-between items-center p-4 border-b border-stone-100 dark:border-stone-800 shrink-0">
                        <h3 className="font-black text-lg text-stone-800 dark:text-stone-100 flex items-center gap-2">
                        <Settings size={20} className="text-emerald-500" /> 系統設定
                    </h3>
                    <button onClick={onClose} className="p-1.5 bg-stone-100 dark:bg-stone-800 rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
                    {/* 版本資訊 */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1">
                            <Info size={14} /> 版本資訊
                        </label>
                        <div className="bg-stone-50 dark:bg-stone-950 p-3 rounded-xl border border-stone-100 dark:border-stone-800 text-sm font-mono text-stone-700 dark:text-stone-300 text-center font-bold shadow-inner">
                            MyEcoNotes_Web_v.1.0
                        </div>
                    </div>

                    {/* 最後同步時間 */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={14} /> 最後同步時間
                        </label>
                        <div className="bg-stone-50 dark:bg-stone-950 p-3 rounded-xl border border-stone-100 dark:border-stone-800 text-sm font-mono text-stone-700 dark:text-stone-300 text-center font-bold shadow-inner">
                            {formatTime(lastSyncTime)}
                        </div>
                    </div>

                    {/* 網頁基礎設定：字體拉霸 */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-end">
                            <label className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1">
                                <Type size={14} /> 全域字體與排版大小
                            </label>
                            <span className="text-xs font-mono font-bold text-blue-500">{fontSize} px</span>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-stone-50 dark:bg-stone-950 p-4 rounded-xl border border-stone-100 dark:border-stone-800">
                            <span className="text-xs font-bold text-stone-400 shrink-0">小</span>
                            <input 
                                type="range" 
                                min="12" 
                                max="22" 
                                step="1" 
                                value={fontSize} 
                                onChange={handleFontSizeChange}
                                className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer dark:bg-stone-700 accent-blue-600 hover:accent-blue-500 transition-all"
                            />
                            <span className="text-lg font-bold text-stone-400 shrink-0">大</span>
                        </div>

                        {/* 即時預覽區塊 */}
                        <div className="mt-1 p-3 bg-stone-100 dark:bg-stone-800/50 rounded-xl border border-stone-200 dark:border-stone-700">
                            <p className="text-stone-800 dark:text-stone-100 font-bold mb-1">介面預覽</p>
                            <p className="text-stone-500 dark:text-stone-400 leading-relaxed">
                                拖曳上方的滑桿，即可即時預覽全站字體大小與排版的等比例縮放效果。
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-stone-100 dark:border-stone-800 shrink-0">
                        <button onClick={onClose} className="w-full py-2.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-xl font-bold active:scale-95 transition-transform shadow-md">
                        完成
                    </button>
                </div>
            </div>
        </div>
    );
};