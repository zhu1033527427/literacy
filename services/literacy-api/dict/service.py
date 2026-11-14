import json
import os
from pathlib import Path

_DATA: dict = {}
_CHAR_LIST: list = []

def load_dict():
    global _DATA, _CHAR_LIST
    data_path = Path(__file__).parent / "data" / "chars.json"
    if not data_path.exists():
        raise RuntimeError(f"字典文件不存在: {data_path}")
    with open(data_path, "r", encoding="utf-8") as f:
        _DATA = json.load(f)
    _CHAR_LIST = sorted(_DATA.keys())
    print(f"✅ 字典加载完成: {len(_CHAR_LIST)} 个字")

def get_char_detail(char: str):
    """查单个字详情"""
    if char not in _DATA:
        return {"char": char, "found": False, "entries": []}
    raw = _DATA[char]
    entries = [{"pinyin": p, "meanings": m} for p, m in raw.items()]
    total = sum(len(v) for v in raw.values())
    return {
        "char": char,
        "found": True,
        "entries": entries,
        "total_meanings": total,
    }

def get_chars_batch(chars_str: str):
    """批量查字"""
    keys = [c.strip() for c in chars_str.split(",") if c.strip()]
    result = {}
    missing = []
    for k in keys:
        if k in _DATA:
            raw = _DATA[k]
            result[k] = {
                "entries": [{"pinyin": p, "meanings": m} for p, m in raw.items()],
                "total_meanings": sum(len(v) for v in raw.values()),
            }
        else:
            missing.append(k)
    return {"found": result, "missing": missing}

def search_dict(q: str, limit: int = 20):
    """按拼音或释义搜索"""
    q_lower = q.lower()
    results = []
    for char, raw in _DATA.items():
        for pinyin, meanings in raw.items():
            if q_lower in pinyin.lower():
                results.append({
                    "char": char,
                    "pinyin": pinyin,
                    "meanings": meanings[:3],
                })
                break
            for m in meanings:
                if q_lower in m.lower():
                    results.append({
                        "char": char,
                        "pinyin": pinyin,
                        "matched_meaning": m,
                    })
                    break
            if len(results) >= limit:
                break
        if len(results) >= limit:
            break
    return {"total": len(results), "results": results}

def list_all_chars(page: int = 1, page_size: int = 50):
    """分页列表"""
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "total": len(_CHAR_LIST),
        "page": page,
        "page_size": page_size,
        "chars": _CHAR_LIST[start:end],
    }

def get_version():
    """字典版本信息"""
    data_path = Path(__file__).parent / "data" / "chars.json"
    stat = os.stat(data_path)
    return {
        "count": len(_CHAR_LIST),
        "mtime": int(stat.st_mtime),
        "etag": f"{len(_CHAR_LIST)}-{int(stat.st_mtime)}",
    }