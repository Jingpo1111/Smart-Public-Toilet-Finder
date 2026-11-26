import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { installI18n } from './stores/preferences'
import './base.css'
import './style.css'
import './utilities.css'
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
// The vue-i18n plugin is only a translation backend (prefs.t falls back to the bundled messages),
// so it loads in the background instead of delaying first paint behind an extra chunk request.
void installI18n(app)
