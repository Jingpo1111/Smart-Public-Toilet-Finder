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
// Once the page is idle, warm the chunks a visitor is most likely to open next (Explore + map,
// details), so navigation feels instant instead of waiting on a chunk download.
const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500))
idle(() => {
  void import('./views/ExploreView.vue')
  void import('./components/MapView.vue')
  void import('./views/ToiletDetailsView.vue')
})
