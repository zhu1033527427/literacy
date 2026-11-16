// utils/HanziQuiz.uts
// ============================================================================
// HanziQuiz —— 汉字手写答题板
//   · 在 canvas 上实时渲染用户手写轨迹
//   · 抬手时按 HanziWriter quiz 的多指标匹配算法判定对错
//   · 对就清空笔迹、显示标准笔画；错就清空、累计错误次数
//
// 移植自 HanziWriter v3 的 Quiz / strokeMatches，只保留 quiz 所需部分。
// ============================================================================

/* ============================================================================
 * 一、对外类型
 * ============================================================================ */
export type Point = { x: number; y: number };

/** 外部传入的笔画结构（宽松） */
export type Stroke = {
  path: string;
  points: Point[];
  strokeNum?: number; // ★ 可选：外部传入时可不填，内部规范化时填入
};

export type StrokeEventData = {
  character: string;
  strokeNum: number;
  mistakesOnStroke: number;
  totalMistakes: number;
  strokesRemaining: number;
  isBackwards: boolean;
};

export type CompleteEventData = {
  character: string;
  totalMistakes: number;
};

export type OnCorrectStroke = (data: StrokeEventData) => void;
export type OnMistake = (data: StrokeEventData) => void;
export type OnComplete = (data: CompleteEventData) => void;

export type QuizOptions = {
  character: string;

  // 匹配参数（不变）
  leniency: number;
  averageDistanceThreshold: number;
  acceptBackwardsStrokes: boolean;
  markStrokeCorrectAfterMisses: number;
  showHintAfterMisses: number;

  // 渲染参数
  strokeColor: string;
  drawingColor: string;
  drawingWidth: number;
  padding: number;

  // ★ 新增：参照字 + 当前笔画提示
  showOutline: boolean; // 是否显示参照字
  outlineColor: string; // 参照字颜色（浅色）
  hintCurrentStroke: boolean; // 是否始终高亮当前该写的笔画
  highlightColor: string; // 当前笔画提示色

  // 回调（不变）
  onCorrectStroke: OnCorrectStroke | null;
  onMistake: OnMistake | null;
  onComplete: OnComplete | null;
};

export function createDefaultQuizOptions(character: string): QuizOptions {
  return {
    character,
    leniency: 1,
    averageDistanceThreshold: 350,
    acceptBackwardsStrokes: false,
    markStrokeCorrectAfterMisses: 0,
    showHintAfterMisses: 3,

    strokeColor: "#555555",
    drawingColor: "#333333",
    drawingWidth: 4,
    padding: 10,

    // ★ 默认：显示参照字，错 3 次后才提示当前笔
    showOutline: true,
    outlineColor: "#E0E0E0",
    hintCurrentStroke: false,
    highlightColor: "#FFB6C1",

    onCorrectStroke: null,
    onMistake: null,
    onComplete: null,
  };
}

/* ============================================================================
 * 二、常量
 * ============================================================================ */

// MakeMeAHanzi 字符数据固定边界
const CHAR_FROM: Point = { x: 0, y: -124 };
const PRE_SCALED_WIDTH = 1024;
const PRE_SCALED_HEIGHT = 1024;

// 匹配阈值
const COSINE_SIMILARITY_THRESHOLD = 0;
const START_AND_END_DIST_THRESHOLD = 250;
const FRECHET_THRESHOLD = 0.4;
const MIN_LEN_THRESHOLD = 0.35;
const SHAPE_FIT_ROTATIONS: number[] = [
  Math.PI / 16,
  Math.PI / 32,
  0,
  -Math.PI / 32,
  -Math.PI / 16,
];

/* ============================================================================
 * 三、几何工具（模块私有）
 * ============================================================================ */

