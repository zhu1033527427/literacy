from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import os, base64, time, sys

app = FastAPI(title="OCR Service")

# ===== 鉴权 =====
API_KEY = os.environ.get("OCR_API_KEY")
if not API_KEY:
    print("❌ 未设置 OCR_API_KEY 环境变量，服务拒绝启动")
    sys.exit(1)

# ===== CORS =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== OCR 引擎 =====
from rapidocr_onnxruntime import RapidOCR
engine = RapidOCR(params={"use_cls": False, "Global.max_side_len": 1200})

# ===== 数据模型 =====
class OCRRequest(BaseModel):
    image_base64: str

class BatchOCRRequest(BaseModel):
    images: List[str]

# ===== 工具函数 =====
def ocr_bytes(img_bytes: bytes):
    t0 = time.time()
    result, _ = engine(img_bytes)
    cost = round(time.time() - t0, 2)
    lines, detail = [], []
    if result:
        for box, text, score in result:
            lines.append(text)
            detail.append({
                "text": text,
                "score": round(float(score), 3),
                "box": box
            })
    return {
        "success": True,
        "lines": lines,
        "detail": detail,
        "elapse": f"{cost}s"
    }

# ===== 接口 =====

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ocr/base64")
def ocr_base64(
    req: OCRRequest,
    x_api_key: str = Header(None, alias="X-API-Key")
):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="invalid api key")
    try:
        b64 = req.image_base64
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        return ocr_bytes(base64.b64decode(b64))
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/ocr/batch")
def ocr_batch(
    req: BatchOCRRequest,
    x_api_key: str = Header(None, alias="X-API-Key")
):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="invalid api key")

    results = []
    for i, b64 in enumerate(req.images):
        try:
            img_b64 = b64
            if "," in img_b64:
                img_b64 = img_b64.split(",", 1)[1]
            img_bytes = base64.b64decode(img_b64)
            result = ocr_bytes(img_bytes)
            result["index"] = i
            results.append(result)
        except Exception as e:
            results.append({
                "index": i,
                "success": False,
                "error": str(e),
                "lines": [],
                "detail": [],
                "elapse": "0s"
            })
    return {
        "success": True,
        "count": len(results),
        "results": results
    }