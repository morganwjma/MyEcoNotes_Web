// src/App.tsx
import React, { useState, useEffect } from 'react';
import { FileText, Book, Music, RefreshCw, Settings, User, X, LogOut, HardDrive, Archive } from 'lucide-react';
import { WebDriveService } from './services/WebDriveService';
import { WebHistoryView } from './views/WebHistoryView';
import { WebNotesView } from './views/WebNotesView';
import { WebRecordView } from './views/WebRecordView';
import { WebBackupView } from './views/WebBackupView';
import { WebSettingsModal } from './components/WebSettingsModal';

import Logo from './assets/logo.png';

type TabMode = 'SURVEY' | 'NOTES' | 'AUDIO' | 'BACKUP';

const findGoogleToken = () => {
    try {
        const w = window as any;
        if (w.gapi?.client?.getToken?.()?.access_token) return w.gapi.client.getToken().access_token;
        
        for (const key in WebDriveService) {
            const val = (WebDriveService as any)[key];
            if (typeof val === 'string' && val.startsWith('ya29.')) return val;
            if (val && typeof val === 'object' && val.access_token?.startsWith('ya29.')) return val.access_token;
        }

        for (const storage of [localStorage, sessionStorage]) {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (!key) continue;
                const val = storage.getItem(key);
                if (!val) continue;
                if (val.startsWith('ya29.')) return val;
                try {
                    const parsed = JSON.parse(val);
                    if (parsed.access_token?.startsWith('ya29.')) return parsed.access_token;
                } catch (e) {}
            }
        }
    } catch (e) {
        console.error("Token 掃描異常", e);
    }
    return null;
};