function magnitude(p: Point): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}
function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}
function pointDistance(a: Point, b: Point): number {
  return magnitude(subtract(a, b));
}
function average(arr: number[]): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}
function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += pointDistance(points[i], points[i - 1]);
  return total;
}
function extendPointOnLine(p1: Point, p2: Point, d: number): Point {
  const v = subtract(p2, p1);
  const n = d / magnitude(v);
  return { x: p2.x + n * v.x, y: p2.y + n * v.y };
}
function cosineSimilarity(a: Point, b: Point): number {
  return (a.x * b.x + a.y * b.y) / magnitude(a) / magnitude(b);
}

function stripDuplicates(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    if (points[i].x !== last.x || points[i].y !== last.y) out.push(points[i]);
  }
  return out;
}
function getEdgeVectors(points: Point[]): Point[] {
  const vs: Point[] = [];
  for (let i = 1; i < points.length; i++)
    vs.push(subtract(points[i], points[i - 1]));
  return vs;
}

/* ============================================================================
 * 四、曲线归一化 + Fréchet 距离（形状匹配底层）
 * ============================================================================ */

function frechetDist(c1: Point[], c2: Point[]): number {
  const long = c1.length >= c2.length ? c1 : c2;
  const short = c1.length >= c2.length ? c2 : c1;

  const calc = (
    i: number,
    j: number,
    prev: number[],
    cur: number[],
  ): number => {
    if (i === 0 && j === 0) return pointDistance(long[0], short[0]);
    if (i > 0 && j === 0)
      return Math.max(prev[0], pointDistance(long[i], short[0]));
    const lastResult = cur[cur.length - 1];
    if (i === 0 && j > 0)
      return Math.max(lastResult, pointDistance(long[0], short[j]));
    return Math.max(
      Math.min(prev[j], prev[j - 1], lastResult),
      pointDistance(long[i], short[j]),
    );
  };

  let prevCol: number[] = [];
  for (let i = 0; i < long.length; i++) {
    const curCol: number[] = [];
    for (let j = 0; j < short.length; j++)
      curCol.push(calc(i, j, prevCol, curCol));
    prevCol = curCol;
  }
  return prevCol[short.length - 1];
}

function subdivideCurve(curve: Point[], maxLen: number = 0.05): Point[] {
  const out: Point[] = [curve[0]];
  for (let i = 1; i < curve.length; i++) {
    const point = curve[i];
    const prev = out[out.length - 1];
    const segLen = pointDistance(point, prev);
    if (segLen > maxLen) {
      const n = Math.ceil(segLen / maxLen);
      const step = segLen / n;
      for (let k = 0; k < n; k++)
        out.push(extendPointOnLine(point, prev, -step * (k + 1)));
    } else {
      out.push(point);
    }
  }
  return out;
}

function outlineCurve(curve: Point[], numPoints: number = 30): Point[] {
  const curveLen = polylineLength(curve);
  const segLen = curveLen / (numPoints - 1);
  const out: Point[] = [curve[0]];
  const endPoint = curve[curve.length - 1];
  const rest = curve.slice(1);

  for (let i = 0; i < numPoints - 2; i++) {
    let lastPoint = out[out.length - 1];
    let remaining = segLen;
    let found = false;
    while (!found) {
      const nextDist = pointDistance(lastPoint, rest[0]);
      if (nextDist < remaining) {
        remaining -= nextDist;
        lastPoint = rest.shift()!;
      } else {
        out.push(extendPointOnLine(lastPoint, rest[0], remaining - nextDist));
        found = true;
      }
    }
  }
  out.push(endPoint);
  return out;
}

function normalizeCurve(curve: Point[]): Point[] {
  const outlined = outlineCurve(curve);
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < outlined.length; i++) {
    sx += outlined[i].x;
    sy += outlined[i].y;
  }
  const mean: Point = { x: sx / outlined.length, y: sy / outlined.length };

  const translated: Point[] = [];
  for (let i = 0; i < outlined.length; i++)
    translated.push(subtract(outlined[i], mean));

  const first = translated[0];
  const last = translated[translated.length - 1];
  const scale = Math.sqrt(
    average([
      first.x * first.x + first.y * first.y,
      last.x * last.x + last.y * last.y,
    ]),
  );

  const scaled: Point[] = [];
  for (let i = 0; i < translated.length; i++) {
    scaled.push({ x: translated[i].x / scale, y: translated[i].y / scale });
  }
  return subdivideCurve(scaled);
}

