<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { store } from './store'
import AppSidebar from './components/AppSidebar.vue'
import AppModal from './components/AppModal.vue'

const route = useRoute()
const showShell = computed(() => route.name && route.name !== 'login')

function closeConfirm(result) {
  store.confirmState.resolve(result)
  store.confirmState = null
}
</script>

<template>
  <div v-if="showShell" class="app-shell">
    <AppSidebar />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
  <RouterView v-else />

  <AppModal v-if="store.confirmState" :title="store.confirmState.title" size="sm" @close="closeConfirm(false)">
    <p class="mb-0" style="white-space: pre-line">{{ store.confirmState.message }}</p>
    <template #footer>
      <button class="btn btn-light" @click="closeConfirm(false)">취소</button>
      <button class="btn" :class="store.confirmState.danger ? 'btn-danger' : 'btn-primary'" @click="closeConfirm(true)">
        {{ store.confirmState.okText }}
      </button>
    </template>
  </AppModal>

  <div class="toast-stack" aria-live="polite">
    <div v-for="t in store.toasts" :key="t.id" class="toast-item" :class="t.variant">{{ t.message }}</div>
  </div>
</template>
