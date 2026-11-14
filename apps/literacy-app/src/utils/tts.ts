import type { RecordRecognitionManager, WechatSI } from '@/types/plugin'
let currentAudio: UniApp.InnerAudioContext | null = null

let manager: RecordRecognitionManager | null = null

export function getRecordManager(): RecordRecognitionManager {
	if (!manager) {
		const plugin = requirePlugin('WechatSI') as WechatSI
		manager = plugin.getRecordRecognitionManager()
	}
	return manager
}

export function textToSpeech(content: string): Promise<string> {
	const plugin = requirePlugin('WechatSI') as WechatSI
	return new Promise((resolve, reject) => {
		plugin.textToSpeech({
			content,
			lang: 'zh_CN',
			success(res) {
				resolve(res.filename)
			},
			fail(err) {
				reject(err)
			},
		})
	})
}

export const speakText = async (content: string) => {

	const filename = await textToSpeech(content)

	const audio = uni.createInnerAudioContext()
	audio.src = filename

	// 监听错误
	audio.onError((err) => {
		console.error('[TTS] 音频播放错误:', err)
	})

	audio.onEnded(() => {
		console.log('[TTS] 播放结束')
	})

	audio.play()
	currentAudio = audio
	return audio
}