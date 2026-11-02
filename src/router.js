import { createRouter, createWebHashHistory, createMemoryHistory } from 'vue-router'
import { store, currentUser, canEvaluate, logout, toast } from './store'
import LoginView from './views/LoginView.vue'
import ProgressView from './views/ProgressView.vue'
import OrgView from './views/OrgView.vue'
import EvalSettingsView from './views/EvalSettingsView.vue'
import KpiView from './views/KpiView.vue'
import ResultView from './views/ResultView.vue'
import MyEvalView from './views/MyEvalView.vue'
import EvaluateView from './views/EvaluateView.vue'

// meta.role: 'admin' 관리자 전용, 'user' 사원·팀장·임원 전용
const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/progress', name: 'progress', component: ProgressView, meta: { role: 'admin' } },
  { path: '/org', name: 'org', component: OrgView, meta: { role: 'admin' } },
  { path: '/eval-settings', name: 'eval-settings', component: EvalSettingsView, meta: { role: 'admin' } },
  { path: '/kpi', name: 'kpi', component: KpiView, meta: { role: 'admin' } },
  { path: '/results', name: 'results', component: ResultView, meta: { role: 'admin' } },
  { path: '/me', name: 'me', component: MyEvalView, meta: { role: 'user' } },
  { path: '/me/evaluate/:stage/:targetId', name: 'evaluate', component: EvaluateView, meta: { role: 'user' } },
  { path: '/:pathMatch(.*)*', redirect: '/login' },
]

const router = createRouter({
  // claude.ai 공유용 빌드는 주소창을 쓰지 않고 앱 안에서만 화면을 바꾼다
  history: import.meta.env.VITE_SHARED ? createMemoryHistory() : createWebHashHistory(),
  routes,
})

export const homeOf = (kind) => (kind === 'admin' ? '/progress' : '/me')

// 화면 접근 권한 확인. 프런트엔드 목업 수준의 통제이며 실제 서비스에서는 서버 검증이 필요하다.
router.beforeEach((to) => {
  const s = store.session
  if (s && !currentUser()) logout() // 삭제·비활성화된 계정
  if (!store.session) return to.name === 'login' ? true : { name: 'login' }
  if (to.name === 'login') return homeOf(store.session.kind)
  if (to.meta.role === 'admin' && store.session.kind !== 'admin') {
    toast('관리자만 사용할 수 있는 화면입니다.', 'warning')
    return '/me'
  }
  if (to.meta.role === 'user' && store.session.kind !== 'user') return '/progress'
  if (to.name === 'evaluate') {
    const u = currentUser()
    if (!u.active || !canEvaluate(u.id, to.params.stage, Number(to.params.targetId))) {
      toast('나에게 배정되지 않은 평가입니다.', 'warning')
      return '/me'
    }
  }
})

export default router
