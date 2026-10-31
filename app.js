/* Gestão de Serviço – 27º BPM Batalhão Cabanagem. Dados ficam somente neste aparelho (localStorage). */
'use strict';
const KEY = 'gvtr27.v1';
const APP_VERSION = '1.4 (30/10/2026)';
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const HIST_KEY = 'gvtr27.hist';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = (n) => String(n).padStart(2, '0');
const AREAS = EscalaParser.AREAS;
const CIAS = ['1', '2', '3'];
const GRADS = ['CEL', 'TEN CEL', 'MAJ', 'CAP', '1º TEN', '2º TEN', 'ASP OF', 'SUB TEN', 'SUB TEN RR', '1º SGT', '2º SGT', '3º SGT', '3º SGT RR', 'CB', 'SD'];
const GRAD_ORD = (g) => { const i = GRADS.findIndex((x) => (g || '').startsWith(x)); return i < 0 ? 99 : i; };
const DOW = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
const DOW3 = ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.'];
const T1 = [420, 1140], T2 = [1140, 1860];

const STATUS = {
  area: { e: '🟢', l: 'Na área' },
  qaj: { e: '🍽️', l: 'QAJ / Pausa' },
  ocorrencia: { e: '🚨', l: 'Ocorrência' },
  conduzindo: { e: '🚓', l: 'Conduzindo' },
  deslocamento: { e: '🔄', l: 'Deslocamento' },
  abastecimento: { e: '⛽', l: 'Abastecendo' },
  operacao: { e: '🎯', l: 'Em operação' },
  apoio: { e: '🤝', l: 'Apoio' },
  baixada: { e: '🔴', l: 'Baixada' },
};
const TIPOS = {
  fiscal: 'Oficial de Dia', ordinario: 'Ordinário', gpa: 'GPA', recobrimento: 'Recobrimento', extra: 'Extraordinário',
  permanencia: 'Permanência', reserva: 'Reserva de Armamento', adm: 'Administrativo',
};
const POSTOS = ['permanencia', 'reserva', 'adm'];
const VTR_ST = { pronto: { e: '🟢', l: 'No pronto' }, manut: { e: '🟡', l: 'Manutenção' }, baixada: { e: '🔴', l: 'Baixada' } };

const DEFAULT_ASSUNTOS = [
  'Orientações para cumprir o Cartão Programa;',
  'Postura e conduta no Policiamento;',
  'Postagem correta de fotos das ações realizadas;',
  'Encaminhamento de ocorrências, relatórios e demais documentos;',
  'Inspeção, primeiro escalão, higienização e outros cuidados com as Viaturas; e',
  'Sinistro com viaturas',
  "Orientação sobre preenchimento do formulário do check list das vtr's.",
  'Orientações sobre as Operações e Ações previstas para o Turno de Serviço',
];

function defaults() {
  const baix = { 2705: 'Op. Barcarena', 2716: 'Sinistro', 2720: 'Sinistro', 2721: 'Sinistro', 2723: 'Sinistro - foi no guincho', 2724: 'Viagem - Op. Finados' };
  const vtrs = [];
  for (let n = 2701; n <= 2727; n++) vtrs.push({ id: String(n), status: baix[n] ? 'baixada' : 'pronto', obs: baix[n] || '', modelo: n === 2727 ? 'Duster' : '' });
  return {
    v: 1,
    config: {
      nomeGuerra: 'ASP OF LUCAS SANTOS', cmtCpc: 'CEL PM ILANISE', subCpc: 'TEN CEL L. ARAÚJO', cmtBpm: 'MAJ BRUNO GAMA',
      subBpm: 'CAP. ANA PAULA', fiscal: '', localInicio: 'Sede da 1ª CIA/27º BPM', assuntos: DEFAULT_ASSUNTOS.slice(),
    },
    vtrs,
    militares: {},
    servico: novoServico(),
    ui: { tab: 'painel', filtro: 'agora', modo: 'cia', rel: 'mapa' },
  };
}
function novoServico(data) {
  return { data: data || hojeISO(), pelotao: '', empregos: [], operacoes: [], tarefas: [], rondas: [], eventos: [], avisos: [], avulsos: [], log: [], notif: {}, fontes: [] };
}
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !S.v) S = defaults();
S.ui = Object.assign({ tab: 'painel', filtro: 'agora', modo: 'cia', rel: 'mapa' }, S.ui || {});
S.config.alertas = Object.assign({ ativo: true, antecedencia: 15, limOcorr: 60, limQaj: 40 }, S.config.alertas || {});
S.servico.notif = S.servico.notif || {};
S.servico.fontes = S.servico.fontes || [];
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ Não foi possível salvar'); } }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- tempo ---------- */
const toMin = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
function span(e) {
  const s = toMin(e.inicio); if (s == null) return null;
  const st = s + (e.d || 0) * 1440;
  let en = toMin(e.fim); if (en == null) en = s;
  let end = en + (e.d || 0) * 1440; if (end <= st) end += 1440;
  return [st, end];
}
function svcDate() { return new Date((S.servico.data || hojeISO()) + 'T00:00:00'); }
function nowMin() { return Math.floor((Date.now() - svcDate().getTime()) / 60000); }
const hhmm = (min) => { const m = ((min % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const hh = (min) => { const m = ((min % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + 'h' + pad(m % 60); };
const hStr = (s) => (s ? s.replace(':', 'h') : '');
const dataBR = (iso) => { const [y, m, d] = (iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
const dowOf = (iso) => DOW[new Date(iso + 'T12:00:00').getDay()];
const overlap = (a, b) => (a && b ? Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0])) : 0);
const isActive = (e, now) => { const sp = span(e); return sp && now >= sp[0] && now < sp[1]; };
const ago = (ts) => { if (!ts) return ''; const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${pad(m % 60)}`; };
function turnoWin(t) { return t === '2' ? T2 : T1; }
function noTurno(e, t) {
  if (['fiscal', 'ordinario'].includes(e.tipo) && e.turno) return e.turno === t;
  if (POSTOS.includes(e.tipo)) return true;
  return overlap(span(e), turnoWin(t)) >= 30;
}

/* ---------- militares ---------- */
const mkey = (m) => (m.rg ? 'rg' + m.rg : 'n' + (m.grad + ' ' + m.nome).toUpperCase().replace(/\s+/g, '_'));
function upsertMilitar(m) {
  const k = mkey(m);
  const cur = S.militares[k] || {};
  S.militares[k] = { rg: m.rg || cur.rg || '', grad: m.grad || cur.grad || '', nome: (m.nome || cur.nome || '').toUpperCase(), unidade: m.unidade ?? cur.unidade ?? '' };
  return k;
}
function milName(k, unidade = true) {
  const m = S.militares[k]; if (!m) return '—';
  return `${m.grad} ${m.nome}`.trim() + (unidade && m.unidade ? ` (${m.unidade})` : '');
}
const isMe = (k) => k && milName(k, false).replace(/\./g, '').replace(/\s+/g, ' ') === S.config.nomeGuerra.replace(/\./g, '').replace(/\s+/g, ' ');
function empsOf(k) { return S.servico.empregos.filter((e) => e.membros.some((m) => m.mk === k)); }
function keysNoServico() {
  const set = new Set(S.servico.avulsos);
  S.servico.empregos.forEach((e) => e.membros.forEach((m) => m.mk && set.add(m.mk)));
  return [...set].filter((k) => S.militares[k]);
}

/* ---------- registro ---------- */
function log(msg, ref) { S.servico.log.push({ t: Date.now(), msg, ref }); }
const empById = (id) => S.servico.empregos.find((e) => e.id === id);
const opById = (id) => S.servico.operacoes.find((o) => o.id === id);
function empLabel(e) {
  if (e.vtr) return 'VTR ' + e.vtr;
  const m = e.membros[0]; return (TIPOS[e.tipo] || '') + (m && m.mk ? ' – ' + milName(m.mk, false) : '');
}
function empArea(e) {
  const p = [];
  if (e.cia) p.push(e.cia + 'ª Cia');
  if (e.bairro) p.push(e.bairro);
  return p.join(' · ');
}
function rotulo(e) {
  if (e.rotulo) return e.rotulo;
  if (e.tipo === 'fiscal') return 'Fiscal de Dia';
  const l = (e.local || '').toUpperCase();
  if (/^QUADRANTE/.test(l)) return 'QUADRANTE';
  if (l && l.length <= 26) return l;
  return (e.bairro || '').toUpperCase() || l.slice(0, 26);
}
function conflitos(e) {
  const out = [];
  const sp = span(e);
  const v = S.vtrs.find((x) => x.id === e.vtr);
  if (v && v.status === 'baixada') out.push(`VTR ${e.vtr} está BAIXADA na frota`);
  if (v && v.status === 'manut') out.push(`VTR ${e.vtr} em manutenção`);
  for (const o of S.servico.empregos) {
    if (o === e || !sp) continue;
    const ov = overlap(sp, span(o));
    if (!ov) continue;
    if (e.vtr && o.vtr === e.vtr) out.push(`VTR também em ${o.operacao || TIPOS[o.tipo]} (${o.inicio}–${o.fim})`);
    for (const m of e.membros) if (m.mk && o.membros.some((x) => x.mk === m.mk)) out.push(`${milName(m.mk, false)} também na ${empLabel(o)}`);
  }
  return out;
}

/* ---------- importação ---------- */
function dayOffset(tipo, ini, isTarefa) {
  const m = toMin(ini); if (m == null) return 0;
  if (isTarefa) return m < 420 ? 1 : 0;
  if (tipo === 'extra') return m < 240 ? 1 : 0;
  if (['ordinario', 'fiscal', 'gpa', 'recobrimento'].includes(tipo)) return m < 300 ? 1 : 0;
  return 0;
}
const TIPO_ESC = { ordinario: '🚔 Ordinária', extra: '🟨 Extraordinária' };
// Remove do serviço tudo o que veio de uma escala (fonte) importada.
function removerFonte(fid) {
  const sv = S.servico;
  const saem = new Set();
  sv.empregos.filter((e) => e.fonte === fid).forEach((e) => e.membros.forEach((m) => m.mk && saem.add(m.mk)));
  sv.empregos = sv.empregos.filter((e) => e.fonte !== fid);
  sv.operacoes = sv.operacoes.filter((o) => o.fonte !== fid);
  sv.tarefas = sv.tarefas.filter((t) => t.fonte !== fid);
  sv.rondas = sv.rondas.filter((r) => r.fonte !== fid);
  sv.fontes = sv.fontes.filter((x) => x.id !== fid);
  sv.avulsos = sv.avulsos.filter((k) => !saem.has(k) || empsOf(k).length);
}
// modo: 'novo' (novo serviço) | 'add' (juntar ao serviço atual; escala do mesmo tipo e data é substituída)
function applyParsed(results, modo) {
  const datas = results.map((r) => r.data).filter(Boolean);
  const dataAlvo = (results.find((r) => r.tipo === 'ordinario' && r.data) || {}).data || datas[0];
  if (modo === 'novo') {
    arquivarServico('antes-da-importacao');
    S.servico = novoServico(dataAlvo || hojeISO()); S.servico._id = uid();
    log('Novo serviço criado por importação de escala');
  } else if (!S.servico.data && dataAlvo) S.servico.data = dataAlvo;
  const sv = S.servico; sv.fontes = sv.fontes || [];
  let nE = 0, nM = 0, subst = 0;
  for (const r of results) {
    const antiga = sv.fontes.find((x) => x.tipo === r.tipo && x.data === r.data);
    if (antiga) { removerFonte(antiga.id); subst++; log(`${TIPO_ESC[r.tipo]} de ${dataBR(r.data)} substituída pela nova versão (${r.arquivo})`); }
    const fid = 'f' + uid();
    sv.fontes.push({ id: fid, tipo: r.tipo, data: r.data, arquivo: r.arquivo, em: Date.now(), n: r.empregos.filter((e) => !e._skip).length });
    if (r.pelotao) sv.pelotao = r.pelotao;
    const opMap = {};
    for (const o of r.operacoes) {
      const id = 'op' + uid();
      opMap[o.id] = id;
      sv.operacoes.push({ ...o, id, d: dayOffset('extra', o.inicio), fonte: fid });
    }
    for (const e of r.empregos) {
      if (e._skip) continue;
      const membros = e.membros.filter((m) => !(m.vazio && m.funcao === 'PAT')).map((m) => {
        if (m.vazio || !m.nome) return { funcao: m.funcao, mk: null };
        const before = Object.keys(S.militares).length;
        const k = upsertMilitar(m);
        if (Object.keys(S.militares).length > before) nM++;
        return { funcao: m.funcao, mk: k };
      });
      const tipo = e.tipo;
      sv.empregos.push({
        id: 'e' + uid(), tipo, operacao: e.operacao, opId: opMap[e.opId] || '', vtr: e.vtr, cia: e.cia, bairro: e.bairro,
        local: e.local, rotulo: '', inicio: e.inicio, fim: e.fim, d: dayOffset(tipo, e.inicio), turno: e.turno, qaj: e.qaj,
        missao: e.missao, membros, status: tipo === 'extra' ? 'operacao' : 'area', statusDesde: null, statusObs: '', fonte: fid,
      });
      nE++;
    }
    for (const t of r.tarefas || []) sv.tarefas.push({ ...t, id: 't' + uid(), d: dayOffset('', t.inicio, true), fonte: fid });
    for (const x of r.rondas || []) sv.rondas.push({ ...x, id: 'r' + uid(), fonte: fid });
    sv.avisos.push(...(r.avisos || []));
    log(`${TIPO_ESC[r.tipo]} importada (${r.arquivo}): ${r.empregos.length} postos/GUs, ${(r.tarefas || []).length} tarefas`);
  }
  save();
  return { nE, nM, subst };
}

/* ---------- ações de emprego ---------- */
function setStatus(id, st) {
  const e = empById(id); if (!e) return;
  if (e.status === st) return;
  e.status = st; e.statusDesde = Date.now();
  log(`${empLabel(e)}: ${STATUS[st].e} ${STATUS[st].l}`, id);
  save();
}
function assign(empId, idx, k) {
  const e = empById(empId); const sp = span(e);
  const slot = e.membros[idx];
  const prev = slot.mk;
  if (prev === k) return;
  // retirar o militar de outras GUs no mesmo horário
  for (const o of S.servico.empregos) {
    if (o === e || !overlap(sp, span(o))) continue;
    const i = o.membros.findIndex((m) => m.mk === k);
    if (i >= 0) {
      if (o.membros[i].funcao === 'PAT') o.membros.splice(i, 1); else o.membros[i].mk = null;
      log(`${milName(k)} saiu da ${empLabel(o)} (${o.inicio}–${o.fim})`, o.id);
    }
  }
  slot.mk = k;
  S.servico.avulsos = S.servico.avulsos.filter((x) => x !== k);
  if (prev && !empsOf(prev).length) S.servico.avulsos.push(prev);
  log(`${milName(k)} escalado como ${slot.funcao} na ${empLabel(e)}` + (prev ? ` (substituiu ${milName(prev)})` : ''), empId);
  save();
}
function unassign(empId, idx) {
  const e = empById(empId); const m = e.membros[idx];
  if (m.mk) {
    log(`${milName(m.mk)} retirado da ${empLabel(e)}`, empId);
    const k = m.mk;
    if (m.funcao === 'PAT') e.membros.splice(idx, 1); else m.mk = null;
    if (!empsOf(k).length && !S.servico.avulsos.includes(k)) S.servico.avulsos.push(k);
  } else if (m.funcao === 'PAT') e.membros.splice(idx, 1);
  save();
}

/* ================= UI base ================= */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200); }
let sheetOpen = false, sheetCtx = null, stack = [], navPop = false, ignorePop = 0;
const sheetKey = (c) => [c.kind, c.id || '', c.k || '', c.empId || '', c.idx ?? ''].join(':');
// Abre uma tela inferior. Cada tela nova entra na pilha do botão "voltar" do Android.
function openSheet(html, ctx, opts = {}) {
  ctx = ctx || { kind: 'misc' };
  $('#sheetBody').innerHTML = '<div class="grab"></div>' + html;
  $('#sheet').classList.remove('hidden');
  const key = sheetKey(ctx), top = stack[stack.length - 1];
  if (navPop) { /* reabrindo após "voltar" */ }
  else if (top && (opts.replace || top.key === key)) { top.key = key; top.reopen = opts.reopen || top.reopen; }
  else { stack.push({ key, reopen: opts.reopen }); history.pushState({ sheet: stack.length }, ''); }
  sheetOpen = true; sheetCtx = ctx;
  if (!top || top.key !== key) $('#sheetBody').scrollTop = 0;
}
function hideSheet() { $('#sheet').classList.add('hidden'); sheetOpen = false; sheetCtx = null; render(); }
function closeSheet() {
  const n = stack.length; stack = [];
  hideSheet();
  if (n) { ignorePop++; history.go(-n); }
}
function sheetBack() { history.back(); }
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  if (dlgResolve) { closeDlg(null, true); return; }
  if (!stack.length) return;
  stack.pop();
  const top = stack[stack.length - 1];
  if (top && top.reopen) { navPop = true; try { top.reopen(); } finally { navPop = false; } }
  else { stack = []; hideSheet(); }
});
$('#sheet .bk').addEventListener('click', () => closeSheet());

/* ---------- janela de diálogo própria (substitui confirm/prompt) ---------- */
let dlgResolve = null;
function ask({ title, msg = '', fields = [], ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise((res) => {
    if (dlgResolve) dlgResolve(null);
    dlgResolve = res;
    $('#dlgBox').innerHTML = `<div class="dlg-t">${esc(title)}</div>${msg ? `<div class="dlg-m">${msg}</div>` : ''}
      ${fields.map((f) => `<label class="f"><span>${esc(f.label)}</span><input id="dlg_${f.id}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.mode ? `inputmode="${f.mode}"` : ''} autocomplete="off"></label>`).join('')}
      <div class="row mt"><button class="btn" data-dlg="0" style="flex:1">${esc(cancel)}</button><button class="btn ${danger ? 'pri' : 'blue'}" data-dlg="1" style="flex:1">${esc(ok)}</button></div>`;
    $('#dlg').classList.remove('hidden');
    history.pushState({ dlg: 1 }, '');
    const first = $('#dlgBox input'); if (first) setTimeout(() => first.focus(), 60);
    $('#dlgBox').onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('[data-dlg="1"]').click(); } };
    $('#dlgBox').dataset.fields = JSON.stringify(fields.map((f) => f.id));
  });
}
function closeDlg(val, fromPop) {
  $('#dlg').classList.add('hidden');
  const r = dlgResolve; dlgResolve = null;
  if (!fromPop) { ignorePop++; history.back(); }
  if (r) r(val);
}
$('#dlg').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-dlg]');
  if (ev.target.classList.contains('bk')) return closeDlg(null);
  if (!b) return;
  if (b.dataset.dlg === '0') return closeDlg(null);
  const ids = JSON.parse($('#dlgBox').dataset.fields || '[]');
  if (!ids.length) return closeDlg(true);
  const out = {}; ids.forEach((id) => (out[id] = $('#dlg_' + id).value.trim()));
  closeDlg(out);
});

function setTab(t) { S.ui.tab = t; save(); $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); render(); window.scrollTo(0, 0); }
$('#tabs').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });

function tick() {
  const d = new Date();
  $('#clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
}
setInterval(() => { tick(); checkAlerts(); if (!sheetOpen && !dlgResolve && ['painel', 'agenda'].includes(S.ui.tab) && !document.activeElement.matches('input,textarea,select')) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); checkAlerts(); if (!sheetOpen) render(); } });

/* ================= ALERTAS ================= */
const dur = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${pad(min % 60)}`);
function statusExcedido(e) {
  if (!e.statusDesde) return 0;
  const lim = ['ocorrencia', 'conduzindo'].includes(e.status) ? S.config.alertas.limOcorr : e.status === 'qaj' ? S.config.alertas.limQaj : 0;
  if (!lim) return 0;
  const m = Math.floor((Date.now() - e.statusDesde) / 60000);
  return m >= lim ? m : 0;
}
async function notify(title, body, tag) {
  if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
  showAlertBar(title, body);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    const opt = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [250, 120, 250], renotify: true };
    if (reg) reg.showNotification(title, opt); else new Notification(title, opt);
  } catch (e) { /* sem notificação do sistema */ }
}
let alertQueue = [];
function showAlertBar(title, body) {
  alertQueue.push({ title, body, t: Date.now() });
  alertQueue = alertQueue.slice(-4);
  drawAlertBar();
}
function drawAlertBar() {
  const el = $('#alertbar');
  if (!alertQueue.length) { el.classList.add('hidden'); return; }
  el.innerHTML = alertQueue.map((x, i) => `<div class="al"><div class="grow"><b>${esc(x.title)}</b><div>${esc(x.body)}</div></div><button class="iconbtn" data-al="${i}" aria-label="Dispensar">✕</button></div>`).join('');
  el.classList.remove('hidden');
}
$('#alertbar').addEventListener('click', (ev) => { const b = ev.target.closest('[data-al]'); if (!b) return; alertQueue.splice(+b.dataset.al, 1); drawAlertBar(); });
function checkAlerts() {
  const cfg = S.config.alertas; if (!cfg.ativo || !S.servico.empregos.length) return;
  const now = nowMin(), N = (S.servico.notif = S.servico.notif || {}); let changed = false;
  const due = agendaEvents().filter((ev) => !ev.done && ['op', 'qaj', 'turno', 'tarefa', 'manual', 'fim'].includes(ev.kind) && now >= ev.t - cfg.antecedencia && now <= ev.t + 2);
  const fresh = due.filter((ev) => !N['ev' + ev.kind + ev.t + ev.title]);
  if (fresh.length) {
    fresh.forEach((ev) => (N['ev' + ev.kind + ev.t + ev.title] = 1));
    const first = fresh[0]; const falta = first.t - now;
    const title = `⏰ ${falta > 0 ? 'Em ' + falta + ' min' : 'Agora'} (${hhmm(first.t)}): ${first.title.replace(/^\W+\s*/, '')}`;
    const body = fresh.length > 1 ? fresh.slice(1).map((x) => `${hhmm(x.t)} ${x.title}`).join(' · ') : (first.sub || '');
    notify(title, body.slice(0, 220), 'ev' + first.t); changed = true;
  }
  for (const e of S.servico.empregos) {
    if (!isActive(e, now)) continue;
    const m = statusExcedido(e); if (!m) continue;
    const key = 'st' + e.id + e.statusDesde;
    if (N[key]) continue;
    N[key] = 1; changed = true;
    notify(`⏱️ ${empLabel(e)}: ${dur(m)} em ${STATUS[e.status].l}`, `${e.statusObs || ''} Limite: ${['qaj'].includes(e.status) ? cfg.limQaj : cfg.limOcorr} min`.trim(), key);
  }
  if (changed) save();
}
async function pedirNotificacao() {
  if (!('Notification' in window)) return toast(IS_IOS && !IS_STANDALONE ? 'No iPhone, instale o app (Compartilhar → Adicionar à Tela de Início) para receber alertas' : 'Este aparelho não suporta notificações; os alertas aparecem dentro do app');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? '🔔 Notificações ativadas' : '🔕 Notificações bloqueadas no navegador');
  render();
}

/* ================= HISTÓRICO / BACKUP AUTOMÁTICO ================= */
function getHist() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (e) { return []; } }
function arquivarServico(motivo) {
  const sv = S.servico;
  if (!sv.empregos.length && !sv.log.length) return false;
  const h = getHist().filter((x) => x.id !== sv._id);
  h.unshift({ id: sv._id || uid(), data: sv.data, salvoEm: Date.now(), motivo, servico: sv });
  try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 5))); } catch (e) { try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 2))); } catch (e2) {} }
  download(`backup-27bpm-${sv.data}-${motivo}.json`, JSON.stringify({ ...S, servico: sv }));
  return true;
}

