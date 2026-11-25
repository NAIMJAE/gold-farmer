import { createClient } from '@supabase/supabase-js';
import { STATUS, safeUrl, formatDate, kstDay, defaultRange } from './format.js';
import { weekday, summarizeDays, groupWeeks } from './periods.js';
import './style.css';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 25;
let client, page = 0, total = 0, requestId = 0, people = [];
let search = '', sessionReady = false;
let currentItems = [], sortKey = '', sortDirection = 1;
const columnFilters = { title: '', method: '', prize: '', deadline: '', announce: '', status: '', updated: '' };
const range = { basis: 'done', from: '', to: '', strict: false };   // 조회 기준(참여일/발표일)과 기간(YYYY-MM-DD). strict: 날짜 없는 미참여 항목을 빼고 그 기간 참여분만
let periodItems = [], periodPerson = '', periodOpen = false;      // 회차별 참여 표: 상태·검색 필터와 무관한 전체 항목
let surveyCount = null, surveyRequest = 0;

const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

function preferredTheme() {
  return localStorage.getItem('theme') || (themeMedia.matches ? 'dark' : 'light');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  $('theme-toggle').querySelector('span').textContent = dark ? '☀' : '☾';
  $('theme-toggle').setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
  document.querySelector('meta[name="theme-color"]').content = dark ? '#101411' : '#f7f9f4';
}

applyTheme(preferredTheme());
$('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', theme);
  applyTheme(theme);
});
themeMedia.addEventListener('change', event => {
  if (!localStorage.getItem('theme')) applyTheme(event.matches ? 'dark' : 'light');
});

function showPeople() {
  requestId++;
  surveyRequest++;
  $('board-view').hidden = true;
  $('survey-view').hidden = true;
  $('people-view').hidden = false;
  $('events').replaceChildren();
  $('person').value = '';
  clearPeriods();
}