function rotateCurve(curve: Point[], theta: number): Point[] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const out: Point[] = [];
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i];
    out.push({ x: c * p.x - s * p.y, y: s * p.x + c * p.y });
  }
  return out;
}

function shapeFit(c1: Point[], c2: Point[], leniency: number): boolean {
  const n1 = normalizeCurve(c1);
  const n2 = normalizeCurve(c2);
  let minDist = Infinity;
  for (let i = 0; i < SHAPE_FIT_ROTATIONS.length; i++) {
    const d = frechetDist(n1, rotateCurve(n2, SHAPE_FIT_ROTATIONS[i]));
    if (d < minDist) minDist = d;
  }
  return minDist <= FRECHET_THRESHOLD * leniency;
}

/* ============================================================================
 * 五、笔画匹配（模块私有）
 * ============================================================================ */

type MatchOptions = {
  leniency: number;
  isOutlineVisible: boolean;
  checkBackwards: boolean;
  averageDistanceThreshold: number;
};
type MatchResult = {
  isMatch: boolean;
  avgDist: number;
  isBackwards: boolean;
};

function getStrokePoints(stroke: Stroke): Point[] {
  // 如果 shared-types 里是 number[][]，改成：
  // return (stroke.points as number[][]).map(...)
  return stroke.points;
}

function getAverageDistance(points: Point[], stroke: Stroke): number {
  const pts = getStrokePoints(stroke);
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    let min = Infinity;
    for (let j = 0; j < pts.length; j++) {
      const d = pointDistance(points[i], pts[j]);
      if (d < min) min = d;
    }
    total += min;
  }
  return total / points.length;
}

function startAndEndMatches(
  points: Point[],
  stroke: Stroke,
  leniency: number,
): boolean {
  const pts = getStrokePoints(stroke);
  const sd = pointDistance(pts[0], points[0]);
  const ed = pointDistance(pts[pts.length - 1], points[points.length - 1]);
  return (
    sd <= START_AND_END_DIST_THRESHOLD * leniency &&
    ed <= START_AND_END_DIST_THRESHOLD * leniency
  );
}

function directionMatches(points: Point[], stroke: Stroke): boolean {
  const edgeVectors = getEdgeVectors(points);
  const strokePoints = getStrokePoints(stroke);
  const strokeVectors = getEdgeVectors(strokePoints);
  if (edgeVectors.length === 0 || strokeVectors.length === 0) return false;

  const sims: number[] = [];
  for (let i = 0; i < edgeVectors.length; i++) {
    let max = -Infinity;
    for (let j = 0; j < strokeVectors.length; j++) {
      const s = cosineSimilarity(strokeVectors[j], edgeVectors[i]);
      if (s > max) max = s;
    }
    sims.push(max);
  }
  return average(sims) > COSINE_SIMILARITY_THRESHOLD;
}

function lengthMatches(
  points: Point[],
  stroke: Stroke,
  leniency: number,
): boolean {
  return (
    (leniency * (polylineLength(points) + 25)) /
      (polylineLength(getStrokePoints(stroke)) + 25) >=
    MIN_LEN_THRESHOLD
  );
}

function getMatchData(
  points: Point[],
  stroke: Stroke,
  options: MatchOptions,
): MatchResult {
  const avgDist = getAverageDistance(points, stroke);

  // ★ 提取出来，可选属性兜底为 0
  const strokeNum = stroke.strokeNum ?? 0;
  const distMod = options.isOutlineVisible || strokeNum > 0 ? 0.5 : 1;

  const within =
    avgDist <= options.averageDistanceThreshold * distMod * options.leniency;
  if (!within) return { isMatch: false, avgDist, isBackwards: false };

  const ok =
    within &&
    startAndEndMatches(points, stroke, options.leniency) &&
    directionMatches(points, stroke) &&
    shapeFit(points, getStrokePoints(stroke), options.leniency) &&
    lengthMatches(points, stroke, options.leniency);

  if (ok) return { isMatch: true, avgDist, isBackwards: false };

  if (options.checkBackwards) {
    const back = getMatchData(points.slice().reverse(), stroke, {
      ...options,
      checkBackwards: false,
    });
    if (back.isMatch) return { isMatch: false, avgDist, isBackwards: true };
  }
  return { isMatch: false, avgDist, isBackwards: false };
}