function renderHeader() {
  $('#who').textContent = S.config.nomeGuerra + ' · Oficial de Dia';
  const sv = S.servico;
  let h = `<div class="svc">📅 <b>${dataBR(sv.data)}</b> ${sv.data ? dowOf(sv.data).toLowerCase() : ''}${sv.pelotao ? ' · ' + esc(sv.pelotao) : ''} · ${sv.empregos.filter((e) => e.vtr).length} GUs · ${keysNoServico().length} militares${(sv.fontes || []).length ? ' · 📄 ' + ['ordinario', 'extra'].map((t) => (sv.fontes.some((x) => x.tipo === t) ? '✓' : '✗') + (t === 'extra' ? 'Extra' : 'Ord')).join(' ') : ''}</div>`;
  if (S.ui.tab === 'painel') {
    h += `<div class="chips">` + [['agora', 'Agora'], ['1', '1º Turno'], ['2', '2º Turno'], ['tudo', 'Tudo']].map(([k, l]) => `<button class="chip ${S.ui.filtro === k ? 'on' : ''}" data-filtro="${k}">${l}</button>`).join('') +
      `<button class="chip" data-modo="1">${S.ui.modo === 'cia' ? '🗺️ Por Cia' : '🎯 Por missão'}</button></div>`;
  }
  $('#svcbar').innerHTML = h;
}
$('#svcbar').addEventListener('click', (ev) => {
  const f = ev.target.closest('[data-filtro]'); if (f) { S.ui.filtro = f.dataset.filtro; save(); render(); }
  if (ev.target.closest('[data-modo]')) { S.ui.modo = S.ui.modo === 'cia' ? 'missao' : 'cia'; save(); render(); }
});

function render() {
  renderHeader();
  const v = $('#view');
  const fn = { painel: renderPainel, agenda: renderAgenda, efetivo: renderEfetivo, frota: renderFrota, relatorios: renderRelatorios }[S.ui.tab] || renderPainel;
  const y = window.scrollY;
  v.innerHTML = fn();
  if (S.ui.tab === 'relatorios') mountRelatorio();
  window.scrollTo(0, y);
}

