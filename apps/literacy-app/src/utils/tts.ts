/**
 * 三端统一语音工具 - 最终版
 * - TTS：文本转语音（朗读）
 * - ASR：语音识别（听写）
 *
 * 微信小程序 → WechatSI 0.3.10（textToSpeech + innerAudioContext）
 * H5 / App   → Web Speech API
 */

// ==================== 类型定义 ====================

type SpeakOptions = {
	rate ?: number      // 语速 0.1~2，默认 1
	pitch ?: number     // 音调 0~2，默认 1
	volume ?: number    // 音量 0~1，默认 1
}

type ASRCallbacks = {
	onStart ?: () => void
	onRecognizing ?: (text : string) => void
	onFinish ?: (result : { text : string }) => void
	onError ?: (err : any) => void
	onStop ?: () => void
}

// ==================== 内部状态 ====================

let _speaking = false
let _listening = false
let _queue : string[] = []          // 待播放队列
let _isPlayingQueue = false        // 是否正在播放队列
let _currentAudio : any = null      // 微信小程序的 InnerAudioContext 实例
let _asrManager : any = null

// ==================== 语音合成（TTS） ====================

export function speak(
	text : string,
	options : SpeakOptions = {}
) : Promise<void> {
	return new Promise((resolve, reject) => {
		if (!text) {
			reject(new Error('speak: text is empty'))
			return
		}

		// #ifdef H5 || APP-PLUS
		// ---------- H5 / App：浏览器原生语音 ----------
		try {
			if (window.speechSynthesis.speaking) {
				window.speechSynthesis.cancel()
			}

			const utterance = new SpeechSynthesisUtterance(text)
			utterance.lang = 'zh-CN'
			utterance.rate = options.rate ?? 1
			utterance.pitch = options.pitch ?? 1
			utterance.volume = options.volume ?? 1

			utterance.onstart = () => { _speaking = true }
			utterance.onend = () => { _speaking = false; resolve() }
			utterance.onerror = (e) => { _speaking = false; reject(e) }

			window.speechSynthesis.speak(utterance)
		} catch (e) {
			_speaking = false
			reject(e)
		}
		// #endif

		// #ifdef MP-WEIXIN
		// ---------- 微信小程序：WechatSI 0.3.10 ----------
		try {
			const plugin = requirePlugin('WechatSI')
			if (!plugin || typeof plugin.textToSpeech !== 'function') {
				reject(new Error('WechatSI plugin not available'))
				return
			}

			_speaking = true
			let settled = false  // 🔥 防重复锁

			plugin.textToSpeech({
				lang: 'zh_CN',
				tts: true,
				content: text,
				success: (res : any) => {
					if (settled) return
					settled = true

					// 停止上一个音频
					if (_currentAudio) {
						_currentAudio.destroy()
					}

					const audio = wx.createInnerAudioContext()
					_currentAudio = audio
					audio.src = res.filename
					audio.autoplay = true

					audio.onEnded = () => {
						_speaking = false
						_currentAudio = null
						resolve()
					}

					audio.onError = (err : any) => {
						_speaking = false
						_currentAudio = null
						reject(err)
					}

					audio.play()
				},
				fail: (err : any) => {
					if (settled) return
					settled = true
					_speaking = false
					reject(err)
				},
				complete: () => {
					// complete 不做任何操作
				}
			})
		} catch (e) {
			_speaking = false
			reject(e)
		}
		// #endif
	})
}

/**
 * 朗读一组文本（按顺序播报，带队列控制）
 * @param texts 文本数组
 * @param options 可选参数
 */
export async function speakSequence(
	texts : string[],
	options : SpeakOptions = {}
) : Promise<void> {
	// 清空当前队列
	_queue = []
	_isPlayingQueue = false

	// 如果正在播放，先停止
	if (_speaking) {
		stopSpeak()
		await new Promise(resolve => setTimeout(resolve, 200))
	}

	_queue = [...texts]
	_isPlayingQueue = true

	for (const text of _queue) {
		if (!_isPlayingQueue) break  // 外部调用了 stopSpeak
		await speak(text, options)
	}

	_isPlayingQueue = false
	_queue = []
}

