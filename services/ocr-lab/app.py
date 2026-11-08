from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from contextlib import asynccontextmanager
import os, base64, time, sys, json
import httpx

# ============================================================
# ===== 鉴权 =====
# ============================================================
API_KEY = os.environ.get("API_KEY")
if not API_KEY:
    print("❌ 未设置 API_KEY 环境变量，服务拒绝启动")
    sys.exit(1)

# ============================================================
# ===== Ollama 配置 =====
# ============================================================
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL   = os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b")
OLLAMA_TIMEOUT  = float(os.environ.get("OLLAMA_TIMEOUT", "300"))

_ollama_client: Optional[httpx.AsyncClient] = None

# ============================================================
# ===== 生命周期 =====
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _ollama_client
    _ollama_client = httpx.AsyncClient(
        base_url=OLLAMA_BASE_URL,
        timeout=OLLAMA_TIMEOUT,
    )
    print(f"✅ Ollama client 初始化完成 → {OLLAMA_BASE_URL}，默认模型：{DEFAULT_MODEL}")
    try:
        yield
    finally:
        if _ollama_client is not None:
            await _ollama_client.aclose()
            _ollama_client = None

app = FastAPI(title="OCR + 识字 Service", lifespan=lifespan)

# ============================================================
# ===== CORS =====
# ============================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# ===== OCR 引擎 =====
# ============================================================
from rapidocr_onnxruntime import RapidOCR
engine = RapidOCR(params={"use_cls": False, "Global.max_side_len": 1200})

# ============================================================
# ===== OCR 数据模型 =====
# ============================================================
class OCRRequest(BaseModel):
    image_base64: str

class BatchOCRRequest(BaseModel):
    images: List[str]

# ============================================================
# ===== OCR 工具函数 =====
# ============================================================
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

# ============================================================
# ===== OCR 接口 =====
# ============================================================

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ocr/single")
def ocr_single(
    req: OCRRequest,
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    单张图片 OCR 识别
    接收 base64 编码的图片，返回识别结果
    """
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="invalid api key")

    try:
        b64 = req.image_base64
        if "," in b64:
            b64 = b64.split(",", 1)[1]

        img_bytes = base64.b64decode(b64)
        result = ocr_bytes(img_bytes)
        result["index"] = 0
        return result
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "lines": [],
            "detail": [],
            "elapse": "0s"
        }

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

# ============================================================
# ===== 识字助手（qwen2.5:1.5b） =====
# ============================================================
CHAR_SYSTEM_PROMPT = """你是一名面向6-8岁儿童的小学语文识字老师。你的任务是严格按JSON格式输出指定汉字的学习内容。

【硬性规则——违反任何一条即为失败】
1. 只输出一个JSON对象，不添加解释、前缀、后缀或Markdown代码块。
2. "words" 中的词语必须同时满足：
   - 是日常生活或教材中常见的普通名词/动词/形容词；
   - 不得包含动画片名、品牌名、网络流行语、专有名词（如“熊出没”禁止使用）；
   - 不得带有贬义、歧视、暴力或负面评价色彩（如“熊孩子”禁止使用）；
   - 每个词语的笔画和含义适合6-8岁儿童理解。
3. "sentences" 中的句子必须同时满足：
   - 场景限于家庭、学校、公园、自然等儿童熟悉的环境；
   - 语气积极或中性，禁止出现“应该…”“不许…”“听话”等说教式表达；
   - 句子长度不超过15个字；
   - 目标汉字必须出现在句子中，且句子中其他汉字的难度不高于小学二年级水平。

【负向示例——以下输出会被直接拒绝】
- 组词："熊出没"（专有名词）、"熊孩子"（贬义标签）
- 造句："熊孩子应该听话"（说教、负面预设）

【正确示例】
输入：拼
输出：{"char":"拼","pinyin":"pīn","words":["拼音","拼图"],"sentences":["我在用拼音读故事。"]}"""

class CharReq(BaseModel):
    char: str = Field(..., min_length=1, max_length=2, description="要查询的汉字")

def _require_key(x_api_key: Optional[str]):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="invalid api key")

async def ask_ollama_char(char: str) -> dict:
    """调用 Ollama 获取汉字结构化信息"""
    prompt = f"请处理汉字：{char}"
    payload = {
        "model": DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": CHAR_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_ctx": 2048,
            "num_gpu": 0,   # 强制 CPU，规避本机 CUDA 兼容问题
        },
    }
    r = await _ollama_client.post("/api/chat", json=payload)
    r.raise_for_status()
    content = r.json()["message"]["content"]

    start, end = content.find("{"), content.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise HTTPException(
            status_code=502,
            detail=f"模型未返回合法 JSON：{content!r}",
        )
    try:
        return json.loads(content[start:end + 1])
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"JSON 解析失败：{e}；模型原始输出：{content!r}",
        )

@app.get("/char/health")
async def char_health():
    if _ollama_client is None:
        raise HTTPException(status_code=503, detail="ollama client not initialized")
    try:
        r = await _ollama_client.get("/api/tags")
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        return {"status": "ok", "ollama": OLLAMA_BASE_URL, "models": models}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Ollama 不可用: {e}")

@app.post("/char-info")
async def char_info(
    req: CharReq,
    x_api_key: str = Header(None, alias="X-API-Key"),
):
    """你是一个小学语文识字助手。
    输入一个汉字，严格只输出JSON：
    {
      "char": "拼",
      "pinyin": "pīn",
      "words": ["拼音", "拼凑"],
      "sentences": ["我最近在学习拼音字母"]
    }"""
    _require_key(x_api_key)
    if _ollama_client is None:
        raise HTTPException(status_code=503, detail="ollama client not initialized")

    try:
        return await ask_ollama_char(req.char)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"请求 Ollama 失败: {e}")