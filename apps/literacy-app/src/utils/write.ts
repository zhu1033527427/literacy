import { StrokeData } from "@literacy/shared-types";
let defaultStrokeData: StrokeData = { strokes: [], radStrokes: [], medians: [] }
/** 加载文字笔画 */
export async function loadStrokeData(char: string): Promise<StrokeData> {
  if (!(char && char.length === 1)) return defaultStrokeData;
  try {
    const res = await uni.request({
      url: `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`,
      method: "GET"
    });
    return res.data as StrokeData;
  } catch (e) {
    console.warn(`加载笔画数据失败: ${char}`, e);
    return defaultStrokeData;
  }
}

export interface Stroke {
  color: string;
  d: string;
}

export const strokesToSvgDataUrl = (strokes: Array<Stroke>): string => {
  if (!(strokes && strokes.length > 0)) return ''
  const paths = strokes
    .map((stroke) => `<path d="${stroke.d}" fill="${stroke.color}"/>`)
    .join('')
  /** hanzi - writer 底层使用的 Make Me a Hanzi 数据，
  实际坐标边界是：左上角(0, 900)，右下角(1024, -124)。
  也就是说，笔画的 Y 轴范围是 -124 到 900（高度 1024），翻转后 y: 124~1148。**/
  const padding = 20
  const vbX = -padding
  const vbY = 100 // 留出底部空间
  const vbW = 1024 + padding * 2
  const vbH = 1050 // 高度覆盖到 1148 左右

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
    <g transform="translate(0, 1024) scale(1, -1)">${paths}</g>
  </svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}