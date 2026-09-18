// src/components/WebShared.tsx
import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Play, Pause, Image as ImageIcon, MapPin, FileText, Clock } from 'lucide-react';
import { WebDriveService } from '../services/WebDriveService';
import { MapContainer, Polyline, CircleMarker, Marker, Popup, Tooltip, TileLayer, useMap, LayersControl, LayerGroup } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export const getFirstImage = (obs: any) => {
    if (obs.images && obs.images.length > 0) return obs.images[0];
    if (obs.imageUrl) return obs.imageUrl;
    if (obs.media && obs.media.length > 0) {
        const img = obs.media.find((m: any) => m.type === 'image' || m.mimeType?.startsWith('image'));
        if (img) return img.filePath || img.fileName;
    }
    return null;
};

export const AsyncImage = ({ srcPath, alt }: { srcPath: string, alt?: string }) => {
    const [url, setUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        if (!srcPath) {
            setIsLoading(false);
            return;
        }
        if (srcPath.startsWith('data:image') || srcPath.startsWith('http')) {
            setUrl(srcPath);
            setIsLoading(false);
        } else {
            WebDriveService.getMediaBlobUrl(srcPath, 'image/jpeg', true)
                .then(res => { 
                    if(res) setUrl(res); 
                    setIsLoading(false);
                })
                .catch(() => setIsLoading(false));
        }
    }, [srcPath]);

    if (isLoading || !url) {
        return (
            <div className="w-full h-full bg-stone-100 dark:bg-stone-800 flex flex-col items-center justify-center text-stone-400 rounded-lg">
                {isLoading ? <RefreshCw size={24} className="animate-spin mb-2" /> : <ImageIcon size={24} className="mb-2 opacity-50" />}
                {isLoading && <span className="text-[10px] font-bold">載入中...</span>}
            </div>
        );
    }

    return <img src={url} alt={alt} className="w-full h-full object-cover rounded-lg shadow-sm animate-in fade-in duration-300" />;
};

export const AsyncAudio = ({ recording }: { recording: any }) => {
    const [url, setUrl] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
        };
    }, []);

    const togglePlay = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (isPlaying && audioRef.current) { 
            audioRef.current.pause(); 
            setIsPlaying(false); 
            return;
        }

        let playUrl = url;
        
        if (!playUrl) {
            setIsLoading(true);
            try {
                if (recording.base64) {
                    playUrl = recording.base64.startsWith('data:') 
                        ? recording.base64 
                        : `data:${recording.mimeType || 'audio/wav'};base64,${recording.base64}`;
                } else {
                    const path = recording.filePath || recording.localPath || recording.fileName;
                    const fetchedUrl = await WebDriveService.getMediaBlobUrl(path, recording.mimeType || 'audio/wav', false, recording.id);
                    if (!fetchedUrl) throw new Error("File not found on cloud");
                    playUrl = fetchedUrl;
                }
                setUrl(playUrl);
            } catch (err) {
                console.warn(err);
                setIsLoading(false);
                alert("無法播放：雲端找不到此音檔，請確認 App 端是否已成功上傳。");
                return;
            }
        }

        if (!audioRef.current) {
            audioRef.current = new Audio(playUrl);
            audioRef.current.onended = () => setIsPlaying(false);
            audioRef.current.onerror = () => {
                setIsPlaying(false);
                setIsLoading(false);
                alert("音檔播放失敗，格式可能不受瀏覽器支援");
            };
        } else if (audioRef.current.src !== playUrl) {
            audioRef.current.src = playUrl;
        }

        setIsLoading(true); 
        audioRef.current.play().then(() => {
            setIsPlaying(true);
            setIsLoading(false);
        }).catch(err => { 
            console.warn(err); 
            setIsLoading(false);
            setIsPlaying(false);
            alert("無法播放，此音檔格式可能不受瀏覽器支援"); 
        }); 
    };

    return (
        <>
            <audio ref={audioRef} src={url} onEnded={() => setIsPlaying(false)} onError={() => setIsPlaying(false)} className="hidden" preload="auto" />
            <button onClick={togglePlay} disabled={isLoading} className={`w-10 h-10 flex items-center justify-center rounded-full shrink-0 transition-colors ${isLoading ? 'opacity-50 cursor-wait bg-stone-100 dark:bg-stone-800 text-stone-400' : isPlaying ? 'bg-emerald-500 text-white shadow-md' : 'bg-stone-100 dark:bg-stone-800 text-stone-600 hover:text-emerald-600 dark:text-stone-300 dark:hover:text-emerald-400'}`}>
                {isLoading ? <RefreshCw size={18} className="animate-spin" /> : isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
        </>
    );
};

