// src/services/WebDriveService.ts
import * as Y from 'yjs';

export const WEB_CLIENT_ID = "199001549012-5424brfoprhr94g33fafira9fdvh2gb6.apps.googleusercontent.com";

declare global {
    interface Window {
        google: any;
    }
}

class WebCache {
    private static dbName = 'MyEcoNotesWebCache';
    private static storeName = 'cloud_files';
    private static dbPromise: Promise<IDBDatabase> | null = null;

    private static getDB(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(this.storeName, { keyPath: 'id' });
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return this.dbPromise;
    }

    static async get(id: string): Promise<{ modifiedTime: string, data: any } | null> {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const req = tx.objectStore(this.storeName).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    static async set(id: string, modifiedTime: string, data: any): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).put({ id, modifiedTime, data });
            tx.oncomplete = () => resolve();
        });
    }
}

export class WebDriveService {
    private static accessToken: string | null = null;
    private static tokenClient: any = null;
    
    static mediaMap = new Map<string, string>();
    static mediaBlobCache = new Map<string, string>();

    static init(onAuthSuccess: () => void) {
        if (this.tokenClient) return;
        const loadScript = () => {
            if (window.google?.accounts?.oauth2) {
                this.initTokenClient(onAuthSuccess);
            } else {
                const script = document.createElement('script');
                script.src = "https://accounts.google.com/gsi/client";
                script.async = true;
                script.defer = true;
                script.onload = () => this.initTokenClient(onAuthSuccess);
                document.head.appendChild(script);
            }
        };
        loadScript();
    }

