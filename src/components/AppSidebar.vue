<script setup>
import { useRouter } from 'vue-router'
import { confirmDialog, logout } from '../store'
import RollentLogo from './RollentLogo.vue'

const router = useRouter()

const menus = [
  { to: '/home', label: 'HOME' },
  { to: '/teams', label: '팀 관리' },
  { to: '/users', label: '사원 관리' },
  { to: '/items', label: '평가항목' },
  { to: '/admin-eval', label: '관리자 평가' },
  { to: '/results', label: '응답결과' },
]

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
  .menu { flex-direction: row; flex-wrap: wrap; flex: 1 1 100%; order: 3; }
  .menu-item { width: auto; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; }
  .logout { margin: 0 0 0 auto; width: auto; }
}
</style>
