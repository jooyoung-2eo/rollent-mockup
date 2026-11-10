<script setup>
// Rollent 로고 마크 (원형 심볼). 짙은 배경에서는 badge로 흰 원을 깔아 오른쪽 네이비 반원이 묻히지 않게 한다.
defineProps({
  size: { type: Number, default: 56 },
  badge: { type: Boolean, default: true },
})
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 100 100" role="img" aria-label="Rollent 로고">
    <circle v-if="badge" cx="50" cy="50" r="50" fill="#ffffff" />
    <g :transform="badge ? 'translate(7 7) scale(0.86)' : undefined">
      <!-- 바깥 원: 왼쪽 파랑, 오른쪽 네이비, 가운데 세로 틈 -->
      <path d="M50 0 A50 50 0 0 0 50 100 Z" fill="#0d5a9e" />
      <path d="M50 0 A50 50 0 0 1 50 100 Z" fill="#1e2054" />
      <rect x="48.9" y="0" width="2.2" height="100" fill="#ffffff" />
      <!-- 안쪽 청록 고리와 가운데 흰 원, 가로 틈 -->
      <circle cx="50" cy="50" r="28" fill="#ffffff" />
      <circle cx="50" cy="50" r="25" fill="#22b3c8" />
      <circle cx="50" cy="50" r="12.5" fill="#ffffff" />
      <rect x="24" y="48.9" width="52" height="2.2" fill="#ffffff" />
    </g>
  </svg>
</template>
