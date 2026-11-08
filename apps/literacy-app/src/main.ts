import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.uvue'

export function createApp() {
	const app = createSSRApp(App)
	const pinia = createPinia()
	app.use(pinia) // 必须这行
	return { app, pinia }
}