function matchUserStroke(
  rawPoints: Point[],
  strokes: Stroke[],
  strokeNum: number,
  options: MatchOptions,
): MatchResult {
  const points = stripDuplicates(rawPoints);
  if (points.length < 2)
    return { isMatch: false, avgDist: Infinity, isBackwards: false };

  const primary = getMatchData(points, strokes[strokeNum], options);
  if (!primary.isMatch) return primary;

  // 用户是否画成了"后面更像我"的笔画
  let closestDist = primary.avgDist;
  for (let i = strokeNum + 1; i < strokes.length; i++) {
    const r = getMatchData(points, strokes[i], {
      ...options,
      checkBackwards: false,
    });
    if (r.isMatch && r.avgDist < closestDist) closestDist = r.avgDist;
  }
  if (closestDist < primary.avgDist) {
    const adjust =
      (0.6 * (closestDist + primary.avgDist)) / (2 * primary.avgDist);
    return getMatchData(points, strokes[strokeNum], {
      ...options,
      leniency: options.leniency * adjust,
    });
  }
  return primary;
}

/* ============================================================================
 * 六、Positioner —— 汉字坐标 <-> canvas 逻辑坐标
 * ============================================================================ */

class Positioner {
  padding: number;
  width: number;
  height: number;
  scale: number;
  xOffset: number;
  yOffset: number;

  constructor(width: number, height: number, padding: number) {
    this.padding = padding;
    this.width = width;
    this.height = height;
    const ew = width - 2 * padding;
    const eh = height - 2 * padding;
    this.scale = Math.min(ew / PRE_SCALED_WIDTH, eh / PRE_SCALED_HEIGHT);
    const xc = padding + (ew - this.scale * PRE_SCALED_WIDTH) / 2;
    const yc = padding + (eh - this.scale * PRE_SCALED_HEIGHT) / 2;
    this.xOffset = -CHAR_FROM.x * this.scale + xc;
    this.yOffset = -CHAR_FROM.y * this.scale + yc;
  }

  /** canvas 逻辑坐标（相对 canvas 左上角）→ 汉字内部坐标 */
  toHanzi(p: Point): Point {
    return {
      x: (p.x - this.xOffset) / this.scale,
      y: (this.height - this.yOffset - p.y) / this.scale,
    };
  }
}

/* ============================================================================
 * 七、SVG path 解析（MakeMeAHanzi 用到的 M / L / C / Q / Z）
 * ============================================================================ */

function isPathLetter(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}
function isPathSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function buildPath(c: any, pathString: string): void {
  let cmd = "";
  let nums: number[] = [];

  const flush = () => {
    if (cmd === "M") {
      for (let k = 0; k + 1 < nums.length; k += 2) {
        if (k === 0) c.moveTo(nums[0], nums[1]);
        else c.lineTo(nums[k], nums[k + 1]);
      }
    } else if (cmd === "L") {
      for (let k = 0; k + 1 < nums.length; k += 2)
        c.lineTo(nums[k], nums[k + 1]);
    } else if (cmd === "C") {
      for (let k = 0; k + 5 < nums.length; k += 6) {
        c.bezierCurveTo(
          nums[k],
          nums[k + 1],
          nums[k + 2],
          nums[k + 3],
          nums[k + 4],
          nums[k + 5],
        );
      }
    } else if (cmd === "Q") {
      for (let k = 0; k + 3 < nums.length; k += 4) {
        c.quadraticCurveTo(nums[k], nums[k + 1], nums[k + 2], nums[k + 3]);
      }
    } else if (cmd === "Z" || cmd === "z") {
      c.closePath();
    }
    nums = [];
  };

  let i = 0;
  while (i < pathString.length) {
    const ch = pathString[i];
    if (isPathLetter(ch)) {
      flush();
      cmd = ch;
      i++;
    } else if (isPathSpace(ch) || ch === ",") {
      i++;
    } else {
      let j = i;
      while (
        j < pathString.length &&
        !isPathLetter(pathString[j]) &&
        !isPathSpace(pathString[j]) &&
        pathString[j] !== ","
      )
        j++;
      nums.push(parseFloat(pathString.substring(i, j)));
      i = j;
    }
  }
  flush();
}

