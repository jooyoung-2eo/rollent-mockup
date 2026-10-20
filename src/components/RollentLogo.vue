<script setup>
defineProps({ size: { type: Number, default: 56 } })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="#ffffff" />
    <circle cx="32" cy="32" r="23" fill="#2a78d6" />
    <circle cx="32" cy="32" r="15" fill="#ffffff" />
    <circle cx="32" cy="32" r="9" fill="#5fb3f0" />
    <path d="M32 2 A30 30 0 0 1 62 32" stroke="#1e2054" stroke-width="3" fill="none" />
  </svg>
</template>