/**
 * 停止所有朗读
 */
export function stopSpeak() : void {
	// #ifdef H5 || APP-PLUS
	if (window.speechSynthesis) {
		window.speechSynthesis.cancel()
	}
	// #endif

	// #ifdef MP-WEIXIN
	try {
		if (_currentAudio) {
			_currentAudio.stop()
			_currentAudio.destroy()
			_currentAudio = null
		}
	} catch (_) { }
	// #endif

	_speaking = false
	_isPlayingQueue = false
	_queue = []
}

/**
 * 是否正在朗读
 */
export function isSpeaking() : boolean {
	return _speaking
}

// ==================== 语音识别（ASR） ====================

/**
 * 开始语音识别（听写）
 * @param callbacks 回调对象
 */
export function startListening(callbacks : ASRCallbacks) : void {
	if (_listening) {
		callbacks.onError?.(new Error('already listening'))
		return
	}

	// #ifdef H5 || APP-PLUS
	// ---------- H5 / App：浏览器语音识别 ----------
	try {
		const SpeechRecognition =
			(window as any).SpeechRecognition ||
			(window as any).webkitSpeechRecognition

		if (!SpeechRecognition) {
			callbacks.onError?.(new Error('浏览器不支持语音识别，请使用 Chrome 或 Edge'))
			return
		}

		const recognition = new SpeechRecognition()
		recognition.lang = 'zh-CN'
		recognition.continuous = true
		recognition.interimResults = true

		recognition.onstart = () => {
			_listening = true
			callbacks.onStart?.()
		}

		recognition.onresult = (event : any) => {
			let interimText = ''
			let finalText = ''

			for (let i = event.resultIndex; i < event.results.length; i++) {
				const transcript = event.results[i][0].transcript
				if (event.results[i].isFinal) {
					finalText += transcript
				} else {
					interimText += transcript
				}
			}

			if (finalText) {
				callbacks.onFinish?.({ text: finalText })
			} else if (interimText) {
				callbacks.onRecognizing?.(interimText)
			}
		}

		recognition.onerror = (event : any) => {
			_listening = false
			callbacks.onError?.(event.error || 'unknown error')
		}

		recognition.onend = () => {
			_listening = false
			callbacks.onStop?.()
		}

			; (window as any).__recognitionInstance = recognition
		recognition.start()
	} catch (e) {
		_listening = false
		callbacks.onError?.(e)
	}
	// #endif

	// #ifdef MP-WEIXIN
	// ---------- 微信小程序：WechatSI 0.3.10 ----------
	try {
		const plugin = requirePlugin('WechatSI')
		if (!plugin || typeof plugin.createRecordRecognitionManager !== 'function') {
			callbacks.onError?.(new Error('WechatSI ASR not available'))
			return
		}

		if (!_asrManager) {
			_asrManager = plugin.createRecordRecognitionManager()
		}

		_listening = true

		_asrManager.onStart = () => {
			callbacks.onStart?.()
		}

		_asrManager.onRecognize = (res : { result : string }) => {
			callbacks.onRecognizing?.(res.result)
		}

		_asrManager.onStop = (res : { result : string }) => {
			_listening = false
			callbacks.onFinish?.({ text: res.result })
		}

		_asrManager.onError = (res : { msg : string }) => {
			_listening = false
			callbacks.onError?.(res.msg || 'asr error')
		}

		_asrManager.start({ lang: 'zh_CN', duration: 30000 })
	} catch (e) {
		_listening = false
		callbacks.onError?.(e)
	}
	// #endif
}

/**
 * 停止语音识别
 */
export function stopListening() : void {
	// #ifdef H5 || APP-PLUS
	const recognition = (window as any).__recognitionInstance
	if (recognition) {
		try { recognition.stop() } catch (_) { }
		; (window as any).__recognitionInstance = null
	}
	// #endif

	// #ifdef MP-WEIXIN
	try {
		if (_asrManager) {
			_asrManager.stop()
		}
	} catch (_) { }
	// #endif

	_listening = false
}

/**
 * 是否正在录音
 */
export function isListening() : boolean {
	return _listening
}