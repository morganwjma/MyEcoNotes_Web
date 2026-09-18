// src/services/WebTaxonomyService.ts

export interface TaxonInfo {
    scientificName: string;
    kingdom_c?: string; kingdom?: string;
    phylum_c?: string; phylum?: string;
    class_c?: string; class?: string;
    order_c?: string; order?: string;
    family_c?: string; family?: string;
    genus_c?: string; genus?: string;
    conservationStatus?: string;
}

const IDB_TIMEOUT = 2000;
const VERCEL_API_URL = 'https://my-eco-notes-web-taicol-proxy.vercel.app/api/taicol';

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
};

class TaxonomyCacheDB {
    private static dbName = 'MyEcoTaxonomyCacheFinal'; 
    private static storeName = 'taxa';
    private static dbPromise: Promise<IDBDatabase> | null = null;

    private static getDB(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(this.storeName, { keyPath: 'scientificName' });
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error("IDB 被鎖死"));
        });
        return this.dbPromise;
    }

    static async get(sciName: string): Promise<TaxonInfo | null> {
        try {
            const db = await withTimeout(this.getDB(), IDB_TIMEOUT, '開啟資料庫超時');
            return await withTimeout(new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const req = tx.objectStore(this.storeName).get(sciName);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            }), IDB_TIMEOUT, '讀取資料庫超時');
        } catch (e) {
            return null; 
        }
    }

    static async set(data: TaxonInfo): Promise<void> {
        try {
            const db = await withTimeout(this.getDB(), IDB_TIMEOUT, '開啟資料庫超時');
            return await withTimeout(new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).put(data);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            }), IDB_TIMEOUT, '寫入資料庫超時');
        } catch (e) {
            return; 
        }
    }
}

export class WebTaxonomyService {
    // ★ 智慧脫殼器：自動辨識並處理 {val: "[...]", ts: ...} 這種帶有時間戳的外殼封包
    static getParsedCustomSettings(): any[] {
        const rawStr = localStorage.getItem('ecolog_taxon_settings_v1');
        if (!rawStr) return [];
        try {
            let parsed = JSON.parse(rawStr);
            
            // 處理被包裝在 { val: string, ts: number } 結構內的情況
            if (parsed && parsed.val !== undefined) {
                parsed = typeof parsed.val === 'string' ? JSON.parse(parsed.val) : parsed.val;
            }

            const nodes: any[] = [];
            
            const traverse = (obj: any) => {
                if (!obj) return;
                if (Array.isArray(obj)) {
                    obj.forEach(traverse);
                    return;
                }
                if (typeof obj === 'object') {
                    if (obj.id || obj.key || (obj.keywords && Array.isArray(obj.keywords))) {
                        nodes.push(obj);
                    }
                    // 繼續向下挖
                    for (const val of Object.values(obj)) {
                        if (typeof val === 'object' || Array.isArray(val)) {
                            traverse(val);
                        }
                    }
                }
            };
            
            traverse(parsed);

            const uniqueMap = new Map();
            for (const node of nodes) {
                const id = node.id || node.key;
                if (id && !uniqueMap.has(id)) {
                    uniqueMap.set(id, node);
                }
            }
            return Array.from(uniqueMap.values());
        } catch (e) {
            console.error('自訂類群封包解析失敗', e);
            return [];
        }
    }

