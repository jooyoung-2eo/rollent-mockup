<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { store, login, toast } from '../store'
import RollentLogo from '../components/RollentLogo.vue'
import AppModal from '../components/AppModal.vue'

const router = useRouter()
const empNo = ref('')
const password = ref('')
const showPw = ref(false)
const error = ref('')
const showFindPw = ref(false)
const langOpen = ref(false)

const languages = [
  { key: 'ko', label: '한국어' },
  { key: 'en', label: 'English' },
  { key: 'ru', label: 'Русский' },
]

function onSubmit() {
  if (!empNo.value.trim() || !password.value) {
    error.value = '사번과 비밀번호를 모두 입력해 주세요.'
    return
  }
  error.value = ''
  login(empNo.value.trim())
  router.push('/home')
}

function selectLang(lang) {
  store.lang = lang.key
  langOpen.value = false
  if (lang.key !== 'ko') toast(`${lang.label}를 선택했습니다. 목업에서는 한국어 화면만 제공합니다.`, 'warning')
}
</script>

<template>
  <div class="login-page">
    <form class="login-card" novalidate @submit.prevent="onSubmit">
      <div class="text-center mb-4">
        <RollentLogo :size="72" />
        <h1 class="brand">Rollent</h1>
      </div>

      <label class="form-label small" for="empNo">사번</label>
      <input id="empNo" v-model="empNo" class="form-control mb-3" placeholder="사번을 입력하세요" autocomplete="username" />

      <label class="form-label small" for="pw">비밀번호</label>
      <div class="input-group mb-2">
        <input
          id="pw" v-model="password" :type="showPw ? 'text' : 'password'" class="form-control"
          placeholder="비밀번호를 입력하세요" autocomplete="current-password"
        />
        <button type="button" class="btn btn-light border" @click="showPw = !showPw">{{ showPw ? '숨기기' : '표시' }}</button>
      </div>

      <div v-if="error" class="login-error mb-2" role="alert">{{ error }}</div>

      <button type="submit" class="btn btn-primary w-100 mt-2">로그인</button>

      <div class="d-flex justify-content-between align-items-center mt-3">
        <button type="button" class="btn btn-link link-light p-0 small" @click="showFindPw = true">비밀번호 찾기</button>
        <div class="position-relative">
          <button type="button" class="btn btn-sm btn-outline-light" @click="langOpen = !langOpen">
            🌐 {{ languages.find((l) => l.key === store.lang).label }} ▾
          </button>
          <ul v-if="langOpen" class="lang-menu">
            <li v-for="l in languages" :key="l.key">
              <button type="button" :class="{ active: l.key === store.lang }" @click="selectLang(l)">{{ l.label }}</button>
            </li>
          </ul>
        </div>
      </div>

      <p class="mock-note">목업 화면입니다. 아무 사번과 비밀번호로 로그인할 수 있습니다.</p>
    </form>

    <AppModal v-if="showFindPw" title="비밀번호 찾기" size="sm" @close="showFindPw = false">
      <p>비밀번호는 관리자가 초기 비밀번호를 일괄 발급합니다.</p>
      <p class="mb-0">비밀번호를 잊으셨다면 인사 관리자에게 초기화를 요청해 주세요. 로그인 후에는 직접 비밀번호를 변경할 수 있습니다.</p>
      <template #footer>
        <button class="btn btn-primary" @click="showFindPw = false">확인</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--surface); }
.login-card { width: 100%; max-width: 380px; background: var(--navy); color: #fff; border-radius: 14px; padding: 36px 32px 24px; box-shadow: 0 12px 40px rgba(20, 24, 60, 0.25); }
.brand { font-size: 1.6rem; font-weight: 700; margin: 10px 0 0; }
.form-label { color: #c9cce6; }
.login-error { color: #ffb4b4; font-size: 0.85rem; }
.lang-menu { position: absolute; right: 0; bottom: calc(100% + 4px); list-style: none; padding: 4px; margin: 0; background: #fff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); min-width: 120px; z-index: 10; }
.lang-menu button { width: 100%; text-align: left; border: 0; background: none; padding: 6px 10px; border-radius: 6px; color: #23263a; font-size: 0.9rem; }
.lang-menu button:hover { background: #f1f4fa; }
.lang-menu button.active { font-weight: 700; color: var(--brand); }
.mock-note { margin: 18px 0 0; font-size: 0.75rem; color: #9ea2c8; text-align: center; }
</style>