function selectPerson(key) {
  if (!people.some(p => p.key === key)) return;
  requestId++;
  $('person').value = key;
  page = 0;
  search = '';
  $('search').value = '';
  $('status').value = '';
  resetRange('done');
  ['total', 'completed', 'review', 'queued', 'pending'].forEach(k => $(`stat-${k}`).textContent = '—');
  clearPeriods();
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
    tr.append(event, node('td', item.platform || '미확인'), node('td', item.prize || '—', 'prize'), node('td', formatDate(item.deadline), 'date'),
      node('td', formatDate(item.announce), 'date'), status,
      node('td', formatDate(date, true), 'date'));
    return tr;
  }));
  $('empty').hidden = items.length > 0;
  $('total-count').textContent = `${total.toLocaleString('ko-KR')}개 이벤트`;
  $('page-info').textContent = total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} / ${total}` : '0개';
  $('prev').disabled = page === 0;
  $('next').disabled = (page + 1) * PAGE_SIZE >= total;
}

function applyGridView() {
  const statusText = item => STATUS[item.participation_status]?.[0] || STATUS.review[0];
  const values = {
    title: item => `${item.title || ''} ${item.host || ''} ${item.platform || ''}`,
    prize: item => item.prize || '',
    method: item => item.platform || '미확인',
    deadline: item => formatDate(item.deadline),
    announce: item => formatDate(item.announce),
    status: item => item.participation_status || 'review',
    updated: item => formatDate(item.participation?.updated_at, true),
  };
  let items = currentItems.filter(item => Object.entries(columnFilters).every(([key, filter]) => {
    if (!filter) return true;
    const value = key === 'status' ? values[key](item) : values[key](item).toLocaleLowerCase('ko-KR');
    return value.includes(filter.toLocaleLowerCase('ko-KR')) || (key === 'status' && statusText(item).includes(filter));
  }));
  if (range.from || range.to) {
    const byAnn = range.basis === 'ann';
    const day = byAnn ? item => kstDay(item.announce) : item => kstDay(item.participation?.updated_at);
    const today = todayKst();
    items = items.filter(item => {
      const d = day(item);
      if (!d) {
        // 참여일 기준: 참여일이 없는 미참여 항목은 마감이 안 지났을 때만(마감 없음 포함) 같이 보임 — 지난 것이 쌓이지 않게
        if (byAnn || range.strict) return false;
        const end = kstDay(item.deadline);
        return !end || end >= today;
      }
      return (!range.from || d >= range.from) && (!range.to || d <= range.to);
    });
  }
  if (sortKey) items = [...items].sort((a, b) => values[sortKey](a).localeCompare(values[sortKey](b), 'ko-KR', { numeric: true }) * sortDirection);
  total = items.length;
  page = Math.min(page, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
  render(items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
  syncPeriodSelection();
}

// 한 사람의 board_page 를 100건씩 끝까지 읽음. 중간에 요청이 바뀌면(isStale) null
async function fetchAll(person, status, term, isStale) {
  const items = [];
  let data;
  for (let offset = 0; ; offset += 100) {
    const result = await client.rpc('board_page', { p_person: person, p_status: status, p_search: term, p_offset: offset, p_limit: 100 });
    if (isStale()) return null;
    if (result.error || !result.data) throw new Error('query');
    data = result.data;
    items.push(...data.items);
    if (items.length >= Number(data.total)) break;
    if (!data.items.length) throw new Error('incomplete');
  }
  return { items, data };
}

async function loadPage(force = false) {
  if (!sessionReady || $('board-view').hidden || !$('person').value) return;
  const id = ++requestId;
  message('board-message', '기록을 불러오는 중…');
  $('refresh').disabled = true;
  $('events').replaceChildren();
  $('empty').hidden = true;
  $('prev').disabled = $('next').disabled = true;
  try {
    const person = $('person').value, status = $('status').value, term = search;
    currentItems = [];
    const got = await fetchAll(person, status, term, () => id !== requestId);
    if (!got) return;
    const { data } = got;
    currentItems = got.items;
    ['total', 'completed', 'review', 'queued', 'pending'].forEach(key => {
      $(`stat-${key}`).textContent = Number(data.summary[key] || 0).toLocaleString('ko-KR');
    });
    $('list-title').textContent = `${people.find(p => p.key === $('person').value)?.label || '참가자'}의 내역`;
    applyGridView();
    message('board-message', '');
    // 회차별 표는 상태·검색과 무관한 전체 기준: 필터 없이 읽은 때는 그대로 쓰고, 필터 중이면 따로 읽음(새로고침·사람 바뀜일 때만)
    if (!status && !term) setPeriods(person, got.items);
    else if (force || periodPerson !== person) loadPeriods(person, id);
  } catch {
    if (id === requestId) message('board-message', '기록을 불러오지 못했음. 연결·접근 권한을 확인한 뒤 새로고침해 주세요.', true);
  } finally {
    if (id === requestId) $('refresh').disabled = false;
  }
}

// ---- 회차별 참여 표(참여일별·주별 건수) ----
function clearPeriods() {
  periodItems = []; periodPerson = ''; periodOpen = false;
  $('period-card').hidden = true;
  $('period-body').replaceChildren();
}

function setPeriods(person, items) {
  periodItems = items; periodPerson = person;
  renderPeriods();
}

async function loadPeriods(person, id) {
  try {
    const all = await fetchAll(person, '', '', () => id !== requestId);
    if (all) setPeriods(person, all.items);
  } catch { /* 목록은 이미 떴으므로 표만 못 띄움 */ }
}

function pickRow(from, to, className, cells) {
  const tr = node('tr', null, `pick ${className}`);
  tr.dataset.from = from; tr.dataset.to = to;
  tr.tabIndex = 0;
  tr.setAttribute('role', 'button');
  tr.setAttribute('aria-pressed', 'false');
  tr.append(...cells);
  return tr;
}

function renderPeriods() {
  const weeks = groupWeeks(summarizeDays(periodItems, item => kstDay(item.participation?.updated_at)), todayKst());
  const dayCount = weeks.reduce((n, week) => n + week.days.length, 0);
  const shown = periodOpen ? weeks : weeks.slice(0, 2);
  const max = Math.max(1, ...weeks.flatMap(week => week.days.map(day => day.done)));
  const count = (n, className) => node('td', n ? n.toLocaleString('ko-KR') : '·', className);
  const today = todayKst();
  const rows = shown.flatMap(week => {
    const label = node('td', week.label);
    label.append(node('span', `${week.start.slice(5)} ~ ${week.end.slice(5)}`, 'period-sub'));
    return [
      pickRow(week.start, week.end, 'week-row', [label, count(week.done), count(week.check), count(week.skipped), node('td', null, 'bar-cell')]),
      ...week.days.map(day => {
        const date = node('td', day.day.slice(5));
        date.append(node('span', `${weekday(day.day)}${day.day === today ? ' · 오늘' : ''}`, 'period-sub'));
        const bar = node('td', null, 'bar-cell');
        const track = node('span', null, 'mini'), fill = node('span');
        fill.style.width = `${Math.round(day.done / max * 100)}%`;
        track.append(fill); bar.append(track);
        return pickRow(day.day, day.day, 'day-row', [date, count(day.done, 'ok'), count(day.check, 'mute'), count(day.skipped, 'mute'), bar]);
      }),
    ];
  });
  $('period-body').replaceChildren(...rows);
  $('period-body').closest('.table-wrap').hidden = !weeks.length;
  $('period-empty').hidden = weeks.length > 0;
  $('period-total').textContent = dayCount ? `${dayCount.toLocaleString('ko-KR')}회차` : '';
  $('period-more').hidden = weeks.length <= 2;
  $('period-more').textContent = periodOpen ? '접기' : `전체 ${dayCount.toLocaleString('ko-KR')}회차 보기`;
  $('period-card').hidden = false;
  syncPeriodSelection();
}

// 목록 기간이 표의 한 줄과 같으면 그 줄을 눌린 모양으로
function syncPeriodSelection() {
  document.querySelectorAll('#period-body .pick').forEach(row => {
    const on = range.basis === 'done' && range.strict && range.from === row.dataset.from && range.to === row.dataset.to;
    row.classList.toggle('sel', on);
    row.setAttribute('aria-pressed', String(on));
  });
}

function pickPeriod(from, to) {
  const same = range.basis === 'done' && range.strict && range.from === from && range.to === to;
  if (same) {
    resetRange('done');
  } else {
    Object.assign(range, { basis: 'done', from, to, strict: true });
    $('range-basis').value = 'done';
    $('range-from').value = from;
    $('range-to').value = to;
  }
  page = 0;
  applyGridView();
  if (!same) $('list-title').scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function resetRange(basis) {
  range.basis = basis;
  range.strict = false;
  [range.from, range.to] = defaultRange(basis, todayKst());
  $('range-basis').value = basis;
  $('range-from').value = range.from;
  $('range-to').value = range.to;
}

function todayKst() { return kstDay(new Date().toISOString()); }

function surveyQuery(select, options) {
  return client.from('surveys').select(select, options).or(`end_date.is.null,end_date.gte.${todayKst()}`);
}

async function addSurveyCard() {
  // 설문 표가 아직 없거나 못 읽으면 카드를 안 붙임
  try {
    const { count, error } = await surveyQuery('key', { count: 'exact', head: true });
    if (error) return;
    surveyCount = count || 0;
  } catch { return; }
  if (!$('people-cards').children.length || $('people-cards').querySelector('.survey-card')) return;
  const card = node('button', null, 'person-card survey-card');
  card.type = 'button';
  card.append(node('span', '✎', 'person-avatar'), node('strong', '직접 참여 설문'),
    node('span', `마감 전 ${surveyCount.toLocaleString('ko-KR')}건 · 링크 열어 직접 참여`, 'muted'));
  card.addEventListener('click', showSurveys);
  $('people-cards').append(card);
}

function showSurveys() {
  requestId++;
  $('people-view').hidden = true;
  $('board-view').hidden = true;
  $('survey-view').hidden = false;
  loadSurveys();
}

async function loadSurveys() {
  const id = ++surveyRequest;
  message('survey-message', '설문을 불러오는 중…');
  $('survey-refresh').disabled = true;
  $('surveys').replaceChildren();
  $('survey-empty').hidden = true;
  try {
    const { data, error } = await surveyQuery('key,title,host,prize,end_date,ann_date,platform,url,post,memo,need,q_direct,q_total,questions')
      .order('end_date', { ascending: true, nullsFirst: false }).order('q_direct', { ascending: true });
    if (id !== surveyRequest) return;
    if (error) throw new Error('surveys');
    renderSurveys(data || []);
    message('survey-message', '');
  } catch {
    if (id === surveyRequest) message('survey-message', '설문을 불러오지 못했음. 연결을 확인한 뒤 새로고침해 주세요.', true);
  } finally {
    if (id === surveyRequest) $('survey-refresh').disabled = false;
  }
}

function linkNode(text, href, className) {
  const a = node('a', text, className);
  a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}

function renderSurveys(items) {
  const today = todayKst();
  $('surveys').replaceChildren(...items.map(item => {
    const tr = node('tr');
    const url = safeUrl(item.url);
    const cell = node('td');
    cell.append(url ? linkNode(item.title, url, 'event-title') : node('span', item.title, 'event-title'),
      node('span', [item.host, item.platform].filter(Boolean).join(' · '), 'event-host'));
    if (item.memo) cell.append(node('span', item.memo, 'survey-memo'));
    if (item.need) cell.append(node('span', item.need, 'status-detail'));
    const questions = node('td');
    const count = node('span', item.q_direct == null ? '—' : `${item.q_direct}개`, 'badge pending');
    if (item.questions?.length) count.title = item.questions.join('\n');
    questions.append(count);
    if (item.q_total != null) questions.append(node('span', `전체 ${item.q_total}문항`, 'status-detail'));
    const deadline = node('td', formatDate(item.end_date), 'date');
    if (item.end_date === today) deadline.append(node('span', '오늘 마감', 'badge review today-badge'));
    const links = node('td', null, 'survey-links');
    if (url) links.append(linkNode('참여하기', url, 'secondary'));
    const post = safeUrl(item.post);
    if (post) links.append(linkNode('게시물', post, 'post-link'));
    tr.append(cell, node('td', item.prize || '—', 'prize'), questions, deadline, node('td', formatDate(item.ann_date), 'date'), links);
    return tr;
  }));
  $('survey-empty').hidden = items.length > 0;
  $('survey-count').textContent = `${items.length.toLocaleString('ko-KR')}개 설문`;
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
    addSurveyCard();
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
$('back-survey').addEventListener('click', () => { showPeople(); $('people-title').focus(); });
$('survey-refresh').addEventListener('click', loadSurveys);
$('range-basis').addEventListener('change', () => { resetRange($('range-basis').value); page = 0; applyGridView(); });
['range-from', 'range-to'].forEach(id => $(id).addEventListener('change', () => {
  range.from = $('range-from').value;
  range.to = $('range-to').value;
  range.strict = false;
  page = 0;
  applyGridView();
}));
$('period-body').addEventListener('click', event => {
  const row = event.target.closest('.pick');
  if (row) pickPeriod(row.dataset.from, row.dataset.to);
});
$('period-body').addEventListener('keydown', event => {
  const row = event.target.closest('.pick');
  if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); pickPeriod(row.dataset.from, row.dataset.to); }
});
$('period-more').addEventListener('click', () => { periodOpen = !periodOpen; renderPeriods(); });
$('people-title').tabIndex = -1;
$('people-refresh').addEventListener('click', loadPeople);
$('person').addEventListener('change', () => selectPerson($('person').value));
$('status').addEventListener('change', () => { page = 0; loadPage(); });
$('search-form').addEventListener('submit', event => { event.preventDefault(); search = $('search').value.trim(); page = 0; loadPage(); });
$('refresh').addEventListener('click', () => sessionReady ? loadPage(true) : loadPeople());
$('prev').addEventListener('click', () => { if (page) { page--; applyGridView(); } });
$('next').addEventListener('click', () => { if ((page + 1) * PAGE_SIZE < total) { page++; applyGridView(); } });
const methodHeader = node('th');
methodHeader.scope = 'col';
const methodSort = node('button');
methodSort.type = 'button';
methodSort.dataset.sort = 'method';
methodSort.append(document.createTextNode('참여방법 '), node('span', '↕'));
methodHeader.append(methodSort);
document.querySelector('.column-head').children[0].after(methodHeader);
const methodFilterCell = node('th');
const methodFilter = node('input');
methodFilter.dataset.filter = 'method';
methodFilter.placeholder = '참여방법 필터';
methodFilter.setAttribute('aria-label', '참여방법 열 필터');
methodFilterCell.append(methodFilter);
document.querySelector('.column-filters').children[0].after(methodFilterCell);
$('list-title').parentElement.querySelector('.grid-note').textContent = '열 제목을 눌러 정렬 · 전체 목록에서 열별 필터';
document.querySelectorAll('[data-filter]').forEach(control => control.addEventListener('input', () => {
  columnFilters[control.dataset.filter] = control.value.trim();
  page = 0;
  applyGridView();
}));
document.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.sort;
  sortDirection = sortKey === key ? -sortDirection : 1;
  sortKey = key;
  page = 0;
  document.querySelectorAll('[data-sort]').forEach(item => {
    const active = item.dataset.sort === sortKey;
    item.classList.toggle('active', active);
    item.querySelector('span').textContent = active ? (sortDirection === 1 ? '↑' : '↓') : '↕';
  });
  applyGridView();
}));

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