/* ================= PAINEL ================= */
function filtroEmp(e, now) {
  const f = S.ui.filtro;
  if (f === 'tudo') return true;
  if (f === 'agora') { const sp = span(e); return !sp || (now >= sp[0] - 30 && now < sp[1]); }
  return noTurno(e, f);
}
function iosTip() {
  if (!IS_IOS || IS_STANDALONE) return '';
  return `<div class="ios-tip"><span style="font-size:22px">📲</span><div><b>Instalar no iPhone:</b> no Safari, toque em <b>Compartilhar</b> (quadrado com seta ⬆️) → <b>Adicionar à Tela de Início</b>. Abra sempre pelo ícone: assim os dados ficam guardados e os alertas funcionam.</div></div>`;
}
function emptyState() {
  return iosTip() + `<div class="empty"><img src="brasao.png" alt=""><h3 style="color:var(--tx);font-size:17px;text-transform:none;letter-spacing:0">Nenhum serviço carregado</h3>
  <p>Importe a escala <b>ordinária</b> e a <b>extraordinária</b> em PDF (pode escolher as duas juntas ou uma de cada vez). O app junta tudo no mesmo serviço e separa por Cia, operação e horário.</p>
  <button class="btn pri" data-act="importar">📄 Importar escalas (PDF)</button>
  <p class="mt"><button class="btn sm ghost" data-act="novoemp">+ Criar GU manualmente</button></p></div>`;
}
function cardEmp(e, now) {
  const sp = span(e);
  const before = sp && now < sp[0], after = sp && now >= sp[1];
  const st = STATUS[e.status] || STATUS.area;
  const gu = e.membros.map((m) => `<b>${m.funcao === 'POSTO' || m.funcao === 'ADM' ? '' : m.funcao}</b> ${m.mk ? esc(milName(m.mk)) : '<span class="muted">vago</span>'}`).join(' · ');
  const me = e.membros.some((m) => isMe(m.mk));
  const cf = conflitos(e);
  let stTxt = `${st.e} ${st.l} <small>${ago(e.statusDesde)}</small>`;
  if (before) stTxt = `⏳ Inicia ${hStr(e.inicio)}${e.d ? ' (+1)' : ''}`;
  if (after) stTxt = `✔️ Encerrado ${hStr(e.fim)}`;
  if (e.statusObs && !before && !after) stTxt += ` <small>· ${esc(e.statusObs)}</small>`;
  const exc = !before && !after ? statusExcedido(e) : 0;
  if (exc) stTxt += `<span class="late">⏱️ ${dur(exc)} – acima do limite</span>`;
  const tag = e.opId || e.operacao ? `<span class="tag op">${esc((e.operacao || '').replace(/^OPERA[ÇC][ÃA]O\s*/i, '').slice(0, 18))}</span>` : `<span class="tag">${esc(TIPOS[e.tipo] || e.tipo)}</span>`;
  const qaj = e.qaj ? ` · 🍽️ ${e.qaj.replace(/:/g, 'h').replace('-', '–')}` : '';
  return `<button class="card s-${before || after ? 'x' : e.status} ${after ? 'off' : ''} ${exc ? 'exc' : ''}" data-act="emp" data-lp="1" data-id="${e.id}">
    <div class="r1"><span class="vtr">${e.vtr ? esc(e.vtr) : '📍'}</span>${tag}${me ? '<span class="tag me">VOCÊ</span>' : ''}<span class="time">${hStr(e.inicio)}–${hStr(e.fim)}</span></div>
    <div class="loc">${esc([empArea(e), e.local].filter(Boolean).join(' — ') || '—')}${qaj}</div>
    <div class="gu">${gu}</div>
    <div class="st">${stTxt}</div>
    ${cf.length ? `<div class="warn">⚠️ ${esc(cf[0])}${cf.length > 1 ? ` (+${cf.length - 1})` : ''}</div>` : ''}
  </button>`;
}
function secHtml(title, cls, emps, now, sub) {
  if (!emps.length && !sub) return '';
  let inner = '';
  if (sub) {
    for (const [bt, list] of sub) if (list.length) inner += `<h3 class="bairro-h"><span>📍 ${esc(bt)}</span><span>${list.length}</span></h3><div class="grid">${list.map((e) => cardEmp(e, now)).join('')}</div>`;
    if (!inner) return '';
  } else inner = `<div class="grid">${emps.map((e) => cardEmp(e, now)).join('')}</div>`;
  const n = sub ? sub.reduce((a, [, l]) => a + l.length, 0) : emps.length;
  return `<div class="sec ${cls}"><h2>${title} <span class="n">${n}</span></h2>${inner}</div>`;
}
const sortEmp = (a, b) => ((span(a) || [0])[0] - (span(b) || [0])[0]) || String(a.vtr).localeCompare(String(b.vtr));
function renderPainel() {
  const sv = S.servico;
  if (!sv.empregos.length) return emptyState();
  const now = nowMin();
  const list = sv.empregos.filter((e) => filtroEmp(e, now)).sort(sortEmp);
  // contadores (GUs com VTR ativas agora)
  const ativos = sv.empregos.filter((e) => e.vtr && isActive(e, now));
  const cnt = (st) => ativos.filter((e) => st.includes(e.status)).length;
  let h = iosTip() + `<div class="counters">
    <div class="counter"><b>${ativos.length}</b><span>GUs agora</span></div>
    <div class="counter"><b style="color:var(--ok)">${cnt(['area', 'operacao', 'apoio'])}</b><span>Na área/op.</span></div>
    <div class="counter"><b style="color:var(--bad)">${cnt(['ocorrencia', 'conduzindo'])}</b><span>Ocorrência</span></div>
    <div class="counter"><b style="color:var(--warn)">${cnt(['qaj', 'deslocamento', 'abastecimento', 'baixada'])}</b><span>Fora da área</span></div></div>`;
  const nExc = ativos.filter((e) => statusExcedido(e)).length;
  if (nExc) h += `<div class="banner bad mt">⏱️ ${nExc} GU(s) acima do tempo limite em ocorrência/QAJ</div>`;
  if ('Notification' in window && Notification.permission === 'default' && S.config.alertas.ativo) h += `<button class="banner mt" data-act="notif">🔔 Toque para ativar os alertas de horário no celular</button>`;
  const fts = sv.fontes || [];
  if (fts.length && !fts.some((x) => x.tipo === 'extra')) h += `<button class="banner mt" data-act="importar">🟨 Só a escala ordinária está carregada. Toque para adicionar a extraordinária.</button>`;
  else if (fts.length && !fts.some((x) => x.tipo === 'ordinario')) h += `<button class="banner mt" data-act="importar">🚔 Só a escala extraordinária está carregada. Toque para adicionar a ordinária.</button>`;
  const prox = agendaEvents().filter((ev) => ev.t >= now && !ev.done).slice(0, 3);
  if (prox.length) h += `<div class="next">${prox.map((ev) => `<div><b>${hhmm(ev.t)}</b><span>${esc(ev.title)}</span></div>`).join('')}</div>`;
  if (!list.length) return h + `<div class="empty">Nenhuma GU neste filtro. <br><button class="btn sm mt" data-filtro-set="tudo">Ver tudo</button></div>`;
  const fiscal = list.filter((e) => e.tipo === 'fiscal');
  const postos = list.filter((e) => POSTOS.includes(e.tipo));
  const rest = list.filter((e) => e.tipo !== 'fiscal' && !POSTOS.includes(e.tipo));
  h += secHtml('👮 Oficial de Dia', 'fisc', fiscal, now);
  if (S.ui.modo === 'cia') {
    for (const c of CIAS) {
      const ce = rest.filter((e) => e.cia === c);
      const sub = [...AREAS[c].map((b) => [b, ce.filter((e) => e.bairro === b)]), ['Bairro não definido', ce.filter((e) => !AREAS[c].includes(e.bairro))]];
      h += secHtml(`🚔 ${c}ª Cia`, 'cia' + c, ce, now, sub);
    }
    h += secHtml('🔄 Toda a área do 27º (sem Cia definida)', 'geral', rest.filter((e) => !CIAS.includes(e.cia)), now);
  } else {
    h += secHtml('🚔 Ordinário', 'cia1', rest.filter((e) => e.tipo === 'ordinario').sort((a, b) => (a.cia || '9').localeCompare(b.cia || '9') || sortEmp(a, b)), now);
    h += secHtml('🛡️ GPA', 'cia3', rest.filter((e) => e.tipo === 'gpa'), now);
    h += secHtml('🔄 Recobrimento', 'cia2', rest.filter((e) => e.tipo === 'recobrimento'), now);
    const ops = {};
    rest.filter((e) => e.tipo === 'extra').forEach((e) => { const k = e.opId || e.operacao || 'Extra'; (ops[k] = ops[k] || []).push(e); });
    for (const k in ops) { const o = opById(k); h += secHtml('🟨 ' + esc(o ? o.nome : k), 'geral', ops[k], now); }
  }
  h += secHtml('🏠 Permanência / Reserva / Adm', '', postos, now);
  h += `<p class="hint mt2">💡 Segure o dedo sobre uma viatura para mudar o status rapidamente.</p><div class="row wrap"><button class="btn sm" data-act="importar">📄 Adicionar escala</button><button class="btn sm" data-act="novoemp">+ Nova GU / posto</button></div>`;
  return h;
}

