import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const VIEWER = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const OTHER_RUN = '44444444-4444-4444-8444-444444444444';

test('PostgreSQL 스키마·RLS·실행권·완료·속도 제한', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/202611180001_event_board.sql', import.meta.url),'utf8'));
    await db.exec(`
      insert into auth.users values('${VIEWER}'),('${OUTSIDER}');
      insert into public.board_viewers values('${VIEWER}');
      insert into public.participants(key,label) values('person_a','참가자 A'),('person_b','참가자 B');
      insert into public.events(key,title,url) values('ig:Example','예제 이벤트','https://example.com'),
        ('ig:Other','두 번째 이벤트','https://example.com/2');
    `);
    const scalar = async (sql,params=[]) => (await db.query(sql,params)).rows[0].value;
    await t.test('익명 조회와 실행 RPC 차단', async () => {
      await db.exec('set role anon');
      await assert.rejects(db.query('select * from public.events'), /permission denied/);
      await assert.rejects(db.query(`select public.claim_participation('ig:Example','person_a','${RUN}','2026-11-18')`), /permission denied/);
      await db.exec('reset role');
    });
    await t.test('허용되지 않은 로그인 사용자에게 RLS 적용', async () => {
      await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${OUTSIDER}'`);
      assert.equal((await db.query('select * from public.events')).rows.length,0);
      const data = await scalar(`select public.board_page('person_a') as value`);
      assert.equal(data.total,0);
      await db.exec('reset role');
    });
    await t.test('허용 사용자는 읽기만 가능', async () => {
      await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${VIEWER}'`);
      assert.equal((await db.query('select * from public.events')).rows.length,2);
      await assert.rejects(db.query("insert into public.participants(key,label) values('extra','추가')"), /permission denied/);
      await assert.rejects(db.query('select * from public.comment_attempts'), /permission denied/);
      await db.exec('reset role');
    });
    await t.test('같은 이벤트·참가자는 한 실행만 선점', async () => {
      await db.exec('set role service_role');
      assert.equal(await scalar(`select public.claim_participation('ig:Example','person_a','${RUN}','2026-11-18') as value`),true);
      assert.equal(await scalar(`select public.claim_participation('ig:Example','person_a','${OTHER_RUN}','2026-11-18') as value`),false);
      assert.equal(await scalar(`select public.claim_participation('ig:Example','person_b','${OTHER_RUN}','2026-11-18') as value`),true);
      await db.exec('reset role');
    });
    await t.test('다른 실행이 완료 결과 덮어쓰기 불가', async () => {
      assert.equal(await scalar(`select public.finish_participation('ig:Example','person_a','${OTHER_RUN}','completed','OK',null,true) as value`),false);
      assert.equal(await scalar(`select public.finish_participation('ig:Example','person_a','${RUN}','review','UNVERIFIED','CHECK',false,true) as value`),true);
      assert.equal(await scalar(`select public.verify_participation('ig:Example','person_a','${RUN}',true) as value`),true);
      assert.equal(await scalar(`select status as value from public.participations where participant_key='person_a'`),'review');
      // 필수 폼이 실패했으면 댓글이 확인돼도 완료로 바뀌지 않음.
    });
    await t.test('슬롯 예약은 게시 직전 한 번, 다른 실행은 불가', async () => {
      const allowed = await scalar(`select public.reserve_comment_slot('ig:Example','person_b','${OTHER_RUN}') as value`);
      assert.equal(allowed.allowed,true);
      assert.equal((await scalar(`select public.reserve_comment_slot('ig:Example','person_b','${OTHER_RUN}') as value`)).reason,'ALREADY_RESERVED');
      assert.equal((await scalar(`select public.reserve_comment_slot('ig:Example','person_b','${RUN}') as value`)).reason,'NOT_OWNER');
      await scalar(`select public.claim_participation('ig:Other','person_b','${RUN}','2026-11-18') as value`);
      const wait = await scalar(`select public.reserve_comment_slot('ig:Other','person_b','${RUN}') as value`);
      assert.equal(wait.reason,'WAIT'); assert.ok(wait.retry_after >= 119);
    });
    await t.test('10개마다 12분 휴식·KST 하루 60개 상한', async () => {
      await db.exec(`delete from public.comment_attempts;
        insert into public.comment_attempts(event_key,participant_key,run_id,attempted_at)
          select 'ig:Example','person_b',md5(i::text)::uuid,clock_timestamp()-interval '2 minutes'
          from generate_series(1,10) i;`);
      let slot = await scalar(`select public.reserve_comment_slot('ig:Other','person_b','${RUN}') as value`);
      assert.equal(slot.reason,'WAIT'); assert.ok(slot.retry_after >= 599);
      await db.exec(`delete from public.comment_attempts;
        insert into public.comment_attempts(event_key,participant_key,run_id,attempted_at)
          select 'ig:Example','person_b',md5(i::text)::uuid,clock_timestamp()
          from generate_series(1,60) i;`);
      slot = await scalar(`select public.reserve_comment_slot('ig:Other','person_b','${RUN}') as value`);
      assert.equal(slot.reason,'CAP');
    });
    await t.test('게시판은 참가자별 미참여·검색·페이지 결과 반환', async () => {
      await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${VIEWER}'`);
      const data = await scalar(`select public.board_page('person_a','pending','',0,25) as value`);
      assert.equal(data.total,1);
      assert.equal(data.items[0].key,'ig:Other');
      assert.equal((await scalar(`select public.board_page('person_a','','두 번째',0,25) as value`)).total,1);
      assert.equal((await scalar(`select public.board_page('person_a','','',0,1) as value`)).items.length,1);
      await db.exec('reset role');
    });
    await t.test('공개 전환 후 익명 조회 허용·쓰기와 실행 차단', async () => {
      await db.exec(await readFile(new URL('../../supabase/migrations/202611190001_public_board.sql', import.meta.url),'utf8'));
      await db.exec('set role anon');
      assert.equal((await db.query('select key,label from public.participants')).rows.length,2);
      const data = await scalar(`select public.board_page('person_a') as value`);
      assert.equal(data.total,2);
      assert.equal(data.items.find(x => x.key === 'ig:Example').participation.form_status,'CHECK');
      await assert.rejects(db.query("update public.participations set status='completed'"), /permission denied/);
      await assert.rejects(db.query('select * from public.comment_attempts'), /permission denied/);
      await assert.rejects(db.query('select * from public.board_viewers'), /permission denied/);
      await assert.rejects(db.query(`select public.claim_participation('ig:Other','person_a','${RUN}','2026-11-19')`), /permission denied/);
      await db.exec('reset role');
      await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${OUTSIDER}'`);
      assert.equal((await scalar(`select public.board_page('person_a') as value`)).total,2);
      await db.exec('reset role');
    });
    await t.test('완료 건은 수동 해제도 거부', async () => {
      await db.exec(`update public.participations set status='completed' where event_key='ig:Example' and participant_key='person_a'`);
      assert.equal(await scalar(`select public.release_participation('ig:Example','person_a','${RUN}') as value`),false);
    });
  } finally { await db.close(); }
});
