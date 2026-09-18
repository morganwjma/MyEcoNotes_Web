// src/views/WebBackupView.tsx
import React, { useState } from 'react';
import { Archive, Download, Clock, HardDrive, FileArchive, Database, RefreshCw } from 'lucide-react';
import { WebDriveService } from '../services/WebDriveService';

interface Props {
    backups: any[];
    isLoading: boolean;
    statusMsg: string;
}

export const WebBackupView: React.FC<Props> = ({ backups, isLoading, statusMsg }) => {
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const formatBytes = (bytes: string | number) => {
        if (!bytes) return '0 KB';
        const b = Number(bytes);
        if (b > 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        return (b / (1024 * 1024)).toFixed(2) + ' MB';
    };

    const getBackupType = (name: string) => {
        if (name.toLowerCase().includes('auto')) return { label: '自動備份', color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800' };
        return { label: '手動備份', color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800' };
    };

    const handleDownload = async (file: any) => {
        setDownloadingId(file.id);
        try {
            // 嘗試取得 Token
            let token = '';
            const w = window as any;
            if (w.gapi?.client?.getToken?.()?.access_token) {
                token = w.gapi.client.getToken().access_token;
            } else {
                for (const key in WebDriveService) {
                    const val = (WebDriveService as any)[key];
                    if (typeof val === 'string' && val.startsWith('ya29.')) token = val;
                    if (val && typeof val === 'object' && val.access_token?.startsWith('ya29.')) token = val.access_token;
                }
            }

            // 直接透過底層 fetch 請求下載二進位備份檔
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!res.ok) throw new Error('檔案下載失敗');
            
            // 轉換為 Blob 並建立下載連結
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert('備份檔下載失敗，請檢查網路狀態或重新登入。');
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-white dark:bg-stone-950 relative overflow-hidden h-full">
            <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md z-10 shrink-0">
                <h2 className="text-xl font-black text-stone-800 dark:text-stone-100 flex items-center gap-2">
                    <Archive className="text-indigo-500" /> 備份資料管理
                </h2>
                <p className="text-sm text-stone-500 mt-1">檢視與下載儲存於雲端隱藏空間的自動與手動備份檔案。</p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-stone-50 dark:bg-stone-950/50">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                        <Database size={48} className="mb-4 animate-bounce text-indigo-400" />
                        <p className="font-bold">{statusMsg || '讀取中...'}</p>
                    </div>
                ) : backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                        <FileArchive size={64} className="mb-4 opacity-20" />
                        <p className="font-bold text-lg text-stone-600 dark:text-stone-300">目前沒有任何備份檔案</p>
                        <p className="text-sm mt-1">您可以從手機 App 端執行手動備份，或開啟自動化備份功能。</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {backups.map(file => {
                            const isDownloading = downloadingId === file.id;
                            const typeInfo = getBackupType(file.name);
                            
                            return (
                                <div key={file.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all flex flex-col group">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-800/50">
                                                <FileArchive size={24} />
                                            </div>
                                            <div className="min-w-0 flex flex-col items-start">
                                                <h3 className="font-bold text-stone-800 dark:text-stone-100 truncate w-full" title={file.name}>{file.name}</h3>
                                                <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-md border font-black tracking-widest ${typeInfo.color}`}>
                                                    {typeInfo.label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-auto space-y-2 mb-4 bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl border border-stone-100 dark:border-stone-800">
                                        <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 font-bold">
                                            <Clock size={14} className="shrink-0 text-stone-400" /> 
                                            <span>{new Date(file.createdTime).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 font-bold">
                                            <HardDrive size={14} className="shrink-0 text-stone-400" /> 
                                            <span>{formatBytes(file.size)}</span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => handleDownload(file)}
                                        disabled={isDownloading}
                                        className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                                            isDownloading 
                                            ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 cursor-wait' 
                                            : 'bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-900/40 dark:hover:bg-indigo-600 text-indigo-600 dark:text-indigo-300'
                                        }`}
                                    >
                                        {isDownloading ? (
                                            <><RefreshCw size={16} className="animate-spin" /> 封裝下載中...</>
                                        ) : (
                                            <><Download size={16} className="group-hover:-translate-y-0.5 transition-transform" /> 點擊下載</>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};