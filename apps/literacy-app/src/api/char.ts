// api/char.js
import { request } from './request.ts'

/**
 * 查询汉字的识字信息
 * @param {string} char 单个汉字
 * @returns {Promise<Object>} 结构化识字 JSON
 */
export async function getCharInfo(char) {
	if (!char || char.length > 2) {
		throw new Error('请输入 1~2 个汉字')
	}
	return request({
		url: '/char-info',
		method: 'POST',
		data: { char },
		timeout: 180000,
	})
}