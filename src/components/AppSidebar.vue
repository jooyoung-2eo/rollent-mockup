<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { store, confirmDialog, logout, currentUser, teamName } from '../store'
import { roleLabel } from '../constants'
import RollentLogo from './RollentLogo.vue'

const router = useRouter()

const ADMIN_MENUS = [
  { to: '/progress', label: '진행현황' },
  { to: '/org', label: '직원 및 부서 관리' },
  { to: '/eval-settings', label: '평가 관리' },
  { to: '/kpi', label: '부서 KPI 관리' },
  { to: '/results', label: '평가 결과' },
]
const USER_MENUS = [{ to: '/me', label: '내 평가' }]

const isAdmin = computed(() => store.session?.kind === 'admin')
const menus = computed(() => (isAdmin.value ? ADMIN_MENUS : USER_MENUS))
const who = computed(() => {
  const u = currentUser()
  if (!u) return ''
  return isAdmin.value ? `${u.name}${u.canOverride ? ' · 직접 수정 권한' : ''}` : `${u.name} · ${teamName(u.teamId)} ${roleLabel(u.role)}`
})

async function onLogout() {
  const ok = await confirmDialog({ title: '로그아웃', message: '로그아웃하시겠습니까?', okText: '로그아웃' })
  if (!ok) return
  logout()
  router.push('/login')
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <RollentLogo :size="52" />
      <div class="brand-name">Rollent</div>
      <div class="who">{{ who }}</div>
    </div>
    <nav class="menu">
      <RouterLink v-for="m in menus" :key="m.to" :to="m.to" class="menu-item" active-class="active">
        {{ m.label }}
      </RouterLink>
    </nav>
    <button type="button" class="menu-item logout" @click="onLogout">로그아웃</button>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--navy);
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 28px 0 24px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 28px; }
.brand-name { font-weight: 700; font-size: 1.25rem; letter-spacing: 0.02em; }
.who { font-size: 0.78rem; color: #b9bde0; text-align: center; padding: 0 10px; }
.menu { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.menu-item {
  display: block;
  width: 100%;
  padding: 11px 28px;
  color: #d3d6ee;
  text-decoration: none;
  font-size: 0.95rem;
  background: none;
  border: 0;
  text-align: left;
}
.menu-item:hover { color: #fff; background: var(--navy-light); }
.menu-item.active { background: #fff; color: var(--navy); font-weight: 700; }
.logout { margin-top: 12px; }

@media (max-width: 900px) {
  .sidebar { width: 150px; }
  .menu-item { padding: 10px 18px; }
}

@media (max-width: 640px) {
  .sidebar { width: 100%; height: auto; position: static; flex-direction: row; flex-wrap: wrap; align-items: center; padding: 10px 12px; gap: 4px; }
  .brand { flex-direction: row; margin: 0 8px 0 0; }
  .brand :deep(svg) { width: 28px; height: 28px; }
  .brand-name { font-size: 1rem; }
  .who { display: none; }
  .menu { flex-direction: row; flex-wrap: wrap; flex: 1 1 100%; order: 3; }
  .menu-item { width: auto; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; }
  .logout { margin: 0 0 0 auto; width: auto; }
}
</style>