    private static initTokenClient(onAuthSuccess: () => void) {
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: WEB_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.appdata',
            callback: (tokenResponse: any) => {
                if (tokenResponse && tokenResponse.access_token) {
                    this.accessToken = tokenResponse.access_token;
                    onAuthSuccess();
                }
            }
        });
    }

    static login() {
        if (this.tokenClient) this.tokenClient.requestAccessToken();
    }

    static isLoggedIn(): boolean {
        return !!this.accessToken;
    }

    static logout() {
        this.accessToken = null;
        this.mediaMap.clear();
        this.mediaBlobCache.clear();
    }

    static async fetchCoreFilesAndBuildMediaMap(): Promise<{ manifestId: string | null, profileId: string | null }> {
        if (!this.accessToken) throw new Error('尚未登入');
        let manifestId = null;
        let profileId = null;
        this.mediaMap.clear();

        let pageToken = '';
        do {
            const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=trashed=false&fields=nextPageToken,files(id,name)&pageSize=1000${pageToken ? '&pageToken=' + pageToken : ''}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${this.accessToken}` } });
            if (!res.ok) break;
            const data = await res.json();
            if (data.files) {
                data.files.forEach((f: any) => {
                    this.mediaMap.set(f.name, f.id);
                    if (f.name === 'master_manifest.yjs') manifestId = f.id;
                    if (f.name === 'global_profile.yjs') profileId = f.id;
                });
            }
            pageToken = data.nextPageToken || '';
        } while (pageToken);

        return { manifestId, profileId };
    }

    static async downloadFileBuffer(fileId: string, useCache: boolean = false): Promise<Uint8Array | null> {
        if (!this.accessToken) return null;
        
        if (useCache) {
            const cached = await WebCache.get(fileId);
            if (cached && cached.data) return cached.data as Uint8Array; 
        }

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });
        if (!res.ok) return null;
        const buffer = new Uint8Array(await res.arrayBuffer());
        
        if (useCache) await WebCache.set(fileId, 'media', buffer);
        
        return buffer;
    }

    static async getMediaBlobUrl(localPath: string, mimeType: string, cacheToDB: boolean = false, fallbackId?: string): Promise<string | null> {
        if (!localPath && !fallbackId) return null;
        if (localPath && localPath.startsWith('data:')) return localPath; 
        
        const fileName = localPath ? localPath.split('/').pop() || '' : '';
        let fileId = fileName ? this.mediaMap.get(fileName) : undefined;
        
        if (!fileId && fileName) {
            const nameNoExt = fileName.split('.')[0];
            for (const [k, v] of this.mediaMap.entries()) {
                if (k.startsWith(nameNoExt)) {
                    fileId = v;
                    break;
                }
            }
        }

        if (!fileId && fallbackId) {
            for (const [k, v] of this.mediaMap.entries()) {
                if (k.includes(fallbackId)) {
                    fileId = v;
                    break;
                }
            }
        }
        
        if (!fileId) return null;

        if (this.mediaBlobCache.has(fileId)) return this.mediaBlobCache.get(fileId)!;

        const buffer = await this.downloadFileBuffer(fileId, cacheToDB);
        if (!buffer) return null;

        const blob = new Blob([buffer as unknown as BlobPart], { type: mimeType });
        const url = URL.createObjectURL(blob);
        this.mediaBlobCache.set(fileId, url);
        return url;
    }

    static parseManifest(buffer: Uint8Array): any[] {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, buffer);
        const directoryMap = doc.getMap('directory');
        const surveys: any[] = [];
        
        directoryMap.forEach((val: any, id: string) => {
            if (!val.isDeleted) {
                surveys.push({
                    id,
                    fileId: val.fileId,
                    title: val.title || '未命名調查',
                    startTime: val.startTime || val.lastModified,
                    locationName: val.locationName || '未知地點',
                    obsCount: val.obsCount || 0,
                    lastModified: val.lastModified
                });
            }
        });
        
        return surveys.sort((a, b) => b.startTime - a.startTime);
    }

    static parseGlobalProfile(buffer: Uint8Array) {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, buffer);
        const settingsMap = doc.getMap('settings');
        
        // ★ 核心修復：從 Yjs 中提取 App 同步上來的自訂類群設定，並交給 Web 版的 localStorage 供全局讀取
        const taxonSettingsRaw = settingsMap.get('ecolog_taxon_settings_v1');
        if (taxonSettingsRaw) {
            const parsedSettings = typeof (taxonSettingsRaw as any).toJSON === 'function' 
                ? (taxonSettingsRaw as any).toJSON() 
                : taxonSettingsRaw;
            localStorage.setItem('ecolog_taxon_settings_v1', typeof parsedSettings === 'string' ? parsedSettings : JSON.stringify(parsedSettings));
        }

        const rawHeavyDb = settingsMap.get('heavy_db');
        const heavyDb = rawHeavyDb && typeof (rawHeavyDb as any).toJSON === 'function' ? (rawHeavyDb as any).toJSON() : rawHeavyDb;
        return heavyDb ? { notes: heavyDb.notes || [], audio: heavyDb.audio || [], tags: heavyDb.tags || [] } : { notes: [], audio: [], tags: [] };
    }

    static parseSurvey(buffer: Uint8Array): any {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, buffer);
        const metaMap = doc.getMap('metadata');
        const obsMap = doc.getMap('observations');
        
        const rawObs = obsMap.toJSON();
        const obsList: any[] = Object.values(rawObs);
        obsList.sort((a: any, b: any) => b.timestamp - a.timestamp);

        let trackLog: any[] = [];
        const trackArray = doc.getArray('trackLog');
        if (trackArray && trackArray.length > 0) {
            trackLog = trackArray.toJSON();
        } else {
            const rawTrack = metaMap.get('trackLog');
            if (Array.isArray(rawTrack)) trackLog = rawTrack;
            else if (rawTrack && typeof (rawTrack as any).toJSON === 'function') trackLog = (rawTrack as any).toJSON();
        }

        let markers: any[] = [];
        const markersArray = doc.getArray('markers');
        if (markersArray && markersArray.length > 0) {
            markers = markersArray.toJSON();
        } else {
            const rawMarkers = metaMap.get('markers');
            if (Array.isArray(rawMarkers)) markers = rawMarkers;
            else if (rawMarkers && typeof (rawMarkers as any).toJSON === 'function') markers = (rawMarkers as any).toJSON();
        }

        return {
            id: metaMap.get('id'),
            title: metaMap.get('title') || '未命名調查',
            startTime: metaMap.get('startTime'),
            endTime: metaMap.get('endTime'),
            surveyors: metaMap.get('surveyors'),
            locationName: metaMap.get('locationName') || '未定位',
            observations: obsList,
            trackLog: trackLog,
            markers: markers,
            lastModified: metaMap.get('lastModified'),
            distanceTraveled: metaMap.get('distanceTraveled') || 0,
            surveyNote: metaMap.get('surveyNote') || metaMap.get('notes') || '',
            stationName: metaMap.get('stationName') || '',
            temperature: metaMap.get('temperature'),
            humidity: metaMap.get('humidity'),
            windSpeed: metaMap.get('windSpeed'),
            windForce: metaMap.get('windForce'),
            weather: metaMap.get('weather') || '',
            weatherSource: metaMap.get('weatherSource') || '',
            weatherObservationTime: metaMap.get('weatherObservationTime') || ''
        };
    }

    static async getSmartGlobalProfile(fileInfo: any, onStatus: (msg: string) => void): Promise<any> {
        const cached = await WebCache.get(fileInfo.id);
        if (cached && cached.modifiedTime === fileInfo.modifiedTime) {
            onStatus('從本地快取秒速載入全域設定...');
            return cached.data;
        }
        onStatus('發現雲端全域設定有更新，正在下載...');
        const buffer = await this.downloadFileBuffer(fileInfo.id);
        if (buffer) {
            const data = this.parseGlobalProfile(buffer);
            await WebCache.set(fileInfo.id, fileInfo.modifiedTime, data);
            return data;
        }
        return { notes: [], audio: [], tags: [] };
    }

    static async getSmartSurveys(surveyFiles: any[], onStatus: (msg: string) => void): Promise<any[]> {
        const parsedSurveys = [];
        let downloadCount = 0;

        for (let i = 0; i < surveyFiles.length; i++) {
            const file = surveyFiles[i];
            const cached = await WebCache.get(file.id);
            
            if (cached && cached.modifiedTime === file.modifiedTime) {
                if (cached.data.id) parsedSurveys.push(cached.data);
            } else {
                downloadCount++;
                onStatus(`正在下載差異資料 (${downloadCount} 筆更新)...`);
                const buffer = await this.downloadFileBuffer(file.id);
                if (buffer) {
                    try {
                        const survey = this.parseSurvey(buffer);
                        if (survey.id) {
                            await WebCache.set(file.id, file.modifiedTime, survey);
                            parsedSurveys.push(survey);
                        }
                    } catch (e) {
                        console.warn('解析失敗跳過', file.name);
                    }
                }
            }
        }
        return parsedSurveys.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    }
}