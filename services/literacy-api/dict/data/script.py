import json
import re
from collections import Counter
from pypinyin import pinyin, Style

# ============================================================
# 第一部分：生成字频数据（如果你已经有字频文件，可以直接跳过）
# ============================================================

def generate_char_freq_from_text(text_path='corpus.txt'):
    """
    从纯文本语料生成字频字典
    返回：{字: 出现次数}
    """
    try:
        with open(text_path, 'r', encoding='utf-8') as f:
            text = f.read()
    except FileNotFoundError:
        print(f"⚠️ 未找到 {text_path}，使用内置备用字频")
        return None
    
    # 只统计汉字
    chars = [ch for ch in text if '\u4e00' <= ch <= '\u9fff']
    freq = Counter(chars)
    return dict(freq)


def load_existing_freq(freq_path='char_freq.json'):
    """加载已有的字频 JSON 文件"""
    try:
        with open(freq_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def get_char_freq():
    """获取字频数据，优先从已有文件加载"""
    # 1. 尝试加载已有字频文件
    freq = load_existing_freq('char_freq.json')
    if freq:
        print("✅ 已加载现有字频文件 char_freq.json")
        return freq
    
    # 2. 尝试从语料生成
    freq = generate_char_freq_from_text('corpus.txt')
    if freq:
        # 保存一份
        with open('char_freq.json', 'w', encoding='utf-8') as f:
            json.dump(freq, f, ensure_ascii=False, indent=2)
        print("✅ 已从 corpus.txt 生成字频并保存")
        return freq
    
    # 3. 使用内置备用字频（基于《通用规范汉字表》一级字的大致频率）
    print("⚠️ 未找到语料或字频文件，使用内置备用字频")
    return get_default_freq()


def get_default_freq():
    """内置备用字频（前500高频字的近似排名倒序作为频率）"""
    # 这是根据现代汉语语料库整理的约300个最常用字
    common_chars = (
        "的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞"
    )
    return {ch: 10000 - i for i, ch in enumerate(common_chars)}


# ============================================================
# 第二部分：建立拼音索引
# ============================================================

def build_pinyin_index(char_freq):
    """
    对字频表中的每个字标注拼音，建立 {拼音: [(字, 频率)]}
    """
    pinyin_dict = {}
    
    for char, freq in char_freq.items():
        try:
            py = pinyin(char, style=Style.TONE)[0][0]
        except Exception:
            continue
        
        if py not in pinyin_dict:
            pinyin_dict[py] = []
        pinyin_dict[py].append((char, freq))
    
    # 按频率降序排列
    for py in pinyin_dict:
        pinyin_dict[py].sort(key=lambda x: -x[1])
    
    return pinyin_dict


# ============================================================
# 第三部分：核心处理逻辑
# ============================================================

def process_data_with_freq(input_data, pinyin_index, char_freq):
    """
    使用字频数据来处理多音字匹配
    """
    # 第一步：找出所有单音字
    single_tone_chars = {}
    
    for char, readings in input_data.items():
        if len(readings) == 1:
            pinyin = list(readings.keys())[0]
            if pinyin not in single_tone_chars:
                single_tone_chars[pinyin] = []
            single_tone_chars[pinyin].append(char)
    
    # 第二步：构建输出数据
    output_data = {}
    fallback_records = []  # 记录用自身兜底的情况
    freq_match_records = []  # 记录从多音字中选最高频的情况
    
    for char, readings in input_data.items():
        output_data[char] = {}
        
        for pinyin, value in readings.items():
            # 情况1：有单音字匹配
            if pinyin in single_tone_chars and single_tone_chars[pinyin]:
                candidates = [c for c in single_tone_chars[pinyin] if c != char]
                if candidates:
                    # 从单音字中选频率最高的
                    best = max(candidates, key=lambda c: char_freq.get(c, 0))
                    new_key = f"{pinyin}|{best}"
                else:
                    # 单音字只有自己，用自身
                    new_key = f"{pinyin}|{char}"
            
            # 情况2：没有单音字，从所有同音字中选频率最高的
            elif pinyin in pinyin_index:
                # 排除自身，选频率最高的同音字
                candidates = [c for c, _ in pinyin_index[pinyin] if c != char]
                if candidates:
                    best = max(candidates, key=lambda c: char_freq.get(c, 0))
                    new_key = f"{pinyin}|{best}"
                    freq_match_records.append({
                        "字": char,
                        "拼音": pinyin,
                        "匹配字": best,
                        "字频": char_freq.get(best, 0)
                    })
                else:
                    new_key = f"{pinyin}|{char}"
                    fallback_records.append({
                        "字": char,
                        "拼音": pinyin,
                        "原因": "无任何同音字"
                    })
            
            # 情况3：完全找不到
            else:
                new_key = f"{pinyin}|{char}"
                fallback_records.append({
                    "字": char,
                    "拼音": pinyin,
                    "原因": f"拼音 '{pinyin}' 不在字频索引中"
                })
            
            output_data[char][new_key] = value
    
    return output_data, fallback_records, freq_match_records


# ============================================================
# 主程序
# ============================================================

def main():
    # 1. 获取字频数据
    print("📊 正在准备字频数据...")
    char_freq = get_char_freq()
    print(f"   共 {len(char_freq)} 个字")
    
    # 2. 建立拼音索引
    print("🔤 正在建立拼音索引...")
    pinyin_index = build_pinyin_index(char_freq)
    print(f"   共 {len(pinyin_index)} 个不同拼音")
    
    # 3. 读取输入数据
    print("📖 正在读取 input.json...")
    with open('/Users/yona/code/yona/literacy/services/literacy-api/dict/data/chars.json', 'r', encoding='utf-8') as f:
        input_data = json.load(f)
    print(f"   共 {len(input_data)} 个字")
    
    # 4. 处理数据
    print("⚙️  正在处理数据...")
    result, fallback, freq_matches = process_data_with_freq(
        input_data, pinyin_index, char_freq
    )
    
    # 5. 保存结果
    with open('/Users/yona/code/yona/literacy/services/literacy-api/dict/data/output.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("✅ 结果已保存到 output.json")
    
    # 6. 保存日志
    if fallback:
        with open('/Users/yona/code/yona/literacy/services/literacy-api/dict/data/fallback_log.json', 'w', encoding='utf-8') as f:
            json.dump(fallback, f, ensure_ascii=False, indent=2)
        print(f"⚠️  有 {len(fallback)} 个用自身兜底，已保存到 fallback_log.json")
    
    if freq_matches:
        with open('/Users/yona/code/yona/literacy/services/literacy-api/dict/data/freq_match_log.json', 'w', encoding='utf-8') as f:
            json.dump(freq_matches, f, ensure_ascii=False, indent=2)
        print(f"📝 有 {len(freq_matches)} 个从多音字中选高频字，已保存到 freq_match_log.json")
    
    # 7. 输出摘要
    print("\n📋 处理摘要：")
    total_keys = sum(len(v) for v in result.values())
    print(f"   总条目数：{total_keys}")
    print(f"   自身兜底：{len(fallback)}")
    print(f"   多音字匹配：{len(freq_matches)}")


if __name__ == '__main__':
    main()