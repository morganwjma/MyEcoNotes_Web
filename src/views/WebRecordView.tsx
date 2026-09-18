// src/views/WebRecordView.tsx
import React, { useState } from 'react';
import { Search, Music, X, Database } from 'lucide-react';
import { AsyncAudio } from '../components/WebShared';

interface Props {
    audios: any[];
    isLoading: boolean;
    statusMsg: string;
}

export const WebRecordView: React.FC<Props> = ({ audios, isLoading, statusMsg }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingData, setViewingData] = useState<any | null>(null);

    const renderDetailPane = () => {
        if (!viewingData) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-stone-300 dark:text-stone-700 select-none">
                    <Music size={64} className="mb-4 opacity-20" />
                    <p className="font-bold text-lg">在左側選擇錄音以進行預覽</p>
                </div>
            );
        }

        const data = viewingData;
        
        return (
            <div className="flex flex-col h-full relative animate-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 shrink-0">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-stone-800 dark:text-stone-100">
                        <Music size={20} className="text-amber-500"/> 錄音預覽
                    </h2>
                    <button onClick={() => setViewingData(null)} className="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 transition-colors">
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-stone-950 custom-scrollbar relative overflow-x-hidden flex flex-col">
                    <div className="max-w-xl mx-auto flex flex-col items-center justify-center h-full pt-10 text-center w-full">
                        <div className="w-24 h-24 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-full flex items-center justify-center mb-6 border border-amber-100 dark:border-amber-800/50 shadow-lg">
                            <Music size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-stone-800 dark:text-stone-100 mb-2">{data.fileName}</h3>
                        <p className="text-stone-500 text-sm mb-10">時長 {(data.duration || 0).toFixed(1)} 秒 • 建立於 {new Date(data.timestamp).toLocaleString()}</p>
                        <div className="scale-125 shadow-2xl rounded-full">
                            <AsyncAudio recording={data} />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <main className="w-80 lg:w-[400px] border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 flex flex-col shrink-0 relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-stone-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-in fade-in duration-200">
                        <Database size={32} className="text-blue-500 mb-3 animate-bounce" />
                        <span className="text-sm font-bold text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 px-4 py-1.5 rounded-full shadow-sm">{statusMsg}</span>
                    </div>
                )}

                <div className="p-4 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 shrink-0">
                    <div className="relative group">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-emerald-500 transition-colors" />
                        <input 
                            className="w-full bg-stone-100 dark:bg-stone-950 border-none rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-stone-800 dark:text-stone-100 font-medium placeholder:font-normal" 
                            placeholder="搜尋錄音檔名稱..." 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="space-y-2 p-4">
                        {audios.length === 0 && <div className="text-center text-stone-400 py-10 text-sm">錄音庫為空</div>}
                        {audios.map((audio) => (
                            <div key={audio.id} onClick={() => setViewingData(audio)} className={`p-3 border rounded-xl cursor-pointer transition-all flex items-center gap-3 ${viewingData?.id === audio.id ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-amber-300 shadow-sm'}`}>
                                <div className="w-10 h-10 bg-stone-100 dark:bg-stone-800 text-stone-400 rounded-full flex items-center justify-center shrink-0">
                                    <Music size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-stone-800 dark:text-stone-100 text-sm truncate">{audio.fileName}</h4>
                                    <p className="text-[10px] text-stone-500 mt-0.5">{(audio.duration || 0).toFixed(1)}s • {new Date(audio.timestamp).toLocaleDateString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <section className="flex-1 min-w-0 bg-white dark:bg-stone-950 relative">
                {renderDetailPane()}
            </section>
        </>
    );
};