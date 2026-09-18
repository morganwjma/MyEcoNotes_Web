// src/components/WebShared.tsx
import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Play, Pause, Image as ImageIcon, MapPin, FileText, Clock } from 'lucide-react';
import { WebDriveService } from '../services/WebDriveService';
import { MapContainer, Polyline, CircleMarker, Marker, Popup, Tooltip, TileLayer, useMap, LayersControl, LayerGroup } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Download, X, ZoomIn, ZoomOut, Maximize,FastForward, Rewind, Settings2, Gauge } from 'lucide-react';


export const getFirstImage = (obs: any) => {
    if (obs.images && obs.images.length > 0) return obs.images[0];
    if (obs.imageUrl) return obs.imageUrl;
    if (obs.media && obs.media.length > 0) {
        const img = obs.media.find((m: any) => m.type === 'image' || m.mimeType?.startsWith('image'));
        if (img) return img.filePath || img.fileName;
    }
    return null;
};

export const AsyncImage = ({ srcPath, className = 'w-full h-full object-cover rounded-lg shadow-sm', alt }: { srcPath: string, className?: string, alt?: string }) => {
    // 原始可靠的載入狀態
    const [url, setUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    
    // 燈箱狀態控制
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // ★ 結合你原本完美的載入邏輯
    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        
        if (!srcPath) {
            if (isMounted) setIsLoading(false);
            return;
        }
        
        if (srcPath.startsWith('data:image') || srcPath.startsWith('http')) {
            if (isMounted) {
                setUrl(srcPath);
                setIsLoading(false);
            }
        } else {
            // 使用原本的 getMediaBlobUrl 來處理雲端檔案
            WebDriveService.getMediaBlobUrl(srcPath, 'image/jpeg', true)
                .then(res => { 
                    if (isMounted) {
                        if (res) setUrl(res); 
                        setIsLoading(false);
                    }
                })
                .catch(() => {
                    if (isMounted) setIsLoading(false);
                });
        }
        
        return () => { isMounted = false; };
    }, [srcPath]);

    // 縮放與拖曳邏輯
    const handleZoomIn = (e: React.MouseEvent) => { e.stopPropagation(); setScale(s => Math.min(s + 0.5, 5)); };
    const handleZoomOut = (e: React.MouseEvent) => { e.stopPropagation(); setScale(s => Math.max(s - 0.5, 0.5)); };
    const handleReset = (e: React.MouseEvent) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); };
    
    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        if (e.deltaY < 0) setScale(s => Math.min(s + 0.2, 5));
        else setScale(s => Math.max(s - 0.2, 0.5));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && scale > 1) {
            setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };
    const handleMouseUp = () => setIsDragging(false);

    // 下載與關閉邏輯
    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = `MyEcoNotes_Image_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    const close = () => {
        setIsModalOpen(false);
        setTimeout(() => { setScale(1); setPosition({ x: 0, y: 0 }); }, 200);
    };

    // 載入中或失敗的佔位圖 (保留舊版設計)
    if (isLoading || !url) {
        return (
            <div className={`bg-stone-100 dark:bg-stone-800 flex flex-col items-center justify-center text-stone-400 ${className}`}>
                {isLoading ? <RefreshCw size={24} className="animate-spin mb-2" /> : <ImageIcon size={24} className="mb-2 opacity-50" />}
                {isLoading && <span className="text-[10px] font-bold">載入中...</span>}
            </div>
        );
    }

    return (
        <>
            {/* 原始縮圖 */}
            <img 
                src={url} 
                alt={alt || "Observation"} 
                className={`${className} cursor-zoom-in transition-all hover:opacity-85 hover:scale-105 animate-in fade-in duration-300`} 
                onClick={() => setIsModalOpen(true)}
                loading="lazy"
            />

            {/* 放大檢視燈箱 */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[99999] bg-stone-950/95 backdrop-blur-md flex items-center justify-center animate-in fade-in zoom-in-95 duration-200"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
                        <button onClick={handleDownload} className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all shadow-lg" title="下載圖片">
                            <Download size={22} />
                        </button>
                        <button onClick={close} className="p-2.5 bg-white/10 hover:bg-red-500/80 text-white rounded-full backdrop-blur-md transition-all shadow-lg" title="關閉">
                            <X size={22} />
                        </button>
                    </div>

                    <div className="relative w-full h-full flex items-center justify-center overflow-hidden" onWheel={handleWheel} onClick={close}>
                        <img 
                            src={url} 
                            alt={alt || "Enlarged"} 
                            draggable={false}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={handleMouseDown}
                            style={{ 
                                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'auto'
                            }}
                            className="max-w-full max-h-full object-contain select-none shadow-2xl"
                        />
                    </div>

                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-stone-900/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-2xl">
                        <button onClick={handleZoomOut} className="p-2.5 hover:bg-white/10 text-stone-300 hover:text-white rounded-xl transition-colors" title="縮小">
                            <ZoomOut size={20} />
                        </button>
                        <div className="w-14 text-center text-white font-mono text-xs font-bold select-none">
                            {Math.round(scale * 100)}%
                        </div>
                        <button onClick={handleZoomIn} className="p-2.5 hover:bg-white/10 text-stone-300 hover:text-white rounded-xl transition-colors" title="放大">
                            <ZoomIn size={20} />
                        </button>
                        <div className="w-px h-5 bg-white/20 mx-1"></div>
                        <button onClick={handleReset} className="p-2.5 hover:bg-white/10 text-stone-300 hover:text-white rounded-xl transition-colors" title="還原大小">
                            <Maximize size={20} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
export const AsyncAudio = ({ recording }: { recording: any }) => {
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);
    
    // 開啟視窗按鈕
    return (
        <>
            <button 
                onClick={(e) => { e.stopPropagation(); setIsPlayerOpen(true); }} 
                className="w-10 h-10 flex items-center justify-center rounded-full shrink-0 transition-all bg-emerald-100 hover:bg-emerald-500 text-emerald-600 hover:text-white dark:bg-emerald-900/40 dark:hover:bg-emerald-500 dark:text-emerald-400 dark:hover:text-white shadow-sm"
                title="開啟播放器"
            >
                <Play size={18} fill="currentColor" className="ml-0.5" />
            </button>
            {isPlayerOpen && <AudioPlayerModal recording={recording} onClose={() => setIsPlayerOpen(false)} />}
        </>
    );
};

// 獨立的播放器 Modal 元件
const AudioPlayerModal = ({ recording, onClose }: { recording: any, onClose: () => void }) => {
    const [url, setUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const animationRef = useRef<number | null>(null);

    // 格式化時間 (mm:ss)
    const formatTime = (time: number) => {
        if (isNaN(time)) return '00:00';
        const m = Math.floor(time / 60).toString().padStart(2, '0');
        const s = Math.floor(time % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // 1. 載入音檔資料
    useEffect(() => {
        let isMounted = true;
        const loadUrl = async () => {
            try {
                let playUrl = '';
                if (recording.base64) {
                    playUrl = recording.base64.startsWith('data:') ? recording.base64 : `data:${recording.mimeType || 'audio/wav'};base64,${recording.base64}`;
                } else {
                    const path = recording.filePath || recording.localPath || recording.fileName || recording.path;
                    const fetchedUrl = await WebDriveService.getMediaBlobUrl(path, recording.mimeType || 'audio/wav', false, recording.id);
                    if (!fetchedUrl) throw new Error("File not found");
                    playUrl = fetchedUrl;
                }
                if (isMounted) {
                    setUrl(playUrl);
                    setIsLoading(false);
                }
            } catch (err) {
                console.warn(err);
                if (isMounted) {
                    setIsLoading(false);
                    alert("無法載入音檔，請確認網路連線。");
                    onClose();
                }
            }
        };
        loadUrl();
        return () => { isMounted = false; };
    }, [recording]);

    // 2. 初始化 Web Audio API 與頻譜圖繪製邏輯
    useEffect(() => {
        if (!url || !audioRef.current || !canvasRef.current) return;

        const audio = audioRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 建立 Web Audio API 節點
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;
        
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; // 提供 128 個頻率區段
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // 連接節點
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        let dynamicMax = 50; // 自動增益初始閥值

        // 繪製頻譜圖迴圈
        const drawSpectrogram = () => {
            animationRef.current = requestAnimationFrame(drawSpectrogram);
            analyser.getByteFrequencyData(dataArray);

            // 清空畫布 (帶點半透明以製造殘影效果)
            ctx.fillStyle = 'rgba(28, 25, 23, 0.2)'; // stone-950 base
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 動態調整最大值，實現自動增益 (AGC)，讓小聲的錄音也能顯示頻譜
            const currentMax = Math.max(...dataArray);
            if (currentMax > dynamicMax) dynamicMax = currentMax;
            else dynamicMax = Math.max(50, dynamicMax * 0.99); // 緩慢回落

            const barWidth = (canvas.width / bufferLength) * 1.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                // 正規化高度
                let value = dataArray[i];
                let percent = value / dynamicMax;
                let barHeight = percent * canvas.height * 0.9; // 預留頂部空間

                // 建立漸層色彩 (熱像儀風格：紫 -> 綠 -> 亮黃)
                const r = Math.min(255, percent * 255 * 1.5);
                const g = Math.min(255, percent * 255 * 2);
                const b = 255 - percent * 255;
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                
                // 畫出頻譜長條 (從底部往上畫)
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
                x += barWidth;
            }
        };

        // 事件綁定
        audio.onloadedmetadata = () => setDuration(audio.duration);
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audio.onended = () => setIsPlaying(false);
        
        audio.onplay = () => {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            setIsPlaying(true);
            drawSpectrogram();
        };
        audio.onpause = () => {
            setIsPlaying(false);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            source.disconnect();
            analyser.disconnect();
            audioCtx.close();
        };
    }, [url]);

    // 控制功能
    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(() => alert("播放失敗，請重試"));
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = Number(e.target.value);
        if (audioRef.current) audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const handleSkip = (seconds: number) => {
        if (audioRef.current) {
            let newTime = audioRef.current.currentTime + seconds;
            if (newTime < 0) newTime = 0;
            if (newTime > duration) newTime = duration;
            audioRef.current.currentTime = newTime;
        }
    };

    const toggleSpeed = () => {
        if (!audioRef.current) return;
        let newRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
        audioRef.current.playbackRate = newRate;
        setPlaybackRate(newRate);
    };

    return (
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
            <div 
                className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()} // 防止點擊內部關閉視窗
            >
                {/* 頂部標題 */}
                <div className="flex justify-between items-center p-4 px-5 bg-stone-900 shrink-0">
                    <h3 className="text-stone-100 font-bold flex items-center gap-2">
                        <Gauge size={18} className="text-emerald-500" />
                        聲音分析播放器
                    </h3>
                    <button onClick={onClose} className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {isLoading ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-3">
                        <RefreshCw size={28} className="animate-spin text-emerald-500" />
                        <span className="text-stone-400 text-sm font-bold tracking-widest">載入音軌中...</span>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {/* 隱藏的實際 Audio 標籤 */}
                        <audio ref={audioRef} src={url} preload="auto" crossOrigin="anonymous" className="hidden" />

                        {/* 頻譜圖 Canvas 區塊 */}
                        <div className="w-full h-40 bg-stone-950 relative border-y border-stone-800 shrink-0">
                            <canvas 
                                ref={canvasRef} 
                                width={600} 
                                height={200} 
                                className="w-full h-full object-fill opacity-90"
                            />
                            {!isPlaying && (
                                <div className="absolute inset-0 bg-stone-950/40 flex items-center justify-center backdrop-blur-[1px]">
                                    <span className="text-stone-500 font-bold text-xs tracking-widest uppercase">準備就緒</span>
                                </div>
                            )}
                        </div>

                        {/* 控制面板區塊 */}
                        <div className="p-6 bg-stone-900 space-y-5">
                            {/* 進度條與時間 */}
                            <div className="space-y-2">
                                <input 
                                    type="range" 
                                    min={0} 
                                    max={duration || 100} 
                                    value={currentTime} 
                                    onChange={handleSeek}
                                    className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
                                />
                                <div className="flex justify-between text-xs font-mono font-medium text-stone-400">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatTime(duration)}</span>
                                </div>
                            </div>

                            {/* 播放控制按鈕 */}
                            <div className="flex items-center justify-between pt-2">
                                {/* 左側輔助功能 (倍速) */}
                                <button 
                                    onClick={toggleSpeed} 
                                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs transition-colors"
                                    title="播放速度"
                                >
                                    {playbackRate}x
                                </button>

                                {/* 中央核心控制 */}
                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={() => handleSkip(-10)} 
                                        className="p-3 text-stone-400 hover:text-white transition-colors"
                                        title="倒退 10 秒"
                                    >
                                        <Rewind size={24} fill="currentColor" />
                                    </button>
                                    
                                    <button 
                                        onClick={togglePlay} 
                                        className="w-16 h-16 flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-stone-950 rounded-full shadow-lg shadow-emerald-500/20 transition-transform active:scale-95"
                                    >
                                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                                    </button>
                                    
                                    <button 
                                        onClick={() => handleSkip(10)} 
                                        className="p-3 text-stone-400 hover:text-white transition-colors"
                                        title="快進 10 秒"
                                    >
                                        <FastForward size={24} fill="currentColor" />
                                    </button>
                                </div>

                                {/* 右側輔助保留空間 (可擴充設定) */}
                                <div className="w-10 h-10 opacity-30 flex items-center justify-center">
                                    <Settings2 size={16} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
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
