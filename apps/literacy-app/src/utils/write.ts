import { StrokeData, Point } from "@literacy/shared-types";

let defaultStrokeData: StrokeData = {
  strokes: [],
  radStrokes: [],
  medians: [],
};

export type Stroke = {
  path: string; // 笔画轮廓的 SVG path，汉字坐标系
  points: Point[]; // 笔画中心线（median），汉字坐标系，Point = {x, y}
  color: string;
};

/** 加载文字笔画 */
export async function loadStrokeData(char: string): Promise<StrokeData> {
  return {
    strokes: [
      "M 531 651 Q 736 675 868 663 Q 893 662 899 670 Q 906 683 894 696 Q 863 724 817 744 Q 801 750 775 740 Q 712 725 483 694 Q 185 660 168 657 Q 162 658 156 657 Q 141 657 141 645 Q 140 632 160 618 Q 178 605 211 594 Q 221 590 240 599 Q 348 629 470 644 L 531 651 Z",
      "M 435 100 Q 407 107 373 116 Q 360 120 361 112 Q 361 103 373 94 Q 445 39 491 -5 Q 503 -15 518 2 Q 560 60 553 141 Q 541 447 548 561 Q 548 579 550 596 Q 556 624 549 635 Q 545 642 531 651 C 509 671 457 671 470 644 Q 485 629 485 573 Q 488 443 488 148 Q 487 112 477 99 Q 464 92 435 100 Z",
    ],
    medians: [
      [
        [153, 645],
        [177, 634],
        [219, 628],
        [416, 663],
        [794, 706],
        [823, 702],
        [887, 679],
      ],
      [
        [478, 644],
        [518, 610],
        [518, 101],
        [495, 55],
        [450, 68],
        [369, 110],
      ],
    ],
  };
  if (!(char && char.length === 1)) return defaultStrokeData;
  try {
    const res = await uni.request({
      url: `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`,
      method: "GET",
    });
    return res.data as StrokeData;
  } catch (e) {
    console.warn(`加载笔画数据失败: ${char}`, e);
    return defaultStrokeData;
  }
}

export const strokesToSvgDataUrl = (strokes: Array<Stroke> | null): string => {
  if (!(strokes && strokes.length > 0)) return "";
  const paths = strokes
    .map((stroke) => `<path d="${stroke.path}" fill="${stroke.color}"/>`)
    .join("");
  /** hanzi - writer 底层使用的 Make Me a Hanzi 数据，
  实际坐标边界是：左上角(0, 900)，右下角(1024, -124)。
  也就是说，笔画的 Y 轴范围是 -124 到 900（高度 1024），翻转后 y: 124~1148。**/
  const padding = 20;
  const vbX = -padding;
  const vbY = 100; // 留出底部空间
  const vbW = 1024 + padding * 2;
  const vbH = 1050; // 高度覆盖到 1148 左右

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
    <g transform="translate(0, 1024) scale(1, -1)">${paths}</g>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
