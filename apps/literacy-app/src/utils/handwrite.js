/* =========================================================================
 * 一、匹配阈值常量
 * 这些是全局硬阈值，leniency（宽容度，默认 1）会按比例放大它们。
 * leniency 越大越宽松，越小越严格。
 * ========================================================================= */

// 方向余弦相似度阈值，-1 ~ 1；0 表示只要整体方向不是完全相反就通过
const COSINE_SIMILARITY_THRESHOLD = 0;

// 起点/终点允许偏差（汉字内部坐标系单位），乘以 leniency
const START_AND_END_DIST_THRESHOLD = 250;

// 形状 Fréchet 距离阈值，乘以 leniency
const FRECHET_THRESHOLD = 0.4;

// 长度比阈值，越小越宽松
const MIN_LEN_THRESHOLD = 0.35;

// 形状匹配时尝试的旋转角度（弧度），容忍用户手写的小角度倾斜
const SHAPE_FIT_ROTATIONS = [
  Math.PI / 16,
  Math.PI / 32,
  0,
  -1 * Math.PI / 32,
  -1 * Math.PI / 16,
];


/* =========================================================================
 * 二、基础几何工具
 * ========================================================================= */

const arrLast = (arr) => arr[arr.length - 1];

const average = (arr) => {
  const sum = arr.reduce((acc, val) => val + acc, 0);
  return sum / arr.length;
};

const subtract = (p1, p2) => ({ x: p1.x - p2.x, y: p1.y - p2.y });

const magnitude = (point) => Math.sqrt(point.x ** 2 + point.y ** 2);

const distance = (point1, point2) => magnitude(subtract(point1, point2));

const equals = (point1, point2) => point1.x === point2.x && point1.y === point2.y;

// 按精度四舍五入（默认 1 位小数），用于生成 path 字符串，匹配里用得不多
const round = (point, precision = 1) => {
  const multiplier = precision * 10;
  return {
    x: Math.round(multiplier * point.x) / multiplier,
    y: Math.round(multiplier * point.y) / multiplier,
  };
};

// 折线总长度：相邻点距离累加
const length = (points) => {
  let lastPoint = points[0];
  const pointsSansFirst = points.slice(1);
  return pointsSansFirst.reduce((acc, point) => {
    const dist = distance(point, lastPoint);
    lastPoint = point;
    return acc + dist;
  }, 0);
};

// 两个向量的余弦相似度，-1 ~ 1
const cosineSimilarity = (point1, point2) => {
  const rawDotProduct = point1.x * point2.x + point1.y * point2.y;
  return rawDotProduct / magnitude(point1) / magnitude(point2);
};

/**
 * 在线段 p1->p2 的延长线上，从 p2 再往外延伸 dist 距离，返回新点 p3。
 * p1、p2、p3 共线且顺序为 p1 -> p2 -> p3。
 * 用于把长线段切分成小段时插值。
 */
const _extendPointOnLine = (p1, p2, dist) => {
  const vect = subtract(p2, p1);
  const norm = dist / magnitude(vect);
  return {
    x: p2.x + norm * vect.x,
    y: p2.y + norm * vect.y,
  };
};


/* =========================================================================
 * 三、曲线归一化 + Fréchet 距离（形状匹配的底层）
 * ========================================================================= */

/**
 * 离散 Fréchet 距离：衡量两条折线“形状”的相似度。
 * 值越小越像；对点的顺序敏感（所以反向笔画要用反转后的点再算一次）。
 * 实现用滚动数组，只保留上一列结果，空间 O(shortCurve.length)。
 * 参考：http://www.kr.tuwien.ac.at/staff/eiter/et-archive/cdtr9464.pdf
 */