/* ============================================================================
 * 八、HanziQuiz —— 对外的那个类
 * ============================================================================ */

export class HanziQuiz {
  private _canvas: any;
  private _ctx: any;
  private _width: number;
  private _height: number;
  private _strokes: Stroke[];
  private _options: QuizOptions;
  private _positioner: Positioner;

  // 答题状态
  private _currentStrokeIndex: number = 0;
  private _currentPoints: Point[] = [];
  private _isDrawing: boolean = false;
  private _mistakesOnStroke: number = 0;
  private _totalMistakes: number = 0;
  private _isActive: boolean = true;

  constructor(
    canvas: any,
    ctx: any,
    width: number,
    height: number,
    strokes: Stroke[],
    options: QuizOptions,
  ) {
    this._canvas = canvas;
    this._ctx = ctx;
    this._width = width;
    this._height = height;
    this._strokes = strokes;
    this._options = options;
    this._positioner = new Positioner(width, height, options.padding);

    // 初始化：直接进入答题状态
    this._currentStrokeIndex = 0;
    this._currentPoints = [];
    this._isDrawing = false;
    this._mistakesOnStroke = 0;
    this._totalMistakes = 0;
  }

  /* ---------------- 供外部查询 ---------------- */

  get currentStrokeIndex(): number {
    return this._currentStrokeIndex;
  }
  get totalMistakes(): number {
    return this._totalMistakes;
  }
  get isFinished(): boolean {
    return this._currentStrokeIndex >= this._strokes.length;
  }

  /* ---------------- 触摸事件 ----------------
   * 参数为相对 canvas 左上角的逻辑像素坐标（外部负责 clientX - rect.left）
   * ------------------------------------------------- */

  onTouchStart(x: number, y: number): void {
    if (!this._isActive || this.isFinished) return;
    const p = this._positioner.toHanzi({ x, y });
    this._currentPoints = [p];
    this._isDrawing = true;
    this.redraw();
  }

  onTouchMove(x: number, y: number): void {
    if (!this._isDrawing) return;
    this._currentPoints.push(this._positioner.toHanzi({ x, y }));
    this.redraw();
  }

  onTouchEnd(): void {
    if (!this._isDrawing) return;
    this._isDrawing = false;

    // 单点视为误触
    if (this._currentPoints.length < 2) {
      this._currentPoints = [];
      this.redraw();
      return;
    }

    const result = matchUserStroke(
      this._currentPoints,
      this._strokes,
      this._currentStrokeIndex,
      {
        leniency: this._options.leniency,
        isOutlineVisible: false,
        checkBackwards: true,
        averageDistanceThreshold: this._options.averageDistanceThreshold,
      },
    );

    const forceAccepted =
      this._options.markStrokeCorrectAfterMisses > 0 &&
      this._mistakesOnStroke + 1 >= this._options.markStrokeCorrectAfterMisses;

    const accepted =
      result.isMatch ||
      forceAccepted ||
      (result.isBackwards && this._options.acceptBackwardsStrokes);

    if (accepted) this._handleSuccess(result);
    else this._handleFailure(result);

    this._currentPoints = [];
    this.redraw();
  }

  /* ---------------- 主动重绘 / 重置 ---------------- */

  redraw(): void {
    const ctx = this._ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this._width, this._height);
    ctx.save();
    ctx.translate(
      this._positioner.xOffset,
      this._height - this._positioner.yOffset,
    );
    ctx.transform(1, 0, 0, -1, 0, 0);
    ctx.scale(this._positioner.scale, this._positioner.scale);