export const MapAutoFitter = ({ track, trackLogs, obs, markers }: { track?: any[], trackLogs?: any[][], obs: any[], markers?: any[] }) => {
    const map = useMap();
    useEffect(() => {
        const points: [number, number][] = [];
        if (track) {
            track.forEach(p => { if (p.latitude && p.longitude) points.push([p.latitude, p.longitude]); });
        }
        if (trackLogs) {
            trackLogs.forEach(t => t.forEach(p => { if (p.latitude && p.longitude) points.push([p.latitude, p.longitude]); }));
        }
        obs.forEach(o => { if (o.location?.latitude && o.location?.longitude) points.push([o.location.latitude, o.location.longitude]); });
        if (markers) {
            markers.forEach(m => { if (m.lat && m.lng) points.push([m.lat, m.lng]); });
        }
        
        if (points.length > 0) {
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }
    }, [track, trackLogs, obs, markers, map]);
    return null;
};

// ★ 復刻 App 端的黑底白字標籤戳針樣式
const createLabelPinIcon = (label: string) => L.divIcon({
    className: 'bg-transparent border-none',
    html: `<div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.4));">
              <div style="background-color: #1c1917; color: #ffffff; font-weight: 900; font-size: 11px; font-family: monospace; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); white-space: nowrap; letter-spacing: 0.5px;">
                ${label}
              </div>
              <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 7px solid #1c1917; margin-top: -1px;"></div>
           </div>`,
    iconSize: [60, 28],
    iconAnchor: [30, 28],
    popupAnchor: [0, -28]
});

