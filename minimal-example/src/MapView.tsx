// MapLibre GL + React 的最小範例,只保留主專案 src/demo/MapPage.tsx 的地圖核心手法:
//   1. worker 路徑用 ?url 交給 Vite(否則 dev 時 "Worker failed to load")
//   2. 相對網址的離線樣式自己抓、把 sprite / glyphs / tiles 補成絕對網址
//   3. 標記用絕對定位的 DOM 疊在地圖上,每次相機移動用 map.project 重新投影
//   4. fitBounds 預留側欄 padding;點標記 flyTo
//   5. 依 style.metadata 鎖鏡頭範圍;WebGL / 樣式失敗時顯示錯誤而不是白畫面
// 面板、popup、交接數位孿生等專案功能不在這裡,請看主專案原始碼。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, LngLatBounds, setWorkerUrl, type LngLatBoundsLike, type MapOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { POINTS, type GeoPoint } from './points';

setWorkerUrl(maplibreWorkerUrl);

// 線上:OpenFreeMap(免費、免金鑰)。離線:設 VITE_MAP_STYLE=map/style.json,
// 並把主專案 scripts/fetch-offline-map.mjs 產出的 offline-map/ 放到 public/map/。
const STYLE_URL = (import.meta.env.VITE_MAP_STYLE as string | undefined) || 'https://tiles.openfreemap.org/styles/liberty';
const PITCH = 50;
const BEARING = -15;
const SIDE_PADDING = { top: 80, bottom: 80, left: 80, right: 80 };

type MapStyle = NonNullable<MapOptions['style']>;
const isAbsolute = (u: string) => /^[a-z][a-z0-9+.-]*:/i.test(u);

// maplibre 不解析 style 內的相對網址;圖磚由 worker 抓,相對路徑會變成相對 worker 檔而 404。
// 用字串拼接而不是 new URL():URL 會把 {z}/{fontstack} 的大括號編碼掉。
const resolveStyle = async (url: string): Promise<MapStyle> => {
    if (isAbsolute(url)) return url;
    const styleUrl = new URL(url, document.baseURI).href;
    const res = await fetch(styleUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const style = await res.json();
    const dir = styleUrl.slice(0, styleUrl.lastIndexOf('/') + 1);
    const abs = (u: string) => (isAbsolute(u) ? u : dir + u);
    if (typeof style.sprite === 'string') style.sprite = abs(style.sprite);
    if (typeof style.glyphs === 'string') style.glyphs = abs(style.glyphs);
    Object.values(style.sources ?? {}).forEach((s) => {
        const src = s as { url?: string; tiles?: string[] };
        if (src.url) src.url = abs(src.url);
        if (src.tiles) src.tiles = src.tiles.map(abs);
    });
    return style;
};

const boundsOf = (points: GeoPoint[]) => {
    const b = new LngLatBounds();
    points.forEach((p) => b.extend([p.lng, p.lat]));
    return b;
};

const MapView = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const [screen, setScreen] = useState<Record<string, { x: number; y: number }>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let disposed = false;
        let map: MapLibreMap | null = null;

        resolveStyle(STYLE_URL).then((style) => {
            if (disposed || !containerRef.current) return;
            try {
                map = new MapLibreMap({
                    container: containerRef.current,
                    style,
                    center: [120.2985, 22.7045],
                    zoom: 14.6,
                    pitch: PITCH,
                    bearing: BEARING,
                });
            } catch (err) {
                // WebGL 不可用(遠端桌面、舊顯卡)時建構子直接丟錯
                setError(`地圖無法載入:${(err as Error).message}`);
                return;
            }
            mapRef.current = map;
            const m = map;

            // 離線樣式只帶周邊一圈圖磚:把鏡頭鎖在範圍內
            const meta = (typeof style === 'object' ? style.metadata : undefined) as Record<string, unknown> | undefined;
            if (meta?.['offline:maxBounds']) m.setMaxBounds(meta['offline:maxBounds'] as LngLatBoundsLike);
            if (typeof meta?.['offline:minZoom'] === 'number') m.setMinZoom(meta['offline:minZoom']);

            // 只有「樣式本身」載不到才算失敗;個別圖磚 404 / 網路抖動地圖仍可用
            let styleLoaded = false;
            m.once('style.load', () => { styleLoaded = true; });
            m.on('error', () => { if (!styleLoaded) setError('底圖無法載入(需要網路)'); });

            // 點位少,每次移動直接重算全部螢幕座標即可;點位上千時改用 GeoJSON source + symbol layer
            const project = () => {
                const next: Record<string, { x: number; y: number }> = {};
                POINTS.forEach((p) => {
                    const { x, y } = m.project([p.lng, p.lat]);
                    next[p.id] = { x, y };
                });
                setScreen(next);
            };
            m.on('move', project);
            m.on('resize', project);
            m.on('load', project);
            m.on('click', () => setSelectedId(null)); // 點空白處取消選取(DOM 標記的點擊不會走到這裡)

            m.fitBounds(boundsOf(POINTS), { padding: SIDE_PADDING, pitch: PITCH, bearing: BEARING, duration: 0 });
            project();
        }, (err: Error) => {
            if (!disposed) setError(`底圖無法載入(${err.message})`);
        });

        return () => {
            disposed = true;
            map?.remove();
            mapRef.current = null;
        };
    }, []);

    const focus = useCallback((p: GeoPoint) => {
        setSelectedId(p.id);
        mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 16.8, pitch: PITCH, duration: 900 });
    }, []);

    const overview = useCallback(() => {
        setSelectedId(null);
        mapRef.current?.fitBounds(boundsOf(POINTS), { padding: SIDE_PADDING, pitch: PITCH, bearing: BEARING, duration: 900 });
    }, []);

    return (
        <div className="map-view">
            {/* 容器一直掛著:失敗時若卸載它,map 實例會留在背景 */}
            <div ref={containerRef} className="map-view__map" />

            <div className="map-view__markers">
                {POINTS.map((p) => {
                    const pos = screen[p.id];
                    if (!pos || error) return null;
                    return (
                        <div
                            key={p.id}
                            className={`marker marker--${p.kind} ${selectedId === p.id ? 'is-selected' : ''}`}
                            style={{ left: pos.x, top: pos.y }}
                            onClick={() => focus(p)}
                        >
                            <div className="marker__dot" />
                            <div className="marker__label">{p.label}</div>
                        </div>
                    );
                })}
            </div>

            <div className="map-view__toolbar">
                <button type="button" onClick={overview}>全部點位</button>
                {selectedId && <span>已選:{POINTS.find((p) => p.id === selectedId)?.label}</span>}
            </div>

            {error && <div className="map-view__notice">{error}</div>}
        </div>
    );
};

export default MapView;
