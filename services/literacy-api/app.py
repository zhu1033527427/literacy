from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import sys
import os

from ocr.service import init_engine, ocr_bytes, ocr_bytes_safe, OCRResult, BatchOCRResponse
from dict.service import load_dict

# ============================================================
# 鉴权
# ============================================================
API_KEY = os.environ.get("API_KEY") or "ocr_2026_a1b2c3"
if not API_KEY:
    print("❌ 未设置 API_KEY 环境变量，服务拒绝启动")
    sys.exit(1)

# ============================================================
# 生命周期
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 启动 Literacy API...")
    init_engine()
    load_dict()
    print("✅ OCR 引擎 + 字典数据 初始化完成")
    yield
    print("👋 服务关闭")

app = FastAPI(title="Literacy API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 鉴权依赖
# ============================================================
def _require_key(x_api_key: str = Header(None, alias="X-API-Key")):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="invalid api key")

# ============================================================
# 健康检查
# ============================================================
@app.get("/health")
def health():
    return {"status": "ok", "services": ["ocr", "dict"]}

# ============================================================
# ===== OCR 接口 =====
# ============================================================
from pydantic import BaseModel
from typing import List
import base64

class OCRRequest(BaseModel):
    image_base64: str

class BatchOCRRequest(BaseModel):
    images: List[str]

@app.post("/ocr/single")
def ocr_single(
    req: OCRRequest,
    x_api_key: str = Header(None, alias="X-API-Key"),
):
    """单张图片 OCR 识别"""
    _require_key(x_api_key)
    try:
        b64 = req.image_base64
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        result = ocr_bytes(base64.b64decode(b64))
        result["index"] = 0
        return result
    except Exception as e:
        return {"success": False, "error": str(e), "lines": [], "detail": [], "elapse": "0s"}

# app.py 里的 OCR 接口

@app.post("/ocr/single", response_model=OCRResult)
def ocr_single(
    req: OCRRequest,
    x_api_key: str = Header(None, alias="X-API-Key"),
):
    """单张图片 OCR 识别"""
    _require_key(x_api_key)
    b64 = req.image_base64
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    result = ocr_bytes(base64.b64decode(b64))
    result.index = 0
    return result


@app.post("/ocr/batch", response_model=BatchOCRResponse)
def ocr_batch(
    req: BatchOCRRequest,
    x_api_key: str = Header(None, alias="X-API-Key"),
):
    """批量 OCR"""
    _require_key(x_api_key)
    results = []
    for i, b64 in enumerate(req.images):
        img_b64 = b64
        if "," in img_b64:
            img_b64 = img_b64.split(",", 1)[1]
        result = ocr_bytes_safe(base64.b64decode(img_b64), index=i)
        results.append(result)

    return {
        "success": True,
        "count": len(results),
        "results": results,
    }
# ============================================================
# ===== 字典接口 =====
# ============================================================
@app.get("/dict/char/{char}")
def get_char(char: str):
    """查单个字：拼音 + 释义"""
    from dict.service import get_char_detail
    return get_char_detail(char)