    static async batchGetTaxonomy(names: string[], onProgress?: (msg: string) => void): Promise<{ taxMap: Map<string, TaxonInfo>, errors: {name: string, reason: string}[] }> {
        const uniqueNames = Array.from(new Set(names.filter(Boolean)));
        const resultMap = new Map<string, TaxonInfo>();
        const toFetch: string[] = [];
        const errors: {name: string, reason: string}[] = [];

        if (uniqueNames.length === 0) return { taxMap: resultMap, errors };

        for (const name of uniqueNames) {
            const cached = await TaxonomyCacheDB.get(name);
            if (cached && (cached.kingdom || cached.family || cached.genus)) {
                resultMap.set(name, cached);
            } else {
                toFetch.push(name);
            }
        }

        if (toFetch.length === 0) return { taxMap: resultMap, errors };

        for (let i = 0; i < toFetch.length; i += 5) {
            const batchNames = toFetch.slice(i, i + 5);
            
            const batchPromises = batchNames.map(async (name) => {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);

                    onProgress?.(`> 請求 Vercel 代理: ${name}...`);
                    
                    const res = await fetch(`${VERCEL_API_URL}?name=${encodeURIComponent(name)}`, { signal: controller.signal });
                    
                    clearTimeout(timeoutId);

                    if (!res.ok) {
                        const errText = await res.text();
                        let errMsg = `HTTP 錯誤: ${res.status}`;
                        try {
                            const errData = JSON.parse(errText);
                            if (errData.error) errMsg = errData.error;
                        } catch (e) {
                            if (errText.includes('504') || errText.includes('TIMEOUT')) {
                                errMsg = 'Vercel 代理伺服器處理逾時 (504)';
                            } else {
                                errMsg = `伺服器回傳無效格式 (${res.status})`;
                            }
                        }
                        throw new Error(errMsg);
                    }

                    const infoToSave = await res.json();
                    
                    resultMap.set(name, infoToSave);
                    await TaxonomyCacheDB.set(infoToSave);

                } catch (err: any) {
                    let reason = err.message || String(err);
                    if (err.name === 'AbortError') reason = 'Vercel 伺服器逾時未回應 (10s)';
                    
                    console.warn(`Vercel 代理查詢失敗: ${name}`, reason);
                    errors.push({ name, reason });
                    resultMap.set(name, { scientificName: name });
                }
            });

            await Promise.all(batchPromises);
            
            if (i + 5 < toFetch.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return { taxMap: resultMap, errors };
    }

    static extractScientificKw(keyword: string): string {
        const matches = [...keyword.matchAll(/[(\uff08]([^)\uff09]+)[)\uff09]/g)];
        return matches.length > 0 ? matches[matches.length - 1][1].toLowerCase().trim() : keyword.toLowerCase().trim();
    }

    static matchCustomGroup(taxInfo: TaxonInfo | null, speciesName: string, flatSettings: any[]): string | null {
        if (!flatSettings || flatSettings.length === 0) return null;

        const taxStringLower = [
            taxInfo?.kingdom, taxInfo?.kingdom_c,
            taxInfo?.phylum, taxInfo?.phylum_c,
            taxInfo?.class, taxInfo?.class_c,
            taxInfo?.order, taxInfo?.order_c,
            taxInfo?.family, taxInfo?.family_c,
            taxInfo?.genus, taxInfo?.genus_c,
            speciesName
        ].filter(Boolean).join('|').toLowerCase();

        const speciesNameLower = (speciesName || '').toLowerCase();

        for (const setting of flatSettings) {
            if (setting.enabled === false || setting.type === 'marker' || setting.type === 'system') continue;
            
            let isMatch = false;

            // 1. 科學分類主要關鍵字比對 (keywords)
            if (setting.keywords && Array.isArray(setting.keywords)) {
                for (const kw of setting.keywords) {
                    const targetKw = this.extractScientificKw(kw);
                    if (taxStringLower.includes(targetKw)) { isMatch = true; break; }
                }
            }

            // 2. ★ 核心補正：俗名/無法分類關鍵字比對 (fallbackKeywords)
            // 如果上述科學分類沒中，就看俗名有沒有命中 fallbackKeywords
            if (!isMatch && setting.fallbackKeywords && Array.isArray(setting.fallbackKeywords)) {
                for (const fKw of setting.fallbackKeywords) {
                    if (fKw && speciesNameLower.includes(fKw.toLowerCase())) {
                        isMatch = true; break;
                    }
                }
            }

            // 3. 排除關鍵字防線 (excludeKeywords)
            if (isMatch && setting.excludeKeywords && Array.isArray(setting.excludeKeywords)) {
                for (const exKw of setting.excludeKeywords) {
                    const targetExKw = this.extractScientificKw(exKw);
                    if (taxStringLower.includes(targetExKw)) { isMatch = false; break; }
                }
            }

            // 若順利通過篩選，回傳 ID
            if (isMatch) return setting.id || setting.key;
        }
        return null;
    }
}