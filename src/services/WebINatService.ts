// src/services/WebINatService.ts
import { WebDriveService } from './WebDriveService';

// ==========================================
// ★ 內建 Type，與手機版脫鉤
// ==========================================
export interface SurveySession {
    id: string; title?: string; startTime: number; endTime?: number; locationName: string;
    observations: any[]; startLocation?: { latitude: number; longitude: number; } | null;
}

export interface INatUser {
    id: number;
    login: string;
    name: string;
    icon_url?: string;
}

export interface INatUploadConfig {
    geoprivacy: 'open' | 'obscured' | 'private';
    mediaOnly: boolean;
    speciesOverrides: Record<string, number | null>;
}

export interface TaxonMatchResult {
    originalName: string;
    scientificName: string;
    matchedTaxonId: number | null;
    matchedName: string | null;
    matchedRank: string | null;
    status: 'exact' | 'fallback' | 'unmatched';
}

export interface UploadResultReport {
    totalRecords: number;
    uploadedCount: number;
    exactMatchCount: number;
    fallbackMatchCount: number;
    unmatchedCount: number;
    failedCount: number;
    errors: string[];
}

const INAT_API_V1 = 'https://api.inaturalist.org/v1';

class WebINaturalistService {
    private token: string | null = null;
    private currentUser: INatUser | null = null;

    constructor() {
        this.loadToken();
    }

    private async loadToken() {
        const savedToken = localStorage.getItem('inat_access_token');
        if (savedToken) {
            this.token = savedToken;
            await this.fetchProfile();
        }
    }

    public isLoggedIn(): boolean {
        return !!this.token;
    }

    public getCurrentUser(): INatUser | null {
        return this.currentUser;
    }

    public async loginWithToken(apiToken: string): Promise<INatUser> {
        const cleanToken = apiToken.trim();
        if (!cleanToken) throw new Error('請輸入有效的 API Token');

        this.token = cleanToken;
        localStorage.setItem('inat_access_token', cleanToken);

        const user = await this.fetchProfile();
        if (!user) {
            this.logout();
            throw new Error('API Token 無效或已過期，請重新從 iNaturalist 取得');
        }
        return user;
    }

