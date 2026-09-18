// src/components/WebExportModals.tsx
import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Route, Leaf, Globe, EyeOff, Lock, Merge, GripVertical, Loader2, CloudUpload, Plus, ChevronRight } from 'lucide-react';
import { WebINatService } from '../services/WebINatService';
import { exportCustomCSVWeb, type CsvColumnConfig } from '../services/WebExportService';

// =======================================================
// 1. 下載主選單
// =======================================================
export const WebDownloadOptionsModal: React.FC<{
    onClose: () => void;
    onOpenCsvConfig: () => void;
    onExportiNaturalist: (privacy: string) => void;
    onExportEBird: () => void;
    onExportGPX: () => void;
    onExportBackup: () => void;
    selectedCount: number;
}> = ({ onClose, onOpenCsvConfig, onExportiNaturalist, onExportEBird, onExportGPX, onExportBackup, selectedCount }) => {
    const [step, setStep] = useState<'menu' | 'inat_privacy'>('menu');

    return (
        <div className="fixed inset-0 z-[6000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-stone-900 w-full max-w-xs rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95 duration-200">
                <div className="text-center mb-6 pt-6">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Download size={32} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-2">匯出紀錄</h2>
                    <p className="text-sm text-stone-500 dark:text-stone-400">共選取了 <strong className="text-emerald-600 dark:text-emerald-400">{selectedCount}</strong> 筆調查紀錄。</p>
                </div>

                {step === 'menu' ? (
                    <div className="flex flex-col gap-3 pb-6 px-6">
                        <button onClick={onOpenCsvConfig} className="w-full py-3 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"><FileText size={20} /> 匯出 CSV (自訂格式)</button>
                        <button onClick={onExportGPX} className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"><Route size={20} /> 匯出航跡檔 (GPX)</button>
                        <button onClick={onExportBackup} className="w-full py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"><Download size={20} /> 匯出備份檔 (ZIP)</button>
                        <button onClick={onExportEBird} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"><Leaf size={20} /> 匯出 eBird 清單</button>
                        <button onClick={() => setStep('inat_privacy')} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"><Leaf size={18} /> 匯出 iNaturalist (CSV)</button>
                        <button onClick={onClose} className="w-full mt-2 py-2 text-stone-400 hover:text-stone-600 font-bold transition-colors">取消</button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 pb-6 px-6 animate-in slide-in-from-right duration-200">
                        <p className="text-sm font-bold text-stone-600 dark:text-stone-300 mb-1 text-center">請選擇地理隱私狀態:</p>
                        <button onClick={() => { onExportiNaturalist('open'); onClose(); }} className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Globe size={20} /> 公開 (Open)</button>
                        <button onClick={() => { onExportiNaturalist('obscured'); onClose(); }} className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"><EyeOff size={20} /> 模糊 (Obscured)</button>
                        <button onClick={() => { onExportiNaturalist('private'); onClose(); }} className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Lock size={20} /> 私密 (Private)</button>
                        <button onClick={() => setStep('menu')} className="w-full mt-2 py-2 text-stone-400 hover:text-stone-600 font-bold transition-colors">返回</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// =======================================================
// 2. CSV 自訂欄位匯出介面 (Web 版)
// =======================================================
const DEFAULT_CSV_COLUMNS: CsvColumnConfig[] = [
    { key: 'survey_title', label: '調查名稱', enabled: true },
    { key: 'date', label: '日期', enabled: true },
    { key: 'time', label: '時間', enabled: true },
    { key: 'species', label: '物種名稱', enabled: true },
    { key: 'species_alias', label: '中文別名', enabled: false }, 
    { key: 'count', label: '數量', enabled: true },
    { key: 'notes', label: '備註', enabled: true },
    { key: 'latitude', label: '緯度', enabled: true },
    { key: 'longitude', label: '經度', enabled: true },
    { key: 'accuracy', label: '精確度', enabled: true },
    { key: 'survey_area', label: '樣區', enabled: true },
    { key: 'taxon_group', label: '自訂類群', enabled: false },
    { key: 'scientific_name', label: '學名', enabled: false },
    { key: 'conservation', label: '保育等級', enabled: false },
    { key: 'survey_date', label: '調查日期', enabled: false }, 
    { key: 'survey_start_time', label: '調查開始時間', enabled: false }, 
    { key: 'end_time', label: '調查結束時間', enabled: false },
    { key: 'duration', label: '調查時長', enabled: false },
    { key: 'distance', label: '調查距離(km)', enabled: false },
    { key: 'weather_summary', label: '天氣概況', enabled: false },
    { key: 'temperature', label: '溫度(C)', enabled: false },
    { key: 'humidity', label: '濕度(%)', enabled: false },
    { key: 'wind_info', label: '風力資訊', enabled: false },
    { key: 'survey_note', label: '調查備註', enabled: false },
    { key: 'taxon_tree', label: '完整分類樹', enabled: false }
];

export const WebCsvExportModal: React.FC<{
    fullSurveys: any[];
    onClose: () => void;
}> = ({ fullSurveys, onClose }) => {
    const [columns, setColumns] = useState<CsvColumnConfig[]>([]);
    const [mergeSpecies, setMergeSpecies] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportMsg, setExportMsg] = useState('匯出 CSV');
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

    useEffect(() => { 
        let stored: CsvColumnConfig[] = [];
        try {
            const raw = localStorage.getItem('ecolog_csv_settings_v1');
            if (raw) stored = JSON.parse(raw);
        } catch {}
        
        if (stored.length === 0) stored = [...DEFAULT_CSV_COLUMNS];

        const storedKeys = new Set(stored.map(c => c.key));
        const missingCols = DEFAULT_CSV_COLUMNS.filter(def => !storedKeys.has(def.key));
        let cols = missingCols.length > 0 ? [...stored, ...missingCols] : stored;

        const usedCustomFields = new Map<string, string>(); 
        fullSurveys.forEach(s => {
            s.observations.forEach((o: any) => {
                if (o.customFields && Array.isArray(o.customFields)) {
                    o.customFields.forEach((cf: any) => {
                        if (cf.fieldId && cf.label) usedCustomFields.set(cf.fieldId, cf.label);
                    });
                }
            });
        });

        const dynamicCols: CsvColumnConfig[] = Array.from(usedCustomFields.entries()).map(([id, label]) => ({
            key: `custom_field_${id}`, label: label, enabled: true 
        }));

        setColumns([...cols.filter(c => !c.key.startsWith('custom_field_')), ...dynamicCols]); 
    }, [fullSurveys]);

    const enabledCols = columns.filter(c => c.enabled);
    const disabledCols = columns.filter(c => !c.enabled);

    const handleRemove = (key: string) => setColumns(columns.map(c => c.key === key ? { ...c, enabled: false } : c));
    const handleAdd = (key: string) => {
        const colToAdd = columns.find(c => c.key === key);
        if (!colToAdd) return;
        const otherCols = columns.filter(c => c.key !== key);
        const enCols = otherCols.filter(c => c.enabled);
        const disCols = otherCols.filter(c => !c.enabled);
        setColumns([...enCols, { ...colToAdd, enabled: true }, ...disCols]);
    };
    
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => { setDraggedItemIndex(index); e.dataTransfer.effectAllowed = "move"; };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
    const handleDragEnd = () => { setDraggedItemIndex(null); };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => { 
        e.preventDefault(); 
        if (draggedItemIndex === null || draggedItemIndex === index) return; 
        const newEnabled = [...enabledCols]; 
        const item = newEnabled[draggedItemIndex]; 
        newEnabled.splice(draggedItemIndex, 1); 
        newEnabled.splice(index, 0, item); 
        setColumns([...newEnabled, ...disabledCols]); 
        setDraggedItemIndex(null); 
    };
    
    const handleExport = async () => { 
        setIsExporting(true);
        try {
            const baseColumns = columns.filter(c => !c.key.startsWith('custom_field_'));
            localStorage.setItem('ecolog_csv_settings_v1', JSON.stringify(baseColumns)); 
            
            await exportCustomCSVWeb(fullSurveys, columns, mergeSpecies, (task) => setExportMsg(task)); 
            onClose();
        } catch (e) {
            alert('匯出時發生錯誤，請重試。');
        } finally {
            setIsExporting(false);
            setExportMsg('匯出 CSV');
        }
    };

    return (
        <div className="fixed inset-0 z-[6000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-stone-900 w-full max-w-sm rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95 duration-200 h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-2 pt-4 px-4 shrink-0">
                    <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2">
                        {showAddMenu && (
                            <button onClick={() => setShowAddMenu(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                                <ChevronRight size={22} className="rotate-180" />
                            </button>
                        )}
                        {showAddMenu ? '加入欄位' : '匯出欄位設定'}
                    </h2>
                    <button onClick={onClose} disabled={isExporting} className="p-2 bg-stone-100 dark:bg-stone-800 rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"><X size={20} /></button>
                </div>
                
                {!showAddMenu && (
                    <div className="px-4 mb-2 flex flex-col gap-2 shrink-0">
                        <div 
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${mergeSpecies ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-stone-50 border-stone-200 dark:bg-stone-800 dark:border-stone-700'}`}
                            onClick={() => !isExporting && setMergeSpecies(!mergeSpecies)}
                        >
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2"><Merge size={16} /> 合併物種輸出</span>
                                <span className="text-[10px] text-stone-500 dark:text-stone-400">相同學名/樣區的紀錄將合併計算數量</span>
                            </div>
                            <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${mergeSpecies ? 'bg-blue-500' : 'bg-stone-300 dark:bg-stone-600'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${mergeSpecies ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                        </div>
                    </div>
                )}

                {!showAddMenu ? (
                    <>
                        <div className="px-4 py-2 flex justify-between items-end shrink-0">
                            <p className="text-xs text-stone-500 dark:text-stone-400">已啟用 <strong className="text-emerald-600">{enabledCols.length}</strong> 個欄位。拖移左側手柄排序。</p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 space-y-2 min-h-0 custom-scrollbar">
                            {enabledCols.map((col, idx) => (
                                <div key={col.key} draggable={!isExporting} onDragStart={(e) => handleDragStart(e, idx)} onDragOver={(e) => handleDragOver(e, idx)} onDragEnd={handleDragEnd} onDrop={(e) => handleDrop(e, idx)} className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${isExporting ? 'cursor-not-allowed opacity-50' : 'cursor-move'} bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 shadow-sm ${draggedItemIndex === idx ? 'opacity-50 border-dashed border-emerald-500' : ''}`}>
                                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                        <div className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 active:cursor-grabbing"><GripVertical size={18} /></div>
                                        <span className="font-bold text-sm text-stone-700 dark:text-stone-200 truncate">
                                            {col.label}
                                            {col.key.startsWith('custom_field_') && <span className="ml-2 text-[10px] bg-stone-100 text-stone-500 px-1.5 rounded border border-stone-200">自訂</span>}
                                            {col.key === 'taxon_tree' && <span className="ml-2 text-[10px] bg-emerald-50 text-emerald-600 px-1.5 rounded border border-emerald-200">一鍵展開</span>}
                                        </span>
                                    </div>
                                    <button onClick={() => !isExporting && handleRemove(col.key)} className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0" title="移除欄位">
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="px-4 pt-3 pb-2 shrink-0">
                            <button onClick={() => setShowAddMenu(true)} disabled={isExporting} className="w-full py-2 border-dashed border-2 border-stone-300 dark:border-stone-700 text-stone-500 hover:border-emerald-500 hover:text-emerald-600 font-bold rounded-xl flex items-center justify-center transition-colors"><Plus size={18} className="mr-1"/> 加入欄位</button>
                        </div>
                        <div className="flex gap-3 pb-4 px-4 mt-2 border-t border-stone-100 dark:border-stone-800 pt-3 shrink-0">
                            <button onClick={onClose} disabled={isExporting} className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold rounded-xl transition-colors">取消</button>
                            <button onClick={handleExport} disabled={isExporting} className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center">
                                {isExporting ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {exportMsg}</span> : '匯出 CSV'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="px-4 py-2 shrink-0">
                            <p className="text-xs text-stone-500 dark:text-stone-400">點擊欲加入匯出清單的欄位。</p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 space-y-2 min-h-0 custom-scrollbar pb-4">
                            {disabledCols.length === 0 ? (
                                <div className="text-center py-10 text-stone-400 text-sm">所有欄位皆已加入</div>
                            ) : (
                                disabledCols.map((col) => (
                                    <button key={col.key} onClick={() => handleAdd(col.key)} className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all text-left group">
                                        <span className="font-bold text-sm text-stone-600 dark:text-stone-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                                            {col.label}
                                            {col.key.startsWith('custom_field_') && <span className="ml-2 text-[10px] bg-stone-200 text-stone-500 px-1.5 rounded">自訂</span>}
                                        </span>
                                        <Plus size={18} className="text-stone-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// =======================================================
// 3. Web 版 iNaturalist 直接上傳介面
// =======================================================
export const WebINatUploadModal: React.FC<{ survey: any, onClose: () => void }> = ({ survey, onClose }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(WebINatService.isLoggedIn());
    const [apiTokenInput, setApiTokenInput] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [step, setStep] = useState<'config' | 'uploading' | 'result'>('config');
    const [mediaOnly, setMediaOnly] = useState(false);
    const [geoprivacy, setGeoprivacy] = useState<'open' | 'obscured' | 'private'>('open');
    const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
    const [report, setReport] = useState<any>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        try {
            let cleanToken = apiTokenInput.trim().replace(/\\/g, '');
            const match = cleanToken.match(/api_token["'\s:=]+([^"'\s}]+)/);
            if (match && match[1]) cleanToken = match[1];
            else cleanToken = cleanToken.replace(/^[\s{"',:]+/, '').replace(/[\s}"',]+$/, '');

            await WebINatService.loginWithToken(cleanToken);
            setIsLoggedIn(true);
        } catch (err: any) {
            alert(err.message || '授權失敗');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleUpload = async () => {
        setStep('uploading');
        try {
            const res = await WebINatService.uploadObservations(survey, { geoprivacy, mediaOnly, speciesOverrides: {} }, (curr, tot, msg) => {
                setProgress({ current: curr, total: tot, message: msg });
            });
            setReport(res);
            setStep('result');
        } catch (err: any) {
            alert(`上傳發生錯誤: ${err.message}`);
            setStep('config');
        }
    };

    return (
        <div className="fixed inset-0 z-[6000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-stone-800">
                <div className="flex justify-between items-center pb-4 border-b border-stone-100 dark:border-stone-800 shrink-0 mb-4">
                    <h3 className="font-bold text-lg text-stone-800 dark:text-stone-100 flex items-center gap-2"><CloudUpload size={20} className="text-emerald-500" /> 上傳至 iNaturalist</h3>
                    <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors"><X size={20}/></button>
                </div>

                {!isLoggedIn ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                            <strong className="block mb-2 text-sm">如何取得 API 授權金鑰：</strong>
                            <ol className="list-decimal pl-4 space-y-1">
                                <li>請先登入 iNaturalist 網頁版。</li>
                                <li>前往官方授權網址：<a href="https://www.inaturalist.org/users/api_token" target="_blank" rel="noreferrer" className="underline font-bold text-emerald-600">inaturalist.org/users/api_token</a></li>
                                <li>複製頁面上顯示的 Token 並貼於下方欄位。</li>
                            </ol>
                        </div>
                        <textarea required rows={4} value={apiTokenInput} onChange={e => setApiTokenInput(e.target.value)} placeholder="貼上 API Token..." className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500" />
                        <button type="submit" disabled={isLoggingIn || !apiTokenInput.trim()} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl active:scale-95 disabled:opacity-50">{isLoggingIn ? '驗證中...' : '登入'}</button>
                    </form>
                ) : step === 'config' ? (
                    <div className="space-y-5">
                        <div className="flex justify-between items-center bg-stone-50 dark:bg-stone-800 p-3 rounded-xl text-xs border border-stone-100 dark:border-stone-700">
                            <span className="font-bold text-stone-700 dark:text-stone-300">登入身份: {WebINatService.getCurrentUser()?.name}</span>
                            <button onClick={() => { WebINatService.logout(); setIsLoggedIn(false); }} className="text-red-500 font-bold hover:underline">切換帳號</button>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 mb-1.5 uppercase">地理隱私權</label>
                            <select value={geoprivacy} onChange={e => setGeoprivacy(e.target.value as any)} className="w-full p-3 bg-stone-50 border rounded-xl text-sm font-bold dark:bg-stone-800 dark:border-stone-700 outline-none">
                                <option value="open">公開 (精確座標)</option>
                                <option value="obscured">模糊 (隨機位移)</option>
                                <option value="private">私密 (隱藏座標)</option>
                            </select>
                        </div>
                        <label className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-800 rounded-xl cursor-pointer">
                            <div><div className="text-sm font-bold text-stone-800 dark:text-stone-100">僅上傳多媒體</div><div className="text-[10px] text-stone-500 mt-0.5">過濾沒有照片或錄音的紀錄</div></div>
                            <input type="checkbox" checked={mediaOnly} onChange={e => setMediaOnly(e.target.checked)} className="w-5 h-5 accent-emerald-600" />
                        </label>
                        <button onClick={handleUpload} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl active:scale-95">開始直接上傳</button>
                    </div>
                ) : step === 'uploading' ? (
                    <div className="py-12 text-center space-y-5">
                        <div className="text-sm font-bold text-stone-700 dark:text-stone-300 px-4 break-all">{progress.message}</div>
                        <div className="w-full bg-stone-200 dark:bg-stone-700 h-2.5 rounded-full overflow-hidden relative">
                            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5 text-center">
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-xl border border-emerald-100 dark:border-emerald-800">
                            <div className="text-emerald-700 dark:text-emerald-400 font-bold text-lg mb-2">上傳作業完成</div>
                            <div className="text-4xl font-black text-emerald-800 dark:text-emerald-300">{report?.uploadedCount} <span className="text-base font-bold text-emerald-600/70">筆成功</span></div>
                        </div>
                        <button onClick={() => window.open('https://www.inaturalist.org/observations', '_blank')} className="w-full py-3.5 bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-800 font-bold rounded-xl">前往確認紀錄</button>
                    </div>
                )}
            </div>
        </div>
    );
};