const googleApiGet = async (endpoint: string, params: Record<string, string>) => {
    const urlObj = new URL(endpoint.startsWith('http') ? endpoint : `https://www.googleapis.com${endpoint}`);
    Object.entries(params).forEach(([k, v]) => urlObj.searchParams.append(k, v));
    const fullUrl = urlObj.toString();

    const token = findGoogleToken();
    if (token) {
        const res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    const gapi = (window as any).gapi;
    if (gapi && gapi.client && gapi.client.request) {
        const res = await gapi.client.request({
            path: urlObj.pathname,
            method: 'GET',
            params: params
        });
        return res.result;
    }

    throw new Error('找不到可用的 Google API 憑證或連線工具');
};

const WebAccountModal = ({ onClose, userInfo }: { onClose: () => void, userInfo: any }) => {
    const [folderSize, setFolderSize] = useState<number | null>(null);
    
    useEffect(() => {
        const calculateAppFolderSize = async () => {
            try {
                let totalBytes = 0;
                let pageToken = '';

                do {
                    const params: any = {
                        spaces: 'appDataFolder',
                        fields: 'nextPageToken,files(size,quotaBytesUsed)',
                        pageSize: '1000'
                    };
                    if (pageToken) params.pageToken = pageToken;

                    const data = await googleApiGet('/drive/v3/files', params);
                    
                    const files = data.files || [];
                    files.forEach((f: any) => {
                        const size = f.quotaBytesUsed || f.size;
                        if (size) totalBytes += parseInt(size, 10);
                    });
                    
                    pageToken = data.nextPageToken;
                } while (pageToken);

                setFolderSize(totalBytes);
            } catch (e) {
                console.error("無法計算隱藏資料夾用量:", e);
                setFolderSize(0);
            }
        };

        calculateAppFolderSize();
    }, []);

    const handleLogout = async () => {
        try {
            if (typeof (WebDriveService as any).logout === 'function') {
                await (WebDriveService as any).logout();
            }
        } catch (e) {
            console.error("登出過程發生錯誤:", e);
        } finally {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
        }
    };

    const formatBytes = (bytes: number | null) => {
        if (bytes === null) return '計算中...';
        if (bytes === 0) return '0 KB';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        if (bytes > 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            {/* ★ 1. 放寬 Modal 最大寬度以容納大字體 (max-w-sm -> max-w-md) */}
            <div className="bg-white dark:bg-stone-900 w-full max-w-md rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="flex justify-between items-center p-4 md:p-5 border-b border-stone-100 dark:border-stone-800 shrink-0">
                    {/* ★ 2. 標題字體放大 */}
                    <h3 className="font-black text-xl text-stone-800 dark:text-stone-100 flex items-center gap-2">
                        <User size={24} className="text-indigo-500" /> 帳號資訊
                    </h3>
                    <button onClick={onClose} className="p-2 bg-stone-100 dark:bg-stone-800 rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 md:p-8 flex flex-col gap-6 items-center">
                    {userInfo?.photoLink ? (
                        <img src={userInfo.photoLink} alt="Avatar" className="w-20 h-20 rounded-full shadow-md border border-stone-200 dark:border-stone-700 object-cover" />
                    ) : (
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center border border-indigo-100 dark:border-indigo-800/50">
                            <User size={40} />
                        </div>
                    )}
                    
                    <div className="text-center space-y-1.5">
                        {/* ★ 3. 使用者名稱放大 */}
                        <div className="text-xl font-bold text-stone-800 dark:text-stone-100">
                            {userInfo?.displayName || 'Google 雲端硬碟帳號'}
                        </div>
                        {/* ★ 4. Email 放大 */}
                        <div className="text-sm text-stone-500">
                            {userInfo?.emailAddress || '已連結至 MyEcoNotes'}
                        </div>
                    </div>
                    
                    <div className="w-full bg-stone-50 dark:bg-stone-950 p-5 rounded-xl border border-stone-100 dark:border-stone-800 space-y-3">
                        {/* ★ 5. 空間容量標籤放大 */}
                        <div className="flex justify-between items-center text-base">
                            <span className="font-bold text-stone-600 dark:text-stone-400 flex items-center gap-2">
                                <HardDrive size={18} /> MyEcoNotes專案雲端用量
                            </span>
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-lg">
                                {formatBytes(folderSize)}
                            </span>
                        </div>
                        {/* ★ 6. 取消鎖死 10px，改用 text-xs 以支援動態縮放 */}
                        <div className="text-xs text-stone-400 text-center mt-3">
                            *此為 MyEcoNotes 於雲端佔用的專案資料夾總容量
                        </div>
                    </div>
                </div>
                
                <div className="p-4 md:p-5 border-t border-stone-100 dark:border-stone-800 shrink-0 flex gap-3">
                    {/* ★ 7. 按鈕字體放大並增加點擊區塊 */}
                    <button onClick={handleLogout} className="flex-1 py-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl text-base font-bold transition-colors shadow-sm flex items-center justify-center gap-2">
                        <LogOut size={18} /> 登出帳號
                    </button>
                </div>
            </div>
        </div>
    );
};

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [statusMsg, setStatusMsg] = useState('初始化...');
   
    const [surveys, setSurveys] = useState<any[]>([]);
    const [notes, setNotes] = useState<any[]>([]);
    const [audios, setAudios] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [backups, setBackups] = useState<any[]>([]);
   
    const [activeTab, setActiveTab] = useState<TabMode>('SURVEY');
    
    const [showSettings, setShowSettings] = useState(false);
    const [showAccount, setShowAccount] = useState(false);
    
    const [userInfo, setUserInfo] = useState<any>(null);

    const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => {
        const saved = localStorage.getItem('ecolog_web_last_sync');
        return saved ? parseInt(saved, 10) : null;
    });

    useEffect(() => {
        const savedSize = localStorage.getItem('ecolog_web_fontsize');
        const html = document.documentElement;
        if (savedSize) {
            if (savedSize === 'small') html.style.fontSize = '14px';
            else if (savedSize === 'medium') html.style.fontSize = '16px';
            else if (savedSize === 'large') html.style.fontSize = '18px';
            else html.style.fontSize = `${savedSize}px`;
        } else {
            html.style.fontSize = '16px';
        }

        WebDriveService.init(async () => {
            setIsLoggedIn(true);
            
            try {
                const data = await googleApiGet('/drive/v3/about', { fields: 'user' });
                if (data && data.user) {
                    setUserInfo(data.user);
                }
            } catch (e) {
                console.error("取得帳號資訊失敗:", e);
            }

            loadCloudData();
        });
        setIsLoading(false);
    }, []);

    const loadCloudData = async () => {
        setIsLoading(true);
        try {
            setStatusMsg('掃描全區檔案與媒體庫...');
            const { manifestId, profileId } = await WebDriveService.fetchCoreFilesAndBuildMediaMap();
           
            if (manifestId) {
                setStatusMsg('建立歷史調查清單...');
                const buffer = await WebDriveService.downloadFileBuffer(manifestId, false);
                if (buffer) setSurveys(WebDriveService.parseManifest(buffer));
            }
           
            if (profileId) {
                setStatusMsg('掛載物種筆記與資源庫...');
                const buffer = await WebDriveService.downloadFileBuffer(profileId, false);
                if (buffer) {
                    const heavy = WebDriveService.parseGlobalProfile(buffer);
                    setNotes(heavy.notes);
                    setAudios(heavy.audio);
                    setTags(heavy.tags || []);
                }
            }

            setStatusMsg('掃描備份資料庫...');
            try {
                const backupRes = await googleApiGet('/drive/v3/files', {
                    spaces: 'appDataFolder',
                    q: "mimeType='application/zip' or name contains '.zip'",
                    fields: 'files(id, name, createdTime, size)',
                    orderBy: 'createdTime desc'
                });
                if (backupRes && backupRes.files) {
                    setBackups(backupRes.files);
                }
            } catch (e) {
                console.error('取得備份檔失敗:', e);
            }

            const now = Date.now();
            setLastSyncTime(now);
            localStorage.setItem('ecolog_web_last_sync', now.toString());

        } catch (error) {
            console.error('同步錯誤:', error);
        } finally {
            setIsLoading(false);
            setStatusMsg('');
        }
    };

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-stone-100 dark:bg-stone-950 font-sans flex flex-col items-center justify-center px-4 text-center relative overflow-hidden">
                {/* 稍微調降負邊距，避免小螢幕時撞到天花板 */}
                <div className="flex flex-col items-center justify-center w-full max-w-max -mt-[5vh]">
                    
                    {/* ★ 修改這裡：拔除基於字體縮放的 w-80/w-96，改用 vh (螢幕高度比例) 搭配最大高度限制 */}
                    <div className="h-[25vh] max-h-[300px] min-h-[160px] mb-6 flex items-center justify-center animate-in zoom-in duration-500">
                        <img src={Logo} alt="MyEcoNotes Logo" className="h-full w-auto object-contain drop-shadow-2xl" />
                    </div>
                    
                    <h1 className="text-3xl md:text-4xl font-black text-stone-800 dark:text-stone-100 mb-3 tracking-tight">
                        MyEcoNotes Web 雲端工作站
                    </h1>
                    
                    <p className="text-lg md:text-xl font-bold text-stone-500 mb-6 leading-relaxed">
                        登入 Google 帳號，瀏覽 / 下載 MyEcoNotes 專案資料。
                    </p>
                    
                    <p className="text-base font-medium text-stone-400 dark:text-stone-500 leading-relaxed text-center mb-10 whitespace-nowrap overflow-visible">
                        需在 <a href="https://play.google.com/store/apps/details?id=app.morgan.myeconotes&pcampaignid=web_share" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400 underline underline-offset-2 font-black transition-colors">MyEcoNotes</a> App內完成 Google 帳號串接，並進行同步或備份才能讀取資料。
                    </p>
                    
                    <button 
                        onClick={() => WebDriveService.login()} 
                        className="inline-flex items-center justify-center px-24 py-4 text-xl font-black text-white transition-all duration-300 bg-emerald-800 rounded-2xl hover:bg-emerald-700 hover:scale-105 active:scale-95 tracking-[0.2em] shadow-xl shadow-emerald-900/20"
                    >
                        登入
                    </button>

                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-100 overflow-hidden font-sans">
            <aside className="w-64 bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 flex flex-col shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20">
                <div className="p-5 border-b border-stone-100 dark:border-stone-800">
                    <h1 className="text-xl font-black flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                        <img src={Logo} alt="Logo" className="w-7 h-7 object-contain" /> MyEcoNotes Web
                    </h1>
                </div>
               
                <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
                    <button onClick={() => setActiveTab('SURVEY')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'SURVEY' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                        <FileText size={18} /> 調查紀錄 <span className="ml-auto text-[10px] bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded-full">{surveys.length}</span>
                    </button>
                    <button onClick={() => setActiveTab('NOTES')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'NOTES' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                        <Book size={18} /> 物種筆記 <span className="ml-auto text-[10px] bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded-full">{notes.length}</span>
                    </button>
                    <button onClick={() => setActiveTab('AUDIO')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'AUDIO' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                        <Music size={18} /> 錄音庫 <span className="ml-auto text-[10px] bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded-full">{audios.length}</span>
                    </button>

                    <div className="pt-2 pb-1">
                        <div className="h-px w-full bg-stone-100 dark:bg-stone-800 mb-2"></div>
                    </div>
                    <button onClick={() => setActiveTab('BACKUP')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'BACKUP' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                        <Archive size={18} /> 備份資料 <span className="ml-auto text-[10px] bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded-full">{backups.length}</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/50 flex gap-2 items-center">
                    <button onClick={loadCloudData} className="mr-auto flex items-center justify-center w-10 h-10 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-300 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm" title="重新同步">
                        <RefreshCw size={18} className={isLoading ? 'animate-spin text-blue-500' : ''} />
                    </button>
                    
                    <button onClick={() => setShowAccount(true)} className="flex items-center justify-center w-10 h-10 rounded-full shrink-0 border border-stone-200 dark:border-stone-700 hover:ring-2 hover:ring-indigo-400 dark:hover:ring-indigo-500 transition-all shadow-sm overflow-hidden bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300" title="帳號資訊">
                        {userInfo?.photoLink ? (
                            <img src={userInfo.photoLink} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <User size={18} />
                        )}
                    </button>
                    
                    <button onClick={() => setShowSettings(true)} className="flex items-center justify-center w-10 h-10 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-600 dark:text-stone-300 hover:text-emerald-600 hover:border-emerald-300 transition-colors shadow-sm" title="系統設定">
                        <Settings size={18} />
                    </button>
                </div>
            </aside>

            {activeTab === 'SURVEY' && <WebHistoryView surveys={surveys} isLoading={isLoading} statusMsg={statusMsg} />}
            {activeTab === 'NOTES' && <WebNotesView notes={notes} tags={tags} isLoading={isLoading} statusMsg={statusMsg} />}
            {activeTab === 'AUDIO' && <WebRecordView audios={audios} isLoading={isLoading} statusMsg={statusMsg} />}
            
            {activeTab === 'BACKUP' && <WebBackupView backups={backups} isLoading={isLoading} statusMsg={statusMsg} />}

            {showSettings && (
                <WebSettingsModal 
                    onClose={() => setShowSettings(false)} 
                    lastSyncTime={lastSyncTime} 
                />
            )}

            {showAccount && (
                <WebAccountModal 
                    onClose={() => setShowAccount(false)} 
                    userInfo={userInfo} 
                />
            )}
        </div>
    );
}

export default App;