    public logout() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('inat_access_token');
    }

    public async fetchProfile(): Promise<INatUser | null> {
        if (!this.token) return null;
        try {
            const response = await fetch(`${INAT_API_V1}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.status !== 200) {
                if (response.status === 401) this.logout();
                return null;
            }

            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const u = data.results[0];
                this.currentUser = {
                    id: u.id,
                    login: u.login,
                    name: u.name || u.login,
                    icon_url: u.icon
                };
                return this.currentUser;
            }
            return null;
        } catch (e) {
            console.error('Fetch iNat Profile Failed:', e);
            return null;
        }
    }

    public async matchTaxon(scientificName: string, familyLatin?: string, orderLatin?: string): Promise<TaxonMatchResult> {
        const cleanSci = (scientificName || '').trim();

        if (cleanSci) {
            const exactMatch = await this.searchTaxonAPI(cleanSci);
            if (exactMatch) {
                return { originalName: cleanSci, scientificName: cleanSci, matchedTaxonId: exactMatch.id, matchedName: exactMatch.name, matchedRank: exactMatch.rank, status: 'exact' };
            }

            const genusName = cleanSci.split(' ')[0];
            if (genusName && genusName !== cleanSci && genusName.length > 2) {
                const genusMatch = await this.searchTaxonAPI(genusName, 'genus');
                if (genusMatch) {
                    return { originalName: cleanSci, scientificName: cleanSci, matchedTaxonId: genusMatch.id, matchedName: genusMatch.name, matchedRank: genusMatch.rank, status: 'fallback' };
                }
            }
        }

        if (familyLatin) {
            const familyMatch = await this.searchTaxonAPI(familyLatin, 'family');
            if (familyMatch) {
                return { originalName: cleanSci, scientificName: cleanSci, matchedTaxonId: familyMatch.id, matchedName: familyMatch.name, matchedRank: familyMatch.rank, status: 'fallback' };
            }
        }

        if (orderLatin) {
            const orderMatch = await this.searchTaxonAPI(orderLatin, 'order');
            if (orderMatch) {
                return { originalName: cleanSci, scientificName: cleanSci, matchedTaxonId: orderMatch.id, matchedName: orderMatch.name, matchedRank: orderMatch.rank, status: 'fallback' };
            }
        }

        return { originalName: cleanSci, scientificName: cleanSci, matchedTaxonId: null, matchedName: null, matchedRank: null, status: 'unmatched' };
    }

    public async searchTaxonAPI(q: string, rank?: string): Promise<{ id: number; name: string; rank: string } | null> {
        try {
            let url = `${INAT_API_V1}/taxa?q=${encodeURIComponent(q)}&per_page=5`;
            if (rank) url += `&rank=${rank}`;

            const response = await fetch(url);
            if (!response.ok) return null;

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const exact = data.results.find((t: any) => t.name.toLowerCase() === q.toLowerCase());
                const target = exact || data.results[0];
                return { id: target.id, name: target.name, rank: target.rank };
            }
            return null;
        } catch (e) {
            console.error('Search Taxon API Error:', e);
            return null;
        }
    }

    public async uploadObservations(
        surveyInput: SurveySession,
        config: INatUploadConfig,
        onProgress?: (current: number, total: number, message: string) => void
    ): Promise<UploadResultReport> {
        if (!this.token) throw new Error('請先登入 iNaturalist 帳號');

        const report: UploadResultReport = { totalRecords: 0, uploadedCount: 0, exactMatchCount: 0, fallbackMatchCount: 0, unmatchedCount: 0, failedCount: 0, errors: [] };
        let targetObs = surveyInput.observations || [];

        if (config.mediaOnly) {
            targetObs = targetObs.filter(o => {
                const hasNewMedia = o.media && o.media.length > 0;
                const hasLegacyImages = o.images && o.images.length > 0;
                const hasLegacyImageUrl = !!o.imageUrl;
                return hasNewMedia || hasLegacyImages || hasLegacyImageUrl;
            });
        }

        report.totalRecords = targetObs.length;
        if (report.totalRecords === 0) return report;

        for (let i = 0; i < targetObs.length; i++) {
            const obs = targetObs[i];
            const obsName = obs.speciesName || obs.scientificName || '未知物種';

            if (onProgress) onProgress(i + 1, targetObs.length, `正在處理 (${i + 1}/${targetObs.length}): ${obsName}`);

            let taxonId: number | null = null;
            const obsKey = obs.scientificName || obs.speciesName || 'Unknown';

            if (config.speciesOverrides && config.speciesOverrides.hasOwnProperty(obsKey)) {
                taxonId = config.speciesOverrides[obsKey];
            } else {
                const match = await this.matchTaxon(obs.scientificName || '', obs.taxonGroup, undefined);
                taxonId = match.matchedTaxonId;
                if (match.status === 'exact') report.exactMatchCount++;
                else if (match.status === 'fallback') report.fallbackMatchCount++;
                else report.unmatchedCount++;
            }

            if (config.speciesOverrides[obsKey] === null) continue;

            try {
                // 第一階段：建立紀錄文本
                const createRes = await fetch(`${INAT_API_V1}/observations`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        observation: {
                            taxon_id: taxonId,
                            species_guess: taxonId ? undefined : obsName,
                            latitude: obs.location?.latitude || surveyInput.startLocation?.latitude || null,
                            longitude: obs.location?.longitude || surveyInput.startLocation?.longitude || null,
                            observed_on_string: new Date(obs.timestamp).toISOString(),
                            description: obs.notes || '',
                            tag_list: 'MyEcoNotes',
                            geoprivacy: config.geoprivacy
                        }
                    })
                });

                if (!createRes.ok) {
                    const errStr = await createRes.text();
                    throw new Error(`伺服器拒絕: ${errStr}`);
                }

                const createdData = await createRes.json();
                const observationId = createdData.id;

                // 第二階段：收集所有多媒體檔案路徑
                const mediaToUpload: { path: string; type: 'image' | 'audio' }[] = [];

                if (obs.media && obs.media.length > 0) {
                    obs.media.forEach((m: any) => {
                        if (m.filePath) mediaToUpload.push({ path: m.filePath, type: m.type });
                    });
                }
                if (obs.imageUrl) {
                    mediaToUpload.push({ path: obs.imageUrl, type: 'image' });
                }
                if (obs.images && obs.images.length > 0) {
                    obs.images.forEach((img: string) => {
                        if (img && !mediaToUpload.some(m => m.path === img)) {
                            mediaToUpload.push({ path: img, type: 'image' });
                        }
                    });
                }

                // 逐一發送實體檔案上傳 (網頁版使用 WebDriveService 下載 Blob)
                for (let j = 0; j < mediaToUpload.length; j++) {
                    const item = mediaToUpload[j];
                    if (onProgress) {
                        onProgress(i + 1, targetObs.length, `正在上傳 ${obsName} 的多媒體 (${j + 1}/${mediaToUpload.length})...`);
                    }
                    await this.uploadMediaToObservationWeb(observationId, item.path, item.type);
                }

                report.uploadedCount++;
            } catch (err: any) {
                console.error(`Upload Failed for ${obsName}:`, err);
                report.failedCount++;
                report.errors.push(`${obsName}: ${err.message || '未知錯誤'}`);
            }
        }

        return report;
    }

    /**
     * Web 版專屬：向 Google Drive 下載 Blob 並利用 FormData 傳給 iNaturalist
     */
    private async uploadMediaToObservationWeb(observationId: number, filePath: string, type: 'image' | 'audio') {
        if (!this.token || !filePath) return;
        if (filePath.startsWith('data:') || filePath.startsWith('http')) return;

        const fileName = filePath.split('/').pop() || '';
        const fileId = WebDriveService.mediaMap.get(fileName);
        if (!fileId) throw new Error(`雲端找不到檔案: ${fileName}`);

        // 傳入 false 確保我們不將大量二進位資料存入本地 IndexedDB，避免 OOM
        const buffer = await WebDriveService.downloadFileBuffer(fileId, false);
        if (!buffer) throw new Error(`檔案下載失敗: ${fileName}`);

        const mimeType = type === 'image' ? 'image/jpeg' : 'audio/wav';
        // ★ 核心修復：強制將 buffer 轉型為 any 以符合 DOM BlobPart 要求
        const blob = new Blob([buffer as any], { type: mimeType });

        const endpoint = type === 'image'
            ? `${INAT_API_V1}/observation_photos`
            : `${INAT_API_V1}/observation_sounds`;

        const obsIdFieldName = type === 'image' ? 'observation_photo[observation_id]' : 'observation_sound[observation_id]';
        const uploadFileName = type === 'image' ? 'photo.jpg' : 'sound.wav';

        const formData = new FormData();
        formData.append(obsIdFieldName, observationId.toString());
        formData.append('file', blob, uploadFileName);

        const uploadRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`伺服器回應錯誤: ${errText}`);
        }
    }
}

export const WebINatService = new WebINaturalistService();