// src/components/WebHistoryList.tsx
import React from 'react';
import { ChevronRight, ChevronDown, CheckSquare, Square, MapPin, Clock } from 'lucide-react';

export const WebSurveyTimelineList = ({
    data, 
    collapsedYears, 
    collapsedMonths, 
    collapsedDays,
    toggleYear, 
    toggleMonth, 
    toggleDay,
    isSelectionMode, 
    selectedIds, 
    toggleSelection,
    bulkToggleSelection, // ★ 接收批次處理函數
    onItemClick, 
    viewingId
}: any) => {

    // ★ 處理批次勾選邏輯
    const handleBulkSelect = (items: any[], e: React.MouseEvent) => {
        e.stopPropagation();
        const allSelected = items.every(item => selectedIds.has(item.id));
        const ids = items.map(i => i.id);
        bulkToggleSelection(ids, !allSelected); // 傳送批次 ID 陣列與目標狀態
    };

    const renderCheckbox = (items: any[]) => {
        if (!isSelectionMode) return null;
        const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
        const someSelected = items.some(item => selectedIds.has(item.id));
        
        return (
            <button 
                onClick={(e) => handleBulkSelect(items, e)} 
                className="p-1 hover:bg-stone-200 dark:hover:bg-stone-700 rounded transition-colors" 
                title={allSelected ? "取消全選" : "全選"}
            >
                {allSelected ? (
                    <CheckSquare size={18} className="text-emerald-500" />
                ) : someSelected ? (
                    <CheckSquare size={18} className="text-emerald-500 opacity-50" />
                ) : (
                    <Square size={18} className="text-stone-300 dark:text-stone-600" />
                )}
            </button>
        );
    };

    return (
        <div className="w-full flex flex-col pb-20">
            {data.map((yearGroup: any) => {
                const yearItems = yearGroup.months.flatMap((m: any) => m.days.flatMap((d: any) => d.items));
                return (
                    <div key={yearGroup.year} className="flex flex-col">
                        <div className="sticky top-0 z-30 flex items-center justify-between bg-stone-100 dark:bg-stone-900 px-4 py-2.5 border-y border-stone-200 dark:border-stone-800 cursor-pointer shadow-sm" onClick={() => toggleYear(yearGroup.year)}>
                            <div className="flex items-center gap-2">
                                {collapsedYears.has(yearGroup.year) ? <ChevronRight size={18} className="text-stone-500"/> : <ChevronDown size={18} className="text-stone-500"/>}
                                <span className="font-black text-stone-800 dark:text-stone-100">{yearGroup.year} 年 <span className="text-xs font-normal text-stone-500 ml-1">({yearGroup.yearTotal} 筆)</span></span>
                            </div>
                            {renderCheckbox(yearItems)}
                        </div>
                        
                        {!collapsedYears.has(yearGroup.year) && yearGroup.months.map((monthGroup: any) => {
                            const monthItems = monthGroup.days.flatMap((d: any) => d.items);
                            const mLabel = monthGroup.monthStr.split('-')[1]; 
                            const mDisplay = parseInt(mLabel, 10);
                            
                            return (
                                <div key={monthGroup.monthStr} className="flex flex-col">
                                    <div className="sticky top-[45px] z-20 flex items-center justify-between bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur px-4 py-2 border-b border-stone-100 dark:border-stone-800 cursor-pointer pl-8" onClick={() => toggleMonth(monthGroup.monthStr)}>
                                        <div className="flex items-center gap-2">
                                            {collapsedMonths.has(monthGroup.monthStr) ? <ChevronRight size={16} className="text-stone-400"/> : <ChevronDown size={16} className="text-stone-400"/>}
                                            <span className="font-bold text-stone-700 dark:text-stone-200">{mDisplay} 月 <span className="text-xs font-normal text-stone-500 ml-1">({monthGroup.monthTotal} 筆)</span></span>
                                        </div>
                                        {renderCheckbox(monthItems)}
                                    </div>

                                    {!collapsedMonths.has(monthGroup.monthStr) && monthGroup.days.map((dayGroup: any) => {
                                        const dayItems = dayGroup.items;
                                        const dLabel = dayGroup.dayStr.split('-')[2];
                                        const dDisplay = parseInt(dLabel, 10);

                                        return (
                                            <div key={dayGroup.dayStr} className="flex flex-col">
                                                <div className="flex items-center justify-between px-4 py-1.5 bg-white dark:bg-stone-900 pl-12 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors" onClick={() => toggleDay(dayGroup.dayStr)}>
                                                    <div className="flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400">
                                                        {mDisplay}/{dDisplay} <span className="text-xs font-normal text-stone-400 ml-1">({dayItems.length} 筆)</span>
                                                    </div>
                                                    {renderCheckbox(dayItems)}
                                                </div>

                                                {!collapsedDays.has(dayGroup.dayStr) && (
                                                    <div className="flex flex-col gap-2 px-4 py-2 pl-12 bg-white dark:bg-stone-900 border-b border-stone-100 dark:border-stone-800/50">
                                                        {dayItems.map((item: any) => (
                                                            <div 
                                                                key={item.id} 
                                                                onClick={() => isSelectionMode ? toggleSelection(item.id) : onItemClick(item)}
                                                                className={`flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${viewingId === item.id && !isSelectionMode ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md' : 'border-stone-200 dark:border-stone-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm bg-white dark:bg-stone-800'}`}
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-bold text-stone-800 dark:text-stone-100 truncate text-sm mb-1">{item.title}</div>
                                                                        <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
                                                                            <span className="flex items-center gap-1 truncate max-w-[120px]"><MapPin size={12}/> {item.locationName}</span>
                                                                            <span className="flex items-center gap-1 shrink-0"><Clock size={12}/> {new Date(item.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                                                        </div>
                                                                    </div>
                                                                    {isSelectionMode ? (
                                                                        <div className="shrink-0 pt-1">
                                                                            {selectedIds.has(item.id) ? <CheckSquare size={20} className="text-emerald-500"/> : <Square size={20} className="text-stone-300 dark:text-stone-600"/>}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="shrink-0 flex flex-col items-end">
                                                                            <span className="text-lg font-black text-blue-600 dark:text-blue-400">{item.observations?.length || item.obsCount || 0}</span>
                                                                            <span className="text-[10px] text-stone-400">筆</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                )
            })}
        </div>
    )
}