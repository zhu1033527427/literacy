#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
拼音注音数据校验与转换工具（整合版）

用法:
    python pinyin_annotate.py check     data.json
    python pinyin_annotate.py suggest   data.json -o suggestions.txt
    python pinyin_annotate.py convert   data.json -o data_annotated.json [--overrides overrides.json]
    python pinyin_annotate.py validate  data_annotated.json [--allow-multi]

数据格式:
    输入: 汉字 -> { 拼音: [释义...] }
    输出: 汉字 -> { 拼音_注音字: [释义...] }

overrides.json 格式（可选）:
    {
        "zhǒng": "肿",
        "丁|dīng": "叮",
        "南|nā": "南无"
    }
"""

import sys
import csv
import json
import argparse
from collections import defaultdict
from functools import lru_cache

try:
    from pypinyin import pinyin as py_pinyin, Style
except ImportError:
    sys.exit("缺少依赖：pip install pypinyin")


# ---------- 拼音规范化 ----------

TONE_MARKS = {
    "a": "āáǎà", "o": "ōóǒò", "e": "ēéěè",
    "i": "īíǐì", "u": "ūúǔù", "ü": "ǖǘǚǜ",
}


def normalize_pinyin(p: str) -> str:
    """zhong3 -> zhǒng；zhēng 原样返回；lv4 -> lǜ"""
    p = p.strip().lower().replace("v", "ü")
    if any(ch in p for marks in TONE_MARKS.values() for ch in marks):
        return p
    if not p or p[-1] not in "012345":
        return p
    tone = int(p[-1])
    syllable = p[:-1]
    if tone in (0, 5):
        return syllable
    idx = -1
    if "a" in syllable:
        idx = syllable.index("a")
    elif "o" in syllable:
        idx = syllable.index("o")
    elif "e" in syllable:
        idx = syllable.index("e")
    elif "iu" in syllable:
        idx = syllable.index("iu") + 1
    elif "ui" in syllable:
        idx = syllable.index("ui")
    else:
        for i in range(len(syllable) - 1, -1, -1):
            if syllable[i] in "iuü":
                idx = i
                break
    if idx == -1:
        return syllable
    return syllable[:idx] + TONE_MARKS[syllable[idx]][tone - 1] + syllable[idx + 1:]


# ---------- 汉字读音 ----------

@lru_cache(maxsize=65536)
def char_readings(char: str) -> tuple:
    """所有读音（heteronym=True）"""
    try:
        return tuple(py_pinyin(char, style=Style.TONE, heteronym=True)[0])
    except Exception:
        return ()


@lru_cache(maxsize=65536)
def char_primary_reading(char: str) -> str:
    """pypinyin 默认读音（注意：不保证是 TTS 的常用音）"""
    try:
        r = py_pinyin(char, style=Style.TONE, heteronym=False)[0]
        return r[0] if r else ""
    except Exception:
        return ""


def is_single_reading(char: str, target: str) -> bool:
    """严格单音字且等于 target"""
    r = char_readings(char)
    return len(r) == 1 and r[0] == target


def is_primary_reading(char: str, target: str) -> bool:
    """多音字，pypinyin 默认音匹配（相对安全）"""
    return char_primary_reading(char) == target


def is_readable_by_char(char: str, target: str) -> bool:
    """目标音在该字的所有读音里（可降级，但 TTS 可能读错）"""
    return target in char_readings(char)


def is_acceptable_speaker(char: str, target: str) -> bool:
    return is_single_reading(char, target) or is_primary_reading(char, target)


def split_key(key: str):
    """dīng_钉 -> ('dīng','钉')；dīng -> ('dīng', None)"""
    if "_" in key:
        p, c = key.rsplit("_", 1)
        return normalize_pinyin(p), c
    return normalize_pinyin(key), None


# ---------- 数据 IO ----------

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def build_reverse_index(data):
    idx = defaultdict(set)
    for char, pinyin_map in data.items():
        for key in pinyin_map:
            p, _ = split_key(key)
            idx[p].add(char)
    return idx


def get_override(overrides, char, pinyin):
    if f"{char}|{pinyin}" in overrides:
        return overrides[f"{char}|{pinyin}"]
    if pinyin in overrides:
        return overrides[pinyin]
    return None


# ---------- 子命令 ----------

def cmd_check(args):
    data = load_json(args.input)
    total = ok = 0
    no_speaker, bad_speaker, fallback = [], [], []

    for char, pinyin_map in data.items():
        for key in pinyin_map:
            total += 1
            p, speaker = split_key(key)
            if speaker is None:
                no_speaker.append((char, p))
            elif speaker == "??":
                bad_speaker.append((char, p, "未解决", ()))
            elif is_single_reading(speaker, p):
                ok += 1
            elif is_primary_reading(speaker, p):
                fallback.append((char, p, speaker, char_readings(speaker)))
            else:
                bad_speaker.append((char, p, speaker, char_readings(speaker)))

    print(f"总条目: {total}   合格(单音): {ok}   多音降级: {len(fallback)}")

    if total and len(no_speaker) > total * 0.5:
        print(f"\n⚠ {len(no_speaker)}/{total} 条缺少注音字 —— 数据尚未转换。")
        print("  请先运行:  python pinyin_annotate.py convert <input> -o <output>")
        return

    if no_speaker:
        print(f"\n⚠ 缺少注音字: {len(no_speaker)}")
        for c, p in no_speaker[:20]:
            print(f"   {c} -> {p}")
        if len(no_speaker) > 20:
            print(f"   ... 还有 {len(no_speaker) - 20} 个")

    if fallback:
        print(f"\n🔸 多音降级: {len(fallback)}")
        for c, p, s, r in fallback[:20]:
            print(f"   {c} -> {p}_{s}  (读音: {r})")
        if len(fallback) > 20:
            print(f"   ... 还有 {len(fallback) - 20} 个")

    if bad_speaker:
        print(f"\n❌ 注音字不合格: {len(bad_speaker)}")
        for c, p, s, r in bad_speaker[:30]:
            print(f"   {c} -> {p}_{s}  (读音: {r})")
        if len(bad_speaker) > 30:
            print(f"   ... 还有 {len(bad_speaker) - 30} 个")

    if not no_speaker and not bad_speaker and not fallback:
        print("\n🎉 数据完整")


def cmd_suggest(args):
    data = load_json(args.input)
    idx = build_reverse_index(data)
    lines = []
    for p in sorted(idx.keys()):
        single, primary, multi = [], [], []
        for c in idx[p]:
            if is_single_reading(c, p):
                single.append(c)
            elif is_primary_reading(c, p):
                primary.append(c)
            else:
                multi.append(c)
        parts = []
        if single:  parts.append(f"单音 {' '.join(single)}")
        if primary: parts.append(f"多音降级 {' '.join(primary)}")
        if multi:   parts.append(f"仅多音 {' '.join(multi)}")
        tag = "  " if single else ("🔸" if primary else "⚠ ")
        lines.append(f"{tag}{p}: {'  |  '.join(parts)}")
    text = "\n".join(lines)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"已写入 {args.output}（{len(lines)} 条）")
    else:
        print(text)


def _write_csv(path, rows, header):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def cmd_convert(args):
    data = load_json(args.input)
    overrides = load_json(args.overrides) if args.overrides else {}
    idx = build_reverse_index(data)

    new_data = {}
    unresolved, safe, risky, auto_filled = [], [], [], []

    for char, pinyin_map in data.items():
        new_map = {}
        for key, defs in pinyin_map.items():
            p, existing = split_key(key)

            # 1) 已有合格单音注音字
            if existing and is_single_reading(existing, p):
                speaker = existing
            else:
                # 2) overrides
                speaker = get_override(overrides, char, p)
                # 3) 原字单音
                if speaker is None and is_single_reading(char, p):
                    speaker = char
                # 4) 原字多音，pypinyin 默认音匹配 -> 安全降级
                if speaker is None and is_primary_reading(char, p):
                    speaker = char
                    safe.append((char, p, "|".join(char_readings(char))))
                # 5) 原字多音，目标音在字读音里 -> 危险降级
                if speaker is None and is_readable_by_char(char, p):
                    speaker = char
                    risky.append((char, p, "|".join(char_readings(char)),
                                  char_primary_reading(char)))
                # 6) 同音候选单音字
                if speaker is None:
                    cands = sorted(c for c in idx[p] if is_single_reading(c, p))
                    if cands:
                        speaker = cands[0]
                        auto_filled.append((char, p, speaker, "同音单音字"))
                # 7) 同音候选任意可读字
                if speaker is None:
                    cands = sorted(c for c in idx[p] if is_readable_by_char(c, p))
                    if cands:
                        speaker = cands[0]
                        auto_filled.append((char, p, speaker, "同音可读字"))
                # 8) 真无解
                if speaker is None:
                    unresolved.append((char, p))
                    new_map[f"{p}_??"] = defs
                    continue

            new_map[f"{p}_{speaker}"] = defs
        new_data[char] = new_map

    save_json(args.output, new_data)
    base = args.output.rsplit(".", 1)[0]

    if safe:
        _write_csv(base + "_safe.csv", sorted(safe),
                   ["原字", "目标拼音", "该字所有读音"])
    if risky:
        _write_csv(base + "_risky.csv", sorted(risky),
                   ["原字", "目标拼音", "该字所有读音", "pypinyin默认读音"])
    if unresolved:
        _write_csv(base + "_unresolved.csv", sorted(unresolved),
                   ["原字", "目标拼音"])
    if auto_filled:
        _write_csv(base + "_autofilled.csv", sorted(auto_filled),
                   ["原字", "目标拼音", "注音字", "来源"])

    print(f"已写出 {args.output}")
    print(f"  ✅ 安全降级（原字，默认音匹配）: {len(safe)}")
    print(f"  🔸 危险降级（原字，非默认音）  : {len(risky)}"
          f"  -> {base}_risky.csv")
    print(f"  🤖 同音字填充                  : {len(auto_filled)}"
          f"  -> {base}_autofilled.csv")
    print(f"  ⚠ 真无解（读音不在字里）      : {len(unresolved)}"
          f"  -> {base}_unresolved.csv")


def cmd_validate(args):
    data = load_json(args.input)
    bad, fallback = [], []
    for char, pinyin_map in data.items():
        for key in pinyin_map:
            p, speaker = split_key(key)
            if speaker is None:
                bad.append((char, key, "缺少注音字"))
            elif speaker == "??":
                bad.append((char, key, "未解决"))
            elif is_single_reading(speaker, p):
                pass
            elif args.allow_multi and is_readable_by_char(speaker, p):
                fallback.append((char, key))
            else:
                bad.append((char, key, f"读音: {char_readings(speaker)}"))

    if fallback:
        print(f"🔸 多音降级 {len(fallback)} 条（--allow-multi 已放行，"
              f"其中非默认音有风险，建议抽查）")
    if bad:
        print(f"❌ {len(bad)} 个问题:")
        for char, key, msg in bad:
            print(f"   {char} -> {key}: {msg}")
        sys.exit(1)
    print("✅ 全部通过")


# ---------- CLI ----------

def main():
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="拼音注音数据校验与转换")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("check", help="检查现有 key 的注音字")
    p.add_argument("input")

    p = sub.add_parser("suggest", help="为每个拼音列出候选注音字")
    p.add_argument("input")
    p.add_argument("-o", "--output")

    p = sub.add_parser("convert", help="把 拼音 转成 拼音_注音字")
    p.add_argument("input")
    p.add_argument("-o", "--output", required=True)
    p.add_argument("--overrides")

    p = sub.add_parser("validate", help="最终校验输出数据")
    p.add_argument("input")
    p.add_argument("--allow-multi", action="store_true",
                   help="放行'读音包含目标音'的降级条目，并列出清单")

    args = parser.parse_args()
    {"check": cmd_check, "suggest": cmd_suggest,
     "convert": cmd_convert, "validate": cmd_validate}[args.cmd](args)


if __name__ == "__main__":
    main()