const frechetDist = (curve1, curve2) => {
  const longCurve = curve1.length >= curve2.length ? curve1 : curve2;
  const shortCurve = curve1.length >= curve2.length ? curve2 : curve1;

  const calcVal = (i, j, prevResultsCol, curResultsCol) => {
    if (i === 0 && j === 0) {
      return distance(longCurve[0], shortCurve[0]);
    }
    if (i > 0 && j === 0) {
      return Math.max(prevResultsCol[0], distance(longCurve[i], shortCurve[0]));
    }
    const lastResult = curResultsCol[curResultsCol.length - 1];
    if (i === 0 && j > 0) {
      return Math.max(lastResult, distance(longCurve[0], shortCurve[j]));
    }
    // 取左、左上、上三个方向的最小值，再与当前两点距离取 max
    return Math.max(
      Math.min(prevResultsCol[j], prevResultsCol[j - 1], lastResult),
      distance(longCurve[i], shortCurve[j])
    );
  };

  let prevResultsCol = [];
  for (let i = 0; i < longCurve.length; i++) {
    const curResultsCol = [];
    for (let j = 0; j < shortCurve.length; j++) {
      // prevResultsCol 是 results[i-1][:]，curResultsCol 是 results[i][:j-1]
      curResultsCol.push(calcVal(i, j, prevResultsCol, curResultsCol));
    }
    prevResultsCol = curResultsCol;
  }
  return prevResultsCol[shortCurve.length - 1];
};

/**
 * 把折线中过长的线段切分成不超过 maxLen 的小段。
 * 目的是让两条采样密度不同的曲线在 Fréchet 距离下可比。
 */
const subdivideCurve = (curve, maxLen = 0.05) => {
  const newCurve = curve.slice(0, 1);
  for (const point of curve.slice(1)) {
    const prevPoint = newCurve[newCurve.length - 1];
    const segLen = distance(point, prevPoint);
    if (segLen > maxLen) {
      const numNewPoints = Math.ceil(segLen / maxLen);
      const newSegLen = segLen / numNewPoints;
      for (let i = 0; i < numNewPoints; i++) {
        // 注意这里是从 point 往 prevPoint 方向反推，所以乘 -1
        newCurve.push(_extendPointOnLine(point, prevPoint, -1 * newSegLen * (i + 1)));
      }
    } else {
      newCurve.push(point);
    }
  }
  return newCurve;
};

/**
 * 沿曲线长度等距重采样出 numPoints 个点（默认 30 个）。
 * 这样两条原始采样点数不同的曲线，归一化后点数一致，Fréchet 才有意义。
 */
const outlineCurve = (curve, numPoints = 30) => {
  const curveLen = length(curve);
  const segmentLen = curveLen / (numPoints - 1);
  const outlinePoints = [curve[0]];
  const endPoint = arrLast(curve);
  const remainingCurvePoints = curve.slice(1);

  for (let i = 0; i < numPoints - 2; i++) {
    let lastPoint = arrLast(outlinePoints);
    let remainingDist = segmentLen;
    let outlinePointFound = false;
    while (!outlinePointFound) {
      const nextPointDist = distance(lastPoint, remainingCurvePoints[0]);
      if (nextPointDist < remainingDist) {
        // 还没走够一段，消耗掉这个原始点继续走
        remainingDist -= nextPointDist;
        lastPoint = remainingCurvePoints.shift();
      } else {
        // 在这一段上插值出等距点
        const nextPoint = _extendPointOnLine(
          lastPoint,
          remainingCurvePoints[0],
          remainingDist - nextPointDist
        );
        outlinePoints.push(nextPoint);
        outlinePointFound = true;
      }
    }
  }
  outlinePoints.push(endPoint);
  return outlinePoints;
};

/**
 * Procrustes 式归一化：
 * 1) 等距重采样成 30 个点；
 * 2) 平移到质心（消除位置差异）；
 * 3) 按首尾点到质心的尺度缩放（消除大小差异）；
 * 4) 再细分到 maxLen=0.05（让 Fréchet 更稳定）。
 * 旋转不做在这里，由 shapeFit 尝试几个角度。
 */
const normalizeCurve = (curve) => {
  const outlinedCurve = outlineCurve(curve);
  const meanX = average(outlinedCurve.map((point) => point.x));
  const meanY = average(outlinedCurve.map((point) => point.y));
  const mean = { x: meanX, y: meanY };

  const translatedCurve = outlinedCurve.map((point) => subtract(point, mean));

  // 用首尾两点到质心距离的均方根作为尺度
  const scale = Math.sqrt(
    average([
      translatedCurve[0].x ** 2 + translatedCurve[0].y ** 2,
      arrLast(translatedCurve).x ** 2 + arrLast(translatedCurve).y ** 2,
    ])
  );

  const scaledCurve = translatedCurve.map((point) => ({
    x: point.x / scale,
    y: point.y / scale,
  }));

  return subdivideCurve(scaledCurve);
};

