<script setup>
import { computed } from 'vue'

// 단일 비율(0~100)을 보여주는 원형 진행률 차트
const props = defineProps({
  value: { type: Number, required: true },
  label: { type: String, default: '' },
  detail: { type: String, default: '' },
  size: { type: Number, default: 110 },
  color: { type: String, default: '#2a78d6' },
})

const r = 42
const circ = 2 * Math.PI * r
const dash = computed(() => `${(Math.max(0, Math.min(100, props.value)) / 100) * circ} ${circ}`)
</script>

<template>
  <figure class="donut m-0" :title="detail || `${label} ${value}%`">
    <svg :width="size" :height="size" viewBox="0 0 100 100" role="img" :aria-label="`${label} 진행률 ${value}%`">
      <circle cx="50" cy="50" :r="r" fill="none" stroke="#e6e8ee" stroke-width="10" />
      <circle v-if="value > 0"
        cx="50" cy="50" :r="r" fill="none" :stroke="color" stroke-width="10"
        stroke-linecap="round" :stroke-dasharray="dash" transform="rotate(-90 50 50)"
      />
      <text x="50" y="55" text-anchor="middle" font-size="18" font-weight="700" fill="#23263a">{{ value }}%</text>
    </svg>
    <figcaption>{{ label }}</figcaption>
  </figure>
</template>

<style scoped>
.donut { display: flex; flex-direction: column; align-items: center; gap: 4px; }
figcaption { font-size: 0.85rem; color: #4a4f63; font-weight: 600; }
</style>
