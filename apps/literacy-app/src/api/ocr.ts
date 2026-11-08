// api/ocr.js
import { request } from './request.js'

export function ocrSingle(imageBase64) {
	return request({
		url: '/ocr/single',
		method: 'POST',
		data: { image_base64: imageBase64 },
	})
}

export function ocrBatch(images) {
	return request({
		url: '/ocr/batch',
		method: 'POST',
		data: { images },
		timeout: 180000,   // 批量识别给长一点
	})
}