    // 第 1 层：参照字（所有笔画浅色）
    if (this._options.showOutline) {
      for (let i = 0; i < this._strokes.length; i++) {
        this._drawStroke(this._strokes[i], this._options.outlineColor);
      }
    }

    // 第 2 层：已完成笔画（深色，盖住参照）
    for (let i = 0; i < this._currentStrokeIndex; i++) {
      this._drawStroke(this._strokes[i], this._options.strokeColor);
    }

    // 第 3 层：当前笔画提示（错 N 次后 / 或始终）
    if (this._shouldShowHint()) {
      this._drawStroke(
        this._strokes[this._currentStrokeIndex],
        this._options.highlightColor,
      );
    }

    // 第 4 层：用户手写轨迹
    if (this._currentPoints.length >= 2) {
      this._drawUserStroke(this._currentPoints);
    }

    ctx.restore();
  }

  private _shouldShowHint(): boolean {
    if (this._currentStrokeIndex >= this._strokes.length) return false;

    // 始终高亮当前笔
    if (this._options.hintCurrentStroke) return true;

    // 错够 showHintAfterMisses 次才提示
    if (
      this._options.showHintAfterMisses > 0 &&
      this._mistakesOnStroke >= this._options.showHintAfterMisses
    ) {
      return true;
    }
    return false;
  }
  private _drawOutlineStroke(stroke: Stroke, color: string): void {
    if (!stroke.path) return;
    const ctx = this._ctx;
    ctx.beginPath();
    buildPath(ctx, stroke.path);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2; // 汉字坐标下的线宽
    ctx.stroke();
  }
  reset(): void {
    this._currentStrokeIndex = 0;
    this._currentPoints = [];
    this._isDrawing = false;
    this._mistakesOnStroke = 0;
    this._totalMistakes = 0;
    this._isActive = true;
    this.redraw();
  }

  destroy(): void {
    this._isActive = false;
    this._currentPoints = [];
    if (this._ctx) this._ctx.clearRect(0, 0, this._width, this._height);
  }

  /* ---------------- 内部：判定回调 ---------------- */

  private _handleSuccess(result: MatchResult): void {
    const data: StrokeEventData = {
      character: this._options.character,
      strokeNum: this._currentStrokeIndex,
      mistakesOnStroke: this._mistakesOnStroke,
      totalMistakes: this._totalMistakes,
      strokesRemaining: this._strokes.length - this._currentStrokeIndex - 1,
      isBackwards: result.isBackwards,
    };

    const cb = this._options.onCorrectStroke;
    if (cb) cb(data);

    this._mistakesOnStroke = 0;
    this._currentStrokeIndex += 1;

    if (this._currentStrokeIndex >= this._strokes.length) {
      this._isActive = false;
      const done = this._options.onComplete;
      if (done)
        done({
          character: this._options.character,
          totalMistakes: this._totalMistakes,
        });
    }
  }

  private _handleFailure(result: MatchResult): void {
    this._mistakesOnStroke += 1;
    this._totalMistakes += 1;

    const data: StrokeEventData = {
      character: this._options.character,
      strokeNum: this._currentStrokeIndex,
      mistakesOnStroke: this._mistakesOnStroke,
      totalMistakes: this._totalMistakes,
      strokesRemaining: this._strokes.length - this._currentStrokeIndex,
      isBackwards: result.isBackwards,
    };

    const cb = this._options.onMistake;
    if (cb) cb(data);
  }

  /* ---------------- 内部：绘制 ---------------- */

  private _drawStroke(stroke: Stroke, color: string): void {
    if (!stroke.path) return;
    const ctx = this._ctx;
    ctx.beginPath();
    buildPath(ctx, stroke.path);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private _drawUserStroke(points: Point[]): void {
    const ctx = this._ctx;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = this._options.drawingColor;
    ctx.lineWidth = this._options.drawingWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}
