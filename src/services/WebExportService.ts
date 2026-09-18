// src/services/WebExportService.ts
import JSZip from 'jszip';
import { WebDriveService } from './WebDriveService';
import { WebTaxonomyService, type TaxonInfo } from './WebTaxonomyService';

export interface GeoLocation { latitude: number; longitude: number; accuracy?: number; timestamp: number; }
export interface TrackPoint extends GeoLocation {}
export interface CsvColumnConfig { key: string; label: string; enabled: boolean; }
export interface SurveySession {
    id: string; title?: string; startTime: number; endTime?: number; locationName: string;
    observations: any[]; trackLog?: TrackPoint[]; markers?: any[]; distanceTraveled?: number;
    surveyors?: number; temperature?: number; humidity?: number; windSpeed?: number; windForce?: number;
    weather?: string; surveyNote?: string; notes?: string; startLocation?: GeoLocation | null;
}

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

export const escapeCSV = (field: any) => {
    if (field === undefined || field === null) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

export type ProgressCallback = (taskName: string, current?: number, total?: number) => void;

export const downloadWebFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
};

export const downloadWebCSV = (filename: string, content: string, withBOM: boolean = true) => {
    const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    const csvContent = (withBOM ? '\uFEFF' : '') + content.replace(/(?<!\r)\n/g, '\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadWebFile(blob, safeFilename);
};

const detachMediaToZipWeb = async (obs: any, zip: JSZip, idPrefix: string) => {
    const processItem = async (filePath: string, type: 'image' | 'audio') => {
        if (!filePath || filePath.startsWith('data:') || filePath.startsWith('http')) return;
        const fileName = filePath.split('/').pop() || '';
        const fileId = WebDriveService.mediaMap.get(fileName);
        if (fileId) {
            const buffer = await WebDriveService.downloadFileBuffer(fileId, false);
            if (buffer) {
                const prefix = type === 'image' ? 'images/' : 'audio/';
                zip.file(`${prefix}${idPrefix}_${fileName}`, buffer as any);
            }
        }
    };

    if (obs.imageUrl) await processItem(obs.imageUrl, 'image');
    if (obs.images && Array.isArray(obs.images)) {
        for (const img of obs.images) await processItem(img, 'image');
    }
    if (obs.media && Array.isArray(obs.media)) {
        for (const m of obs.media) await processItem(m.filePath, m.type);
    }
    if (obs.recordings && Array.isArray(obs.recordings)) {
        for (const r of obs.recordings) await processItem(r.filePath, 'audio');
    }
};

export const exportSelectedDataToZipWeb = async (surveys: SurveySession[], onProgress?: ProgressCallback) => {
    if (surveys.length === 0) return;
    onProgress?.('準備打包備份檔', 0, 100);
    
    const zip = new JSZip();
    zip.folder("images");
    zip.folder("audio");

    let obsCount = 0;
    const totalObs = surveys.reduce((acc, s) => acc + s.observations.length, 0);

    for (const s of surveys) {
        for (const o of s.observations) {
            await detachMediaToZipWeb(o, zip, `obs_${o.id}`);
            obsCount++;
            onProgress?.('下載並處理多媒體檔案', obsCount, totalObs);
        }
    }

    onProgress?.('壓縮檔案中，請稍候...', 90, 100);
    const content = await zip.generateAsync({ type: "blob" });
    const filename = `ecolog_selected_${new Date().toISOString().slice(0, 10)}.zip`;
    downloadWebFile(content, filename);
};

export const exportSelectedTracksToGPXWeb = async (surveys: SurveySession[], onProgress?: ProgressCallback) => {
    onProgress?.('打包 GPX 航跡', 0, 100);
    const zip = new JSZip();
    
    for(let i = 0; i < surveys.length; i++) {
        const s = surveys[i];
        const actualTrack = s.trackLog || [];
        
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyEcoNotes">
  <metadata>
    <name>${s.title}</name>
    <time>${new Date(s.startTime).toISOString()}</time>
  </metadata>
  <trk>
    <name>${s.title}</name>
    <trkseg>
      ${(actualTrack||[]).map(pt => `<trkpt lat="${pt.latitude}" lon="${pt.longitude}"><time>${new Date(pt.timestamp).toISOString()}</time></trkpt>`).join('')}
    </trkseg>
  </trk>
  ${s.observations.filter(o => o.location).map(o => `
  <wpt lat="${o.location!.latitude}" lon="${o.location!.longitude}">
    <name>${o.speciesName}</name>
    <desc>${o.count}隻. ${o.notes || ''}</desc>
    <time>${new Date(o.timestamp).toISOString()}</time>
  </wpt>`).join('')}
</gpx>`;
        zip.file(`${(s.title || '無標題').replace(/[\/\\?%*:|"<>]/g, '-')}_${s.id.slice(0,8)}.gpx`, gpx);
        onProgress?.('轉換 GPX', i + 1, surveys.length);
    }
    
    onProgress?.('壓縮檔案中...', 90, 100);
    const content = await zip.generateAsync({ type: "blob" });
    downloadWebFile(content, `ecolog_gpx_${Date.now()}.zip`);
};

export const exportCustomCSVWeb = async (surveys: SurveySession[], columns: CsvColumnConfig[], mergeSpecies: boolean, onProgress?: ProgressCallback) => {
    const activeCols = columns.filter(c => c.enabled);
    const headers: string[] = [];
    
    activeCols.forEach(c => {
        if (c.key === 'taxon_tree') {
            headers.push('界 (Kingdom)', '門 (Phylum)', '綱 (Class)', '目 (Order)', '科 (Family)', '屬 (Genus)', '種 (Species)');
        } else {
            headers.push(c.label);
        }
    });
    
    const rows = [headers.join(',')];
    
    // ★ 套用全新的深度解碼機制
    const customSettings = WebTaxonomyService.getParsedCustomSettings();
    const taxonMap = new Map<string, string>();
    customSettings.forEach((s: any) => taxonMap.set(s.id || s.key, s.title || s.label || s.name || s.text || s.id));

    const needsTaxonomy = activeCols.some(c => c.key === 'taxon_tree' || c.key === 'conservation' || c.key === 'taxon_group');
    let taxMap = new Map<string, TaxonInfo>();

    if (needsTaxonomy) {
        onProgress?.('解析物種分類樹與自訂類群...');
        const allSciNames = new Set<string>();
        surveys.forEach(s => s.observations.forEach(o => {
            const nameToSearch = o.scientificName || o.speciesName;
            if (nameToSearch) allSciNames.add(nameToSearch);
        }));
        
        const res = await WebTaxonomyService.batchGetTaxonomy(Array.from(allSciNames));
        taxMap = res.taxMap;
    }

    onProgress?.('產生 CSV 報表與合併紀錄...');

    surveys.forEach(s => {
        let obsList = s.observations;
        if (mergeSpecies) {
            const merged = new Map<string, any>();
            obsList.forEach(o => {
                const key = `${o.speciesName}_${o.scientificName}_${o.surveyArea}`;
                if (merged.has(key)) {
                    const existing = merged.get(key)!;
                    existing.count += o.count;
                    if (o.notes && !existing.notes?.includes(o.notes)) {
                        existing.notes = (existing.notes ? existing.notes + '; ' : '') + o.notes;
                    }
                } else {
                    merged.set(key, { ...o });
                }
            });
            obsList = Array.from(merged.values());
        }

        obsList.forEach(o => {
            const rowData: string[] = [];
            const searchKey = o.scientificName || o.speciesName;
            const taxInfo = searchKey ? taxMap.get(searchKey) : null;
            
            let groupId = o.taxonGroup;
            if (!groupId && taxInfo) {
                groupId = WebTaxonomyService.matchCustomGroup(taxInfo, o.speciesName, customSettings) || '';
            }
            
            const groupLabel = taxonMap.get(groupId) || groupId || '';
            const consStatus = taxInfo?.conservationStatus || o.conservationStatus || 'N';

            const formatTaxon = (zh?: string, lat?: string) => {
                if (!zh && !lat) return '';
                if (zh && lat && zh !== lat) return `${zh} (${lat})`;
                return zh || lat || '';
            };

            activeCols.forEach(col => {
                if (col.key.startsWith('custom_field_')) {
                    const fieldId = col.key.replace('custom_field_', '');
                    const targetField = o.customFields?.find((f: any) => f.fieldId === fieldId || f.label === col.label);
                    rowData.push(targetField && targetField.values.length > 0 ? escapeCSV(targetField.values.join('、')) : '');
                    return;
                }

                if (col.key === 'taxon_tree') {
                    rowData.push(
                        escapeCSV(formatTaxon(taxInfo?.kingdom_c, taxInfo?.kingdom)),
                        escapeCSV(formatTaxon(taxInfo?.phylum_c, taxInfo?.phylum)),
                        escapeCSV(formatTaxon(taxInfo?.class_c, taxInfo?.class)),
                        escapeCSV(formatTaxon(taxInfo?.order_c, taxInfo?.order)),
                        escapeCSV(formatTaxon(taxInfo?.family_c, taxInfo?.family)),
                        escapeCSV(formatTaxon(taxInfo?.genus_c, taxInfo?.genus)),
                        escapeCSV(formatTaxon(o.speciesName, o.scientificName))
                    );
                    return;
                }

                switch(col.key) {
                    case 'survey_title': rowData.push(escapeCSV(s.title)); break;
                    case 'date': rowData.push(escapeCSV(o.date)); break;
                    case 'time': rowData.push(escapeCSV(o.time)); break;
                    case 'species': rowData.push(escapeCSV(o.speciesName)); break;
                    case 'species_alias': rowData.push(escapeCSV(o.speciesAlias || '')); break; 
                    case 'count': rowData.push(String(o.count)); break;
                    case 'notes': rowData.push(escapeCSV(o.notes)); break;
                    case 'latitude': rowData.push(o.location?.latitude ? String(o.location.latitude) : ''); break;
                    case 'longitude': rowData.push(o.location?.longitude ? String(o.location.longitude) : ''); break;
                    case 'accuracy': rowData.push(o.location?.accuracy ? String(o.location.accuracy) : ''); break;
                    case 'survey_area': rowData.push(escapeCSV(o.surveyArea)); break;
                    case 'taxon_group': rowData.push(escapeCSV(groupLabel)); break;
                    case 'scientific_name': rowData.push(escapeCSV(o.scientificName)); break;
                    case 'conservation': rowData.push(escapeCSV(consStatus)); break;
                    case 'survey_date': rowData.push(new Date(s.startTime).toLocaleDateString()); break;
                    case 'survey_start_time': rowData.push(new Date(s.startTime).toLocaleTimeString()); break;
                    case 'end_time': rowData.push(s.endTime ? new Date(s.endTime).toLocaleTimeString() : ''); break;
                    case 'duration': {
                        if (!s.endTime || !s.startTime) { rowData.push(''); break; }
                        const start = Number(s.startTime);
                        const end = Number(s.endTime);
                        if (isNaN(start) || isNaN(end)) { rowData.push(''); break; }
                        rowData.push(((end - start) / 60000).toFixed(1)); break;
                    }
                    case 'distance': rowData.push((s.distanceTraveled ?? 0).toFixed(3)); break;
                    case 'weather_summary': rowData.push(escapeCSV(s.weather)); break;
                    case 'temperature': rowData.push(s.temperature !== undefined ? String(s.temperature) : ''); break;
                    case 'humidity': rowData.push(s.humidity !== undefined ? String(s.humidity) : ''); break;
                    case 'wind_info': rowData.push(s.windForce ? `${s.windForce}級` : (s.windSpeed ? `${s.windSpeed}m/s` : '')); break;
                    case 'survey_note': 
                        const cleanNote = s.surveyNote ? s.surveyNote.replace(/\n/g, ' ； ') : '';
                        rowData.push(escapeCSV(cleanNote)); 
                        break;
                    default: rowData.push(''); break;
                }
            });
            rows.push(rowData.join(','));
        });
    });
    
    downloadWebCSV(`custom_export_${Date.now()}.csv`, rows.join('\n'));
};

const cleanNotes = (text?: string) => {
    if (!text) return '';
    let cleaned = text.replace(/\[系統註記\][\s\S]*/, '');
    cleaned = cleaned.replace(/[\r\n]+/g, ' ');
    cleaned = cleaned.replace(/["']/g, '');
    return cleaned.trim();
};

export const exportSelectedSurveysToeBirdCSVWeb = async (surveys: SurveySession[], allReported: string, recordMode: string, autoSplit: boolean) => { 
    const rows: string[] = [];

    for (const s of surveys) {
        let checklists: any[] = [];
        const track = s.trackLog || [];
        
        const allPoints: [number, number][] = [];
        if (s.startLocation && !isNaN(s.startLocation.latitude)) allPoints.push([s.startLocation.latitude, s.startLocation.longitude]);
        s.observations.forEach(o => { if (o.location && !isNaN(o.location.latitude)) allPoints.push([o.location.latitude, o.location.longitude]); });
        track.forEach(p => { if (p.latitude && !isNaN(p.latitude)) allPoints.push([p.latitude, p.longitude]); });

        const globalLat = allPoints.length > 0 ? (allPoints.reduce((acc, p) => acc + p[0], 0) / allPoints.length).toFixed(6) : '';
        const globalLng = allPoints.length > 0 ? (allPoints.reduce((acc, p) => acc + p[1], 0) / allPoints.length).toFixed(6) : '';

        const originalDurMin = (s.endTime && s.startTime) ? Math.max(0, Math.round((s.endTime - s.startTime) / 60000)) : 0;

        if (autoSplit && recordMode === 'survey' && s.observations.length > 0 && track.length > 0) {
            let rawSegments: { type: 'valid' | 'transit'; track: TrackPoint[]; obs: any[] }[] = [];
            
            let currentSeg = { type: 'valid' as 'valid' | 'transit', track: [track[0]], obs: [] as any[] };
            for (let i = 1; i < track.length; i++) {
                const p0 = track[i - 1];
                const p1 = track[i];
                const distKm = calculateDistance(p0.latitude, p0.longitude, p1.latitude, p1.longitude) / 1000;
                const timeHr = (p1.timestamp - p0.timestamp) / 3600000;
                const speed = timeHr > 0 ? (distKm / timeHr) : 0;
                
                const p1Type: 'valid' | 'transit' = speed > 60 ? 'transit' : 'valid';
                if (p1Type === currentSeg.type) {
                    currentSeg.track.push(p1);
                } else {
                    rawSegments.push(currentSeg);
                    currentSeg = { type: p1Type, track: [p1], obs: [] };
                }
            }
            rawSegments.push(currentSeg);

            const sortedObs = [...s.observations].sort((a, b) => a.timestamp - b.timestamp);
            sortedObs.forEach(o => {
                let assigned = rawSegments[rawSegments.length - 1];
                for (let i = 0; i < rawSegments.length; i++) {
                    const pts = rawSegments[i].track;
                    const segEnd = pts.length > 0 ? pts[pts.length - 1].timestamp : Infinity;
                    if (o.timestamp <= segEnd) { assigned = rawSegments[i]; break; }
                }
                if (assigned) assigned.obs.push(o);
            });

            let validSegments: typeof rawSegments = [];
            for (let i = 0; i < rawSegments.length; i++) {
                const seg = rawSegments[i];
                if (seg.type === 'transit') {
                    if (seg.obs.length > 0) {
                        let target = null;
                        for (let j = i - 1; j >= 0; j--) { if (rawSegments[j].type === 'valid') { target = rawSegments[j]; break; } }
                        if (!target) { for (let j = i + 1; j < rawSegments.length; j++) { if (rawSegments[j].type === 'valid') { target = rawSegments[j]; break; } } }
                        if (target) { target.obs.push(...seg.obs); }
                        else { seg.type = 'valid'; validSegments.push(seg); }
                    }
                } else {
                    validSegments.push(seg);
                }
            }

            validSegments.forEach(validSeg => {
                validSeg.obs.sort((a, b) => a.timestamp - b.timestamp);
                const pts = validSeg.track;
                if (pts.length === 0 && validSeg.obs.length === 0) return;
                
                const tAll = pts.map(p => p.timestamp).concat(validSeg.obs.map(o => o.timestamp));
                const minTime = Math.min(...tAll);
                let maxTime = Math.max(...tAll);
                if (s.endTime && maxTime > s.endTime && pts.length > 0) maxTime = s.endTime; 
                
                const durMs = Math.max(0, maxTime - minTime);
                let totalDistKm = 0;
                for (let i = 1; i < pts.length; i++) {
                    totalDistKm += calculateDistance(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude) / 1000;
                }
                
                let numParts = Math.max(Math.ceil(durMs / 10800000), Math.ceil(totalDistKm / 8), 1);
                while (numParts > 1 && (durMs / numParts) < 300000) { numParts--; }
                
                let validPartition = false;
                let finalParts: any[] = [];
                
                while (!validPartition && numParts <= Math.max(pts.length, 1)) {
                    finalParts = [];
                    const partDur = durMs / numParts;
                    let isViolating = false;
                    
                    for (let part = 0; part < numParts; part++) {
                        const pStart = minTime + part * partDur;
                        const pEndLimit = (part === numParts - 1) ? Infinity : minTime + (part + 1) * partDur;
                        const pReportEnd = (part === numParts - 1) ? maxTime : minTime + (part + 1) * partDur;
                        finalParts.push({ track: [] as TrackPoint[], obs: [] as any[], distKm: 0, startLimit: pStart, endLimit: pEndLimit, start: pStart, end: pReportEnd });
                    }
                    
                    let lastPt: TrackPoint | null = null;
                    for (const pt of pts) {
                        const p = finalParts.find(fp => pt.timestamp >= fp.startLimit && pt.timestamp < fp.endLimit);
                        if (p) {
                            p.track.push(pt);
                            if (lastPt) p.distKm += calculateDistance(lastPt.latitude, lastPt.longitude, pt.latitude, pt.longitude) / 1000;
                        }
                        lastPt = pt;
                    }
                    
                    for (const o of validSeg.obs) {
                        const p = finalParts.find(fp => o.timestamp >= fp.startLimit && o.timestamp < fp.endLimit);
                        if (p) p.obs.push(o);
                    }
                    
                    for (const p of finalParts) {
                        if (p.distKm > 8.05) { isViolating = true; break; }
                    }
                    
                    if (isViolating) {
                        if (durMs / (numParts + 1) >= 300000) { numParts++; } else { validPartition = true; }
                    } else {
                        validPartition = true;
                    }
                }
                finalParts.filter(p => p.obs.length > 0).forEach(p => checklists.push(p));
            });

            let hasShortChecklist = true;
            while (hasShortChecklist && checklists.length > 1) {
                hasShortChecklist = false;
                for (let i = 0; i < checklists.length; i++) {
                    const list = checklists[i];
                    const cDurMs = (list.end && list.start) ? (list.end - list.start) : 0;
                    if (cDurMs < 300000) { 
                        hasShortChecklist = true;
                        const targetIdx = i > 0 ? i - 1 : i + 1;
                        const target = checklists[targetIdx];
                        
                        target.track.push(...list.track);
                        target.track.sort((a: any, b: any) => a.timestamp - b.timestamp);
                        target.obs.push(...list.obs);
                        target.obs.sort((a: any, b: any) => a.timestamp - b.timestamp);
                        target.distKm += list.distKm;
                        
                        const tAllMerged = target.track.map((t:any) => t.timestamp).concat(target.obs.map((o:any) => o.timestamp));
                        if (tAllMerged.length > 0) {
                            target.start = Math.min(...tAllMerged);
                            target.end = Math.max(...tAllMerged);
                            if (s.endTime && target.end > s.endTime) target.end = s.endTime;
                        }
                        checklists.splice(i, 1);
                        break; 
                    }
                }
            }
        } else {
            checklists.push({ 
                start: s.startTime, end: s.endTime || s.startTime, distKm: s.distanceTraveled || 0, 
                obs: s.observations, track 
            });
        }

        checklists.forEach((list, idx) => {
            const d = new Date(list.start);
            const dateStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
            const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            
            let durMin = (list.end && list.start) ? Math.max(0, Math.round((list.end - list.start) / 60000)) : 0;
            
            let protocol = 'Incidental';
            if (recordMode === 'survey') {
                if (track.length === 0) {
                    protocol = 'Historical';
                } else if (originalDurMin < 5) {
                    protocol = 'Incidental';
                } else {
                    protocol = (list.distKm >= 0.05) ? 'Traveling' : 'Stationary';
                }
            }

            let checklistLat = globalLat, checklistLng = globalLng;
            const validCoords: [number, number][] = [];
            (list.track || []).forEach((pt: any) => { if (pt.latitude && !isNaN(pt.latitude)) validCoords.push([pt.latitude, pt.longitude]); });
            (list.obs || []).forEach((o: any) => { if (o.location?.latitude && !isNaN(o.location.latitude)) validCoords.push([o.location.latitude, o.location.longitude]); });
            
            if (validCoords.length > 0) {
                checklistLat = (validCoords.reduce((acc, p) => acc + p[0], 0) / validCoords.length).toFixed(6);
                checklistLng = (validCoords.reduce((acc, p) => acc + p[1], 0) / validCoords.length).toFixed(6);
            }

            const loc = `${checklistLat}, ${checklistLng}`;
            const cmt = checklists.length > 1 
                ? `自動切分段落 ${idx + 1}/${checklists.length}。 ${cleanNotes(s.surveyNote || s.notes)}` 
                : cleanNotes(s.surveyNote || s.notes);

            const outDuration = (protocol === 'Incidental' || protocol === 'Historical') ? '' : String(Math.max(1, durMin));
            const outDistance = (protocol === 'Traveling' && list.distKm >= 0.05) ? (list.distKm * 0.621371).toFixed(3) : '';

            list.obs.forEach((o: any) => {
                let finalSpeciesName = o.speciesName;
                if (finalSpeciesName && finalSpeciesName.length === 1 && o.speciesAlias) {
                    const firstAlias = o.speciesAlias.split(/[,、]/)[0].trim();
                    if (firstAlias) finalSpeciesName = firstAlias;
                }

                rows.push([
                    escapeCSV(finalSpeciesName), '', escapeCSV(o.scientificName || ''), o.count, escapeCSV(cleanNotes(o.notes)), escapeCSV(loc), 
                    checklistLat, checklistLng, dateStr, timeStr, '', '', protocol, s.surveyors || 1, outDuration, allReported, 
                    outDistance, '', escapeCSV(cmt)
                 ].join(','));
            });
        });
    }
    
    downloadWebCSV(`ebird_export_${Date.now()}.csv`, rows.join('\n'), false);
};