export { }

declare const wx: any
declare function requirePlugin(module: string): any

// 加上 export 导出类型
export interface RecordRecognitionManager {
  start: (opts?: { lang?: string; duration?: number }) => void
  stop: () => void
  onStart: (callback: () => void) => void
  onRecognize: (callback: (res: { result: string }) => void) => void
  onStop: (callback: (res: { result: string; duration: number }) => void) => void
  onError: (callback: (err: { retcode: number; msg: string }) => void) => void
}

export interface WechatSI {
  getRecordRecognitionManager: () => RecordRecognitionManager
  textToSpeech: (opts: {
    content: string
    lang?: 'zh_CN' | 'en_US'
    success?: (res: { filename: string; retcode: number }) => void
    fail?: (err: any) => void
  }) => void
}

declare global {
  function requirePlugin(module: 'WechatSI'): WechatSI
}