import {
	BASE_URL,
	API_KEY
} from '@literacy/shared-config'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'TRACE' | 'CONNECT'

export function request<T = unknown>(options: {
	url: string
	method?: HttpMethod
	data?: any
	timeout?: number
	header?: Record<string, string>
}): Promise<T> {
	return new Promise((resolve, reject) => {
		uni.request({
			url: BASE_URL + options.url,
			method: options.method || 'GET',
			data: options.data || {},
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
					reject(new Error('API Key 无效'))
					return
				}
				resolve(res.data as T)
			},
			fail: (err) => {
				reject(new Error(err.errMsg || '网络请求失败'))
			},
		})
	})
}