<script setup>
// 정렬 가능한 열 제목. 제목 버튼만 정렬을 바꾸므로 행의 이름 클릭·체크박스와 겹치지 않는다.
// sort: { key, dir: 'asc' | 'desc' } (key가 null이면 기본 정렬)
const props = defineProps({
  label: { type: String, required: true },
  k: { type: String, required: true },
  sort: { type: Object, required: true },
  align: { type: String, default: 'start' },
})
const emit = defineEmits(['sort'])
const active = () => props.sort.key === props.k
function toggle() {
  emit('sort', { key: props.k, dir: active() && props.sort.dir === 'asc' ? 'desc' : 'asc' })
}
</script>

<template>
  <th :class="`text-${align}`" :aria-sort="active() ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'">
    <button type="button" class="sort-btn" :class="{ on: active() }" :title="`${label} 기준 정렬`" @click="toggle">
      {{ label }}<span class="arrow" aria-hidden="true">{{ active() ? (sort.dir === 'asc' ? '▲' : '▼') : '↕' }}</span>
    </button>
  </th>
</template>

<style scoped>
.sort-btn { background: none; border: 0; padding: 0; font: inherit; color: inherit; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.sort-btn:hover { color: var(--brand); }
.sort-btn.on { color: var(--brand); }
.arrow { font-size: 0.7rem; opacity: 0.55; }
.sort-btn.on .arrow { opacity: 1; }
</style>
