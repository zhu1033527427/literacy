// api/ocr.js
import { request } from './request.js'
import { OCRRequest, BatchOCRRequest, OCRResult, BatchOCRResponse } from '@literacy/shared-types'

export function ocrSingle(imageBase64: OCRRequest['image_base64']): Promise<OCRResult> {
	return request({
		url: '/ocr/single',
		method: 'POST',
		data: { image_base64: imageBase64 },
	})
}

export function ocrBatch(images: BatchOCRRequest['images']): Promise<BatchOCRResponse> {
	return request({
		url: '/ocr/batch',
		method: 'POST',
		data: { images },
		timeout: 180000,   // 批量识别给长一点
	})
}