// 绕原点旋转曲线
const rotate = (curve, theta) => {
  return curve.map((point) => ({
    x: Math.cos(theta) * point.x - Math.sin(theta) * point.y,
    y: Math.sin(theta) * point.x + Math.cos(theta) * point.y,
  }));
};


/* =========================================================================
 * 四、笔画匹配核心
 * ========================================================================= */

// 去掉连续重复的点，避免距离/方向计算被零向量污染
const stripDuplicates = (points) => {
  if (points.length < 2) return points;
  const [firstPoint, ...rest] = points;
  const dedupedPoints = [firstPoint];
  for (const point of rest) {
    if (!equals(point, dedupedPoints[dedupedPoints.length - 1])) {
      dedupedPoints.push(point);
    }
  }
  return dedupedPoints;
};

// 把折线转成相邻点之间的向量列表（方向序列）
const getEdgeVectors = (points) => {
  const vectors = [];
  let lastPoint = points[0];
  points.slice(1).forEach((point) => {
    vectors.push(subtract(point, lastPoint));
    lastPoint = point;
  });
  return vectors;
};

/**
 * 起终点是否都在容差内。
 * 用户笔画的第一个点要靠近目标笔画起点，最后一个点要靠近目标笔画终点。
 */
const startAndEndMatches = (points, closestStroke, leniency) => {
  const startingDist = distance(closestStroke.getStartingPoint(), points[0]);
  const endingDist = distance(
    closestStroke.getEndingPoint(),
    points[points.length - 1]
  );
  return (
    startingDist <= START_AND_END_DIST_THRESHOLD * leniency &&
    endingDist <= START_AND_END_DIST_THRESHOLD * leniency
  );
};

/**
 * 方向匹配：
 * 用户笔画每一段，去目标笔画的所有段里找余弦相似度最大的那个；
 * 再对这些最大值求平均，要求 > COSINE_SIMILARITY_THRESHOLD。
 * 这样不要求分段一一对应，对手写节奏差异比较宽容。
 */
const directionMatches = (points, stroke) => {
  const edgeVectors = getEdgeVectors(points);
  const strokeVectors = stroke.getVectors();
  const similarities = edgeVectors.map((edgeVector) => {
    const strokeSimilarities = strokeVectors.map((strokeVector) =>
      cosineSimilarity(strokeVector, edgeVector)
    );
    return Math.max(...strokeSimilarities);
  });
  const avgSimilarity = average(similarities);
  return avgSimilarity > COSINE_SIMILARITY_THRESHOLD;
};

/**
 * 长度匹配：
 * 用 +25 做平滑，避免极短笔画因为比例失真被误判。
 * 比值 >= MIN_LEN_THRESHOLD 即通过，leniency 会放大用户长度。
 */
const lengthMatches = (points, stroke, leniency) => {
  return (
    (leniency * (length(points) + 25)) / (stroke.getLength() + 25) >=
    MIN_LEN_THRESHOLD
  );
};

/**
 * 形状匹配：
 * 两条曲线各自归一化（去位置、去尺度、重采样），
 * 然后尝试 5 个旋转角，取最小的 Fréchet 距离。
 * 距离 <= FRECHET_THRESHOLD * leniency 即通过。
 */
const shapeFit = (curve1, curve2, leniency) => {
  const normCurve1 = normalizeCurve(curve1);
  const normCurve2 = normalizeCurve(curve2);
  let minDist = Infinity;
  SHAPE_FIT_ROTATIONS.forEach((theta) => {
    const dist = frechetDist(normCurve1, rotate(normCurve2, theta));
    if (dist < minDist) {
      minDist = dist;
    }
  });
  return minDist <= FRECHET_THRESHOLD * leniency;
};

/**
 * 单次匹配：对「用户点集 points」和「某一笔 stroke」做全套检查。
 * 返回 { isMatch, avgDist, meta: { isStrokeBackwards } }。
 *
 * 五个条件全部满足才算匹配：
 *   1. 平均距离在阈值内（快速短路，不满足直接返回，省性能）
 *   2. 起点、终点在容差内
 *   3. 方向匹配
 *   4. 形状匹配
 *   5. 长度匹配
 *
 * checkBackwards 为 true 时，如果正向失败，会把点序反转再试一次；
 * 反转后能匹配则标记 isStrokeBackwards = true（是否接受由 Quiz 选项决定）。
 */
