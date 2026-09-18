// src/views/WebHistoryView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Database, Search, ChevronLeft, Map as MapIcon, List as ListIcon, FileText, Download, CheckSquare, Maximize2, MapPin, Clock, Route, CloudSun, ShieldAlert, ChevronRight, Book, RefreshCw, X, Layers } from 'lucide-react';
import { WebDriveService } from '../services/WebDriveService';
import { WebTaxonomyService } from '../services/WebTaxonomyService';
import { exportSelectedDataToZipWeb, exportSelectedTracksToGPXWeb, exportSelectedSurveysToeBirdCSVWeb } from '../services/WebExportService';
import { AsyncImage, AsyncAudio, SurveyMap, getFirstImage } from '../components/WebShared';
import { WebSurveyTimelineList } from '../components/WebHistoryList';
import { WebDownloadOptionsModal, WebINatUploadModal, WebCsvExportModal } from '../components/WebExportModals';

interface Props {
    surveys: any[];
    isLoading: boolean;
    statusMsg: string;
}

export const WebHistoryView: React.FC<Props> = ({ surveys, isLoading, statusMsg }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isDownloadingDetail, setIsDownloadingDetail] = useState(false);
    const [progressMsg, setProgressMsg] = useState('');

    const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
    const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
    const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
    
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [viewingId, setViewingId] = useState<string | null>(null);
    const [viewingData, setViewingData] = useState<any | null>(null);
    const [aggregatedData, setAggregatedData] = useState<any | null>(null); 
    
    const [drilledSpeciesKey, setDrilledSpeciesKey] = useState<string | null>(null);
    const [detailViewMode, setDetailViewMode] = useState<'list' | 'map'>('list');
    const [showFullMap, setShowFullMap] = useState(false);
    
    const [isTaxoLoading, setIsTaxoLoading] = useState(false);
    const [taxoLoadMsg, setTaxoLoadMsg] = useState('');
    const [taxoErrors, setTaxoErrors] = useState<{name: string, reason: string}[] | null>(null);
    
    const [enrichedObsGroups, setEnrichedObsGroups] = useState<any[]>([]);
    const [selectedTaxonGroup, setSelectedTaxonGroup] = useState<string | null>(null);
    
    const [detailSearchQuery, setDetailSearchQuery] = useState('');

    const [showDownloadOptions, setShowDownloadOptions] = useState(false);
    const [exportMode, setExportMode] = useState<'LIST' | 'DETAIL'>('LIST'); 
    const [showINatModal, setShowINatModal] = useState(false);
    const [showCsvModal, setShowCsvModal] = useState(false);
    const [fullSurveysForExport, setFullSurveysForExport] = useState<any[]>([]);

    useEffect(() => {
        setDrilledSpeciesKey(null);
        setDetailViewMode('list');
        setSelectedTaxonGroup(null);
        setDetailSearchQuery(''); 
    }, [viewingData, aggregatedData]);

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const bulkToggleSelection = (ids: string[], isSelect: boolean) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            ids.forEach(id => {
                if (isSelect) newSet.add(id);
                else newSet.delete(id);
            });
            return newSet;
        });
    };

    const loadTaxonomyForData = async (obsList: any[]) => {
        setIsTaxoLoading(true);
        setTaxoLoadMsg('啟動分類樹解析引擎...');
        try {
            const customSettings = WebTaxonomyService.getParsedCustomSettings();
            const sciNames = Array.from(new Set(obsList.map((o: any) => o.scientificName || o.speciesName).filter(Boolean)));
            
            const { taxMap, errors } = await WebTaxonomyService.batchGetTaxonomy(
                sciNames as string[], 
                (msg) => setTaxoLoadMsg(msg)
            );

            if (errors.length > 0) setTaxoErrors(errors);

            setTaxoLoadMsg('正在重組排序版面...');

            const map = new Map<string, any>();
            obsList.forEach((obs: any) => {
                const key = obs.speciesName + (obs.scientificName || '');
                if (!map.has(key)) {
                    const searchKey = obs.scientificName || obs.speciesName;
                    const taxInfo = searchKey ? taxMap.get(searchKey) : null;
                    
                    let matchedGroupId = WebTaxonomyService.matchCustomGroup(taxInfo, obs.speciesName, customSettings);
                    if (!matchedGroupId && obs.taxonGroup) matchedGroupId = obs.taxonGroup;
                    
                    const groupDef = customSettings.find((s:any) => s.id === matchedGroupId || s.key === matchedGroupId);
                    const groupLabel = groupDef ? (groupDef.title || groupDef.label || groupDef.name || groupDef.text) : matchedGroupId;
                    
                    map.set(key, { 
                        key, 
                        speciesName: obs.speciesName, 
                        scientificName: obs.scientificName || taxInfo?.scientificName,
                        speciesAlias: obs.speciesAlias || '', 
                        taxInfo: taxInfo,
                        customGroup: groupLabel || '', 
                        customGroupId: matchedGroupId,
                        conservationStatus: obs.conservationStatus || taxInfo?.conservationStatus,
                        totalCount: 0, items: [] 
                    });
                }
                const group = map.get(key);
                group.totalCount += (obs.count || 1);
                group.items.push(obs);
            });

            const getPriority = (groupId: string) => {
                if (!groupId) return 9999;
                const index = customSettings.findIndex((s: any) => s.id === groupId || s.key === groupId);
                return index >= 0 ? index : 9999;
            };

            const groups = Array.from(map.values()).sort((a, b) => {
                const pA = getPriority(a.customGroupId);
                const pB = getPriority(b.customGroupId);
                if (pA !== pB) return pA - pB;

                if (!a.taxInfo && b.taxInfo) return 1;
                if (a.taxInfo && !b.taxInfo) return -1;
                if (a.taxInfo && b.taxInfo) {
                    const aPath = `${a.taxInfo.order_c || ''}_${a.taxInfo.family_c || ''}_${a.taxInfo.genus_c || ''}`;
                    const bPath = `${b.taxInfo.order_c || ''}_${b.taxInfo.family_c || ''}_${b.taxInfo.genus_c || ''}`;
                    if (aPath !== bPath) return aPath.localeCompare(bPath);
                }
                return a.speciesName.localeCompare(b.speciesName, 'zh-TW');
            });

            setEnrichedObsGroups(groups);
        } catch (error: any) {
            console.error("分類樹解析崩潰:", error);
            const fallbackMap = new Map<string, any>();
            obsList.forEach((obs: any) => {
                const key = obs.speciesName + (obs.scientificName || '');
                if (!fallbackMap.has(key)) fallbackMap.set(key, { key, speciesName: obs.speciesName, totalCount: 0, items: [] });
                fallbackMap.get(key).totalCount += (obs.count || 1);
                fallbackMap.get(key).items.push(obs);
            });
            setEnrichedObsGroups(Array.from(fallbackMap.values()));
        } finally {
            setIsTaxoLoading(false);
            setTaxoLoadMsg('');
        }
    };

    const handleViewSurvey = async (surveyMeta: any) => {
        if (!surveyMeta.fileId) return;
        setIsDownloadingDetail(true);
        try {
            setAggregatedData(null);
            setViewingId(surveyMeta.id);
            const buffer = await WebDriveService.downloadFileBuffer(surveyMeta.fileId, true);
            if (buffer) {
                const fullSurvey = WebDriveService.parseSurvey(buffer);
                setViewingData(fullSurvey);
                await loadTaxonomyForData(fullSurvey.observations);
            }
        } catch (e) {
            console.error("下載單筆調查失敗:", e);
        } finally {
            setIsDownloadingDetail(false);
        }
    };

    const handleAggregateView = async () => {
        if (selectedIds.size === 0) return;
        setIsDownloadingDetail(true);
        try {
            setViewingData(null);
            setViewingId(null);
            
            const targetIds = Array.from(selectedIds);
            const promises = targetIds.map(async id => {
                const meta = surveys.find(s => s.id === id);
                if (meta && meta.fileId) {
                    const buffer = await WebDriveService.downloadFileBuffer(meta.fileId, true);
                    if (buffer) return WebDriveService.parseSurvey(buffer);
                }
                return null;
            });

            const fullSurveys = (await Promise.all(promises)).filter(Boolean);
            
            let totalDur = 0, totalDist = 0;
            const allObs: any[] = [];
            const allTracks: any[][] = []; 
            const allMarkers: any[] = [];

            fullSurveys.forEach(s => {
                if (s.endTime && s.startTime) totalDur += (s.endTime - s.startTime);
                if (s.distanceTraveled) totalDist += s.distanceTraveled;
                allObs.push(...s.observations);
                if (s.trackLog && s.trackLog.length > 0) {
                    allTracks.push(s.trackLog.sort((a: any, b: any) => a.timestamp - b.timestamp));
                }
                if (s.markers && Array.isArray(s.markers)) {
                    allMarkers.push(...s.markers);
                }
            });

            const aggData = {
                title: `歷史紀錄彙整 (${fullSurveys.length} 筆)`,
                startTime: fullSurveys.length > 0 ? Math.min(...fullSurveys.map(s => s.startTime)) : Date.now(),
                endTime: fullSurveys.length > 0 ? Math.max(...fullSurveys.map(s => s.endTime || s.startTime)) : Date.now(),
                distanceTraveled: totalDist,
                totalDuration: totalDur,
                observations: allObs,
                trackLog: [], 
                trackLogs: allTracks, 
                markers: allMarkers,
                locationName: "多地點彙整",
                isAggregated: true
            };

            setAggregatedData(aggData);
            await loadTaxonomyForData(allObs);
        } catch (e) {
            console.error("多筆彙整失敗:", e);
        } finally {
            setIsDownloadingDetail(false);
        }
    };

    const groupedSurveys = useMemo(() => {
        let filtered = surveys;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            filtered = surveys.filter(s => {
                const d = new Date(s.startTime);
                const yearStr = d.getFullYear().toString();
                const monthNum = d.getMonth() + 1;
                const dateNum = d.getDate();
                const monthStrPadded = monthNum.toString().padStart(2, '0');
                const dateStrPadded = dateNum.toString().padStart(2, '0');
                
                const dateStrings = [
                    yearStr,
                    `${monthNum}月`,
                    `${monthStrPadded}月`,
                    `${dateNum}日`,
                    `${dateStrPadded}日`,
                    `${yearStr}-${monthStrPadded}`,
                    `${monthStrPadded}-${dateStrPadded}`,
                    `${yearStr}-${monthStrPadded}-${dateStrPadded}`,
                    `${yearStr}/${monthStrPadded}/${dateStrPadded}`,
                    `${monthNum}/${dateNum}`
                ].join(' ').toLowerCase();

                return s.title.toLowerCase().includes(q) || 
                       s.locationName.toLowerCase().includes(q) || 
                       dateStrings.includes(q);
            });
        }

        const byYear: Record<string, Record<string, Record<string, any[]>>> = {};
        filtered.forEach(s => {
            const dateObj = new Date(s.startTime);
            const year = dateObj.getFullYear().toString();
            const monthStr = `${year}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
            const dayStr = `${monthStr}-${dateObj.getDate().toString().padStart(2, '0')}`;

            if (!byYear[year]) byYear[year] = {};
            if (!byYear[year][monthStr]) byYear[year][monthStr] = {};
            if (!byYear[year][monthStr][dayStr]) byYear[year][monthStr][dayStr] = [];
            byYear[year][monthStr][dayStr].push(s);
        });

        return Object.entries(byYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, monthsData]) => {
            const months = Object.entries(monthsData).sort((a, b) => b[0].localeCompare(a[0])).map(([monthStr, daysData]) => {
                const days = Object.entries(daysData).sort((a, b) => b[0].localeCompare(a[0])).map(([dayStr, items]) => ({ dayStr, items }));
                return { monthStr, days, monthTotal: days.reduce((acc, d) => acc + d.items.length, 0) };
            });
            return { year, months, yearTotal: months.reduce((acc, m) => acc + m.monthTotal, 0) };
        });
    }, [surveys, searchQuery]);

    const handlePrepareExport = async () => {
        setIsDownloadingDetail(true);
        try {
            setProgressMsg('提取調查資料中...');
            const full = await Promise.all(Array.from(selectedIds).map(async id => {
                const meta = surveys.find(s => s.id === id);
                if (meta?.fileId) {
                    const buffer = await WebDriveService.downloadFileBuffer(meta.fileId, true);
                    if (buffer) return WebDriveService.parseSurvey(buffer);
                }
                return null;
            }));
            const validSurveys = full.filter(Boolean);
            setFullSurveysForExport(validSurveys);
            return validSurveys;
        } finally {
            setIsDownloadingDetail(false);
        }
    };

    const getTargetSurveysForExport = async () => {
        if (exportMode === 'DETAIL') {
            const activeData = aggregatedData || viewingData;
            if (!activeData) return [];
            
            const currentObservationsToExport = drilledSpeciesKey 
                ? filteredGroups.find(g => g.key === drilledSpeciesKey)?.items || []
                : filteredObservations;
                
            const validObsIds = new Set(currentObservationsToExport.map((o: any) => o.id));

            if (activeData.isAggregated) {
                const baseSurveys = await handlePrepareExport();
                return baseSurveys.map(survey => ({
                    ...survey,
                    observations: survey.observations.filter((o: any) => validObsIds.has(o.id))
                })).filter(survey => survey.observations.length > 0); 
            } else {
                return [{ 
                    ...viewingData, 
                    observations: viewingData.observations.filter((o: any) => validObsIds.has(o.id))
                }];
            }
        } else {
            return await handlePrepareExport();
        }
    };

    const handleExportZip = async () => {
        const fullSurveys = await getTargetSurveysForExport();
        await exportSelectedDataToZipWeb(fullSurveys, (task, curr, total) => setProgressMsg(`${task} (${curr}/${total})`));
        setShowDownloadOptions(false);
    };

    const handleExportGPX = async () => {
        const fullSurveys = await getTargetSurveysForExport();
        await exportSelectedTracksToGPXWeb(fullSurveys, (task) => setProgressMsg(task));
        setShowDownloadOptions(false);
    };

    const handleOpenCsvConfig = async () => {
        const fullSurveys = await getTargetSurveysForExport();
        setFullSurveysForExport(fullSurveys);
        setShowDownloadOptions(false);
        setShowCsvModal(true);
    };

    const handleExportEBird = async () => {
        const fullSurveys = await getTargetSurveysForExport();
        await exportSelectedSurveysToeBirdCSVWeb(fullSurveys, 'Y', 'survey', true);
        setShowDownloadOptions(false);
    };

    const searchFilteredGroups = useMemo(() => {
        if (!detailSearchQuery.trim()) return enrichedObsGroups;
        const q = detailSearchQuery.toLowerCase().trim();
        const qLevel1 = q.replace(/一級|第?一?類|瀕臨絕種/g, 'i').replace(/二級|第?二?類|珍貴稀有/g, 'ii').replace(/三級|第?三?類|其他應予保育/g, 'iii');

        return enrichedObsGroups.map(g => {
            const gText = [
                g.speciesName,
                g.speciesAlias,
                g.scientificName,
                g.conservationStatus,
                g.conservationStatus === 'I' ? '一級瀕臨絕種保育類' : g.conservationStatus === 'II' ? '二級珍貴稀有保育類' : g.conservationStatus === 'III' ? '三級其他應予保育類' : '',
                g.taxInfo?.kingdom_c, g.taxInfo?.phylum_c, g.taxInfo?.class_c, g.taxInfo?.order_c, g.taxInfo?.family_c, g.taxInfo?.genus_c
            ].join(' ').toLowerCase();

            const filteredItems = g.items.filter((item: any) => {
                const itemText = [
                    item.surveyArea,
                    item.notes,
                    ...(item.customFields || []).map((cf:any) => `${cf.label} ${cf.values.join(' ')}`)
                ].join(' ').toLowerCase();

                return gText.includes(q) || itemText.includes(q) || gText.includes(qLevel1);
            });

            return {
                ...g,
                items: filteredItems,
                totalCount: filteredItems.reduce((acc: number, curr: any) => acc + (curr.count || 1), 0)
            };
        }).filter(g => g.items.length > 0);
    }, [enrichedObsGroups, detailSearchQuery]);

    const taxonGroupStats = useMemo(() => {
        const stats = new Map<string, number>();
        let totalSpecies = 0;
        searchFilteredGroups.forEach(g => {
            const groupName = g.customGroup || '其他';
            stats.set(groupName, (stats.get(groupName) || 0) + 1);
            totalSpecies++;
        });
        const sortedStats = Array.from(stats.entries()).sort((a, b) => b[1] - a[1]);
        return { sortedStats, totalSpecies };
    }, [searchFilteredGroups]);

    const filteredGroups = useMemo(() => {
        if (!selectedTaxonGroup) return searchFilteredGroups;
        return searchFilteredGroups.filter(g => (g.customGroup || '其他') === selectedTaxonGroup);
    }, [searchFilteredGroups, selectedTaxonGroup]);

    const filteredObservations = useMemo(() => {
        return filteredGroups.flatMap(g => g.items);
    }, [filteredGroups]);

    const renderDetailPane = () => {
        const activeData = aggregatedData || viewingData;
        if (!activeData) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-stone-300 dark:text-stone-700 select-none bg-white dark:bg-stone-950">
                    <FileText size={64} className="mb-4 opacity-20" />
                    <p className="font-bold text-lg">在左側選擇調查紀錄以查看詳細內容</p>
                </div>
            );
        }

        const groupData = drilledSpeciesKey ? filteredGroups.find(g => g.key === drilledSpeciesKey) : null;

        return (
            <div className="flex flex-col h-full relative animate-in slide-in-from-right-4 duration-300 bg-stone-50 dark:bg-stone-950">
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0 gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto flex-1">
                        <h2 className="text-lg font-bold flex items-center gap-2 text-stone-800 dark:text-stone-100 shrink-0">
                            {drilledSpeciesKey ? (
                                <button onClick={() => setDrilledSpeciesKey(null)} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                    <ChevronLeft size={20} className="text-blue-500" /> 返回{activeData.isAggregated ? '彙整' : '總覽'}
                                </button>
                            ) : (
                                <><ListIcon size={20} className="text-blue-500"/> {activeData.title}</>
                            )}
                        </h2>
                        
                        <div className={`relative w-full sm:max-w-xs flex items-center rounded-xl transition-all duration-300 ${detailSearchQuery ? 'ring-2 ring-emerald-400 dark:ring-emerald-500 shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'bg-stone-100 dark:bg-stone-800'}`}>
                            {detailSearchQuery && <div className="absolute inset-0 rounded-xl bg-emerald-500/10 animate-pulse pointer-events-none"></div>}
                            <Search size={16} className={`absolute left-3 transition-colors ${detailSearchQuery ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400'}`} />
                            <input 
                                className="w-full bg-transparent border-none rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none text-stone-800 dark:text-stone-100 placeholder:text-stone-400"
                                placeholder="篩選物種、俗名、保育、分類、備註..."
                                value={detailSearchQuery}
                                onChange={e => setDetailSearchQuery(e.target.value)}
                            />
                            {detailSearchQuery && (
                                <button onClick={() => setDetailSearchQuery('')} className="absolute right-2.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 bg-stone-200/50 dark:bg-stone-700/50 p-1 rounded-full">
                                    <X size={12}/>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                        {drilledSpeciesKey && (
                            <div className="flex bg-stone-200 dark:bg-stone-800 p-1 rounded-lg shrink-0">
                                <button onClick={() => setDetailViewMode('list')} className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors ${detailViewMode === 'list' ? 'bg-white dark:bg-stone-700 shadow-sm text-stone-800 dark:text-stone-100' : 'text-stone-500 hover:text-stone-700'}`}>
                                    <ListIcon size={14} /> 列表
                                </button>
                                <button onClick={() => setDetailViewMode('map')} className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors ${detailViewMode === 'map' ? 'bg-white dark:bg-stone-700 shadow-sm text-stone-800 dark:text-stone-100' : 'text-stone-500 hover:text-stone-700'}`}>
                                    <MapIcon size={14} /> 地圖
                                </button>
                            </div>
                        )}
                        
                        <button onClick={() => { setExportMode('DETAIL'); setShowDownloadOptions(true); }} className="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 hover:text-blue-600 transition-colors shrink-0" title="匯出當前篩選結果">
                            <Download size={20} />
                        </button>
                        
                        {!drilledSpeciesKey && (
                            <button onClick={() => { setViewingData(null); setAggregatedData(null); setViewingId(null); setSelectedTaxonGroup(null); setDetailSearchQuery(''); }} className="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 transition-colors shrink-0">
                                <X size={20}/>
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col bg-white dark:bg-stone-950">
                    <div className="w-full max-w-4xl mx-auto flex flex-col relative pb-12">
                        {!drilledSpeciesKey ? (
                            <>
                                <div className="p-6 pb-2 space-y-6 bg-white dark:bg-stone-950">
                                    <div className="bg-stone-50 dark:bg-stone-900 p-6 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
                                        <h3 className="text-3xl font-black text-stone-800 dark:text-stone-100 mb-6">{activeData.title}</h3>
                                        
                                        {/* ★ 修正大字體排版：引入 Liquid 彈性換行佈局，捨棄僵硬的 Grid */}
                                        <div className="flex flex-wrap gap-6">
                                            
                                            {/* 左側資訊區：flex-wrap 搭配 min-w 確保內容永遠不會被擠到破版 */}
                                            <div className="flex-1 min-w-[280px] flex flex-wrap gap-3 text-sm text-stone-600 dark:text-stone-300 h-fit content-start">
                                                <div className="flex-1 min-w-[160px] flex items-center gap-3 bg-white dark:bg-stone-800 p-3.5 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm">
                                                    <MapPin size={20} className="text-red-500 shrink-0"/>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-stone-400 mb-0.5 uppercase tracking-wider">地點</div>
                                                        <div className="font-bold text-stone-800 dark:text-stone-100 truncate text-base">{activeData.locationName}</div>
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-[160px] flex items-center gap-3 bg-white dark:bg-stone-800 p-3.5 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm">
                                                    <Clock size={20} className="text-amber-500 shrink-0"/>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-stone-400 mb-0.5 uppercase tracking-wider">時間</div>
                                                        <div className="font-bold text-stone-800 dark:text-stone-100 truncate text-base">{new Date(activeData.startTime).toLocaleDateString()} {activeData.isAggregated ? '起' : ''}</div>
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-[160px] flex items-center gap-3 bg-white dark:bg-stone-800 p-3.5 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm">
                                                    <Route size={20} className="text-blue-500 shrink-0"/>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-stone-400 mb-0.5 uppercase tracking-wider">距離</div>
                                                        <div className="font-bold text-stone-800 dark:text-stone-100 truncate text-base">{(activeData.distanceTraveled || 0).toFixed(2)} km</div>
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-[160px] flex items-center gap-3 bg-white dark:bg-stone-800 p-3.5 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm">
                                                    <CloudSun size={20} className="text-emerald-500 shrink-0"/>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-stone-400 mb-0.5 uppercase tracking-wider">紀錄數</div>
                                                        <div className="font-bold text-stone-800 dark:text-stone-100 truncate text-base">{activeData.observations.length} 筆觀察</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 右側地圖預覽區：給予寬裕的寬度確保比例優美 */}
                                            <div className="flex-1 min-w-[240px] max-w-full lg:max-w-[350px] h-48 lg:h-auto min-h-[180px] rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 relative group cursor-pointer shadow-sm bg-stone-100 dark:bg-stone-900" onClick={() => setShowFullMap(true)}>
                                                <div className="absolute inset-0 z-10 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                    <div className="opacity-0 group-hover:opacity-100 bg-white/90 dark:bg-stone-800/90 backdrop-blur text-stone-700 dark:text-stone-200 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 transition-opacity transform scale-95 group-hover:scale-100">
                                                        <Maximize2 size={14} /> 點擊展開地圖
                                                    </div>
                                                </div>
                                                <SurveyMap data={{ ...activeData, observations: filteredObservations }} interactive={false} />
                                            </div>
                                        </div>
                                        
                                        {!activeData.isAggregated && activeData.surveyNote && (
                                            <div className="bg-white dark:bg-stone-800 p-4 rounded-xl border border-stone-100 dark:border-stone-700 mt-4">
                                                <div className="text-[10px] font-bold text-stone-400 mb-1 flex items-center gap-1"><FileText size={12}/> 調查備註</div>
                                                <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap">{activeData.surveyNote}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="sticky top-0 z-20 bg-white/95 dark:bg-stone-950/95 backdrop-blur-md px-6 py-4 border-b border-stone-200 dark:border-stone-800 shadow-sm transition-all">
                                    <h4 className="text-sm font-bold text-stone-500 uppercase tracking-wider flex justify-between items-center mb-3">
                                        <span className="flex items-center gap-1.5"><Layers size={16}/> 類群觀察統計 ({taxonGroupStats.totalSpecies} 種)</span>
                                        {selectedTaxonGroup && (
                                            <button onClick={() => setSelectedTaxonGroup(null)} className="text-xs bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 px-2 py-1 rounded text-stone-600 dark:text-stone-300 transition-colors">
                                                清除篩選
                                            </button>
                                        )}
                                    </h4>
                                    
                                    <div className="flex flex-wrap gap-2">
                                        {taxonGroupStats.sortedStats.map(([groupName, count]) => {
                                            const isSelected = selectedTaxonGroup === groupName;
                                            return (
                                                <div 
                                                    key={groupName}
                                                    onClick={() => setSelectedTaxonGroup(isSelected ? null : groupName)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-stone-800 text-white border-stone-800 dark:bg-stone-200 dark:text-stone-900 dark:border-stone-200 shadow-md scale-[1.02]' : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 shadow-sm'}`}
                                                >
                                                    <span className="font-bold text-sm">{groupName}</span>
                                                    <span className={`text-sm font-black px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-stone-600 dark:bg-stone-300/50' : 'bg-stone-100 dark:bg-stone-800'}`}>{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="p-6 pt-4 bg-white dark:bg-stone-950 flex-1">
                                    <div className="flex justify-between items-center text-xs text-stone-500 mb-4">
                                        <span className="font-bold">顯示物種清單 ({filteredGroups.length} / {taxonGroupStats.totalSpecies})</span>
                                    </div>

                                    {filteredGroups.length === 0 && (
                                        <div className="flex flex-col items-center justify-center p-10 text-stone-400 dark:text-stone-600">
                                            <Search size={48} className="mb-4 opacity-20" />
                                            <p className="font-bold mb-2">無符合條件的觀察紀錄</p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-3 relative min-h-[100px]">
                                        {isTaxoLoading && (
                                            <div className="absolute inset-0 z-10 bg-white/50 dark:bg-stone-950/50 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                                                <span className="bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-bold px-4 py-2 rounded-full shadow-sm border border-stone-200 dark:border-stone-700 flex items-center gap-2">
                                                    <RefreshCw size={14} className="animate-spin text-blue-500"/> 
                                                    {taxoLoadMsg || '連接 TaiCOL 解析分類中...'}
                                                </span>
                                            </div>
                                        )}
                                        {filteredGroups.map((group: any) => {
                                            const areaCounts = group.items.reduce((acc: any, obs: any) => {
                                                const area = obs.surveyArea || '無樣區';
                                                acc[area] = (acc[area] || 0) + (obs.count || 1);
                                                return acc;
                                            }, {});
                                            
                                            const hasValidAreas = Object.keys(areaCounts).some(a => a !== '無樣區' && a !== '');

                                            return (
                                                <div key={group.key} onClick={() => setDrilledSpeciesKey(group.key)} className="flex justify-between items-center p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group">
                                                    <div className="flex gap-4 items-center min-w-0 flex-1">
                                                        <div className="w-14 h-14 shrink-0 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                                            <span className="text-2xl font-black leading-none">{group.totalCount}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                            <div className="flex items-end gap-2 flex-wrap mb-1">
                                                                <span className="font-bold text-stone-800 dark:text-stone-100 text-lg leading-tight">{group.speciesName}</span>
                                                                {group.scientificName && <span className="italic text-stone-500 text-sm leading-tight pb-0.5">({group.scientificName})</span>}
                                                                {group.conservationStatus && group.conservationStatus !== 'N' && (
                                                                    <span className="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-600 px-2 py-0.5 rounded-full border border-red-100 dark:border-red-900/50 flex items-center gap-1 mb-0.5"><ShieldAlert size={10} /> 保育: {group.conservationStatus}</span>
                                                                )}
                                                            </div>
                                                            {group.speciesAlias && (
                                                                <div className="text-xs text-stone-500 dark:text-stone-400 font-medium mb-1">
                                                                    俗名/別名: {group.speciesAlias}
                                                                </div>
                                                            )}
                                                            {hasValidAreas && (
                                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                                    {Object.entries(areaCounts).map(([area, count]) => (
                                                                        <span key={area} className="text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-500 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 flex items-center gap-1">
                                                                            <MapIcon size={10} /> {area}: <span className="font-bold text-stone-700 dark:text-stone-300">{String(count)}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 ml-4">
                                                        <ChevronRight size={20} className="text-stone-300 group-hover:text-blue-500 transition-colors" />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </>
                        ) : (
                            (() => {
                                const groupData = filteredGroups.find(g => g.key === drilledSpeciesKey);
                                
                                if (!groupData) {
                                    return (
                                        <div className="flex-1 flex flex-col items-center justify-center p-10 text-stone-500">
                                            <Search size={48} className="mb-4 opacity-20" />
                                            <p className="font-bold text-lg mb-2">無符合篩選條件的觀察紀錄</p>
                                            <button onClick={() => setDetailSearchQuery('')} className="mt-2 px-4 py-2 bg-stone-200 dark:bg-stone-800 rounded-lg text-sm hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors font-bold">清除搜尋條件</button>
                                        </div>
                                    );
                                }
                                
                                return (
                                    <>
                                        <div className="sticky top-0 z-20 bg-blue-50/95 dark:bg-blue-900/90 backdrop-blur-md border-b border-blue-100 dark:border-blue-800 p-6 shadow-sm">
                                            <div className="flex justify-between items-center shrink-0 gap-4">
                                                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                                    <h3 className="text-2xl font-black text-stone-800 dark:text-stone-100 flex items-center gap-2 flex-wrap leading-tight">
                                                        <span>{groupData.speciesName}</span>
                                                        {groupData.scientificName && <span className="text-lg text-stone-500 font-normal italic">({groupData.scientificName})</span>}
                                                        {groupData.conservationStatus && groupData.conservationStatus !== 'N' && <span className="text-[12px] bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 px-2 py-1 rounded-md flex items-center gap-1 border border-red-200 dark:border-red-800"><ShieldAlert size={12} /> 保育等級: {groupData.conservationStatus}</span>}
                                                    </h3>
                                                    {groupData.speciesAlias && <p className="text-sm text-stone-600 dark:text-stone-400 font-bold">俗名/別名: {groupData.speciesAlias}</p>}
                                                    {groupData.taxInfo && <p className="text-xs text-stone-500 dark:text-stone-400 font-mono mt-1 bg-white/50 dark:bg-stone-950/30 inline-block px-2 py-1 rounded w-fit">{[groupData.taxInfo.kingdom_c, groupData.taxInfo.phylum_c, groupData.taxInfo.class_c, groupData.taxInfo.order_c, groupData.taxInfo.family_c, groupData.taxInfo.genus_c].filter(Boolean).join(' > ')}</p>}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-xs text-blue-600/70 dark:text-blue-400/70 font-bold mb-1 uppercase tracking-widest">總數</div>
                                                    <div className="text-4xl font-black text-blue-600 dark:text-blue-400 leading-none">{groupData.totalCount}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-6 bg-white dark:bg-stone-950 flex-1">
                                            {detailViewMode === 'list' ? (
                                                <div className="space-y-3">
                                                    {groupData.items.map((obs: any) => {
                                                        const imgSource = getFirstImage(obs);
                                                        return (
                                                            <div key={obs.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 md:items-center">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-2 text-xs font-bold text-stone-500 flex-wrap">
                                                                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500"><Clock size={14} />{new Date(obs.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                                                                        {obs.location && <><span className="text-stone-300 dark:text-stone-700">|</span><span className="flex items-center gap-1 text-red-500 dark:text-red-400"><MapPin size={14} /><span className="font-mono">{obs.location.latitude.toFixed(5)}, {obs.location.longitude.toFixed(5)}</span></span></>}
                                                                        {obs.surveyArea && <><span className="text-stone-300 dark:text-stone-700">|</span><span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500"><MapIcon size={14} />{obs.surveyArea}</span></>}
                                                                    </div>
                                                                    {imgSource && <div className="h-20 w-32 rounded-lg overflow-hidden mb-3 md:mb-0 md:float-right md:ml-4 shrink-0 border border-stone-100 dark:border-stone-800"><AsyncImage srcPath={imgSource} /></div>}
                                                                    
                                                                    {obs.customFields && obs.customFields.length > 0 && (
                                                                        <div className="flex flex-wrap gap-2 mb-2 mt-2">
                                                                            {obs.customFields.map((cf: any, idx: number) => (
                                                                                <span key={idx} className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700">
                                                                                    {cf.label}: <span className="font-bold">{cf.values.join(', ')}</span>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    {obs.media && obs.media.length > 0 && (
                                                                        <div className="flex gap-2 mt-3 mb-3">
                                                                            {obs.media.map((m: any, idx: number) => {
                                                                                if (m.type === 'audio' || m.mimeType?.startsWith('audio')) return <AsyncAudio key={idx} recording={m} />;
                                                                                return null;
                                                                            })}
                                                                        </div>
                                                                    )}

                                                                    {obs.notes && (
                                                                        <div className="text-sm text-stone-700 dark:text-stone-300 mt-2 mb-2 leading-relaxed bg-amber-50 dark:bg-amber-900/10 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30">
                                                                            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-500 mb-1 flex items-center gap-1"><FileText size={12}/> 觀察備註</div>
                                                                            {obs.notes}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="shrink-0 flex flex-col items-center justify-center md:border-l border-stone-100 dark:border-stone-800 md:pl-5 pt-4 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                                                                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">數量</span>
                                                                    <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{obs.count}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="w-full h-[65vh] min-h-[500px] rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800 shadow-inner relative z-0">
                                                    <SurveyMap data={{ ...activeData, observations: groupData.items }} interactive={true} />
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <main className="w-80 lg:w-[400px] border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 flex flex-col shrink-0 relative">
                {(isLoading || isDownloadingDetail) && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-stone-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-in fade-in duration-200">
                        <Database size={32} className="text-blue-500 mb-3 animate-bounce" />
                        <span className="text-sm font-bold text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 px-4 py-1.5 rounded-full shadow-sm">{progressMsg || statusMsg}</span>
                    </div>
                )}

                <div className="p-4 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 shrink-0">
                    {isSelectionMode ? (
                        <div className="flex justify-between items-center animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="p-1.5 bg-stone-100 dark:bg-stone-800 rounded-full text-stone-500 dark:text-stone-300"><X size={18} /></button>
                                <span className="font-bold text-sm text-stone-800 dark:text-stone-100">已選 {selectedIds.size} 筆</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleAggregateView} disabled={selectedIds.size === 0} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white shadow-md disabled:opacity-50 flex items-center gap-1">
                                    <Search size={14} /> 彙整
                                </button>
                                <button onClick={() => { setExportMode('LIST'); setShowDownloadOptions(true); }} disabled={selectedIds.size === 0} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white shadow-md disabled:opacity-50 flex items-center gap-1">
                                    <Download size={14} /> 匯出
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-2 items-center">
                            <div className={`relative flex-1 flex items-center rounded-xl transition-all duration-300 ${searchQuery ? 'ring-2 ring-blue-400 dark:ring-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' : 'bg-stone-100 dark:bg-stone-800'}`}>
                                {searchQuery && <div className="absolute inset-0 rounded-xl bg-blue-500/10 animate-pulse pointer-events-none"></div>}
                                <Search size={16} className={`absolute left-3 transition-colors ${searchQuery ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400'}`} />
                                <input 
                                    className="w-full bg-transparent border-none rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none text-stone-800 dark:text-stone-100 placeholder:text-stone-400"
                                    placeholder="搜尋調查、地點或日期..." 
                                    value={searchQuery} 
                                    onChange={e => setSearchQuery(e.target.value)} 
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 bg-stone-200/50 dark:bg-stone-700/50 p-1 rounded-full">
                                        <X size={12}/>
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setIsSelectionMode(true)} className="p-2 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors" title="多選">
                                <CheckSquare size={18} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <WebSurveyTimelineList 
                        data={groupedSurveys}
                        collapsedYears={collapsedYears}
                        collapsedMonths={collapsedMonths}
                        collapsedDays={collapsedDays}
                        toggleYear={(y: string) => { const s = new Set(collapsedYears); if (s.has(y)) s.delete(y); else s.add(y); setCollapsedYears(s); }}
                        toggleMonth={(m: string) => { const s = new Set(collapsedMonths); if (s.has(m)) s.delete(m); else s.add(m); setCollapsedMonths(s); }}
                        toggleDay={(d: string) => { const s = new Set(collapsedDays); if (s.has(d)) s.delete(d); else s.add(d); setCollapsedDays(s); }}
                        isSelectionMode={isSelectionMode}
                        selectedIds={selectedIds}
                        toggleSelection={toggleSelection}
                        bulkToggleSelection={bulkToggleSelection}
                        onItemClick={handleViewSurvey}
                        viewingId={viewingId || undefined}
                    />
                </div>
            </main>

            <section className="flex-1 min-w-0 bg-white dark:bg-stone-950 relative">
                {renderDetailPane()}
            </section>

            {showFullMap && (viewingData || aggregatedData) && (
                <div className="fixed inset-0 z-[9999] bg-stone-950/95 backdrop-blur-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-4 flex justify-between items-center bg-white/10 border-b border-white/10 shadow-md z-10 shrink-0">
                        <div>
                            <h3 className="font-black text-white text-lg flex items-center gap-2">
                                <MapIcon size={20} className="text-blue-400" /> {(aggregatedData || viewingData).title}
                            </h3>
                        </div>
                        <button onClick={() => setShowFullMap(false)} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-sm">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 relative bg-stone-900">
                        <SurveyMap 
                            data={drilledSpeciesKey 
                                ? { ...(aggregatedData || viewingData), observations: filteredGroups.find(g => g.key === drilledSpeciesKey)?.items || [] } 
                                : { ...(aggregatedData || viewingData), observations: filteredObservations }
                            } 
                            interactive={true} 
                        />
                    </div>
                </div>
            )}

            {showDownloadOptions && (
                <WebDownloadOptionsModal 
                    selectedCount={exportMode === 'DETAIL' ? 1 : selectedIds.size}
                    onClose={() => setShowDownloadOptions(false)}
                    onOpenCsvConfig={handleOpenCsvConfig}
                    onExportiNaturalist={(privacy) => {
                        setShowDownloadOptions(false);
                        if (exportMode === 'DETAIL') {
                            setShowINatModal(true);
                        } else {
                            if (aggregatedData) setShowINatModal(true);
                            else {
                                handleAggregateView().then(() => setShowINatModal(true));
                            }
                        }
                    }}
                    onExportEBird={handleExportEBird}
                    onExportGPX={handleExportGPX}
                    onExportBackup={handleExportZip}
                />
            )}

            {showCsvModal && (
                <WebCsvExportModal 
                    fullSurveys={fullSurveysForExport}
                    onClose={() => { setShowCsvModal(false); setIsSelectionMode(false); setSelectedIds(new Set()); }}
                />
            )}

            {showINatModal && (
                <WebINatUploadModal 
                    survey={exportMode === 'DETAIL' 
                        ? { ...(aggregatedData || viewingData), observations: drilledSpeciesKey ? (filteredGroups.find(g => g.key === drilledSpeciesKey)?.items || []) : filteredObservations } 
                        : aggregatedData} 
                    onClose={() => { setShowINatModal(false); setIsSelectionMode(false); setSelectedIds(new Set()); }} 
                />
            )}

            {taxoErrors && taxoErrors.length > 0 && (
                <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 flex flex-col max-h-[80vh] animate-in zoom-in-95">
                        <div className="flex justify-between items-center p-4 border-b border-stone-100 dark:border-stone-800 shrink-0">
                            <h3 className="font-bold text-lg text-red-600 dark:text-red-400 flex items-center gap-2">
                                <ShieldAlert size={24} /> 網路與 API 解析異常報告
                            </h3>
                            <button onClick={() => setTaxoErrors(null)} className="p-2 bg-stone-100 dark:bg-stone-800 rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"><X size={20} /></button>
                        </div>
                        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
                            <p className="text-sm font-bold text-stone-600 dark:text-stone-300">
                                有 {taxoErrors.length} 個物種在向 TaiCOL 請求分類樹資訊時發生錯誤，它们將暫時無法套用您的自訂類群，並以「未分類」顯示：
                            </p>
                            <div className="space-y-2">
                                {taxoErrors.map((err, idx) => (
                                    <div key={idx} className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30 flex flex-col gap-1">
                                        <span className="font-bold text-stone-800 dark:text-stone-100">{err.name}</span>
                                        <span className="text-xs text-red-600 dark:text-red-400">{err.reason}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t border-stone-100 dark:border-stone-800 shrink-0">
                            <button onClick={() => setTaxoErrors(null)} className="w-full py-3 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-xl font-bold active:scale-95 transition-transform">了解並繼續</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};