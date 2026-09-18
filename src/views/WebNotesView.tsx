// src/views/WebNotesView.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Search, ChevronDown, Book, ShieldAlert, X, Volume2, Database, Download, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import { AsyncImage, AsyncAudio } from '../components/WebShared';
import { WebDriveService } from '../services/WebDriveService';
import { WebTaxonomyService, type TaxonInfo } from '../services/WebTaxonomyService';

interface NoteNode {
    pathStr: string;
    title: string;
    level: number;
    notes: any[];
    children: NoteNode[];
    totalNotes: number;
}

interface Props {
    notes: any[];
    tags: any[];
    isLoading: boolean;
    statusMsg: string;
}

export const WebNotesView: React.FC<Props> = ({ notes, tags, isLoading, statusMsg }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingData, setViewingData] = useState<any | null>(null);
    const [collapsedNotePaths, setCollapsedNotePaths] = useState<Set<string>>(new Set());
    
    // 多圖切換狀態
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // TaiCOL API 與下載狀態
    const [taicolData, setTaicolData] = useState<TaxonInfo | null>(null);
    const [isTaicolLoading, setIsTaicolLoading] = useState(false);
    const [downloadingAudioId, setDownloadingAudioId] = useState<string | null>(null);

    const filteredNotes = useMemo(() => {
        if (!searchQuery.trim()) return notes;
        const q = searchQuery.toLowerCase();
        return notes.filter(n => n.speciesName.toLowerCase().includes(q) || (n.scientificName && n.scientificName.toLowerCase().includes(q)));
    }, [notes, searchQuery]);

    const tagMap = useMemo(() => {
        const map = new Map();
        if (typeof tags !== 'undefined' && Array.isArray(tags)) {
            tags.forEach(t => map.set(t.id, t));
        }
        return map;
    }, [typeof tags !== 'undefined' ? tags : []]);

    useEffect(() => {
        setCurrentImageIndex(0);
    }, [viewingData]);

    useEffect(() => {
        if (!viewingData) {
            setTaicolData(null);
            return;
        }

        let isMounted = true;
        const fetchTaicol = async () => {
            setIsTaicolLoading(true);
            try {
                const queryName = viewingData.scientificName || viewingData.speciesName;
                if (!queryName) {
                    if (isMounted) setTaicolData(null);
                    return;
                }

                const { taxMap } = await WebTaxonomyService.batchGetTaxonomy([queryName]);
                const data = taxMap.get(queryName);
                
                if (isMounted && data && (data.kingdom || data.family || data.genus)) {
                    setTaicolData(data);
                } else if (viewingData.scientificName && viewingData.speciesName) {
                    const { taxMap: fbMap } = await WebTaxonomyService.batchGetTaxonomy([viewingData.speciesName]);
                    const fbData = fbMap.get(viewingData.speciesName);
                    if (isMounted && fbData && (fbData.kingdom || fbData.family || fbData.genus)) {
                        setTaicolData(fbData);
                    } else {
                        if (isMounted) setTaicolData(null);
                    }
                } else {
                    if (isMounted) setTaicolData(null);
                }
            } catch (e) {
                console.warn("TaiCOL API 查詢失敗:", e);
                if (isMounted) setTaicolData(null);
            } finally {
                if (isMounted) setIsTaicolLoading(false);
            }
        };

        fetchTaicol();
        return () => { isMounted = false; };
    }, [viewingData]);

    const noteTree = useMemo(() => {
        const root: NoteNode[] = [];
        filteredNotes.forEach(note => {
            let currentTags = note.tags && Array.isArray(note.tags) ? note.tags : [];
            let path: string[] = [];
            
            if (currentTags.length > 0) {
                const firstTagId = currentTags[0];
                let curr = tagMap.get(firstTagId);
                const visited = new Set();
                while (curr && !visited.has(curr.id)) {
                    visited.add(curr.id);
                    path.unshift(curr.name || curr.label || '未命名標籤'); 
                    curr = tagMap.get(curr.parentId);
                }
            }
            if (path.length === 0) path = ['未分類'];

            let currentLevelList = root;
            let currentPathStr = '';

            for (let i = 0; i < path.length; i++) {
                const part = path[i];
                currentPathStr = currentPathStr ? `${currentPathStr}/${part}` : part;
                let node = currentLevelList.find(n => n.title === part);
                if (!node) {
                    node = { pathStr: currentPathStr, title: part, level: i, notes: [], children: [], totalNotes: 0 };
                    currentLevelList.push(node);
                }
                node.totalNotes += 1;
                if (i === path.length - 1) node.notes.push(note);
                currentLevelList = node.children;
            }
        });

        const sortTree = (nodes: NoteNode[]) => {
            nodes.sort((a, b) => {
                if (a.title === '未分類') return 1;
                if (b.title === '未分類') return -1;
                return a.title.localeCompare(b.title);
            });
            nodes.forEach(n => sortTree(n.children));
        };
        sortTree(root);
        return root;
    }, [filteredNotes, tagMap]);

    const toggleNotePath = (pathStr: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const s = new Set(collapsedNotePaths);
        if (s.has(pathStr)) s.delete(pathStr); else s.add(pathStr);
        setCollapsedNotePaths(s);
    };

    const handleDownloadAudio = async (rec: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (downloadingAudioId) return;
        
        setDownloadingAudioId(rec.id);
        try {
            let downloadUrl = '';
            const mime = rec.mimeType || 'audio/wav';

            if (rec.base64) {
                downloadUrl = rec.base64.startsWith('data:') 
                    ? rec.base64 
                    : `data:${mime};base64,${rec.base64}`;
            } else {
                const path = rec.filePath || rec.localPath || rec.fileName || rec.path;
                const fetchedUrl = await WebDriveService.getMediaBlobUrl(path, mime, false, rec.id);
                if (fetchedUrl) downloadUrl = fetchedUrl;
            }
            
            if (downloadUrl) {
                // ★ 智慧副檔名判斷：優先看檔名，否則以 mimeType 判斷
                let ext = 'wav'; 
                if (rec.fileName && rec.fileName.includes('.')) {
                    ext = rec.fileName.split('.').pop()?.toLowerCase() || 'wav';
                } else if (mime) {
                    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'm4a';
                    else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
                }

                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `MyEcoNotes_Audio_${rec.id.substring(0, 8)}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                alert('無法取得音檔下載連結，請確認 App 端是否已成功上傳。');
            }
        } catch (err) {
            console.error('音檔下載失敗', err);
            alert('音檔下載失敗，請確認網路連線');
        } finally {
            setDownloadingAudioId(null);
        }
    };

    const renderNoteTree = (nodes: NoteNode[]) => {
        return nodes.map(node => {
            const isCollapsed = collapsedNotePaths.has(node.pathStr);
            const topOffset = node.level * 40;

            let bgClass = 'bg-stone-50/90 dark:bg-stone-900/50 border-t border-stone-200/50 dark:border-stone-800';
            let textClass = 'text-sm font-bold text-stone-600 dark:text-stone-400';
            
            if (node.level === 0) {
                bgClass = 'bg-emerald-100/60 dark:bg-emerald-900/30';
                textClass = 'text-base font-black text-emerald-800 dark:text-emerald-300';
            } else if (node.level === 1) {
                bgClass = 'bg-emerald-50/80 dark:bg-emerald-900/20';
                textClass = 'text-sm font-bold text-emerald-700 dark:text-emerald-400';
            }

            return (
                <div key={node.pathStr}>
                    <div 
                        className={`px-4 py-3 ${bgClass} ${textClass} sticky z-${30 - node.level} flex justify-between items-center cursor-pointer hover:brightness-95 transition-all backdrop-blur-md`}
                        style={{ paddingLeft: `${1 + node.level * 1.5}rem`, top: `${topOffset}px` }}
                        onClick={(e) => toggleNotePath(node.pathStr, e)}
                    >
                        <span>{node.title} <span className="ml-2 opacity-60 font-bold">({node.totalNotes} 筆)</span></span>
                        <ChevronDown size={16} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    </div>
                    {!isCollapsed && (
                        <div className="bg-white/50 dark:bg-stone-950/50">
                            {node.children.length > 0 && renderNoteTree(node.children)}
                            {node.notes.length > 0 && (
                                <div className="p-2 space-y-2" style={{ paddingLeft: `${1.5 + node.level * 1.5}rem` }}>
                                    {node.notes.map((note: any) => (
                                        <div key={note.id} onClick={() => setViewingData(note)} className={`p-3 border rounded-xl cursor-pointer transition-all flex items-center gap-3 ${viewingData?.id === note.id ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-emerald-300 shadow-sm'}`}>
                                            <div className="w-12 h-12 rounded-lg bg-stone-100 overflow-hidden shrink-0 border border-stone-100 dark:border-stone-800">
                                                {note.images && note.images.length > 0 ? <AsyncImage srcPath={note.images[0]} /> : <div className="w-full h-full flex items-center justify-center text-stone-300"><Book size={16}/></div>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold text-stone-800 dark:text-stone-100 text-base truncate">{note.speciesName}</h4>
                                                {note.scientificName && <p className="text-xs text-stone-500 italic mt-0.5 truncate">{note.scientificName}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        });
    };

    const renderDetailPane = () => {
        if (!viewingData) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-stone-300 dark:text-stone-700 select-none">
                    <Book size={64} className="mb-4 opacity-20" />
                    <p className="font-bold text-lg">在左側選擇物種以查看詳細筆記</p>
                </div>
            );
        }

        const data = viewingData;
        const noteTags = (data.tags || []).map((tId: string) => tagMap.get(tId)).filter(Boolean);
        
        return (
            <div className="flex flex-col h-full relative animate-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 shrink-0">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-stone-800 dark:text-stone-100">
                        <Book size={20} className="text-emerald-500"/> 物種筆記
                    </h2>
                    <button onClick={() => setViewingData(null)} className="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 transition-colors">
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="bg-indigo-50/50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-900/50 px-6 py-5 shrink-0 z-10">
                    <div className="flex flex-wrap items-baseline gap-3 mb-2">
                        <h3 className="text-2xl font-black text-stone-800 dark:text-stone-100">{data.speciesName}</h3>
                        {data.scientificName && <span className="text-[15px] italic text-stone-500">{data.scientificName}</span>}
                        
                        <div className="flex flex-wrap gap-2 items-center ml-auto md:ml-0 mt-2 md:mt-0">
                            {data.conservationStatus && data.conservationStatus !== 'N' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800/50 shadow-sm">
                                    <ShieldAlert size={12}/> 保育等級: {data.conservationStatus}
                                </span>
                            )}
                            {noteTags.map((t: any) => (
                                <span key={t.id} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 rounded-md border border-blue-200 dark:border-blue-800/50 shadow-sm">
                                    <Tag size={12}/> {t.name || t.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="text-[13px] text-stone-500 font-medium flex flex-wrap gap-1 items-center mt-2">
                        {isTaicolLoading ? (
                            <span className="flex items-center gap-2 text-indigo-500"><Database size={13} className="animate-spin" /> 查詢 TaiCOL 資訊中...</span>
                        ) : taicolData ? (
                            <span>
                                {taicolData.kingdom_c} &gt; {taicolData.phylum_c} &gt; {taicolData.class_c} &gt; {taicolData.order_c} &gt; {taicolData.family_c} &gt; {taicolData.genus_c}
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white dark:bg-stone-950 custom-scrollbar relative overflow-x-hidden flex flex-col">
                    <div className="max-w-3xl mx-auto space-y-6 w-full pb-10">
                        
                        {data.images && data.images.length > 0 && (
                            <div className="w-full h-64 md:h-80 lg:h-96 rounded-2xl overflow-hidden shadow-sm border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 shrink-0 relative group flex items-center justify-center">
                                <AsyncImage srcPath={data.images[currentImageIndex]} className="w-full h-full object-contain" />
                                
                                {data.images.length > 1 && (
                                    <>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(prev => prev > 0 ? prev - 1 : data.images.length - 1); }}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/40 text-white rounded-full hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-all shadow-md z-10"
                                        >
                                            <ChevronLeft size={24} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(prev => prev < data.images.length - 1 ? prev + 1 : 0); }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/40 text-white rounded-full hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-all shadow-md z-10"
                                        >
                                            <ChevronRight size={24} />
                                        </button>
                                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 backdrop-blur-md text-white text-xs font-bold rounded-full shadow-md z-10">
                                            {currentImageIndex + 1} / {data.images.length}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {data.recordings && data.recordings.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-bold text-stone-500 uppercase tracking-wider px-2 flex items-center gap-2"><Volume2 size={16}/> 聲音紀錄</h4>
                                {data.recordings.map((rec: any) => (
                                    <div key={rec.id} className="p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center justify-between gap-4 shadow-sm transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
                                        <div className="flex items-center gap-4 min-w-0 flex-1 overflow-hidden">
                                            <AsyncAudio recording={rec} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">錄音檔 {rec.id.substring(0,8)}</div>
                                                <div className="text-xs text-stone-500 mt-0.5">{(rec.duration || 0).toFixed(1)}s • {new Date(rec.timestamp).toLocaleString()}</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => handleDownloadAudio(rec, e)} 
                                            disabled={downloadingAudioId === rec.id}
                                            className={`p-2.5 rounded-xl transition-all shrink-0 border shadow-sm flex items-center gap-1.5 ${
                                                downloadingAudioId === rec.id 
                                                ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' 
                                                : 'bg-stone-50 hover:bg-emerald-50 text-stone-500 hover:text-emerald-600 dark:bg-stone-800 dark:hover:bg-emerald-900/30 border-stone-200 dark:border-stone-700'
                                            }`}
                                            title="下載音檔"
                                        >
                                            {downloadingAudioId === rec.id ? <Database size={18} className="animate-spin" /> : <Download size={18} />}
                                            <span className="text-xs font-bold hidden sm:inline">{downloadingAudioId === rec.id ? '下載中...' : '下載'}</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="prose dark:prose-invert prose-stone max-w-none text-base leading-loose whitespace-pre-wrap text-stone-700 dark:text-stone-300 p-6 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
                            {data.content || <span className="text-stone-400 italic">尚無文字內容...</span>}
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
                            placeholder="搜尋物種名稱..." 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="relative pb-10">
                        {filteredNotes.length === 0 && <div className="text-center text-stone-400 py-10 text-sm">無相符的物種筆記</div>}
                        {renderNoteTree(noteTree)}
                    </div>
                </div>
            </main>

            <section className="flex-1 min-w-0 bg-white dark:bg-stone-950 relative flex flex-col">
                {renderDetailPane()}
            </section>
        </>
    );
};