const getMatchData = (points, stroke, options) => {
  const {
    leniency = 1,
    isOutlineVisible = false,
    checkBackwards = true,
    averageDistanceThreshold = 350,
  } = options;

  // 用户每个点到目标笔画折线的最近距离，取平均
  const avgDist = stroke.getAverageDistance(points);

  // 显示轮廓、或不是第一笔时，距离阈值收紧一半（更严格）
  const distMod = isOutlineVisible || stroke.strokeNum > 0 ? 0.5 : 1;
  const withinDistThresh =
    avgDist <= averageDistanceThreshold * distMod * leniency;

  // 快速短路：平均距离都不过，后面的复杂计算没必要做
  if (!withinDistThresh) {
    return {
      isMatch: false,
      avgDist,
      meta: { isStrokeBackwards: false },
    };
  }

  const startAndEndMatch = startAndEndMatches(points, stroke, leniency);
  const directionMatch = directionMatches(points, stroke);
  const shapeMatch = shapeFit(points, stroke.points, leniency);
  const lengthMatch = lengthMatches(points, stroke, leniency);

  const isMatch =
    withinDistThresh &&
    startAndEndMatch &&
    directionMatch &&
    shapeMatch &&
    lengthMatch;

  // 正向不匹配时，尝试反向（用户可能从终点往起点写）
  if (checkBackwards && !isMatch) {
    const backwardsMatchData = getMatchData([...points].reverse(), stroke, {
      ...options,
      checkBackwards: false, // 防止无限递归
    });
    if (backwardsMatchData.isMatch) {
      return {
        isMatch,
        avgDist,
        meta: { isStrokeBackwards: true },
      };
    }
  }

  return {
    isMatch,
    avgDist,
    meta: { isStrokeBackwards: false },
  };
};

/**
 * 对外入口：判断用户这一笔是否匹配「第 strokeNum 笔」。
 *
 * 除了 getMatchData 的基本匹配，还多做一件事：
 * 检查用户是不是把「后面还没写的某一笔」提前画了。
 * 如果后面某一笔的 avgDist 更小（更像），说明用户很可能画错笔了，
 * 这时会临时收紧 leniency 再验证当前笔，避免相似笔画蒙混过关。
 */
function strokeMatches(userStroke, character, strokeNum, options = {}) {
  const strokes = character.strokes;
  const points = stripDuplicates(userStroke.points);

  // 少于两个点无法构成笔画
  if (points.length < 2) {
    return { isMatch: false, meta: { isStrokeBackwards: false } };
  }

  const { isMatch, meta, avgDist } = getMatchData(
    points,
    strokes[strokeNum],
    options
  );

  if (!isMatch) {
    return { isMatch, meta };
  }

  // 拿后面所有未写的笔画做对比，找最小平均距离
  const laterStrokes = strokes.slice(strokeNum + 1);
  let closestMatchDist = avgDist;

  for (let i = 0; i < laterStrokes.length; i++) {
    const { isMatch: laterIsMatch, avgDist: laterAvgDist } = getMatchData(
      points,
      laterStrokes[i],
      {
        ...options,
        checkBackwards: false, // 对比后面笔画时不做反向，节省计算
      }
    );
    if (laterIsMatch && laterAvgDist < closestMatchDist) {
      closestMatchDist = laterAvgDist;
    }
  }

  // 如果后面某一笔明显更像，就收紧 leniency 重判当前笔
  if (closestMatchDist < avgDist) {
    // 调整系数落在 0.3 ~ 0.6 之间：越像后面那笔，当前笔要求越严
    const leniencyAdjustment =
      (0.6 * (closestMatchDist + avgDist)) / (2 * avgDist);
    const { isMatch: strictIsMatch, meta: strictMeta } = getMatchData(
      points,
      strokes[strokeNum],
      {
        ...options,
        leniency: (options.leniency || 1) * leniencyAdjustment,
      }
    );
    return { isMatch: strictIsMatch, meta: strictMeta };
  }

  return { isMatch, meta };
}


/* =========================================================================
 * 五、Quiz 里怎么用这个匹配结果
 * （摘自 Quiz.endUserStroke 的判定部分，省略了渲染/动画代码）
 * ========================================================================= */

class Quiz {
  // ... 省略构造函数、startQuiz、startUserStroke、continueUserStroke 等
  // 只保留抬手时的判定逻辑

