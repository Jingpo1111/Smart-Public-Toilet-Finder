import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Role } from '../types/api'
import { landing, useAccount } from '../stores/account'
const workspace = () => import('../views/WorkspaceView.vue')
export const userNav = [
  ['dashboard', '/dashboard', 'layout-dashboard'],
  ['mySubmissions', '/my-submissions', 'map-pin'],
  ['favorites', '/favorites', 'heart'],
  ['myReviews', '/my-reviews', 'message-square'],
  ['myReports', '/my-reports', 'flag'],
  ['notifications', '/notifications', 'bell'],
  ['profile', '/profile', 'user'],
]
export const adminNav = [
  ['dashboard', '/admin/dashboard', 'layout-dashboard'],
  ['locations', '/admin/toilets', 'map'],
  ['submissions', '/admin/submissions', 'inbox'],
  ['users', '/admin/users', 'users'],
  ['managers', '/admin/managers', 'user'],
  ['assignments', '/admin/assignments', 'clipboard-list'],
  ['reviews', '/admin/reviews', 'message-square'],
  ['reports', '/admin/reports', 'flag'],
  ['analytics', '/admin/analytics', 'chart-column'],
  ['settings', '/admin/settings', 'settings'],
]
export const managerNav = [
  ['dashboard', '/manager/dashboard', 'layout-dashboard'],
  ['assigned', '/manager/toilets', 'map'],
  ['cleaning', '/manager/cleaning', 'list-checks'],
  ['reports', '/manager/reports', 'flag'],
  ['profile', '/manager/profile', 'user'],
]
export function authorized(meta: Record<string, unknown>, role?: Role) {
  if (meta.requiresAuth && !role) return '/login'
  if (Array.isArray(meta.allowedRoles) && !meta.allowedRoles.includes(role)) return '/403'
  if (meta.guestOnly && role) return landing(role)
  return ''
}
const personalPages: Record<string, typeof workspace> = {
  '/favorites': () => import('../views/user/MyFavoritesView.vue'),
  '/my-reviews': () => import('../views/user/MyReviewsView.vue'),
  '/my-reports': () => import('../views/user/MyReportsView.vue'),
  '/notifications': () => import('../views/user/NotificationsView.vue'),
  '/profile': () => import('../views/user/ProfileView.vue'),
  '/change-password': () => import('../views/user/ChangePasswordView.vue'),
  '/my-submissions': () => import('../views/user/MySubmissionsView.vue'),
}
const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('../views/HomeView.vue') },
  { path: '/explore', component: () => import('../views/ExploreView.vue') },
  { path: '/about', component: () => import('../views/AboutView.vue') },
  { path: '/toilets/:id', component: () => import('../views/ToiletDetailsView.vue') },
  { path: '/login', component: () => import('../views/auth/LoginView.vue'), meta: { guestOnly: true } },
  {
    path: '/register',
    component: () => import('../views/auth/RegisterView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/forgot-password',
    component: () => import('../views/auth/ForgotPasswordView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/reset-password',
    component: () => import('../views/auth/ResetPasswordView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/add-toilet',
    component: () => import('../views/AddToiletView.vue'),
    meta: { requiresAuth: true },
  },
  ...[...userNav, ['mySubmissions', '/my-submissions/:id'], ['changePassword', '/change-password']].map(
    ([title, path]) => ({
      path,
      component: personalPages[path] ?? workspace,
      meta: { title, requiresAuth: true },
    }),
  ),
  ...[
    ...adminNav,
    ['add', '/admin/toilets/new'],
    ['locations', '/admin/toilets/:id'],
    ['submissions', '/admin/submissions/:id'],
  ].map(([title, path]) => ({
    path,
    component: workspace,
    meta: { title, requiresAuth: true, allowedRoles: ['ADMIN'] },
  })),
  ...[...managerNav, ['assigned', '/manager/toilets/:id']].map(([title, path]) => ({
    path,
    component: workspace,
    meta: { title, requiresAuth: true, allowedRoles: ['MANAGER'] },
  })),
  { path: '/403', component: () => import('../views/ErrorView.vue') },
  { path: '/:pathMatch(.*)*', component: () => import('../views/ErrorView.vue') },
]
export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? {} : { top: 0 }),
})
router.beforeEach(async (to) => {
  const account = useAccount()
  if (to.meta.requiresAuth || to.meta.guestOnly) await account.restore()
  else void account.restore()
  const redirect = authorized(to.meta, account.role)
  return redirect === '/login' ? { path: redirect, query: { redirect: to.fullPath } } : redirect || true
})
export function intended(value: unknown, role?: Role) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return landing(role)
  const to = router.resolve(value)
  return !to.matched.length || to.meta.guestOnly || authorized(to.meta, role)
    ? landing(role)
    : to.fullPath
}
