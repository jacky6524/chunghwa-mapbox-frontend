/*
 * 把 MapLibre 底圖(OpenFreeMap liberty)在指定範圍內整份抓到本機，給離線使用。
 *
 *   npm run fetch-map                              已抓過就跳過
 *   npm run fetch-map -- --refresh                 重抓
 *   (等同 node scripts/fetch-offline-map.mjs [--refresh])
 *
 * 產出 public/map/(gitignored,約 24 MB),Vite 會原樣發布到 dist/map/。
 * 搭配 .env.local 的 VITE_MAP_STYLE=map/style.json 使用(見 src/MapView.tsx 的 resolveStyle):
 *   style.json   網址全改成相對路徑;前端載入時再補成絕對網址
 *                (maplibre 不會幫 style 裡的相對網址解析,worker 會拿 worker 自己的位置去拼)
 *   tiles/       openmaptiles 向量圖磚，只抓 DOWNLOAD_BBOX 範圍
 *   sprites/     圖示
 *   fonts/       非中日韓字的 glyph。中文字由 maplibre 用系統字型在本機畫
 *                (localIdeographFontFamily 預設 'sans-serif'),不需要 glyph 檔;
 *                但全形括號、中文標點仍走 glyph —— 從下載的圖磚字串算出實際用到的範圍，只抓那些。
 *
 * style.metadata 帶 offline:maxBounds / offline:minZoom,MapView 據此把鏡頭鎖在有圖磚的範圍，
 * 拖出去不會看到一片空白。要換地區改下方 DOWNLOAD_BBOX / MAX_BOUNDS / MIN_ZOOM。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'map');
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// 範例點位在 120.292–120.305, 22.697–22.712(src/points.ts)。
// 圖磚抓 ~20km 見方;鏡頭中心鎖在內圈 ~12km,pitch 50° 往遠處看也還落在有圖磚的範圍。
const DOWNLOAD_BBOX = [120.20, 22.62, 120.40, 22.79]; // [west, south, east, north]
const MAX_BOUNDS = [120.24, 22.65, 120.36, 22.76];
const MIN_ZOOM = 12;
const MAX_TILE_ZOOM = 14; // openmaptiles 最高 z14,再近由 maplibre overzoom
const CONCURRENCY = 8;

const refresh = process.argv.includes('--refresh');
if (!refresh && fs.existsSync(path.join(outDir, 'style.json'))) {
    console.log('public/map/ 已存在,跳過下載(要重抓加 --refresh)');
    process.exit(0);
}

const get = async (url) => {
    for (let attempt = 1; ; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 404 || res.status === 204) return null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return Buffer.from(await res.arrayBuffer());
        } catch (err) {
            if (attempt >= 3) throw new Error(`${url}: ${err.message}`);
        }
    }
};

const save = (rel, buf) => {
    const file = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
};

const pool = async (jobs, label) => {
    let done = 0, bytes = 0, missing = 0;
    const queue = [...jobs];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            const { url, rel } = queue.shift();
            const buf = await get(url);
            if (buf) { save(rel, buf); bytes += buf.length; } else missing++;
            if (++done % 100 === 0) process.stdout.write(`  ${label} ${done}/${jobs.length}\r`);
        }
    }));
    console.log(`  ${label}: ${jobs.length - missing} 個檔案,${(bytes / 1024 / 1024).toFixed(1)} MB` +
        (missing ? `(${missing} 個上游沒有,略過)` : ''));
};

// 最小的 Mapbox Vector Tile 解析:只取每個 layer 的 value.string_value(field 4 → 1)。
// Tile.layers = 3;Layer.values = 4;Value.string_value = 1。其餘欄位依 wire type 跳過。
function* pbfFields(buf, start = 0, end = buf.length) {
    let i = start;
    const varint = () => {
        let v = 0, shift = 0, b;
        do { b = buf[i++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
        return v;
    };
    while (i < end) {
        const key = varint();
        const field = Math.floor(key / 8), wire = key & 7;
        if (wire === 0) { varint(); continue; }
        if (wire === 1) { i += 8; continue; }
        if (wire === 5) { i += 4; continue; }
        if (wire !== 2) return; // group 之類的舊格式,MVT 不會用到
        const len = varint();
        yield { field, start: i, end: i + len };
        i += len;
    }
}
const tileStrings = function* (buf) {
    for (const layer of pbfFields(buf)) {
        if (layer.field !== 3) continue;
        for (const v of pbfFields(buf, layer.start, layer.end)) {
            if (v.field !== 4) continue;
            for (const sv of pbfFields(buf, v.start, v.end)) {
                if (sv.field === 1) yield buf.toString('utf8', sv.start, sv.end);
            }
        }
    }
};

const lng2x =(lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

console.log('樣式');
const style = JSON.parse((await get(STYLE_URL)).toString('utf8'));
const omt = style.sources.openmaptiles;
const tilejson = JSON.parse((await get(omt.url)).toString('utf8'));
const tileTemplate = tilejson.tiles[0];

console.log('向量圖磚');
const [w, s, e, n] = DOWNLOAD_BBOX;
const tileJobs = [];
for (let z = 0; z <= MAX_TILE_ZOOM; z++) {
    for (let x = lng2x(w, z); x <= lng2x(e, z); x++) {
        for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
            tileJobs.push({
                url: tileTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y),
                rel: `tiles/${z}/${x}/${y}.pbf`,
            });
        }
    }
}
await pool(tileJobs, 'tiles');

console.log('sprite');
const spriteBase = typeof style.sprite === 'string' ? style.sprite : style.sprite[0].url;
await pool(['.json', '.png', '@2x.json', '@2x.png'].map((suffix) => ({
    url: spriteBase + suffix,
    rel: `sprites/ofm${suffix}`,
})), 'sprite');

console.log('字型');
const fontstacks = new Set();
style.layers.forEach((l) => {
    const f = l.layout?.['text-font'];
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) fontstacks.add(f.join(','));
});
// 全部 256 個範圍 × 3 個字型 ≈ 100 MB(OpenFreeMap 的 Noto 連 CJK 範圍都有內容),
// 所以只抓圖磚字串裡真的出現的字元所在的範圍。中日韓表意字 / 假名 / 諺文 maplibre 會在本機畫,
// 不算在內。範圍 0(ASCII)一定要:數字、路名的英文都在這。
const glyphRanges = new Set([0]);
const LOCAL = /\p{Ideo}|\p{sc=Hang}|\p{sc=Hira}|\p{sc=Kana}/u;
for (const { rel } of tileJobs) {
    const file = path.join(outDir, rel);
    if (!fs.existsSync(file)) continue;
    for (const str of tileStrings(fs.readFileSync(file))) {
        for (const ch of str) {
            if (!LOCAL.test(ch)) glyphRanges.add(Math.floor(ch.codePointAt(0) / 256));
        }
    }
}
console.log(`  用到 ${glyphRanges.size} 個 glyph 範圍`);
const glyphJobs = [];
for (const stack of fontstacks) {
    for (const r of [...glyphRanges].filter((x) => x < 256).sort((a, b) => a - b)) {
        const start = r * 256;
        const range = `${start}-${start + 255}`;
        glyphJobs.push({
            url: style.glyphs.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', range),
            rel: `fonts/${stack}/${range}.pbf`,
        });
    }
}
await pool(glyphJobs, 'glyphs');

// 改寫成離線樣式。網址留相對路徑,由 MapView 補上 style.json 所在的目錄。
// ne2_shaded(自然地球陰影)只在 z<7 顯示,MIN_ZOOM 鎖在 12 用不到,整個拿掉。
style.layers = style.layers.filter((l) => l.source !== 'ne2_shaded');
delete style.sources.ne2_shaded;
style.sources.openmaptiles = {
    type: 'vector',
    tiles: ['tiles/{z}/{x}/{y}.pbf'],
    minzoom: 0,
    maxzoom: MAX_TILE_ZOOM,
    // 範圍外不發請求(否則每格都是一個 404)
    bounds: DOWNLOAD_BBOX,
    attribution: tilejson.attribution ?? omt.attribution,
};
style.sprite = 'sprites/ofm';
style.glyphs = 'fonts/{fontstack}/{range}.pbf';
style.metadata = {
    ...(style.metadata ?? {}),
    'offline:maxBounds': [[MAX_BOUNDS[0], MAX_BOUNDS[1]], [MAX_BOUNDS[2], MAX_BOUNDS[3]]],
    'offline:minZoom': MIN_ZOOM,
    'offline:source': `${STYLE_URL} (${new Date().toISOString().slice(0, 10)})`,
};
save('style.json', Buffer.from(JSON.stringify(style)));
console.log(`完成:${outDir}`);