  endUserStroke() {
    if (!this._userStroke) return;

    // 渲染层：把用户笔迹淡出（这里与判定无关，略）
    // this._renderState.run(hideUserStroke(...));

    // 单点笔画直接忽略，不判对错
    if (this._userStroke.points.length === 1) {
      this._userStroke = undefined;
      return;
    }

    const { acceptBackwardsStrokes, markStrokeCorrectAfterMisses } = this._options;

    // 当前应该写的笔画
    const currentStroke = this._getCurrentStroke();

    // ★ 核心：调用 strokeMatches 判断这一笔对不对
    const { isMatch, meta } = strokeMatches(
      this._userStroke,
      this._character,
      this._currentStrokeIndex,
      {
        // 显示轮廓时距离阈值收紧（见 getMatchData 的 distMod）
        isOutlineVisible: this._renderState.state.character.outline.opacity > 0,
        leniency: this._options.leniency,
        averageDistanceThreshold: this._options.averageDistanceThreshold,
      }
    );

    // 「错 n 次后强制算对」：达到次数就忽略几何匹配结果
    const isForceAccepted =
      markStrokeCorrectAfterMisses &&
      this._mistakesOnStroke + 1 >= markStrokeCorrectAfterMisses;

    // 最终判定：几何匹配通过 / 强制接受 / 反向且允许反向
    const isAccepted =
      isMatch ||
      isForceAccepted ||
      (meta.isStrokeBackwards && acceptBackwardsStrokes);

    if (isAccepted) {
      this._handleSuccess(meta);
    } else {
      this._handleFailure(meta);

      // 错误次数达到 showHintAfterMisses（默认 3）就高亮提示当前笔画
      const { showHintAfterMisses, highlightColor, strokeHighlightSpeed } =
        this._options;
      if (
        showHintAfterMisses !== false &&
        this._mistakesOnStroke >= showHintAfterMisses
      ) {
        // this._renderState.run(
        //   highlightStroke(currentStroke, colorStringToVals(highlightColor), strokeHighlightSpeed)
        // );
      }
    }

    this._userStroke = undefined;
  }

  _handleSuccess(meta) {
    if (!this._options) return;
    const { onCorrectStroke } = this._options;
    // 回调里带上：字符、笔画序号、本次错误数、总错误数、剩余笔画、用户轨迹、是否反向
    onCorrectStroke?.(this._getStrokeData({ isCorrect: true, meta }));
    this.nextStroke();
  }

  _handleFailure(meta) {
    // 记一次错误，并回调 onMistake
    this._mistakesOnStroke += 1;
    this._totalMistakes += 1;
    this._options.onMistake?.(this._getStrokeData({ isCorrect: false, meta }));
  }

  nextStroke() {
    if (!this._options) return;
    const { strokes, symbol } = this._character;
    const { onComplete, highlightOnComplete, /* ... */ } = this._options;

    // 把当前笔画以动画形式显示出来，然后索引前进
    // let animation = showStroke('main', this._currentStrokeIndex, strokeFadeDuration);
    this._mistakesOnStroke = 0;
    this._currentStrokeIndex += 1;

    // 所有笔画写完 -> 结束 quiz，触发 onComplete
    const isComplete = this._currentStrokeIndex === strokes.length;
    if (isComplete) {
      this._isActive = false;
      onComplete?.({ character: symbol, totalMistakes: this._totalMistakes });
      // if (highlightOnComplete) { animation = animation.concat(highlightCompleteChar(...)); }
    }

    // this._renderState.run(animation);
  }

  _getCurrentStroke() {
    return this._character.strokes[this._currentStrokeIndex];
  }

  _getStrokeData({ isCorrect, meta }) {
    // 返回给回调的事件数据
    return {
      character: this._character.symbol,
      strokeNum: this._currentStrokeIndex,
      mistakesOnStroke: this._mistakesOnStroke,
      totalMistakes: this._totalMistakes,
      // 剩余笔画数：如果这一笔算对，当前笔也被计入“已完成”，所以再减 1
      strokesRemaining:
        this._character.strokes.length -
        this._currentStrokeIndex -
        (isCorrect ? 1 : 0),
      // drawnPath: getDrawnPath(this._userStroke), // 用户实际轨迹，渲染用
      isBackwards: meta.isStrokeBackwards,
    };
  }
}