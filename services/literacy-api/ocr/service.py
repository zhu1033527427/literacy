# ocr/service.py
import time
from typing import List, Optional
from pydantic import BaseModel
from rapidocr_onnxruntime import RapidOCR

engine = None


# ── 数据模型 ──
class TextBox(BaseModel):
    text: str
    score: float
    box: List[List[int]]          # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]


class OCRResult(BaseModel):
    success: bool
    lines: List[str]              # 纯文本列表，前端最常用
    detail: List[TextBox]         # 带位置+置信度的详细信息
    elapse: str
    index: Optional[int] = None   # 批量时标记序号
    error: Optional[str] = None   # 失败时填

class BatchOCRResponse(BaseModel):
    success: bool
    count: int
    results: List[OCRResult]

def init_engine():
    global engine
    engine = RapidOCR(params={"use_cls": False, "Global.max_side_len": 1200})
    print("✅ RapidOCR 引擎初始化完成")


def ocr_bytes(img_bytes: bytes) -> OCRResult:
    if engine is None:
        raise RuntimeError("OCR 引擎未初始化")

    t0 = time.time()
    result, _ = engine(img_bytes)
    cost = round(time.time() - t0, 2)

    if not result:
        return OCRResult(
            success=True,
            lines=[],
            detail=[],
            elapse=f"{cost}s",
        )

    lines = []
    detail = []
    for box, text, score in result:
        lines.append(text)
        detail.append(TextBox(
            text=text,
            score=round(float(score), 3),
            box=box,
        ))

    return OCRResult(
        success=True,
        lines=lines,
        detail=detail,
        elapse=f"{cost}s",
    )


def ocr_bytes_safe(img_bytes: bytes, index: Optional[int] = None) -> OCRResult:
    """带异常捕获的版本，批量时用"""
    try:
        result = ocr_bytes(img_bytes)
        if index is not None:
            result.index = index
        return result
    except Exception as e:
        return OCRResult(
            success=False,
            lines=[],
            detail=[],
            elapse="0s",
            index=index,
            error=str(e),
        )