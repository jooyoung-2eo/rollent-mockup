<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login, toast } from '../store'
import { homeOf } from '../router'
import RollentLogo from '../components/RollentLogo.vue'
import AppModal from '../components/AppModal.vue'

const router = useRouter()
const loginName = ref('')
const password = ref('')
const showPw = ref(false)
const error = ref('')
const showFindPw = ref(false)
const langOpen = ref(false)
const lang = ref('ko')
const showAccounts = ref(false)

// 목업 시연용 테스트 계정(가상 인물)
const TEST_ACCOUNTS = [
  { label: '관리자 (인사)', name: '관리자', empNo: '0000' },
  { label: '대표자 (최종 점수 직접 수정 권한)', name: '대표자', empNo: '0001' },
  { label: '사원 (생산팀)', name: '이서준', empNo: '2019102' },
  { label: '팀장 (생산팀)', name: '박성호', empNo: '2015001' },
  { label: '임원', name: '장민석', empNo: '2008001' },
]
function fillAccount(a) {
  loginName.value = a.name
  password.value = a.empNo
}

const languages = [
  { key: 'ko', label: '한국어' },
  { key: 'en', label: 'English' },
  { key: 'ru', label: 'Русский' },
]

function onSubmit() {
  if (!loginName.value.trim() || !password.value) {
    error.value = '아이디(이름)와 비밀번호(사번)를 모두 입력해 주세요.'
    return
  }
  const result = login(loginName.value, password.value)
  if (!result.ok) {
    error.value = result.message
    return
  }
  error.value = ''
  router.push(homeOf(result.kind))
}

function selectLang(item) {
  lang.value = item.key
  langOpen.value = false
  if (item.key !== 'ko') toast(`${item.label}를 선택했습니다. 목업에서는 한국어 화면만 제공합니다.`, 'warning')
}
</script>

<template>
  <div class="login-page">
    <form class="login-card" novalidate @submit.prevent="onSubmit">
      <div class="text-center mb-4">
        <RollentLogo :size="72" />
        <h1 class="brand">Rollent</h1>
      </div>

      <label class="form-label small" for="loginName">아이디 (이름)</label>
      <input id="loginName" v-model="loginName" class="form-control mb-3" placeholder="이름을 입력하세요" autocomplete="username" />

      <label class="form-label small" for="pw">비밀번호 (사번)</label>
      <div class="input-group mb-2">
        <input
          id="pw" v-model="password" :type="showPw ? 'text' : 'password'" class="form-control"
          placeholder="사번을 입력하세요" autocomplete="current-password"
        />
        <button type="button" class="btn btn-light border" @click="showPw = !showPw">{{ showPw ? '숨기기' : '표시' }}</button>
      </div>

      <div v-if="error" class="login-error mb-2" role="alert">{{ error }}</div>

      <button type="submit" class="btn btn-primary w-100 mt-2">로그인</button>

      <div class="d-flex justify-content-between align-items-center mt-3">
        <button type="button" class="btn btn-link link-light p-0 small" @click="showFindPw = true">비밀번호 찾기</button>
        <div class="position-relative">
          <button type="button" class="btn btn-sm btn-outline-light" @click="langOpen = !langOpen">
            🌐 {{ languages.find((l) => l.key === lang).label }} ▾
          </button>
          <ul v-if="langOpen" class="lang-menu">
            <li v-for="l in languages" :key="l.key">
              <button type="button" :class="{ active: l.key === lang }" @click="selectLang(l)">{{ l.label }}</button>
            </li>
          </ul>
        </div>
      </div>

      <div class="mock-note">
        <button type="button" class="btn btn-link link-light p-0 small" @click="showAccounts = !showAccounts">
          테스트 계정 {{ showAccounts ? '닫기' : '보기' }}
        </button>
        <div v-if="showAccounts" class="accounts">
          <p class="mb-1">목업 시연용 가상 계정입니다. 누르면 입력란이 채워집니다.</p>
          <button v-for="a in TEST_ACCOUNTS" :key="a.label" type="button" class="account" @click="fillAccount(a)">
            {{ a.label }}: {{ a.name }} / {{ a.empNo }}
          </button>
        </div>
      </div>
    </form>

    <AppModal v-if="showFindPw" title="비밀번호 찾기" size="sm" @close="showFindPw = false">
      <p>비밀번호는 본인의 사번입니다.</p>
      <p class="mb-0">사번을 모르거나 로그인이 되지 않으면 인사 관리자에게 문의해 주세요.</p>
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
.mock-note { margin: 18px 0 0; font-size: 0.78rem; color: #9ea2c8; text-align: center; }
.accounts { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.account { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #e4e6f7; border-radius: 6px; padding: 4px 8px; font-size: 0.8rem; }
.account:hover { background: rgba(255, 255, 255, 0.16); }
</style>