export const SurveyMap = ({ data, interactive = true }: { data: any, interactive?: boolean }) => {
    return (
        <MapContainer 
            center={[23.6, 121.0]} 
            zoom={7} 
            className="h-full w-full z-0"
            zoomControl={interactive}
            dragging={interactive}
            scrollWheelZoom={interactive}
            doubleClickZoom={interactive}
            touchZoom={interactive}
        >
            <LayersControl position="topright">
                
                <LayersControl.BaseLayer checked name="標準地圖">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                </LayersControl.BaseLayer>
                
                <MapAutoFitter track={data.trackLog} trackLogs={data.trackLogs} obs={data.observations || []} markers={data.markers} />

                {/* 軌跡圖層 */}
                <LayersControl.Overlay checked name="調查軌跡">
                    <LayerGroup>
                        {!data.trackLogs && data.trackLog && data.trackLog.length > 0 && (
                            <Polyline 
                                positions={data.trackLog.map((p: any) => [p.latitude, p.longitude])} 
                                color="#ef4444"
                                weight={4} 
                                opacity={0.8} 
                            />
                        )}
                        {data.trackLogs && data.trackLogs.map((track: any[], i: number) => (
                            <Polyline 
                                key={`multi-track-${i}`}
                                positions={track.map((p: any) => [p.latitude, p.longitude])} 
                                color="#ef4444"
                                weight={4} 
                                opacity={0.8} 
                            />
                        ))}
                    </LayerGroup>
                </LayersControl.Overlay>

                {/* 觀察紀錄圖層 */}
                <LayersControl.Overlay checked name="物種觀察紀錄">
                    <LayerGroup>
                        {data.observations?.map((obs: any) => {
                            if (!obs.location) return null;
                            return (
                                <CircleMarker
                                    key={obs.id}
                                    center={[obs.location.latitude, obs.location.longitude]}
                                    radius={interactive ? 8 : 4}
                                    color="#2563eb"
                                    fillColor="#3b82f6"
                                    fillOpacity={0.8}
                                    weight={2}
                                >
                                    {interactive && (
                                        <Popup className="custom-popup">
                                            <div className="flex flex-col gap-1 min-w-[200px] max-w-[250px]">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-base text-stone-800 dark:text-stone-100 leading-tight">
                                                        {obs.speciesName}
                                                    </span>
                                                    {obs.scientificName && (
                                                        <span className="italic text-xs text-stone-500 leading-tight mt-0.5">
                                                            {obs.scientificName}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-stone-100 dark:border-stone-800">
                                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md">
                                                        數量: {obs.count || 1}
                                                    </span>
                                                    {obs.surveyArea && (
                                                        <span className="text-[10px] text-emerald-600 dark:text-emerald-500 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-md">
                                                            <MapPin size={10} /> {obs.surveyArea}
                                                        </span>
                                                    )}
                                                </div>

                                                {obs.customFields && obs.customFields.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {obs.customFields.map((cf: any, idx: number) => (
                                                            <span key={idx} className="text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 leading-tight">
                                                                {cf.label}: <span className="font-bold">{cf.values.join(', ')}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {obs.notes && (
                                                    <div className="text-[11px] text-stone-700 dark:text-stone-300 mt-1.5 bg-amber-50 dark:bg-amber-900/10 p-1.5 rounded-lg border border-amber-100 dark:border-amber-900/30 leading-relaxed">
                                                        <span className="font-bold text-amber-600 dark:text-amber-500 flex items-center gap-1 mb-0.5">
                                                            <FileText size={10}/> 備註
                                                        </span>
                                                        {obs.notes}
                                                    </div>
                                                )}
                                            </div>
                                        </Popup>
                                    )}
                                </CircleMarker>
                            );
                        })}
                    </LayerGroup>
                </LayersControl.Overlay>

                {/* 地標圖層 */}
                {data.markers && data.markers.length > 0 && (
                    <LayersControl.Overlay checked name="自訂地標 (樣點/相機)">
                        <LayerGroup>
                            {data.markers.map((m: any) => (
                                <Marker
                                    key={m.id}
                                    position={[m.lat, m.lng]}
                                    icon={createLabelPinIcon(m.label || '地標')}
                                >
                                    {/* ★ 移除重複的 Tooltip，改用更簡潔穩定的 Title 屬性或直接由 Popup 承載 */}
                                    
                                    {interactive && (
                                        <Popup className="custom-popup">
                                            <div className="flex flex-col gap-1.5 min-w-[160px]">
                                                <span className="font-black text-stone-900 dark:text-stone-100 border-b border-stone-100 dark:border-stone-800 pb-1.5 text-base leading-none">
                                                    {m.label || '自訂地標'}
                                                </span>
                                                <span className="text-stone-600 dark:text-stone-300 flex items-center gap-1.5 text-sm mt-1 font-mono">
                                                    <MapPin size={14} className="text-amber-500 shrink-0"/> 
                                                    {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
                                                </span>
                                                <span className="text-stone-600 dark:text-stone-300 flex items-center gap-1.5 text-sm">
                                                    <Clock size={14} className="text-blue-500 shrink-0"/> 
                                                    {m.timestamp ? new Date(m.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '無時間紀錄'}
                                                </span>
                                                {m.description && (
                                                    <div className="mt-1 text-xs text-stone-500 bg-stone-50 dark:bg-stone-800/50 p-1.5 rounded border border-stone-100 dark:border-stone-700">
                                                        {m.description}
                                                    </div>
                                                )}
                                            </div>
                                        </Popup>
                                    )}
                                </Marker>
                            ))}
                        </LayerGroup>
                    </LayersControl.Overlay>
                )}
            </LayersControl>
        </MapContainer>
    );
};