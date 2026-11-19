import { createClient } from '@supabase/supabase-js';
import { STATUS, safeUrl, formatDate } from './format.js';
import './style.css';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 25;
let client, page = 0, total = 0, requestId = 0, people = [];
let search = '', sessionReady = false;

function showPeople() {
  requestId++;
  $('board-view').hidden = true;
  $('people-view').hidden = false;
  $('events').replaceChildren();
  $('person').value = '';
}

function selectPerson(key) {
  if (!people.some(p => p.key === key)) return;
  requestId++;
  $('person').value = key;
  page = 0;
  search = '';
  $('search').value = '';
  $('status').value = '';
  ['total', 'completed', 'review', 'pending'].forEach(k => $(`stat-${k}`).textContent = '—');
  $('list-title').textContent = `${people.find(p => p.key === key).label}의 내역`;
  $('people-view').hidden = true;
  $('board-view').hidden = false;
  loadPage();
}

function message(id, text, error = false) {
  $(id).textContent = text;
  $(id).classList.toggle('error', error);
}

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function render(items) {
  $('events').replaceChildren(...items.map(item => {
    const tr = node('tr');
    const event = node('td');
    const url = safeUrl(item.url);
    const title = node(url ? 'a' : 'span', item.title, 'event-title');
    if (url) { title.href = url; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
    event.append(title, node('span', [item.host, item.platform].filter(Boolean).join(' · '), 'event-host'));
    const state = STATUS[item.participation_status] || STATUS.review;
    const status = node('td');
    status.append(node('span', state[0], `badge ${state[1]}`));
    if (item.participation?.form_status) {
      const formLabels = {DONE: '폼 제출 확인', ALREADY: '기존 응답 있음', CLOSED: '폼 마감', DRY: '폼 시험 입력'};
      status.append(node('span', formLabels[item.participation.form_status] || '폼 확인 필요', 'status-detail'));
    }
    const date = item.participation?.updated_at;
    tr.append(event, node('td', item.prize || '—', 'prize'), node('td', formatDate(item.deadline), 'date'), status,
      node('td', formatDate(date, true), 'date'));
    return tr;
  }));
  $('empty').hidden = items.length > 0;
  $('total-count').textContent = `${total.toLocaleString('ko-KR')}개 이벤트`;
  $('page-info').textContent = total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} / ${total}` : '0개';
  $('prev').disabled = page === 0;
  $('next').disabled = (page + 1) * PAGE_SIZE >= total;
}

async function loadPage() {
  if (!sessionReady || $('board-view').hidden || !$('person').value) return;
  const id = ++requestId;
  message('board-message', '기록을 불러오는 중…');
  $('refresh').disabled = true;
  $('events').replaceChildren();
  $('empty').hidden = true;
  $('prev').disabled = $('next').disabled = true;
  try {
    const { data, error } = await client.rpc('board_page', {
      p_person: $('person').value, p_status: $('status').value, p_search: search,
      p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE,
    });
    if (id !== requestId) return;
    if (error || !data) throw new Error('query');
    total = Number(data.total);
    if (page > 0 && page * PAGE_SIZE >= total) { page = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1); return loadPage(); }
    ['total', 'completed', 'review', 'pending'].forEach(key => {
      $(`stat-${key}`).textContent = Number(data.summary[key] || 0).toLocaleString('ko-KR');
    });
    $('list-title').textContent = `${people.find(p => p.key === $('person').value)?.label || '참가자'}의 내역`;
    render(data.items);
    message('board-message', '');
  } catch {
    if (id === requestId) message('board-message', '기록을 불러오지 못했음. 연결·접근 권한을 확인한 뒤 새로고침해 주세요.', true);
  } finally {
    if (id === requestId) $('refresh').disabled = false;
  }
}

async function loadPeople() {
  sessionReady = false;
  $('people-refresh').disabled = true;
  message('people-message', '참가자를 불러오는 중…');
  try {
    const { data, error } = await client.from('participants').select('key,label,enabled').order('label');
    if (error) throw new Error('people');
    people = data;
    $('person').replaceChildren(...people.map(p => {
      const option = node('option', p.label + (p.enabled ? '' : ' (비활성)'));
      option.value = p.key; return option;
    }));
    $('person').value = '';
    $('people-cards').replaceChildren(...people.map(p => {
      const card = node('button', null, 'person-card');
      card.type = 'button';
      card.append(node('span', p.label.slice(0, 1).toUpperCase(), 'person-avatar'),
        node('strong', p.label), node('span', p.enabled ? '참여 기록 보기' : '비활성 · 기록 보기', 'muted'));
      card.addEventListener('click', () => selectPerson(p.key));
      return card;
    }));
    sessionReady = true;
    page = 0;
    if (!people.length) {
      message('people-message', '등록된 참가자가 없음.');
      return;
    }
    message('people-message', '');
  } catch {
    $('people-cards').replaceChildren();
    message('people-message', '참가자를 불러오지 못했음. 연결을 확인하고 다시 시도해 주세요.', true);
  } finally { $('people-refresh').disabled = false; }
}

$('back-people').addEventListener('click', () => { showPeople(); $('people-title').focus(); });
$('people-title').tabIndex = -1;
$('people-refresh').addEventListener('click', loadPeople);
$('person').addEventListener('change', () => selectPerson($('person').value));
$('status').addEventListener('change', () => { page = 0; loadPage(); });
$('search-form').addEventListener('submit', event => { event.preventDefault(); search = $('search').value.trim(); page = 0; loadPage(); });
$('refresh').addEventListener('click', () => sessionReady ? loadPage() : loadPeople());
$('prev').addEventListener('click', () => { if (page) { page--; loadPage(); } });
$('next').addEventListener('click', () => { if ((page + 1) * PAGE_SIZE < total) { page++; loadPage(); } });

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || key.startsWith('sb_secret_')) {
  $('people-refresh').disabled = true;
  message('people-message', 'Supabase 공개 연결 설정이 필요함.', true);
} else {
  try {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    loadPeople();
  } catch { message('people-message', '연결 설정을 확인해 주세요.', true); }
}