/* ================= SHEET: GU / emprego ================= */
function vtrOptions(sel) {
  const ids = new Set(S.vtrs.map((v) => v.id)); if (sel) ids.add(sel);
  return `<option value="">— sem VTR —</option>` + [...ids].sort().map((id) => { const v = S.vtrs.find((x) => x.id === id); return `<option value="${id}" ${id === sel ? 'selected' : ''}>${id}${v ? ' ' + VTR_ST[v.status].e : ''}</option>`; }).join('');
}
function bairroOptions(cia, sel) {
  const list = cia ? AREAS[cia] : [];
  return `<option value="">—</option>` + list.map((b) => `<option ${b === sel ? 'selected' : ''}>${b}</option>`).join('');
}
function openEmp(id, opts = {}) {
  const e = empById(id); if (!e) return;
  const cf = conflitos(e);
  const hist = S.servico.log.filter((l) => l.ref === id).slice(-8).reverse();
  const op = opById(e.opId);
  let h = `<div class="sh-title"><span class="vtr">${e.vtr ? 'VTR ' + esc(e.vtr) : esc(TIPOS[e.tipo])}</span><span class="tag ${e.opId ? 'op' : ''}">${esc(e.operacao || TIPOS[e.tipo])}</span><button class="iconbtn x" data-act="close">✕</button></div>
  <div class="hint">⏰ ${hStr(e.inicio)} às ${hStr(e.fim)}${e.d ? ' (dia seguinte)' : ''}${e.qaj ? ' · 🍽️ QAJ ' + e.qaj.replace('-', '–') : ''} · 📍 ${esc([empArea(e), e.local].filter(Boolean).join(' — ') || 'local não definido')}</div>
  ${op && (op.apresentacao || op.concentracao) ? `<div class="hint mt">🟨 Apresentação: ${esc([op.apresentacaoHora && hStr(op.apresentacaoHora), op.apresentacao].filter(Boolean).join(' – '))}${op.concentracao ? ' · Concentração: ' + esc(op.concentracao) : ''}</div>` : ''}
  ${cf.map((c) => `<div class="warn mt">⚠️ ${esc(c)}</div>`).join('')}
  <h3>Status</h3><div class="stgrid">${Object.entries(STATUS).map(([k, s]) => `<button class="stbtn ${e.status === k ? 'on' : ''}" data-act="st" data-st="${k}"><span>${s.e}</span>${s.l}</button>`).join('')}</div>
  <label class="f"><span>Observação do status (nº ocorrência, local, destino…)</span><input type="text" id="stObs" value="${esc(e.statusObs)}" placeholder="Ex.: Roubo – Pass. Mucajá / conduzindo à Seccional"></label>
  <h3>Guarnição</h3>
  <div>${e.membros.map((m, i) => `<div class="slot"><span class="fn">${m.funcao}</span><div class="nm">${m.mk ? esc(milName(m.mk)) + `<small>RG ${esc(S.militares[m.mk].rg || '—')}${isMe(m.mk) ? ' · VOCÊ' : ''}</small>` : '<span class="vago">vago</span>'}</div>
    <button class="btn sm" data-act="pick" data-i="${i}">${m.mk ? 'Trocar' : 'Escalar'}</button>${m.mk || m.funcao === 'PAT' ? `<button class="btn sm ghost" data-act="unassign" data-i="${i}">✕</button>` : ''}</div>`).join('')}</div>
  <div class="row mt"><button class="btn sm" data-act="addslot" data-fn="PAT">+ PAT</button>${!e.membros.some((m) => m.funcao === 'CMT') ? '<button class="btn sm" data-act="addslot" data-fn="CMT">+ CMT</button>' : ''}${!e.membros.some((m) => m.funcao === 'MOT') ? '<button class="btn sm" data-act="addslot" data-fn="MOT">+ MOT</button>' : ''}</div>
  <details class="box mt2"><summary>✏️ Editar emprego (VTR, área, horário)</summary>${empForm(e)}
    <div class="row mt"><button class="btn blue" data-act="saveemp">Salvar</button><button class="btn" data-act="dupemp">Duplicar</button><button class="btn ghost" data-act="delemp">🗑️ Excluir</button></div></details>
  ${hist.length ? `<h3>Histórico</h3><div class="list">${hist.map((l) => `<div class="it"><div class="grow"><div class="t2">${new Date(l.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — ${esc(l.msg)}</div></div></div>`).join('')}</div>` : ''}`;
  openSheet(h, { kind: 'emp', id }, { reopen: () => openEmp(id), replace: opts.replace });
}
function empForm(e) {
  return `<div class="row"><label class="f" style="flex:1"><span>VTR</span><select id="fVtr">${vtrOptions(e.vtr)}</select></label>
    <label class="f" style="flex:1"><span>Tipo</span><select id="fTipo">${Object.entries(TIPOS).map(([k, l]) => `<option value="${k}" ${e.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  <div class="row"><label class="f" style="flex:1"><span>Companhia</span><select id="fCia"><option value="">Toda a área</option>${CIAS.map((c) => `<option value="${c}" ${e.cia === c ? 'selected' : ''}>${c}ª Cia</option>`).join('')}</select></label>
    <label class="f" style="flex:1"><span>Bairro</span><select id="fBairro">${bairroOptions(e.cia, e.bairro)}</select></label></div>
  <label class="f"><span>Operação (se houver)</span><input type="text" id="fOp" value="${esc(e.operacao)}" list="opsList"><datalist id="opsList">${S.servico.operacoes.map((o) => `<option value="${esc(o.nome)}">`).join('')}</datalist></label>
  <label class="f"><span>Local / setor / PBE</span><input type="text" id="fLocal" value="${esc(e.local)}"></label>
  <label class="f"><span>Nome no Mapa-Força (opcional)</span><input type="text" id="fRot" value="${esc(e.rotulo)}" placeholder="${esc(rotulo({ ...e, rotulo: '' }))}"></label>
  <div class="row"><label class="f"><span>Início</span><input type="time" id="fIni" value="${e.inicio}"></label><label class="f"><span>Término</span><input type="time" id="fFim" value="${e.fim}"></label></div>
  <div class="row"><label class="f" style="flex:1"><span>Início no dia</span><select id="fD"><option value="0">do serviço</option><option value="1" ${e.d ? 'selected' : ''}>seguinte (+1)</option></select></label>
    <label class="f" style="flex:1"><span>Turno</span><select id="fTurno"><option value="">—</option><option value="1" ${e.turno === '1' ? 'selected' : ''}>1º</option><option value="2" ${e.turno === '2' ? 'selected' : ''}>2º</option></select></label></div>
  <div class="row"><label class="f"><span>QAJ início</span><input type="time" id="fQ1" value="${(e.qaj || '').split('-')[0] || ''}"></label><label class="f"><span>QAJ fim</span><input type="time" id="fQ2" value="${(e.qaj || '').split('-')[1] || ''}"></label></div>`;
}
function readEmpForm(e) {
  e.vtr = $('#fVtr').value; e.tipo = $('#fTipo').value; e.cia = $('#fCia').value; e.bairro = $('#fBairro').value;
  const opName = $('#fOp').value.trim();
  e.operacao = opName; const op = S.servico.operacoes.find((o) => o.nome === opName); e.opId = op ? op.id : '';
  e.local = $('#fLocal').value.trim(); e.rotulo = $('#fRot').value.trim();
  e.inicio = $('#fIni').value; e.fim = $('#fFim').value; e.d = +$('#fD').value; e.turno = $('#fTurno').value;
  const q1 = $('#fQ1').value, q2 = $('#fQ2').value; e.qaj = q1 && q2 ? q1 + '-' + q2 : '';
}
function novoEmp() {
  const now = nowMin();
  const e = { id: 'e' + uid(), tipo: 'ordinario', operacao: '', opId: '', vtr: '', cia: '', bairro: '', local: '', rotulo: '', inicio: hhmm(Math.max(now, 0)), fim: hhmm(Math.max(now, 0) + 360), d: 0, turno: '', qaj: '', missao: '', membros: [{ funcao: 'CMT', mk: null }, { funcao: 'MOT', mk: null }], status: 'area', statusDesde: null, statusObs: '' };
  openSheet(`<div class="sh-title"><span class="vtr">Nova GU / posto</span><button class="iconbtn x" data-act="close">✕</button></div>${empForm(e)}
    <div class="row mt"><button class="btn pri full" data-act="createemp">Criar e escalar efetivo</button></div>`, { kind: 'new', emp: e }, { reopen: null });
}

function openQuick(id) {
  const e = empById(id); if (!e) return;
  openSheet(`<div class="sh-title"><span class="vtr">${e.vtr ? 'VTR ' + esc(e.vtr) : esc(TIPOS[e.tipo])}</span><span class="tag">Status rápido</span><button class="iconbtn x" data-act="close">✕</button></div>
   <div class="hint">${STATUS[e.status].e} ${STATUS[e.status].l} ${ago(e.statusDesde)}</div>
   <div class="stgrid mt">${Object.entries(STATUS).map(([k, s]) => `<button class="stbtn ${e.status === k ? 'on' : ''}" data-act="qst" data-st="${k}"><span>${s.e}</span>${s.l}</button>`).join('')}</div>
   <label class="f"><span>Observação (opcional)</span><input type="text" id="qObs" value="${esc(e.statusObs)}" placeholder="Nº ocorrência, local, destino…"></label>
   <button class="btn full" data-act="emp" data-id="${id}">Abrir guarnição completa ›</button>`, { kind: 'quick', id }, { reopen: () => openQuick(id) });
}
let lpTimer = null, lpFired = false, lpStart = null;
document.addEventListener('pointerdown', (ev) => {
  const c = ev.target.closest('[data-lp]'); if (!c) return;
  lpFired = false; lpStart = [ev.clientX, ev.clientY];
  clearTimeout(lpTimer);
  lpTimer = setTimeout(() => { lpFired = true; if (navigator.vibrate) navigator.vibrate(35); openQuick(c.dataset.id); }, 550);
});
document.addEventListener('pointermove', (ev) => { if (lpTimer && lpStart && Math.hypot(ev.clientX - lpStart[0], ev.clientY - lpStart[1]) > 10) { clearTimeout(lpTimer); lpTimer = null; } });
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, () => { clearTimeout(lpTimer); lpTimer = null; }));
document.addEventListener('contextmenu', (ev) => { if (ev.target.closest('[data-lp]')) ev.preventDefault(); });

/* ---------- seletor de militar ---------- */
function openPicker(ctx) {
  // ctx: {empId, idx} para escalar | {avulso:true} para adicionar ao serviço
  const target = ctx.empId ? empById(ctx.empId) : null;
  const title = target ? `${target.membros[ctx.idx].funcao} – ${empLabel(target)}` : 'Adicionar militar ao serviço';
  openSheet(`<div class="sh-title"><button class="iconbtn" data-act="back">←</button><b>${esc(title)}</b><button class="iconbtn x" data-act="close">✕</button></div>
    <input type="search" id="pkQ" placeholder="Buscar nome, graduação ou RG" autocomplete="off">
    <div id="pkList" class="list mt"></div>
    <details class="box mt2"><summary>➕ Cadastrar novo militar</summary>
      <div class="row"><label class="f" style="flex:1"><span>Posto/Grad.</span><select id="nGrad">${GRADS.map((g) => `<option ${g === 'SD' ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="f" style="flex:1"><span>RG</span><input type="text" id="nRg" inputmode="numeric"></label></div>
      <label class="f"><span>Nome de guerra</span><input type="text" id="nNome" style="text-transform:uppercase"></label>
      <label class="f"><span>Unidade de origem (se de fora)</span><input type="text" id="nUn" placeholder="Ex.: 5º BPM"></label>
      <button class="btn blue full" data-act="newmil">Cadastrar e selecionar</button></details>`, { kind: 'picker', ...ctx }, { reopen: () => openPicker(ctx) });
  const draw = () => {
    const q = $('#pkQ').value.trim().toUpperCase();
    const sp = target ? span(target) : null;
    const inSvc = keysNoServico();
    const match = (k) => { const m = S.militares[k]; return !q || `${m.grad} ${m.nome} ${m.rg} ${m.unidade}`.toUpperCase().includes(q); };
    const row = (k) => {
      const emps = empsOf(k);
      const busy = sp && emps.some((o) => o !== target && overlap(sp, span(o)));
      const where = emps.map((o) => `<span class="pill">${esc(empLabel(o))} ${hStr(o.inicio)}–${hStr(o.fim)}</span>`).join('') || '<span class="pill free">sem alocação</span>';
      return `<div class="it" data-act="pickmil" data-k="${k}"><div class="grow"><div class="t1">${esc(milName(k))}</div><div class="t2">RG ${esc(S.militares[k].rg || '—')} ${where}${busy ? ' <span class="warn">ocupado neste horário – será movido</span>' : ''}</div></div><span>›</span></div>`;
    };
    const busyOf = (k) => (sp && empsOf(k).some((o) => o !== target && overlap(sp, span(o))) ? 1 : 0);
    const a = inSvc.filter(match).sort((x, y) => busyOf(x) - busyOf(y) || (empsOf(x).length - empsOf(y).length) || GRAD_ORD(S.militares[x].grad) - GRAD_ORD(S.militares[y].grad));
    const b = Object.keys(S.militares).filter((k) => !inSvc.includes(k) && match(k)).slice(0, q ? 40 : 15);
    $('#pkList').innerHTML = (a.length ? `<h3>No serviço de hoje (livres no horário primeiro)</h3>${a.map(row).join('')}` : '') + (b.length ? `<h3>Banco de militares</h3>${b.map(row).join('')}` : '') || '<div class="hint">Nenhum militar encontrado. Cadastre abaixo.</div>';
  };
  $('#pkQ').addEventListener('input', draw);
  draw();
}
function pickMilitar(k) {
  const c = sheetCtx;
  if (c.empId != null) { assign(c.empId, c.idx, k); toast('✅ ' + milName(k, false) + ' escalado'); if (stack.length > 1) sheetBack(); else openEmp(c.empId, { replace: true }); }
  else { if (!S.servico.avulsos.includes(k) && !empsOf(k).length) S.servico.avulsos.push(k); log(`${milName(k)} adicionado ao serviço`); save(); toast('✅ Adicionado ao serviço'); closeSheet(); }
}

/* ================= LINHA DO TEMPO ================= */
function agendaEvents() {
  const sv = S.servico, ev = [];
  const groups = {};
  const addG = (key, t, kind, title, item) => { const g = (groups[key] = groups[key] || { t, kind, title, items: [] }); g.items.push(item); };
  for (const e of sv.empregos) {
    const sp = span(e); if (!sp) continue;
    if (POSTOS.includes(e.tipo)) continue;
    const lbl = (e.vtr || '') + (e.cia ? ` (${e.cia}ª ${e.bairro || ''})`.replace(' )', ')') : '');
    if (!e.opId) {
      const nm = e.tipo === 'fiscal' ? 'Oficial de Dia' : TIPOS[e.tipo];
      addG('i' + sp[0] + e.tipo, sp[0], 'turno', `▶️ Início ${nm}`, lbl);
      addG('f' + sp[1] + e.tipo, sp[1], 'fim', `⏹️ Término ${nm}`, lbl);
    }
    if (e.qaj) {
      const [a, b] = e.qaj.split('-');
      let t = toMin(a) + (e.d || 0) * 1440; if (t < sp[0]) t += 1440;
      ev.push({ t, end: t + ((toMin(b) - toMin(a) + 1440) % 1440), kind: 'qaj', title: `🍽️ QAJ VTR ${e.vtr}`, sub: `${hStr(a)}–${hStr(b)} · ${e.operacao || ''} ${e.local || ''}`, ref: e.id });
    }
  }
  for (const k in groups) { const g = groups[k]; ev.push({ t: g.t, kind: g.kind, title: g.title, sub: 'VTR ' + g.items.join(', ') }); }
  for (const o of sv.operacoes) {
    const sp = span(o); if (!sp) continue;
    const n = sv.empregos.filter((e) => e.opId === o.id);
    if (o.apresentacaoHora) { let t = toMin(o.apresentacaoHora) + (o.d || 0) * 1440; if (t > sp[0]) t -= 1440; ev.push({ t, kind: 'op', title: `🟨 Apresentação – ${o.nome}`, sub: o.apresentacao }); }
    ev.push({ t: sp[0], kind: 'op', title: `🟨 Início ${o.nome}`, sub: `${n.length} GU(s): ${n.map((e) => e.vtr).join(', ')}${o.concentracao ? ' · Concentração: ' + o.concentracao : ''}${!o.apresentacaoHora && o.apresentacao ? ' · Apresentação: ' + o.apresentacao : ''}` });
    ev.push({ t: sp[1], kind: 'fim', title: `⏹️ Término ${o.nome}`, sub: o.obs || '' });
  }
  for (const t of sv.tarefas) {
    const sp = span(t); if (!sp) continue;
    ev.push({ t: sp[0], end: sp[1], kind: 'tarefa', title: `📌 ${t.titulo}`, sub: t.descricao, tarefa: t, done: t.feita });
  }
  for (const m of sv.eventos) { const t = toMin(m.hora) + (m.d || 0) * 1440; ev.push({ t, kind: 'manual', title: `📝 ${m.texto}`, manual: m, done: m.feito }); }
  return ev.sort((a, b) => a.t - b.t || (a.kind === 'fim') - (b.kind === 'fim'));
}
function renderAgenda() {
  const sv = S.servico;
  const now = nowMin();
  const f = S.ui.filtroAg || 'tudo';
  let evs = agendaEvents();
  if (f === '1') evs = evs.filter((e) => e.t >= T1[0] && e.t <= T1[1]);
  if (f === '2') evs = evs.filter((e) => e.t >= T2[0] && e.t <= T2[1]);
  if (f === 'prox') evs = evs.filter((e) => (e.end || e.t) >= now - 15);
  let h = `<div class="seg">${[['tudo', 'Tudo'], ['prox', 'Próximos'], ['1', '1º Turno'], ['2', '2º Turno']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="fag" data-f="${k}">${l}</button>`).join('')}<button class="chip" data-act="addev">+ Lembrete</button></div>`;
  if (sv.rondas.length) {
    const feitas = sv.rondas.filter((r) => r.feita).length;
    h += `<details class="box"><summary>🏠 Rondas do Oficial de Dia (${feitas}/${sv.rondas.length})</summary>${sv.rondas.map((r) => `<label class="chk"><input type="checkbox" data-act="ronda" data-id="${r.id}" ${r.feita ? 'checked' : ''}><span>${esc(r.texto)}${r.feitaEm ? `<br><small class="gold">✔ ${new Date(r.feitaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>` : ''}</span></label>`).join('')}</details>`;
  }
  if (!evs.length) return h + `<div class="empty">Sem eventos. Importe a escala para gerar a linha do tempo.</div>`;
  h += '<div class="tl">';
  let lastH = null, nowShown = false;
  for (const e of evs) {
    if (!nowShown && e.t > now) { h += `<div class="nowline" id="nowline">AGORA ${hhmm(now)}</div>`; nowShown = true; }
    const hr = Math.floor(e.t / 60);
    if (hr !== lastH) { h += `<div class="hr">${pad(((hr % 24) + 24) % 24)}h${e.t >= 1440 ? ' <small>(+1)</small>' : ''}</div>`; lastH = hr; }
    const past = (e.end || e.t) < now;
    let extra = '';
    if (e.tarefa) {
      const vs = S.servico.empregos.filter((x) => x.vtr && overlap(span(x), [e.t, e.end || e.t + 1]));
      extra = `<div class="row mt"><label class="row" style="gap:6px"><input type="checkbox" data-act="tarefa" data-id="${e.tarefa.id}" ${e.tarefa.feita ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--ok)">Feito</label>
        <select data-act="tvtr" data-id="${e.tarefa.id}" style="flex:1;padding:6px"><option value="">Designar VTR…</option>${[...new Set(vs.map((x) => x.vtr))].map((v) => `<option ${e.tarefa.vtr === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn sm ghost" data-act="deltarefa" data-id="${e.tarefa.id}">🗑️</button></div>`;
    }
    if (e.manual) extra = `<div class="row mt"><label class="row" style="gap:6px"><input type="checkbox" data-act="evdone" data-id="${e.manual.id}" ${e.manual.feito ? 'checked' : ''} style="width:22px;height:22px">Feito</label><button class="btn sm ghost" data-act="delev" data-id="${e.manual.id}">🗑️</button></div>`;
    h += `<div class="ev k-${e.kind} ${past ? 'past' : ''} ${e.done ? 'done' : ''}" ${e.ref ? `data-act="emp" data-id="${e.ref}"` : ''}><div><span class="h">${hhmm(e.t)}${e.end ? '–' + hhmm(e.end) : ''}</span><span class="tt">${esc(e.title)}</span></div>${e.sub ? `<div class="ds">${esc(e.sub)}${e.tarefa && e.tarefa.vtr ? ` · <b class="gold">VTR ${esc(e.tarefa.vtr)}</b>` : ''}</div>` : ''}${extra}</div>`;
  }
  if (!nowShown) h += `<div class="nowline" id="nowline">AGORA ${hhmm(now)}</div>`;
  h += '</div><div class="row mt2"><button class="btn sm" data-act="gonow">⬆️ Ir para agora</button></div>';
  return h;
}

/* ================= EFETIVO ================= */
function renderEfetivo() {
  const keys = keysNoServico();
  const q = (S.ui.qEf || '').toUpperCase();
  const now = nowMin();
  const rows = keys.filter((k) => { const m = S.militares[k]; return !q || `${m.grad} ${m.nome} ${m.rg} ${m.unidade}`.toUpperCase().includes(q); })
    .map((k) => ({ k, emps: empsOf(k).sort(sortEmp) }))
    .sort((a, b) => (a.emps.length > 0) - (b.emps.length > 0) || GRAD_ORD(S.militares[a.k].grad) - GRAD_ORD(S.militares[b.k].grad) || S.militares[a.k].nome.localeCompare(S.militares[b.k].nome));
  const livres = rows.filter((r) => !r.emps.length).length;
  const agora = keys.filter((k) => empsOf(k).some((e) => isActive(e, now))).length;
  let h = `<div class="counters" style="grid-template-columns:repeat(3,1fr)"><div class="counter"><b>${keys.length}</b><span>No serviço</span></div><div class="counter"><b style="color:var(--ok)">${agora}</b><span>Empregados agora</span></div><div class="counter"><b style="color:var(--bad)">${livres}</b><span>Sem alocação</span></div></div>
  <div class="row mt"><input type="search" id="qEf" placeholder="Buscar militar…" value="${esc(S.ui.qEf || '')}"><button class="btn blue" data-act="addmil">+ Militar</button></div>
  <div class="sec mt"><div class="list">`;
  h += rows.map(({ k, emps }) => `<div class="it" data-act="mil" data-k="${k}"><div class="grow"><div class="t1">${esc(milName(k))}${isMe(k) ? ' <span class="tag me">VOCÊ</span>' : ''}</div><div class="t2">${emps.map((e) => `<span class="pill" style="${isActive(e, now) ? 'background:#173b26' : ''}">${e.membros.find((m) => m.mk === k).funcao} · ${esc(empLabel(e))} ${hStr(e.inicio)}–${hStr(e.fim)}</span>`).join('') || '<span class="pill free">sem alocação</span>'}</div></div><span>›</span></div>`).join('') || '<div class="hint" style="padding:12px">Nenhum militar. Importe a escala ou adicione.</div>';
  h += `</div></div><p class="hint">Banco permanente: ${Object.keys(S.militares).length} militares cadastrados.</p>`;
  return h;
}
function openMil(k) {
  const m = S.militares[k]; const emps = empsOf(k).sort(sortEmp);
  openSheet(`<div class="sh-title"><b style="font-size:18px">${esc(milName(k))}</b><button class="iconbtn x" data-act="close">✕</button></div>
   <div class="hint">RG ${esc(m.rg || '—')}${m.unidade ? ' · ' + esc(m.unidade) : ''}</div>
   <h3>Alocações no serviço</h3><div class="list">${emps.map((e) => `<div class="it" data-act="emp" data-id="${e.id}"><div class="grow"><div class="t1">${e.membros.find((x) => x.mk === k).funcao} · ${esc(empLabel(e))}</div><div class="t2">${hStr(e.inicio)}–${hStr(e.fim)} · ${esc(e.operacao || TIPOS[e.tipo])} · ${esc(empArea(e) || e.local)}</div></div><span>›</span></div>`).join('') || '<div class="hint">Sem alocação.</div>'}</div>
   <h3>Mover para</h3><select id="mvTo"><option value="">Escolha a GU…</option>${S.servico.empregos.filter((e) => e.vtr || POSTOS.includes(e.tipo)).sort(sortEmp).map((e) => `<option value="${e.id}">${esc(empLabel(e))} · ${hStr(e.inicio)}–${hStr(e.fim)} · ${esc(e.operacao || TIPOS[e.tipo])}</option>`).join('')}</select>
   <div class="row mt"><select id="mvFn" style="flex:1"><option>CMT</option><option>MOT</option><option selected>PAT</option></select><button class="btn blue" data-act="mvmil" data-k="${k}">Mover</button></div>
   <details class="box mt2"><summary>✏️ Editar dados</summary>
     <div class="row"><label class="f" style="flex:1"><span>Posto/Grad.</span><select id="eGrad">${[...new Set([...GRADS, m.grad])].map((g) => `<option ${g === m.grad ? 'selected' : ''}>${g}</option>`).join('')}</select></label><label class="f" style="flex:1"><span>RG</span><input type="text" id="eRg" value="${esc(m.rg)}" inputmode="numeric"></label></div>
     <label class="f"><span>Nome de guerra</span><input type="text" id="eNome" value="${esc(m.nome)}"></label>
     <label class="f"><span>Unidade de origem</span><input type="text" id="eUn" value="${esc(m.unidade)}"></label>
     <button class="btn blue full" data-act="savemil" data-k="${k}">Salvar</button></details>
   <div class="row mt2"><button class="btn ghost" data-act="rmmil" data-k="${k}">🚫 Retirar do serviço</button></div>`, { kind: 'mil', k }, { reopen: () => openMil(k) });
}

/* ================= FROTA ================= */
function vtrUso(id, now) {
  const e = S.servico.empregos.filter((x) => x.vtr === id).sort(sortEmp);
  const at = e.find((x) => isActive(x, now));
  return { at, all: e };
}
function renderFrota() {
  const now = nowMin();
  const c = (s) => S.vtrs.filter((v) => v.status === s).length;
  let h = `<div class="counters"><div class="counter"><b style="color:var(--ok)">${c('pronto')}</b><span>No pronto</span></div><div class="counter"><b style="color:var(--warn)">${c('manut')}</b><span>Manutenção</span></div><div class="counter"><b style="color:var(--bad)">${c('baixada')}</b><span>Baixadas</span></div><div class="counter"><b>${S.vtrs.length}</b><span>Total</span></div></div>
  <p class="hint">Toque numa viatura para mudar a situação. Rodapé: emprego agora.</p><div class="frota">`;
  h += S.vtrs.slice().sort((a, b) => a.id.localeCompare(b.id)).map((v) => { const u = vtrUso(v.id, now); return `<button class="vt ${v.status}" data-act="vtr" data-id="${v.id}"><b>${v.id}</b><small>${VTR_ST[v.status].e} ${u.at ? esc(u.at.bairro || u.at.operacao || TIPOS[u.at.tipo]) : v.status === 'pronto' ? 'livre' : esc(v.obs || VTR_ST[v.status].l)}</small></button>`; }).join('');
  h += `</div><div class="row mt2 wrap"><button class="btn" data-act="addvtr">+ Viatura</button><button class="btn blue" data-act="relvtr">📲 Relatório de VTRs</button></div>`;
  return h;
}
function openVtr(id) {
  const v = S.vtrs.find((x) => x.id === id); const u = vtrUso(id, nowMin());
  openSheet(`<div class="sh-title"><span class="vtr">VTR ${esc(id)}</span>${v.modelo ? `<span class="tag">${esc(v.modelo)}</span>` : ''}<button class="iconbtn x" data-act="close">✕</button></div>
  <div class="stgrid">${Object.entries(VTR_ST).map(([k, s]) => `<button class="stbtn ${v.status === k ? 'on' : ''}" data-act="vst" data-id="${id}" data-st="${k}"><span>${s.e}</span>${s.l}</button>`).join('')}</div>
  <label class="f"><span>Motivo / observação</span><input type="text" id="vObs" value="${esc(v.obs)}" placeholder="Ex.: Sinistro, Op. Barcarena, oficina…"></label>
  <label class="f"><span>Modelo (opcional)</span><input type="text" id="vMod" value="${esc(v.modelo || '')}"></label>
  <button class="btn blue full" data-act="savevtr" data-id="${id}">Salvar</button>
  <h3>Empregos no serviço</h3><div class="list">${u.all.map((e) => `<div class="it" data-act="emp" data-id="${e.id}"><div class="grow"><div class="t1">${hStr(e.inicio)}–${hStr(e.fim)} · ${esc(e.operacao || TIPOS[e.tipo])}</div><div class="t2">${esc(empArea(e) || e.local)} · ${e.membros.filter((m) => m.mk).map((m) => esc(milName(m.mk, false))).join(', ')}</div></div><span>›</span></div>`).join('') || '<div class="hint">Não empregada neste serviço.</div>'}</div>
  <div class="row mt2"><button class="btn ghost" data-act="delvtr" data-id="${id}">🗑️ Remover da frota</button></div>`, { kind: 'vtr', id }, { reopen: () => openVtr(id) });
}

/* ================= RELATÓRIOS ================= */
const SEP = '━━━━━━━━━━━━━━━━━━━';
const fmtRange = (a, b) => `${hStr(a)} às ${hStr(b)}`;
const up = (s) => (s || '').toUpperCase();
function guTxt(e, emoji) {
  return e.membros.filter((m) => m.mk).map((m) => emoji ? `👮 *${m.funcao}:* ${milName(m.mk)}` : `${m.funcao === 'POSTO' || m.funcao === 'ADM' ? '' : m.funcao + ': '}${milName(m.mk)}`).join('\n');
}
function relMapa(t) {
  const sv = S.servico; const win = turnoWin(t);
  const es = sv.empregos.filter((e) => noTurno(e, t)).sort(sortEmp);
  const L = [`*MAPA-FORÇA 27º BPM – ${t}º TURNO* 🚨`, `📅 *${dataBR(sv.data)} – ${dowOf(sv.data)}*`, `⏰ *HORÁRIO:* ${t === '1' ? '07h00 às 19h00' : '19h00 às 07h00'}`];
  const sec = (title, blocks) => { if (blocks.length) L.push(SEP, title, SEP, blocks.join('\n\n')); };
  const vtrBlock = (e, title) => [`🚔 *VTR ${e.vtr}${title ? ' – ' + up(title) : ''}*`, guTxt(e), e.tipo !== 'fiscal' && e.local ? `📍 ${e.local}` : '', `⏰ ${fmtRange(e.inicio, e.fim)}`].filter(Boolean).join('\n');
  sec('👮‍♂️ *FISCAL DE DIA – 27º BPM*', es.filter((e) => e.tipo === 'fiscal').map((e) => vtrBlock(e, 'Fiscal de Dia')));
  for (const c of CIAS) sec(`🚔 *${c}ª CIA – ORDINÁRIO*`, es.filter((e) => e.tipo === 'ordinario' && e.cia === c).map((e) => vtrBlock(e, rotulo(e))));
  sec('🚔 *ORDINÁRIO – OUTRAS*', es.filter((e) => e.tipo === 'ordinario' && !CIAS.includes(e.cia)).map((e) => vtrBlock(e, rotulo(e))));
  sec('🛡️ *GPA – ORDINÁRIO*', es.filter((e) => e.tipo === 'gpa').map((e) => vtrBlock(e)));
  sec('🔄 *RECOBRIMENTO – ORDINÁRIO*', es.filter((e) => e.tipo === 'recobrimento').map((e) => vtrBlock(e)));
  const posto = (e) => [`📍 *${up(e.local)}*`, guTxt(e), `⏰ ${fmtRange(e.inicio, e.fim)}${e.inicio === e.fim ? ' do dia seguinte' : ''}`].join('\n');
  sec('🛡️ *PERMANÊNCIA*', es.filter((e) => e.tipo === 'permanencia').map(posto));
  sec('🔐 *RESERVA DE ARMAMENTO*', es.filter((e) => e.tipo === 'reserva').map(posto));
  // extraordinário
  const ex = es.filter((e) => e.tipo === 'extra');
  const ops = []; const seen = {};
  ex.forEach((e) => { const k = e.opId || e.operacao || 'EXTRA'; if (!seen[k]) { seen[k] = { k, op: opById(e.opId), nome: e.operacao || 'EXTRAORDINÁRIO', emps: [] }; ops.push(seen[k]); } seen[k].emps.push(e); });
  const isPMF = (g) => /MAIS FORTE|\bPMF\b/i.test(g.nome) && !/RECOBRIMENTO/i.test(g.nome);
  const opHeader = (g, big) => {
    const o = g.op || {}; const out = [];
    const nome = /^OPERA/i.test(g.nome) ? up(g.nome) : 'OPERAÇÃO ' + up(g.nome);
    if (!big) out.push(`🟨 *${nome}*`);
    if (o.inicio) out.push(big ? `⏰ *HORÁRIO DA OPERAÇÃO:* ${fmtRange(o.inicio, o.fim)}` : `⏰ ${fmtRange(o.inicio, o.fim)}`);
    if (o.apresentacao) out.push(`📍 Apresentação: ${o.apresentacaoHora ? hStr(o.apresentacaoHora) + ' – ' : ''}${o.apresentacao}`);
    if (o.concentracao) out.push(`📍 Concentração: ${o.concentracao}`);
    return out.join('\n');
  };
  const exBlock = (e, g) => [`🚔 *VTR ${e.vtr}*`, guTxt(e), e.local ? `📍 ${e.local}` : '', e.qaj ? `⏰ QAJ: ${fmtRange(...e.qaj.split('-'))}` : (g.op && g.op.inicio === e.inicio && g.op.fim === e.fim ? '' : `⏰ ${fmtRange(e.inicio, e.fim)}`)].filter(Boolean).join('\n');
  const outras = ops.filter((g) => !isPMF(g));
  if (outras.length) L.push(SEP, '📋 *ESCALA EXTRAORDINÁRIA*', SEP, outras.map((g) => opHeader(g) + '\n\n' + g.emps.map((e) => exBlock(e, g)).join('\n\n')).join('\n\n'));
  for (const g of ops.filter(isPMF)) L.push(SEP, `💪 *${/^OPERA/i.test(g.nome) ? up(g.nome) : 'OPERAÇÃO ' + up(g.nome)}*`, SEP, opHeader(g, true) + '\n\n' + g.emps.map((e) => exBlock(e, g)).join('\n\n'));
  return L.join('\n');
}
function relOperacao(p) {
  const c = S.config;
  const es = p.ids.map(empById).filter(Boolean);
  const L = ['*27º BPM - BATALHÃO CABANAGEM* 🚔', `*COMANDANTE CPC I:* ${c.cmtCpc}`, `*SUBCOMANDANTE CPC I:* ${c.subCpc}`, '*COMANDANTE DO 27° BPM*', ` ${c.cmtBpm}`, '*SUB COMANDO DO 27º BPM:*', c.subBpm, '*FISCAL DE DIA:*', p.fiscal || c.fiscal || c.nomeGuerra,
    '*_________________________________________*', `🚨 *OPERAÇÃO. ${up(p.nome).replace(/^OPERA[ÇC][ÃA]O\.?\s*/, '')}.*`];
  if (p.modalidade) L.push(`       *${up(p.modalidade)}*`);
  L.push('*_______________________*', `📆 DATA: *${dataBR(p.data)}*`, `⏰ HORÁRIO: *${fmtRange(p.ini, p.fim)}*`, '*GUARNIÇÕES ENVOLVIDAS*');
  for (const e of es) {
    L.push(`🚔*VTR: ${e.vtr}*`);
    e.membros.filter((m) => m.mk).forEach((m) => L.push(`👮*${m.funcao}:* ${milName(m.mk)}`));
    if (p.localPorVtr && e.local) L.push(`📍 ${e.local}`);
  }
  if (p.local) L.push(`📍 *LOCAL: ${up(p.local)}*`);
  return L.join('\n');
}
function relInicio(p) {
  const L = ['🚨🚔 *27° BPM* 🚔🚨', `*TURNO*: *${p.turno}º Turno*`, `📆 *DATA*: *${dataBR(p.data)}*`, `⏰ *HORÁRIO: ${p.turno === '1' ? '07h às 19h' : '19h às 07h'}*`, `📌 *LOCAL*:   *(${p.local})*`];
  if (p.pelotao) L.push(`⚡ *${up(p.pelotao)}*`);
  L.push('*OFICIAL DE DIA 27° BPM:* ', `*${p.oficial}*`, '⚠️ *ASSUNTOS ABORDADOS:*');
  p.assuntos.forEach((a) => L.push(`✅ *${a.trim()}*`));
  L.push('🚨🚔 *27° BPM* 🚔🚨', '*EST CUSTOS SOCIETATIS*');
  return L.join('\n');
}
function relVtrs() {
  const d = new Date(); const ds = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  const vs = S.vtrs.slice().sort((a, b) => a.id.localeCompare(b.id));
  const L = ['*RELATÓRIO VTRs 27°BPM*', `*Dia:* ${ds} (${DOW3[d.getDay()]}) às ${pad(d.getHours())}h${pad(d.getMinutes())}`, '*Descrição:* ', '🟢 No pronto ', '🟡 Em Manutenção', '🔴 Baixada ', '*VTRs*'];
  vs.forEach((v, i) => L.push(`${i + 1} - *${v.id}${v.modelo ? '(' + v.modelo + ')' : ''}:* ${VTR_ST[v.status].e}${v.status !== 'pronto' && v.obs ? '(' + v.obs + ')' : ''}`));
  const c = (s) => pad(vs.filter((v) => v.status === s).length);
  L.push(`*🟢VTRs no PRONTO:* ${c('pronto')}`, `*🔴 VTR BAIXADA e/ou VIAGEM :* ${c('baixada')}`, `*🟡VTR MANUTENÇÃO:* ${c('manut')}`, `*TOTAL:* ${vs.length} Vtrs.`);
  return L.join('\n');
}
function relSituacao() {
  const now = nowMin(); const d = new Date();
  const at = S.servico.empregos.filter((e) => e.vtr && isActive(e, now)).sort(sortEmp);
  const L = ['*SITUAÇÃO DAS GUARNIÇÕES – 27º BPM* 🚔', `🕒 ${dataBR(hojeISO())} – ${pad(d.getHours())}h${pad(d.getMinutes())}`];
  const line = (e) => `🚔 ${e.vtr} – ${STATUS[e.status].e} ${STATUS[e.status].l}${e.statusObs ? ' (' + e.statusObs + ')' : ''}${e.bairro ? ' · ' + e.bairro : e.operacao ? ' · ' + e.operacao : ''}`;
  const groups = [['👮 *OFICIAL DE DIA*', at.filter((e) => e.tipo === 'fiscal')], ...CIAS.map((c) => [`*${c}ª CIA*`, at.filter((e) => e.tipo !== 'fiscal' && e.cia === c)]), ['*TODA A ÁREA / OPERAÇÕES*', at.filter((e) => e.tipo !== 'fiscal' && !CIAS.includes(e.cia))]];
  for (const [t, l] of groups) if (l.length) L.push(SEP, t, ...l.map(line));
  const cnt = {}; at.forEach((e) => (cnt[e.status] = (cnt[e.status] || 0) + 1));
  L.push(SEP, `*RESUMO:* ${at.length} GUs – ` + Object.entries(cnt).map(([k, n]) => `${STATUS[k].e} ${n}`).join(' · '));
  return L.join('\n');
}
function relRegistro() {
  const L = [`*REGISTRO DO SERVIÇO – 27º BPM*`, `📅 ${dataBR(S.servico.data)} · ${S.config.nomeGuerra}`, SEP];
  S.servico.log.forEach((l) => L.push(`${new Date(l.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – ${l.msg}`));
  return L.join('\n');
}
const REL = [['mapa', 'Mapa-Força'], ['op', 'Operação'], ['inicio', 'Início de serviço'], ['vtr', 'VTRs'], ['sit', 'Situação agora'], ['reg', 'Registro']];
function renderRelatorios() {
  const r = S.ui.rel; const sv = S.servico;
  let h = `<div class="seg">${REL.map(([k, l]) => `<button class="chip ${r === k ? 'on' : ''}" data-act="rel" data-r="${k}">${l}</button>`).join('')}</div><div class="sec" style="padding-top:10px">`;
  if (r === 'mapa') h += `<div class="row"><label class="f" style="flex:1"><span>Turno</span><select id="rTurno" data-rel><option value="1">1º Turno (07h–19h)</option><option value="2">2º Turno (19h–07h)</option></select></label></div>`;
  if (r === 'op') {
    const ops = sv.operacoes;
    h += `<label class="f"><span>Operação</span><select id="rOp" data-rel><option value="">— Manual (escolher GUs) —</option>${ops.map((o) => `<option value="${o.id}">${esc(o.nome)}</option>`).join('')}</select></label>
    <label class="f"><span>Nome da operação</span><input type="text" id="rNome" data-rel placeholder="FIM DE LINHA"></label>
    <div class="row"><label class="f" style="flex:1"><span>Modalidade</span><input type="text" id="rMod" data-rel placeholder="INCURSÃO / PBE / SATURAÇÃO" list="mods"><datalist id="mods"><option>INCURSÃO</option><option>PBE</option><option>SATURAÇÃO</option><option>COMBOIO</option><option>BLOQUEIO</option><option>ABORDAGEM</option></datalist></label><label class="f" style="flex:1"><span>Data</span><input type="date" id="rData" data-rel value="${sv.data}"></label></div>
    <div class="row"><label class="f"><span>Início</span><input type="time" id="rIni" data-rel></label><label class="f"><span>Término</span><input type="time" id="rFim" data-rel></label></div>
    <label class="f"><span>Local</span><input type="text" id="rLocal" data-rel placeholder="CANAL ÁGUA CRISTAL C/ PASSAGEM LULA ÁREA DO 27° BPM"></label>
    <label class="f"><span>Fiscal de Dia</span><input type="text" id="rFiscal" data-rel value="${esc(S.config.fiscal)}" placeholder="ASP OF ..."></label>
    <label class="chk"><input type="checkbox" id="rLpv" data-rel><span>Mostrar local/PBE de cada VTR</span></label>
    <h3>Guarnições envolvidas</h3><div id="rGus" class="list">${sv.empregos.filter((e) => e.vtr).sort(sortEmp).map((e) => `<label class="chk"><input type="checkbox" value="${e.id}" data-rel><span><b>VTR ${esc(e.vtr)}</b> · ${hStr(e.inicio)}–${hStr(e.fim)} · ${esc(e.operacao || TIPOS[e.tipo])}<br><small class="muted">${esc(e.membros.filter((m) => m.mk).map((m) => milName(m.mk, false)).join(', '))}</small></span></label>`).join('')}</div>`;
  }
  if (r === 'inicio') h += `<div class="row"><label class="f" style="flex:1"><span>Turno</span><select id="rTurno" data-rel><option value="1">1º Turno</option><option value="2">2º Turno</option></select></label><label class="f" style="flex:1"><span>Data</span><input type="date" id="rData" data-rel value="${sv.data}"></label></div>
    <label class="f"><span>Local</span><input type="text" id="rLocal" data-rel value="${esc(S.config.localInicio)}"></label>
    <div class="row"><label class="f" style="flex:1"><span>Pelotão</span><input type="text" id="rPel" data-rel value="${esc((sv.pelotao || '').split('/')[0].trim().replace(/^(\d)º PEL$/, '$1º PELOTÃO'))}"></label></div>
    <label class="f"><span>Oficial de Dia</span><input type="text" id="rOf" data-rel value="${esc(S.config.nomeGuerra)}"></label>
    <h3>Assuntos abordados</h3><div id="rAss">${S.config.assuntos.map((a, i) => `<label class="chk"><input type="checkbox" value="${i}" data-rel checked><span>${esc(a)}</span></label>`).join('')}</div>`;
  h += `<h3>Texto (pode editar antes de enviar)</h3><textarea id="rOut" class="out"></textarea>
   <div class="row mt wrap"><button class="btn pri" data-act="wa" style="flex:1">💬 WhatsApp</button><button class="btn" data-act="copy" style="flex:1">📋 Copiar</button><button class="btn" data-act="share">↗️</button></div></div>`;
  return h;
}
function relParams() {
  const r = S.ui.rel; const v = (id) => ($('#' + id) || {}).value;
  if (r === 'mapa') return relMapa(v('rTurno') || '1');
  if (r === 'op') {
    const ids = $$('#rGus input:checked').map((i) => i.value);
    return relOperacao({ ids, nome: v('rNome') || 'OPERAÇÃO', modalidade: v('rMod'), data: v('rData'), ini: v('rIni'), fim: v('rFim'), local: v('rLocal'), fiscal: v('rFiscal'), localPorVtr: $('#rLpv').checked });
  }
  if (r === 'inicio') return relInicio({ turno: v('rTurno'), data: v('rData'), local: v('rLocal'), pelotao: v('rPel'), oficial: v('rOf'), assuntos: $$('#rAss input:checked').map((i) => S.config.assuntos[+i.value]) });
  if (r === 'vtr') return relVtrs();
  if (r === 'sit') return relSituacao();
  return relRegistro();
}
function mountRelatorio() {
  const upd = () => { $('#rOut').value = relParams(); };
  if (S.ui.rel === 'mapa' || S.ui.rel === 'inicio') { const n = nowMin(); $('#rTurno').value = n >= 1140 || n < 420 ? '2' : '1'; }
  const opSel = $('#rOp');
  if (opSel) opSel.addEventListener('change', () => {
    const o = opById(opSel.value);
    $$('#rGus input').forEach((i) => (i.checked = !!o && empById(i.value).opId === o.id));
    if (o) { $('#rNome').value = o.nome; $('#rIni').value = o.inicio; $('#rFim').value = o.fim; $('#rLocal').value = o.concentracao || ''; $('#rLpv').checked = true; $('#rMod').value = /MAIS FORTE|PMF/i.test(o.nome) ? 'PBE' : ''; }
    upd();
  });
  $$('[data-rel]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' && el.type !== 'checkbox' ? 'input' : 'change', upd));
  upd();
}
function sendWhats(txt) {
  const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
  window.open(url, '_blank');
}
async function copyTxt(txt) {
  try { await navigator.clipboard.writeText(txt); toast('📋 Copiado'); }
  catch (e) { const t = $('#rOut'); t.select(); document.execCommand('copy'); toast('📋 Copiado'); }
}

/* ================= MENU / IMPORTAÇÃO / CONFIG ================= */
function openMenu() {
  openSheet(`<div class="sh-title"><b style="font-size:18px">Menu</b><button class="iconbtn x" data-act="close">✕</button></div>
   <div class="list">
    <div class="it" data-act="importar"><div class="grow"><div class="t1">📄 Importar escalas (PDF)</div><div class="t2">Ordinária + extraordinária do mesmo serviço</div></div>›</div>
    <div class="it" data-act="novoemp"><div class="grow"><div class="t1">➕ Nova GU / posto</div></div>›</div>
    <div class="it" data-act="config"><div class="grow"><div class="t1">⚙️ Configurações</div><div class="t2">Nome de guerra, comandantes, assuntos do início de serviço</div></div>›</div>
    <div class="it" data-act="servico"><div class="grow"><div class="t1">📅 Dados do serviço</div><div class="t2">Data, pelotão, novo serviço</div></div>›</div>
    <div class="it" data-act="encerrar"><div class="grow"><div class="t1">🏁 Encerrar serviço</div><div class="t2">Salva backup automático e começa um serviço novo</div></div>›</div>
    <div class="it" data-act="hist"><div class="grow"><div class="t1">🗂️ Serviços anteriores</div><div class="t2">Os últimos 5 ficam guardados no aparelho</div></div>›</div>
    <div class="it" data-act="backup"><div class="grow"><div class="t1">💾 Exportar backup</div><div class="t2">Arquivo .json com tudo</div></div>›</div>
    <div class="it" data-act="restore"><div class="grow"><div class="t1">♻️ Restaurar backup</div></div>›</div>
   </div><p class="hint mt2">🔒 Os dados ficam só neste aparelho. Nada é enviado para servidores.</p><p class="hint">Versão ${APP_VERSION}</p>`, { kind: 'menu' }, { reopen: openMenu });
}
let pending = null;
const CDN_PDF = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/legacy/build/';
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { s.remove(); rej(new Error(src)); }; document.head.appendChild(s); }); }
// Leitor de PDF: usa a cópia local se existir; senão baixa do CDN (fica guardado para uso offline).
async function loadPdfjs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  let local = true;
  try { await loadScript('pdf.min.js'); } catch (e) {
    local = false;
    try { await loadScript(CDN_PDF + 'pdf.min.js'); } catch (e2) { throw new Error('não foi possível carregar o leitor de PDF. Abra o app uma vez com internet para ele ficar guardado no aparelho.'); }
  }
  if (local) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  else {
    const r = await fetch(CDN_PDF + 'pdf.worker.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
  }
  return window.pdfjsLib;
}
// Lê um ou mais PDFs e acumula na tela de conferência (dá para adicionar o 2º PDF depois).
async function handlePdfs(files, append) {
  files = [...files].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (!files.length) return toast('Selecione arquivo(s) PDF');
  if (!append || !pending) pending = [];
  openSheet(`<div class="empty">⏳ Lendo ${files.length} arquivo(s)…</div>`, { kind: 'import' }, { replace: sheetOpen });
  const erros = [];
  try {
    const lib = await loadPdfjs();
    for (const f of files) {
      try {
        const items = await EscalaParser.extractItems(lib, new Uint8Array(await f.arrayBuffer()));
        const r = EscalaParser.parse(items); r.arquivo = f.name; r._k = uid();
        if (!r.empregos.length && !(r.tarefas || []).length) { erros.push(`${f.name}: nenhuma guarnição encontrada (é uma escala do 27º BPM com texto?)`); continue; }
        // mesmo tipo + mesma data já na lista: fica só o mais recente
        pending = pending.filter((p) => !(p.tipo === r.tipo && p.data === r.data));
        pending.push(r);
      } catch (e) { console.error(e); erros.push(`${f.name}: ${e.message || 'erro de leitura'}`); }
    }
  } catch (e) { erros.push(e.message); }
  pending.sort((a, b) => (a.tipo === 'extra') - (b.tipo === 'extra'));
  showImportPreview(erros);
}
function showImportPreview(erros = []) {
  const sv = S.servico, has = sv.empregos.length > 0;
  const ord = pending.find((r) => r.tipo === 'ordinario'), ext = pending.find((r) => r.tipo === 'extra');
  const datas = [...new Set(pending.map((r) => r.data).filter(Boolean))];
  const dataAlvo = (ord && ord.data) || datas[0] || '';
  const mesmaData = has && dataAlvo && dataAlvo === sv.data;
  const slot = (tipo, r) => {
    const ja = has && mesmaData && (sv.fontes || []).find((x) => x.tipo === tipo && x.data === dataAlvo);
    if (r) return `<div class="esc ok"><div class="grow"><b>${TIPO_ESC[tipo]}</b><div class="hint">📄 ${esc(r.arquivo)} · 📅 ${dataBR(r.data) || '?'} · ${r.empregos.length} GUs/postos${r.operacoes.length ? ' · ' + r.operacoes.length + ' operações' : ''}${(r.tarefas || []).length ? ' · ' + r.tarefas.length + ' tarefas' : ''}${ja ? '<br><span class="warn">vai substituir a versão já carregada neste serviço</span>' : ''}</div></div><button class="iconbtn" data-act="imprm" data-k="${r._k}" aria-label="Remover">✕</button></div>`;
    if (ja) return `<div class="esc"><div class="grow"><b>${TIPO_ESC[tipo]}</b><div class="hint">✅ já carregada neste serviço (${esc(ja.arquivo)})</div></div></div>`;
    return `<button class="esc add" data-act="impmais"><div class="grow"><b>${TIPO_ESC[tipo]}</b><div class="hint">não adicionada · toque para escolher o PDF</div></div><span style="font-size:22px">＋</span></button>`;
  };
  let h = `<div class="sh-title"><b style="font-size:18px">📄 Importar escalas</b><button class="iconbtn x" data-act="close">✕</button></div>
    <p class="hint" style="margin-top:0">Junte a escala <b>ordinária</b> e a <b>extraordinária</b> do mesmo dia para ter o serviço completo.</p>
    ${slot('ordinario', ord)}${slot('extra', ext)}
    ${pending.filter((r) => r !== ord && r !== ext).map((r) => slot(r.tipo, r)).join('')}
    <button class="btn full mt" data-act="impmais">➕ Adicionar outro PDF</button>
    ${erros.map((e) => `<div class="warn mt">⚠️ ${esc(e)}</div>`).join('')}
    ${datas.length > 1 ? `<div class="banner bad mt">⚠️ As escalas são de datas diferentes (${datas.map(dataBR).join(' e ')}). Confira se são do mesmo serviço.</div>` : ''}`;
  if (pending.length) {
    h += `<details class="box mt2"><summary>🔎 Conferir guarnições (${pending.reduce((n, r) => n + r.empregos.length, 0)})</summary>`;
    pending.forEach((r) => {
      h += `<h3>${TIPO_ESC[r.tipo]} ${r.pelotao ? '· ' + esc(r.pelotao) : ''}</h3>${r.avisos.map((a) => `<div class="warn">⚠️ ${esc(a)}</div>`).join('')}
      ${r.empregos.map((e, i) => `<label class="chk"><input type="checkbox" data-imp="${r._k}:${i}" ${e._skip ? '' : 'checked'}><span><b>${e.vtr ? 'VTR ' + esc(e.vtr) : esc(TIPOS[e.tipo])}</b> · ${esc(e.operacao || TIPOS[e.tipo])} · ${hStr(e.inicio)}–${hStr(e.fim)}${e.cia ? ` · ${e.cia}ª Cia ${esc(e.bairro)}` : ''}${e.qaj ? ' · QAJ ' + e.qaj : ''}<br><small class="muted">${esc(e.local)}</small><br><small>${e.membros.filter((m) => !m.vazio).map((m) => `${m.funcao}: ${esc(m.grad + ' ' + m.nome)}${m.unidade ? ' (' + esc(m.unidade) + ')' : ''}`).join(' · ')}</small></span></label>`).join('')}`;
    });
    h += `</details>`;
    const jaTem = (t) => has && mesmaData && (sv.fontes || []).some((x) => x.tipo === t);
    const falta = !ord && !jaTem('ordinario') ? 'ordinária' : !ext && !jaTem('extra') ? 'extraordinária' : '';
    if (falta) h += `<p class="hint">Sem a escala ${falta}? Pode carregar assim e adicionar depois pelo Menu → Importar escalas.</p>`;
    if (!has) h += `<button class="btn pri full mt" data-act="impapply" data-m="novo">✅ Carregar serviço de ${dataBR(dataAlvo) || 'hoje'}</button>`;
    else if (mesmaData) h += `<button class="btn pri full mt" data-act="impapply" data-m="add">➕ Juntar ao serviço de ${dataBR(sv.data)}</button><button class="btn ghost full mt" data-act="impapply" data-m="novo">🆕 Recomeçar o serviço só com estas escalas</button>`;
    else h += `<button class="btn pri full mt" data-act="impapply" data-m="novo">🆕 Novo serviço de ${dataBR(dataAlvo) || '?'}</button><p class="hint">O serviço atual (${dataBR(sv.data)}) será arquivado com backup.</p><button class="btn ghost full" data-act="impapply" data-m="add">Juntar ao serviço atual mesmo assim</button>`;
  }
  openSheet(h, { kind: 'import' }, { replace: true, reopen: () => showImportPreview() });
}
function openHist() {
  const h = getHist();
  openSheet(`<div class="sh-title"><b style="font-size:18px">🗂️ Serviços anteriores</b><button class="iconbtn x" data-act="close">✕</button></div>
   <div class="list">${h.map((x, i) => `<div class="it"><div class="grow"><div class="t1">📅 ${dataBR(x.data)} · ${x.servico.empregos.length} GUs</div><div class="t2">Salvo ${new Date(x.salvoEm).toLocaleString('pt-BR')} · ${esc(x.motivo)}</div></div><button class="btn sm" data-act="histrest" data-i="${i}">Abrir</button></div>`).join('') || '<div class="hint">Nenhum serviço arquivado ainda.</div>'}</div>
   <p class="hint mt">Abrir um serviço anterior arquiva o atual antes.</p>`, { kind: 'hist' }, { reopen: openHist });
}
function openConfig() {
  const c = S.config;
  const f = (id, l, v) => `<label class="f"><span>${l}</span><input type="text" id="${id}" value="${esc(v)}"></label>`;
  openSheet(`<div class="sh-title"><b style="font-size:18px">⚙️ Configurações</b><button class="iconbtn x" data-act="close">✕</button></div>
   ${f('cNome', 'Seu posto e nome de guerra', c.nomeGuerra)}${f('cCmtCpc', 'Comandante CPC I', c.cmtCpc)}${f('cSubCpc', 'Subcomandante CPC I', c.subCpc)}${f('cCmtBpm', 'Comandante do 27º BPM', c.cmtBpm)}${f('cSubBpm', 'Subcomando do 27º BPM', c.subBpm)}${f('cFiscal', 'Fiscal de Dia (relatório de operação)', c.fiscal)}${f('cLocal', 'Local padrão do início de serviço', c.localInicio)}
   <label class="f"><span>Assuntos do início de serviço (um por linha)</span><textarea id="cAss" rows="8">${esc(c.assuntos.join('\n'))}</textarea></label>
   <h3>🔔 Alertas</h3>
   <label class="chk"><input type="checkbox" id="aAtivo" ${S.config.alertas.ativo ? 'checked' : ''}><span>Avisar antes dos eventos da linha do tempo e quando uma GU passar do limite</span></label>
   <div class="row"><label class="f"><span>Antecedência (min)</span><input type="number" id="aAnt" value="${S.config.alertas.antecedencia}" min="1" max="120"></label><label class="f"><span>Limite ocorrência (min)</span><input type="number" id="aOc" value="${S.config.alertas.limOcorr}" min="5"></label><label class="f"><span>Limite QAJ (min)</span><input type="number" id="aQ" value="${S.config.alertas.limQaj}" min="5"></label></div>
   <div class="row"><button class="btn sm" data-act="notif">Permitir notificações</button><button class="btn sm" data-act="testnotif">Testar alerta</button><span class="hint">${'Notification' in window ? { granted: '✅ permitidas', denied: '🚫 bloqueadas no Chrome', default: 'ainda não autorizadas' }[Notification.permission] : 'não suportado'}</span></div>
   <p class="hint">Os alertas funcionam com o app aberto ou recém-minimizado. Com a tela bloqueada por muito tempo, o Android pode atrasá-los.</p>
   <button class="btn blue full mt" data-act="savecfg">Salvar</button>`, { kind: 'cfg' }, { reopen: openConfig });
}
function openServico() {
  const sv = S.servico;
  openSheet(`<div class="sh-title"><b style="font-size:18px">📅 Dados do serviço</b><button class="iconbtn x" data-act="close">✕</button></div>
   <label class="f"><span>Data do serviço (dia em que começa o 1º turno)</span><input type="date" id="sData" value="${sv.data}"></label>
   <label class="f"><span>Pelotão</span><input type="text" id="sPel" value="${esc(sv.pelotao)}"></label>
   <button class="btn blue full" data-act="savesvc">Salvar</button>
   <h3 class="mt2">📄 Escalas carregadas</h3>
   <div class="list">${(sv.fontes || []).map((x) => `<div class="it"><div class="grow"><div class="t1">${TIPO_ESC[x.tipo] || x.tipo} · ${dataBR(x.data)}</div><div class="t2">${esc(x.arquivo)} · ${x.n} GUs/postos · ${new Date(x.em).toLocaleString('pt-BR')}</div></div><button class="btn sm ghost" data-act="rmfonte" data-id="${x.id}">🗑️</button></div>`).join('') || '<div class="hint">Nenhuma escala importada (ou serviço criado antes da v1.3).</div>'}</div>
   <button class="btn full mt" data-act="importar">➕ Adicionar escala a este serviço</button>
   <div class="sec mt2"><h2>Zona de risco</h2><p class="hint">Novo serviço apaga GUs, linha do tempo e registro deste serviço. Frota e banco de militares são mantidos.</p>
   <button class="btn pri full" data-act="resetsvc">🆕 Iniciar novo serviço em branco</button></div>`, { kind: 'svc' }, { reopen: openServico });
}
function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  // iPhone/iPad: o "baixar" de app instalado não funciona bem; usa a folha de Compartilhar (Salvar em Arquivos)
  if (IS_IOS && navigator.canShare) {
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    } catch (e) { /* segue para o download comum */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ================= EVENTOS ================= */
$('#menuBtn').addEventListener('click', openMenu);
let pdfAppend = false;
$('#pdfInput').addEventListener('change', (ev) => { const f = [...ev.target.files]; ev.target.value = ''; handlePdfs(f, pdfAppend); pdfAppend = false; });
// Computador: arrastar e soltar PDFs na janela
document.addEventListener('dragover', (ev) => { if ([...(ev.dataTransfer.items || [])].some((i) => i.kind === 'file')) ev.preventDefault(); });
document.addEventListener('drop', (ev) => { const fs = [...(ev.dataTransfer.files || [])]; if (!fs.length) return; ev.preventDefault(); handlePdfs(fs, !!(sheetCtx && sheetCtx.kind === 'import')); });
// Android: escalas compartilhadas pelo WhatsApp/Arquivos ("Compartilhar" → 27º BPM)
async function receberCompartilhados() {
  if (!/[?&]share=1/.test(location.search) || !('caches' in window)) return;
  history.replaceState(null, '', location.pathname);
  try {
    const c = await caches.open('gvtr27-share');
    const files = [];
    for (const req of await c.keys()) {
      const res = await c.match(req); const name = new URL(req.url).searchParams.get('name') || 'escala.pdf';
      files.push(new File([await res.blob()], name, { type: 'application/pdf' }));
      await c.delete(req);
    }
    if (files.length) handlePdfs(files, false);
    else toast('Nenhum PDF recebido');
  } catch (e) { toast('Erro ao receber arquivos: ' + e.message); }
}
$('#jsonInput').addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!d.v || !d.servico) throw new Error('arquivo inválido'); S = d; S.servico.notif = S.servico.notif || {}; S.servico.fontes = S.servico.fontes || []; S.config.alertas = Object.assign({ ativo: true, antecedencia: 15, limOcorr: 60, limQaj: 40 }, S.config.alertas || {}); save(); toast('♻️ Backup restaurado'); closeSheet(); } catch (e) { toast('Erro: ' + e.message); }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'fCia') { $('#fBairro').innerHTML = bairroOptions(t.value, ''); }
  if (t.dataset.act === 'ronda') { const r = S.servico.rondas.find((x) => x.id === t.dataset.id); r.feita = t.checked; r.feitaEm = t.checked ? Date.now() : null; if (t.checked) log('Ronda realizada: ' + r.texto.slice(0, 60)); save(); render(); }
  if (t.dataset.act === 'tarefa') { const x = S.servico.tarefas.find((y) => y.id === t.dataset.id); x.feita = t.checked; if (t.checked) log(`Tarefa cumprida: ${x.titulo} ${x.inicio} ${x.vtr ? '(VTR ' + x.vtr + ')' : ''}`); save(); render(); }
  if (t.dataset.act === 'tvtr') { const x = S.servico.tarefas.find((y) => y.id === t.dataset.id); x.vtr = t.value; if (t.value) log(`VTR ${t.value} designada: ${x.titulo} ${x.inicio}–${x.fim}`); save(); }
  if (t.dataset.act === 'evdone') { const x = S.servico.eventos.find((y) => y.id === t.dataset.id); x.feito = t.checked; save(); render(); }
  if (t.id === 'stObs' && sheetCtx && sheetCtx.kind === 'emp') { const e = empById(sheetCtx.id); e.statusObs = t.value.trim(); if (e.statusObs) log(`${empLabel(e)}: ${e.statusObs}`, e.id); save(); toast('Observação salva'); }
});
document.addEventListener('input', (ev) => { if (ev.target.id === 'qEf') { S.ui.qEf = ev.target.value; const pos = ev.target.selectionStart; render(); const i = $('#qEf'); i.focus(); i.setSelectionRange(pos, pos); } });
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  const fs = ev.target.closest('[data-filtro-set]'); if (fs) { S.ui.filtro = fs.dataset.filtroSet; save(); render(); return; }
  if (!el) return;
  if (lpFired && el.dataset.lp) { lpFired = false; ev.preventDefault(); return; }
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const a = el.dataset.act, c = sheetCtx || {};
  switch (a) {
    case 'close': closeSheet(); break;
    case 'emp': openEmp(el.dataset.id); break;
    case 'st': setStatus(c.id, el.dataset.st); toast(STATUS[el.dataset.st].e + ' ' + STATUS[el.dataset.st].l); openEmp(c.id); break;
    case 'pick': openPicker({ empId: c.id, idx: +el.dataset.i }); break;
    case 'unassign': unassign(c.id, +el.dataset.i); openEmp(c.id); break;
    case 'addslot': empById(c.id).membros.push({ funcao: el.dataset.fn, mk: null }); save(); openPicker({ empId: c.id, idx: empById(c.id).membros.length - 1 }); break;
    case 'back': if (stack.length > 1) sheetBack(); else if (c.empId) openEmp(c.empId, { replace: true }); else closeSheet(); break;
    case 'pickmil': pickMilitar(el.dataset.k); break;
    case 'newmil': {
      const nome = $('#nNome').value.trim(); if (!nome) return toast('Informe o nome');
      const k = upsertMilitar({ grad: $('#nGrad').value, nome, rg: $('#nRg').value.trim(), unidade: $('#nUn').value.trim() }); save(); pickMilitar(k); break;
    }
    case 'saveemp': { const e = empById(c.id); readEmpForm(e); log(`${empLabel(e)}: emprego editado (${e.inicio}–${e.fim} ${empArea(e)})`, e.id); save(); toast('✅ Salvo'); openEmp(e.id); break; }
    case 'dupemp': { const e = empById(c.id); const n = JSON.parse(JSON.stringify(e)); n.id = 'e' + uid(); n.membros = n.membros.map((m) => ({ funcao: m.funcao, mk: null })); S.servico.empregos.push(n); log(`${empLabel(n)} duplicada`, n.id); save(); openEmp(n.id); break; }
    case 'delemp': (async () => { const e = empById(c.id); if (!(await ask({ title: `Excluir ${empLabel(e)}?`, msg: `${esc(e.operacao || TIPOS[e.tipo])} · ${e.inicio}–${e.fim}. Os militares voltam para "sem alocação".`, ok: 'Excluir', danger: true }))) return; e.membros.forEach((m) => m.mk && !S.servico.empregos.some((o) => o !== e && o.membros.some((x) => x.mk === m.mk)) && S.servico.avulsos.push(m.mk)); S.servico.empregos = S.servico.empregos.filter((x) => x !== e); log(`${empLabel(e)} excluída`); save(); closeSheet(); })(); break;
    case 'novoemp': novoEmp(); break;
    case 'createemp': { const e = c.emp; readEmpForm(e); S.servico.empregos.push(e); if (!S.servico.data) S.servico.data = hojeISO(); log(`${empLabel(e)} criada (${e.inicio}–${e.fim})`, e.id); save(); openEmp(e.id, { replace: true }); break; }
    case 'importar': pdfAppend = false; $('#pdfInput').click(); break;
    case 'impmais': pdfAppend = true; $('#pdfInput').click(); break;
    case 'imprm': pending = pending.filter((r) => r._k !== el.dataset.k); showImportPreview(); break;
    case 'rmfonte': { const x = S.servico.fontes.find((y) => y.id === el.dataset.id); ask({ title: 'Remover escala do serviço?', msg: `${TIPO_ESC[x.tipo]} (${esc(x.arquivo)}): as GUs, operações e tarefas que vieram dela saem do serviço.`, ok: 'Remover', danger: true }).then((ok) => { if (!ok) return; removerFonte(x.id); log(`${TIPO_ESC[x.tipo]} removida do serviço`); save(); toast('Escala removida'); openServico(); }); break; }
    case 'impapply': {
      $$('[data-imp]').forEach((i) => { const [k, ei] = i.dataset.imp.split(':'); const r = pending.find((p) => p._k === k); if (r) r.empregos[+ei]._skip = !i.checked; });
      const r = applyParsed(pending, el.dataset.m); pending = null; toast(`✅ ${r.nE} GUs/postos carregados${r.subst ? ' (' + r.subst + ' escala(s) atualizada(s))' : ''}`); S.ui.filtro = 'tudo'; closeSheet(); setTab('painel'); break;
    }
    case 'mil': openMil(el.dataset.k); break;
    case 'addmil': openPicker({}); break;
    case 'mvmil': {
      const to = $('#mvTo').value; if (!to) return toast('Escolha a GU');
      const e = empById(to); const fn = $('#mvFn').value; let idx = e.membros.findIndex((m) => m.funcao === fn && !m.mk);
      if (idx < 0) { if (fn === 'PAT') { e.membros.push({ funcao: 'PAT', mk: null }); idx = e.membros.length - 1; } else idx = e.membros.findIndex((m) => m.funcao === fn); }
      if (idx < 0) { e.membros.push({ funcao: fn, mk: null }); idx = e.membros.length - 1; }
      assign(to, idx, el.dataset.k); toast('✅ Movido'); openMil(el.dataset.k); break;
    }
    case 'savemil': { const m = S.militares[el.dataset.k]; m.grad = $('#eGrad').value; m.rg = $('#eRg').value.trim(); m.nome = $('#eNome').value.trim().toUpperCase(); m.unidade = $('#eUn').value.trim(); save(); toast('✅ Salvo'); openMil(el.dataset.k); break; }
    case 'rmmil': (async () => { const k = el.dataset.k; if (!(await ask({ title: 'Retirar do serviço?', msg: `${esc(milName(k))} sairá de todas as GUs deste serviço.`, ok: 'Retirar', danger: true }))) return; S.servico.empregos.forEach((e) => { e.membros = e.membros.filter((m) => !(m.mk === k && m.funcao === 'PAT')); e.membros.forEach((m) => { if (m.mk === k) m.mk = null; }); }); S.servico.avulsos = S.servico.avulsos.filter((x) => x !== k); log(`${milName(k)} retirado do serviço`); save(); closeSheet(); })(); break;
    case 'vtr': openVtr(el.dataset.id); break;
    case 'vst': { const v = S.vtrs.find((x) => x.id === el.dataset.id); v.status = el.dataset.st; log(`Frota: VTR ${v.id} ${VTR_ST[v.status].e} ${VTR_ST[v.status].l}`); save(); openVtr(v.id); break; }
    case 'savevtr': { const v = S.vtrs.find((x) => x.id === el.dataset.id); v.obs = $('#vObs').value.trim(); v.modelo = $('#vMod').value.trim(); save(); toast('✅ Salvo'); closeSheet(); break; }
    case 'delvtr': { const id = el.dataset.id; ask({ title: `Remover VTR ${id} da frota?`, ok: 'Remover', danger: true }).then((ok) => { if (ok) { S.vtrs = S.vtrs.filter((x) => x.id !== id); save(); closeSheet(); } }); break; }
    case 'addvtr': ask({ title: 'Nova viatura', fields: [{ id: 'id', label: 'Prefixo', placeholder: 'Ex.: 2732', mode: 'numeric' }, { id: 'mod', label: 'Modelo (opcional)', placeholder: 'Ex.: Duster' }], ok: 'Adicionar' }).then((r) => { if (!r || !r.id) return; if (!S.vtrs.some((v) => v.id === r.id)) S.vtrs.push({ id: r.id, status: 'pronto', obs: '', modelo: r.mod }); save(); render(); toast('✅ VTR ' + r.id + ' adicionada'); }); break;
    case 'relvtr': S.ui.rel = 'vtr'; setTab('relatorios'); break;
    case 'rel': S.ui.rel = el.dataset.r; save(); render(); break;
    case 'wa': sendWhats($('#rOut').value); break;
    case 'copy': copyTxt($('#rOut').value); break;
    case 'share': if (navigator.share) navigator.share({ text: $('#rOut').value }).catch(() => {}); else copyTxt($('#rOut').value); break;
    case 'fag': S.ui.filtroAg = el.dataset.f; save(); render(); if (el.dataset.f === 'tudo') setTimeout(() => { const n = $('#nowline'); n && n.scrollIntoView({ block: 'center' }); }, 50); break;
    case 'gonow': { const n = $('#nowline'); n && n.scrollIntoView({ behavior: 'smooth', block: 'center' }); break; }
    case 'addev': ask({ title: '📝 Novo lembrete', fields: [{ id: 'hora', label: 'Horário', type: 'time', value: hhmm(nowMin() + 30) }, { id: 'texto', label: 'Lembrete', placeholder: 'Ex.: Ligar para o CIOP / conferir VTR 2716' }], ok: 'Adicionar' }).then((r) => {
      if (!r || !r.hora || !r.texto) return;
      S.servico.eventos.push({ id: 'm' + uid(), hora: r.hora, d: toMin(r.hora) < 420 ? 1 : 0, texto: r.texto, feito: false }); save(); render(); toast('✅ Lembrete criado');
    }); break;
    case 'delev': S.servico.eventos = S.servico.eventos.filter((x) => x.id !== el.dataset.id); save(); render(); break;
    case 'deltarefa': S.servico.tarefas = S.servico.tarefas.filter((x) => x.id !== el.dataset.id); save(); render(); break;
    case 'config': openConfig(); break;
    case 'savecfg': { const c2 = S.config; c2.nomeGuerra = $('#cNome').value.trim().toUpperCase(); c2.cmtCpc = $('#cCmtCpc').value.trim(); c2.subCpc = $('#cSubCpc').value.trim(); c2.cmtBpm = $('#cCmtBpm').value.trim(); c2.subBpm = $('#cSubBpm').value.trim(); c2.fiscal = $('#cFiscal').value.trim(); c2.localInicio = $('#cLocal').value.trim(); c2.assuntos = $('#cAss').value.split('\n').map((s) => s.trim()).filter(Boolean); c2.alertas = { ativo: $('#aAtivo').checked, antecedencia: Math.max(1, +$('#aAnt').value || 15), limOcorr: Math.max(5, +$('#aOc').value || 60), limQaj: Math.max(5, +$('#aQ').value || 40) }; save(); toast('✅ Configurações salvas'); closeSheet(); break; }
    case 'servico': openServico(); break;
    case 'savesvc': S.servico.data = $('#sData').value; S.servico.pelotao = $('#sPel').value.trim(); save(); toast('✅ Salvo'); closeSheet(); break;
    case 'resetsvc': case 'encerrar': ask({ title: a === 'encerrar' ? '🏁 Encerrar serviço?' : 'Novo serviço em branco?', msg: 'Um backup do serviço atual será baixado e guardado em "Serviços anteriores". Frota e banco de militares continuam.<br><br>Dica: antes, envie o relatório <b>Registro</b> se precisar.', ok: a === 'encerrar' ? 'Encerrar' : 'Iniciar novo', danger: true }).then((ok) => {
      if (!ok) return; arquivarServico(a === 'encerrar' ? 'encerrado' : 'substituido'); S.servico = novoServico(); S.servico._id = uid(); save(); closeSheet(); toast('💾 Backup salvo – novo serviço iniciado');
    }); break;
    case 'hist': openHist(); break;
    case 'histrest': { const x = getHist()[+el.dataset.i]; if (!x) break; ask({ title: `Abrir serviço de ${dataBR(x.data)}?`, msg: 'O serviço atual será arquivado antes (com backup).', ok: 'Abrir' }).then((ok) => { if (!ok) return; arquivarServico('antes-de-restaurar'); S.servico = x.servico; S.servico.notif = S.servico.notif || {}; S.servico.fontes = S.servico.fontes || []; save(); closeSheet(); toast('♻️ Serviço restaurado'); }); break; }
    case 'notif': pedirNotificacao(); break;
    case 'testnotif': notify('⏰ Teste de alerta – 27º BPM', 'Se você está vendo isto, os alertas estão funcionando.', 'teste'); break;
    case 'qst': { const e = empById(c.id); const obs = $('#qObs').value.trim(); if (obs !== e.statusObs) { e.statusObs = obs; if (obs) log(`${empLabel(e)}: ${obs}`, e.id); } setStatus(c.id, el.dataset.st); toast(STATUS[el.dataset.st].e + ' ' + empLabel(e) + ': ' + STATUS[el.dataset.st].l); closeSheet(); break; }
    case 'backup': download(`gestao27bpm-${S.servico.data}-${Date.now().toString().slice(-5)}.json`, JSON.stringify(S)); break;
    case 'restore': $('#jsonInput').click(); break;
  }
});

/* ================= INIT ================= */
tick();
$$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.ui.tab));
render();
setTimeout(checkAlerts, 1500);
receberCompartilhados();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
