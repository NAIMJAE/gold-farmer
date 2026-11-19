import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function publicConfig(env = process.env) {
  const url = env.VITE_SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* 공개키 형식 확인 */ }
  if (key && !key.startsWith('sb_publishable_') && role !== 'anon') {
    throw new Error('웹에는 publishable/anon 키만 사용 가능. 비밀 키 제거 필요');
  }
  if (url && (!url.startsWith('https://') || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url))) {
    throw new Error('VITE_SUPABASE_URL은 Supabase 프로젝트 HTTPS 주소여야 함');
  }
  return {VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key};
}

export function loadLocalEnv() {
  const path = resolve('.env');
  if (existsSync(path)) process.loadEnvFile(path);
}
