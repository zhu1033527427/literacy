import {
	BASE_URL,
	API_KEY
} from '@literacy/shared-config'

export function request(options) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: BASE_URL + options.url,
			method: options.method || 'GET',
			data: options.data || {},
			// 关键：默认 60s 不够，识字接口给 180s
			timeout: options.timeout || 180000,
			header: {
				'Content-Type': 'application/json',
				'X-API-Key': API_KEY,
				...options.header,
			},
			success: (res) => {
				if (res.statusCode === 403) {
					uni.showToast({
						title: 'API Key 无效',
						icon: 'none'
					})
					reject(res)
					return
				}
				resolve(res.data)
			},
			fail: (err) => {
				// 把 uni 的 errMsg 转成可读信息，避免裸露的 errMsg
				const msg = err && err.errMsg && err.errMsg.includes('timeout') ?
					'请求超时，模型可能还在生成，请重试' :
					(err && err.errMsg) || '网络请求失败'
				reject(new Error(msg))
			},
		})
	})
}