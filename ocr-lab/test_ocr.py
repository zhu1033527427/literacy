from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()


def main():
    img_path = "test.jpg"
    result, elapse = engine(img_path)

    # elapse 可能是 list 也可能是 float，统一处理
    if isinstance(elapse, list):
        total = sum(elapse)
        print(f"耗时: {total:.2f}s (各阶段: {elapse})")
    else:
        print(f"耗时: {elapse:.2f}s")

    if not result:
        print("没识别到文字")
        return

    for box, text, score in result:
        print(f"{text}\t置信度:{score:.2f}")


if __name__ == "__main__":
    main()
