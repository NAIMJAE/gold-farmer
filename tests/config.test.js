import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicConfig } from '../scripts/config.mjs';

test('서버용 secret/service_role 키는 빌드 전 차단', () => {
  assert.throws(() => publicConfig({VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'}));
  const jwt = 'eyJ.' + Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url') + '.signature';
  assert.throws(() => publicConfig({VITE_SUPABASE_PUBLISHABLE_KEY:jwt}));
});
test('허용된 공개 환경변수만 빌드에 포함', () => {
  const result = publicConfig({VITE_SUPABASE_URL:'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example',SUPABASE_SECRET_KEY:'not-in-bundle'});
  assert.equal(Object.keys(result).length,2);
  assert.ok(!JSON.stringify(result).includes('not-in-bundle'));
});
