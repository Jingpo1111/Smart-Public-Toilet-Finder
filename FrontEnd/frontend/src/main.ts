import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { installI18n } from './stores/preferences'
import './base.css'
import './style.css'
import './utilities.css'
async function start() {
  const app = createApp(App)
  app.use(createPinia())
  await installI18n(app)
  app.use(router)
  app.mount('#app')
}
void start()
