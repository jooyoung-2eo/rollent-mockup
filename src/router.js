import { createRouter, createWebHashHistory, createMemoryHistory } from 'vue-router'
import { store, addRecent } from './store'
import LoginView from './views/LoginView.vue'
import HomeView from './views/HomeView.vue'
import TeamView from './views/TeamView.vue'
import UserView from './views/UserView.vue'
import ItemView from './views/ItemView.vue'
import AdminEvalView from './views/AdminEvalView.vue'
import ResultView from './views/ResultView.vue'

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', name: 'login', component: LoginView, meta: { title: '로그인' } },
  { path: '/home', name: 'home', component: HomeView, meta: { title: 'HOME' } },
  { path: '/teams', name: 'teams', component: TeamView, meta: { title: '팀 관리' } },
  { path: '/users', name: 'users', component: UserView, meta: { title: '사원 관리' } },
  { path: '/items', name: 'items', component: ItemView, meta: { title: '평가항목' } },
  { path: '/admin-eval', name: 'admin-eval', component: AdminEvalView, meta: { title: '관리자 평가' } },
  { path: '/results', name: 'results', component: ResultView, meta: { title: '응답결과' } },
]

const router = createRouter({
  // claude.ai 공유용 빌드는 주소창을 쓰지 않고 앱 안에서만 화면을 바꾼다
  history: import.meta.env.VITE_SHARED ? createMemoryHistory() : createWebHashHistory(),
  routes,
})

// 목업: 로그인하지 않았으면 로그인 화면으로 보낸다
router.beforeEach((to) => {
  if (to.name !== 'login' && !store.loggedIn) return { name: 'login' }
  if (to.name === 'login' && store.loggedIn) return { name: 'home' }
})

router.afterEach((to) => {
  if (to.name !== 'login' && to.name !== 'home') addRecent(to.name)
})

export default router
