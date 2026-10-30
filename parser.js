/* Leitor de escalas do 27º BPM (ordinária e extraordinária) a partir de itens de texto do pdf.js */
(function (root) {
  const GRAD_RE = /^(CEL(?: PM)?|TEN CEL|MAJ|CAP|1[ºo°] ?TEN|2[ºo°] ?TEN|ASP(?:\.| )?OF|SUB ?TEN(?: RR)?|ST|1[ºo°] ?SGT(?: RR)?|2[ºo°] ?SGT(?: RR)?|3[ºo°] ?SGT(?: RR)?|CB(?: RR)?|SD(?: RR)?)\s+(.+)$/i;
  const TIME_RANGE_RE = /(\d{1,2})\s*[hH:](\d{2})?(?:min)?\s*(?:ÀS|AS|À|A|-|–)\s*(\d{1,2})\s*[hH:](\d{2})?/i;
  const QAJ_RE = /(\d{1,2})h(\d{2})?\s*[–-]\s*(\d{1,2})h(\d{2})?\s*QAJ/i;
  const MESES = { JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };

  const AREAS = {
    '1': ['Val-de-Cans', 'Miramar', 'Maracangalha'],
    '2': ['Marambaia', 'Castanheira'],
    '3': ['Curió-Utinga', 'Souza'],
  };
  const BAIRRO_KW = [
    [/MARACANGALHA/, '1', 'Maracangalha'],
    [/MIRAMAR|PRATINHA|ARTHUR BERNARDES|AV\.? OESTE/, '1', 'Miramar'],
    [/VAL[ -]?DE[ -]?CANS|J[UÚ]LIO C[EÉ]SAR \(LADO PAR/, '1', 'Val-de-Cans'],
    [/CASTANHEIRA/, '2', 'Castanheira'],
    [/MARAMBAIA|M[EÉ]DICI|MENDARA|GLEBA/, '2', 'Marambaia'],
    [/CURI[OÓ]|UTINGA/, '3', 'Curió-Utinga'],
    [/SOUZA/, '3', 'Souza'],
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const hm = (h, m) => pad(+h % 24) + ':' + pad(m ? +m : 0);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  function compactTimes(s) {
    return s.replace(/(\d)\s+(?=\d)/g, '$1').replace(/(\d)\s+(?=[hH](\b|\d))/g, '$1').replace(/([hH])\s+(?=\d)/g, '$1');
  }
  function parseTimeRange(s) {
    const m = s && s.match(TIME_RANGE_RE);
    if (!m) return null;
    return { inicio: hm(m[1], m[2]), fim: hm(m[3], m[4]) };
  }

  function parseMilitar(raw) {
    let s = norm(raw).replace(/[°o](?= ?(SGT|TEN))/g, 'º').replace(/(\d)º ?(SGT|TEN)/, '$1º $2');
    let unidade = '';
    const u = s.match(/\(([^)]+)\)\s*$/);
    if (u) { unidade = u[1].trim(); s = s.slice(0, u.index).trim(); }
    const m = s.match(GRAD_RE);
    if (!m) return { grad: '', nome: s, unidade };
    let grad = m[1].toUpperCase().replace(/ASP\.?\s*OF/, 'ASP OF').replace(/SUBTEN/, 'SUB TEN').replace(/(\d)º(SGT|TEN)/, '$1º $2');
    return { grad, nome: m[2].trim(), unidade };
  }

  function inferArea(text, ciaHint) {
    const t = (text || '').toUpperCase();
    for (const [re, cia, bairro] of BAIRRO_KW) {
      if (re.test(t) && (!ciaHint || ciaHint === cia)) return { cia, bairro };
    }
    return { cia: ciaHint || '', bairro: '' };
  }

  function parseDate(allText) {
    let m = allText.match(/DIA (\d{1,2}) DE ([A-ZÇ]+) DE (\d{4})/);
    if (m && MESES[m[2]]) return `${m[3]}-${pad(MESES[m[2]])}-${pad(m[1])}`;
    m = allText.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}`;
    return '';
  }

  // items: [{page,x,y,str}] (y de cima para baixo). Retorna {tipo,data,pelotao,empregos,operacoes,rondas,avisos}
  function parse(itemsIn) {
    const items = itemsIn
      .filter((i) => i.str && i.str.trim())
      .map((i, idx) => ({ ...i, str: norm(i.str), Y: i.page * 2000 + i.y, used: false, idx }))
      .sort((a, b) => a.Y - b.Y || a.x - b.x);
    const allText = items.map((i) => i.str).join(' \n ').toUpperCase();
    const tipo = /EXTRAORDIN/.test(allText.slice(0, 400)) ? 'extra' : 'ordinario';
    const out = { tipo, data: parseDate(allText), pelotao: '', empregos: [], operacoes: [], rondas: [], avisos: [] };
    const pm = allText.match(/PELOT[ÃA]O DE SERVI[ÇC]O ORDIN[ÁA]RIO:\s*([^\n]+)/);
    if (pm) out.pelotao = norm(pm[1]);

    const sameLine = (a, b, tol = 4) => a.page === b.page && Math.abs(a.y - b.y) <= tol;
    const isRG = (s) => /^\d{5,6}$/.test(s);
    const isMissao = (s) => /^\d{9,11}$/.test(s);
    const isVTR = (s) => /^\d{4}$/.test(s);
    const SECTION_RE = /^([123]ª CIA|RECOBRIMENTO|PERMAN[ÊE]NCIA|RESERVA DE ARMAMENTO|GRUPO DE PREVEN.*|ADMINISTRATIVO.*)$/i;
    const BOILER = /TODOS OS COMPONENTES|^ESCALADOS$|^VTR:?$|^LOCAL:?$|^GUARNI[ÇC][ÃA]O:?$|^MISS[ÃA]O:?$|^RG$|^QUAT\. EXTRA$|^EFETIVO$|^HOR[ÁA]RIO:?$|^ABC$/i;

    // ---------- 1) Contexto por linha (seções / horários / operações) ----------
    const ctxEvents = []; // {Y, kind, ...}
    let pageWidth = 595;
    for (const it of items) {
      const s = it.str.toUpperCase();
      if (/^[123]ª CIA$/.test(s)) ctxEvents.push({ Y: it.Y, kind: 'sec', sec: 'cia', cia: s[0] });
      else if (/^OF DE DIA$/.test(s)) ctxEvents.push({ Y: it.Y - 15, kind: 'sec', sec: 'fiscal' });
      else if (/GRUPO DE PREVEN/.test(s)) ctxEvents.push({ Y: it.Y, kind: 'sec', sec: 'gpa' });
      else if (/^RECOBRIMENTO$/.test(s)) ctxEvents.push({ Y: it.Y, kind: 'sec', sec: 'recobrimento' });
      else if (/^PERMAN[ÊE]NCIA$/.test(s)) ctxEvents.push({ Y: it.Y, kind: 'sec', sec: 'permanencia' });
      else if (/^RESERVA DE ARMAMENTO$/.test(s)) ctxEvents.push({ Y: it.Y, kind: 'sec', sec: 'reserva' });
      else if (/^ADMINISTRATIVO/.test(s)) ctxEvents.push({ Y: it.Y, kind: 'sec', sec: 'adm' });
      else if (/^OFICIAL DE DIA, PROVIDENCIAR RONDAS/.test(s)) ctxEvents.push({ Y: it.Y, kind: 'sec', sec: 'rondas' });
      else if (/^[12]º TURNO:/.test(s)) {
        const tr = parseTimeRange(s);
        if (tr) ctxEvents.push({ Y: it.Y, kind: 'turno', n: s[0], ...tr, x: it.x });
      } else if (/^OPERA[ÇC][ÃA]O:/.test(s)) {
        if (tipo === 'extra') {
          const rest = items.filter((o) => o !== it && sameLine(o, it) && o.x > it.x).map((o) => o.str).join(' ');
          ctxEvents.push({ Y: it.Y, kind: 'op', nome: norm(it.str.replace(/^OPERA[ÇC][ÃA]O:\s*/i, '') + ' ' + rest) });
        }
      }
    }
    if (tipo === 'ordinario' && !ctxEvents.find((e) => e.kind === 'sec' && e.sec === 'fiscal')) {
      /* sem marcação de OF DE DIA: tudo antes da 1ª CIA vira fiscal */
    }

    // operações (escala extra): ler cabeçalhos
    for (let i = 0; i < ctxEvents.length; i++) {
      const e = ctxEvents[i];
      if (e.kind !== 'op') continue;
      const nextY = (ctxEvents.slice(i + 1).find((x) => x.kind === 'op') || { Y: Infinity }).Y;
      const op = { id: 'op' + out.operacoes.length, nome: e.nome, apresentacao: '', apresentacaoHora: '', concentracao: '', inicio: '', fim: '', obs: '' };
      const headerItems = items.filter((it) => it.Y > e.Y - 1 && it.Y < Math.min(nextY, e.Y + 60));
      for (const it of headerItems) {
        const s = it.str.toUpperCase();
        const valueRight = () => headerItems.filter((o) => o !== it && sameLine(o, it) && o.x > it.x).map((o) => o.str).join(' ');
        if (/^LOCAL DE APRESENTA/.test(s)) {
          let v = norm(it.str.replace(/^LOCAL DE APRESENTA[ÇC][ÃA]O:\s*/i, '') + ' ' + valueRight());
          const t = v.match(/^(\d{1,2})h(\d{2})?\s*,?\s*/i);
          if (t) { op.apresentacaoHora = hm(t[1], t[2]); v = v.slice(t[0].length); }
          op.apresentacao = v.trim();
        } else if (/^CONCENTRA/.test(s)) op.concentracao = norm(it.str.replace(/^CONCENTRA[ÇC][ÃA]O:\s*/i, '') + ' ' + valueRight());
        else if (/^HOR[ÁA]RIO:?$/.test(s) || /^HOR[ÁA]RIO:/.test(s)) {
          const tr = parseTimeRange(it.str + ' ' + valueRight());
          if (tr) { op.inicio = tr.inicio; op.fim = tr.fim; }
        }
      }
      e.opRef = op;
      out.operacoes.push(op);
    }

    function ctxAt(Y, x) {
      let sec = tipo === 'ordinario' ? 'fiscal' : 'extra', cia = '', op = null;
      const turnos = {};
      for (const e of ctxEvents) {
        if (e.Y > Y + 1) break;
        if (e.kind === 'sec') { sec = e.sec; cia = e.cia || ''; }
        if (e.kind === 'turno') turnos[e.n] = e;
        if (e.kind === 'op') { op = e.opRef; sec = 'extra'; }
      }
      return { sec, cia, op, turnos };
    }

    // ---------- 2) Guarnições ancoradas em CMT/MOT/PAT ----------
    const labels = items.filter((it) => /^(CMT|MOT|PAT):/i.test(it.str));
    const takeRight = (label, pred, maxDx) =>
      items.filter((o) => !o.used && o !== label && sameLine(o, label) && o.x > label.x && o.x < label.x + maxDx && pred(o.str))
        .sort((a, b) => a.x - b.x)[0];

    const gus = [];
    for (const lb of labels) {
      const role = lb.str.slice(0, 3).toUpperCase();
      let nameStr = norm(lb.str.slice(4));
      let nameItem = null;
      if (!nameStr) {
        nameItem = takeRight(lb, (s) => !isRG(s) && !isMissao(s) && s !== 'ABC' && /[A-Z]/i.test(s) && GRAD_RE.test(s), 110);
        if (nameItem) { nameItem.used = true; nameStr = nameItem.str; }
      }
      const ref = nameItem || lb;
      const nextLb = labels.filter((o) => o !== lb && sameLine(o, lb) && o.x > lb.x).sort((a, b) => a.x - b.x)[0];
      const rgLimit = nextLb ? nextLb.x : ref.x + 400;
      const rgItem = nameStr ? items.filter((o) => !o.used && sameLine(o, ref, 5) && o.x > ref.x && o.x < rgLimit && isRG(o.str)).sort((a, b) => a.x - b.x)[0] : null;
      if (rgItem) rgItem.used = true;
      lb.used = true;
      items.filter((o) => !o.used && sameLine(o, lb) && o.str === 'ABC' && o.x > lb.x && o.x < lb.x + 120).forEach((o) => (o.used = true));
      // agrupar
      let gu = gus.slice().reverse().find((g) => g.page === lb.page && Math.abs(g.x - lb.x) < 12 && lb.y - g.lastY < 16 && lb.y > g.lastY && role !== 'CMT');
      if (!gu || role === 'CMT') {
        if (role !== 'CMT' && !gu) gu = null;
        if (role === 'CMT' || !gu) { gu = { page: lb.page, x: lb.x, y0: lb.y, lastY: lb.y, Y0: lb.Y, membros: [] }; gus.push(gu); }
      }
      gu.lastY = lb.y;
      if (nameStr) gu.membros.push({ funcao: role, ...parseMilitar(nameStr), rg: rgItem ? rgItem.str : '' });
      else gu.membros.push({ funcao: role, vazio: true });
    }

    for (const g of gus) {
      const top = g.y0 - 5, bot = g.lastY + 5;
      const band = items.filter((o) => o.page === g.page && o.y >= top - 2 && o.y <= bot + 2);
      const vtr = band.filter((o) => isVTR(o.str) && o.x < g.x).sort((a, b) => Math.abs(a.y - (g.y0 + g.lastY) / 2) - Math.abs(b.y - (g.y0 + g.lastY) / 2))[0];
      const missao = band.filter((o) => isMissao(o.str) && o.x > g.x).sort((a, b) => a.x - b.x)[0];
      const ctx = ctxAt(g.Y0, g.x);
      // horário da linha (GPA/recobrimento) ou do turno
      let horario = null;
      const rowTime = band.find((o) => !/TURNO/i.test(o.str) && TIME_RANGE_RE.test(o.str) && !QAJ_RE.test(o.str) && o.x < g.x);
      if (rowTime) { horario = parseTimeRange(rowTime.str); rowTime.used = true; }
      let turnoN = '';
      if (!horario && ctx.sec !== 'extra') {
        const t2 = ctx.turnos['2'];
        turnoN = t2 && g.x >= t2.x - 70 ? '2' : '1';
        const t = ctx.turnos[turnoN];
        if (t) horario = { inicio: t.inicio, fim: t.fim };
      }
      if (!horario && ctx.op && ctx.op.inicio) horario = { inicio: ctx.op.inicio, fim: ctx.op.fim };
      // local: itens não consumidos na faixa, à esquerda da GU (ordinário) ou entre nome e missão (extra)
      let localItems;
      if (ctx.sec === 'extra') localItems = band.filter((o) => !o.used && !SECTION_RE.test(o.str) && o.x > g.x + 100 && (!missao || o.x < missao.x) && !isVTR(o.str));
      else {
        const leftLimit = g.x >= 300 && turnoN === '2' ? 160 : g.x; // 2º turno compartilha o local da linha
        localItems = items.filter((o) => o.page === g.page && o.y >= top - 6 && o.y <= bot + 8 && o.x > 95 && o.x < Math.min(leftLimit, g.x) && !isVTR(o.str) && !BOILER.test(o.str) && !SECTION_RE.test(o.str) && !TIME_RANGE_RE.test(o.str));
      }
      let local = norm(localItems.sort((a, b) => a.y - b.y || a.x - b.x).map((o) => o.str).join(' '));
      let qaj = '';
      const q = local.match(QAJ_RE);
      if (q) { qaj = hm(q[1], q[2]) + '-' + hm(q[3], q[4]); local = norm(local.replace(QAJ_RE, '')); }
      if (ctx.sec === 'extra') localItems.forEach((o) => (o.used = true));
      if (missao) missao.used = true;

      let tipoEmp = ctx.sec === 'cia' ? 'ordinario' : ctx.sec;
      const area = inferArea(local, ctx.sec === 'cia' ? ctx.cia : '');
      const e = {
        id: 'e' + out.empregos.length,
        tipo: tipoEmp,
        operacao: ctx.op ? ctx.op.nome : '',
        opId: ctx.op ? ctx.op.id : '',
        vtr: vtr ? vtr.str : '',
        cia: area.cia,
        bairro: area.bairro,
        local: local.replace(/\s*,\s*$/, ''),
        inicio: horario ? horario.inicio : '',
        fim: horario ? horario.fim : '',
        turno: turnoN,
        qaj,
        missao: missao ? missao.str : '',
        membros: g.membros,
      };
      if (tipoEmp === 'fiscal') { e.local = '27º BPM'; }
      out.empregos.push(e);
    }

    // ---------- 3) Postos sem CMT/MOT (permanência, reserva, administrativo) ----------
    for (const it of items) {
      if (it.used) continue;
      const ctx = ctxAt(it.Y, it.x);
      if (!['permanencia', 'reserva', 'adm'].includes(ctx.sec)) continue;
      if (!GRAD_RE.test(it.str) || it.str.length > 40) continue;
      const line = items.filter((o) => sameLine(o, it, 6));
      const rg = line.find((o) => isRG(o.str) && o.x > it.x);
      const base = line.find((o) => /BASE|SEDE|ABASTEC/i.test(o.str) && o.x < it.x && !/SEDE DO 27/i.test(o.str)) || line.find((o) => /ABASTEC/i.test(o.str));
      const t = line.map((o) => parseTimeRange(o.str)).find(Boolean) ||
        parseTimeRange(items.filter((o) => Math.abs(o.Y - it.Y) < 12).map((o) => o.str).join(' '));
      it.used = true;
      out.empregos.push({
        id: 'e' + out.empregos.length, tipo: ctx.sec, operacao: '', opId: '', vtr: '', cia: '', bairro: '',
        local: base ? base.str : '', inicio: t ? t.inicio : '', fim: t ? t.fim : '', turno: '', qaj: '', missao: '',
        membros: [{ funcao: ctx.sec === 'adm' ? 'ADM' : 'POSTO', ...parseMilitar(it.str), rg: rg ? rg.str : '' }],
      });
    }

    // ---------- 4) Rondas do Oficial de Dia ----------
    const rondaStart = ctxEvents.find((e) => e.sec === 'rondas');
    if (rondaStart) {
      let cur = null;
      for (const it of items.filter((o) => o.Y > rondaStart.Y && o.x < 120)) {
        if (/^[-–•]/.test(it.str)) { cur = { texto: norm(it.str.replace(/^[-–•]\s*/, '')), feita: false }; out.rondas.push(cur); }
        else if (cur && it.str.length > 8 && !/^(VTR|\d[ºª°] ?CIA)/i.test(it.str)) cur.texto += ' ' + it.str;
        else if (cur) break;
      }
    }

    // ---------- 4b) Cartão programa (anexos da escala ordinária) -> tarefas com horário ----------
    out.tarefas = [];
    if (tipo === 'ordinario') {
      const lastGuPage = Math.max(0, ...items.filter((o) => o.used).map((o) => o.page));
      const lines = [];
      for (const it of items.filter((o) => o.page > lastGuPage)) {
        const l = lines[lines.length - 1];
        if (l && l.page === it.page && Math.abs(l.y - it.y) <= 3) l.parts.push(it);
        else lines.push({ page: it.page, y: it.y, parts: [it] });
      }
      lines.forEach((l) => { l.parts.sort((a, b) => a.x - b.x); l.t = compactTimes(norm(l.parts.map((o) => o.str).join(' '))); l.T = l.t.toUpperCase(); });
      const isHeader = (l) => /(^|\s)(VTR:?|N°)(\s|$)/.test(l.T) && /LOCAL|PONTOS?|PBE|COMBOIO/.test(l.T) && !/\d/.test(l.T.replace('N°', '')) && l.parts.length <= 8;
      const isTitle = (l) => !/^FASE/.test(l.T) && /^(OPERA[ÇC][ÃA]O|REFOR[ÇC]O|MADRUGADA|BOM DIA)/.test(l.T) ||
        (/^[A-ZÀ-Ú][A-ZÀ-Ú0-9°º ,.!–-]{5,40}$/.test(l.T) && l.parts.length <= 6 && !TIME_RANGE_RE.test(l.T) && !/VTR|AV\.|RUA|PRA[ÇC]A|P[ÓO]RTICO|COL[ÉE]GIO|SOUZA|GOVERNO|SECRETARIA|POL[ÍI]CIA|COMANDO|BATALH|CIDADE|^RON ?DAS|CONTORNO|LESTE|TAVARES|BARROSO|C[ÉE]SAR|AMAZ[ÔO]NICO|MARINHA|CRIT[ÉE]RIO|SHOPPING|BIS$/.test(l.T));
      const center = (o) => o.x + (o.w || o.str.length * 4.5) / 2;
      let titulo = '', fase = '', hdr = null, skip = false;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/^A[ÇC][ÃA]O \d|TOLER[ÂA]NCIA|NECR[ÓO]POLES|ALMO[ÇC]O SEGURO/.test(l.T)) { skip = true; titulo = l.t; continue; }
        if (/^N°\s+LOCAL/.test(l.T) && !skip) titulo = titulo || 'PBE A CARGO DO OFICIAL DE DIA';
        if (isHeader(l)) {
          if (skip) continue;
          const cols = l.parts.filter((p) => p.str.trim().length >= 2).map((p) => ({ key: p.str.toUpperCase().replace(/[:°]/g, '').trim() || 'N', c: center(p) }));
          const body = [];
          let j = i + 1;
          for (; j < lines.length; j++) {
            const m = lines[j];
            if (m.page !== l.page || isHeader(m) || /^(REFOR[ÇC]O|MADRUGADA|BOM DIA)/.test(m.T) || /^(HOR[ÁA]RIO|FASE|OBS|END|E ?-|BEL[ÉE]M|DIGITADOR|OPERA|CONCENTRA)/.test(m.T)) break;
            body.push(m);
          }
          i = j - 1;
          const colOf = (o) => cols.reduce((best, c) => (Math.abs(c.c - center(o)) < Math.abs(best.c - center(o)) ? c : best), cols[0]).key;
          for (const m of body) {
            m.cells = {};
            for (const p of m.parts) { const k = colOf(p); m.cells[k] = norm((m.cells[k] || '') + ' ' + p.str); }
            for (const k in m.cells) m.cells[k] = compactTimes(m.cells[k]);
          }
          const horKey = cols.map((c) => c.key).find((k) => /HOR/.test(k));
          const vtrKey = cols.map((c) => c.key).find((k) => /^(VTR|N)$/.test(k)) || cols[0].key;
          const anchors = body.filter((m) => horKey ? TIME_RANGE_RE.test(m.cells[horKey] || '') : /VTR|SOUZA|^\d/i.test(m.cells[vtrKey] || ''));
          if (!anchors.length) continue;
          const rows = anchors.map((a) => ({ a, extra: [] }));
          for (const m of body) {
            if (anchors.includes(m)) continue;
            const r = rows.reduce((b, r) => (Math.abs(r.a.y - m.y) < Math.abs(b.a.y - m.y) ? r : b), rows[0]);
            if (Math.abs(r.a.y - m.y) < 30) r.extra.push(m);
          }
          const vtrLines = body.filter((m) => m.cells[vtrKey] && /VTR|SOUZA|^\d/i.test(m.cells[vtrKey]));
          for (const r of rows) {
            const ls = [r.a, ...r.extra].sort((a, b) => a.y - b.y);
            const cell = (k) => norm(ls.map((m) => m.cells[k] || '').join(' '));
            let vtr = cell(vtrKey);
            if (!vtr && vtrLines.length) vtr = vtrLines.reduce((b, m) => (Math.abs(m.y - r.a.y) < Math.abs(b.y - r.a.y) ? m : b)).cells[vtrKey];
            const others = cols.map((c) => c.key).filter((k) => k !== vtrKey && k !== horKey).map(cell).filter(Boolean);
            const h = horKey ? parseTimeRange(r.a.cells[horKey]) : hdr;
            if (!h) continue;
            out.tarefas.push({ id: 't' + out.tarefas.length, titulo: titulo.replace(/(\w) (\w{1,2})( |$)/g, (m0, a, b, c) => (/^(II|I|DE|DA|DO|E)$/.test(b) ? m0 : a + b + c)) + (fase ? ' · ' + fase : ''), inicio: h.inicio, fim: h.fim, descricao: norm([vtr, ...others].join(' — ')), vtr: '', feita: false });
          }
          continue;
        }
        if (/^FASE/.test(l.T)) { if (!skip) fase = l.t.replace(/:$/, ''); continue; }
        if (isTitle(l)) { skip = false; titulo = l.t.replace(/^OPERA[ÇC][ÃA]O:\s*/i, ''); fase = ''; hdr = null; continue; }
        if (skip) continue;
        if (/^FASE/.test(l.T)) { fase = l.t.replace(/:$/, ''); continue; }
        if (/^HOR[ÁA]RIO/.test(l.T)) { hdr = parseTimeRange(l.t); continue; }
        if (hdr && titulo && /^(VTR|SOUZA|CURI|CASTANHEIRA|MARAMBAIA)/.test(l.T) && l.t.length < 100) {
          out.tarefas.push({ id: 't' + out.tarefas.length, titulo: titulo + (fase ? ' · ' + fase : ''), inicio: hdr.inicio, fim: hdr.fim, descricao: norm(l.parts.map((o) => o.str).join(' — ')), vtr: '', feita: false });
        }
      }
      out.operacoes = [];
    }

    // ---------- 5) Observações de operação (ex.: comboio final) ----------
    if (tipo === 'extra' && out.operacoes.length) {
      const lastGuY = Math.max(...gus.map((g) => g.Y0));
      const notes = items.filter((o) => !o.used && o.Y > lastGuY && o.str.length > 30 && !BOILER.test(o.str)).map((o) => o.str);
      if (notes.length) {
        const pmf = (/PMF|MAIS FORTE/.test(notes.join(' ')) && (out.operacoes.find((o) => /MAIS FORTE/i.test(o.nome)) || out.operacoes.find((o) => /PMF/i.test(o.nome)))) || out.operacoes[out.operacoes.length - 1];
        pmf.obs = norm(notes.join(' '));
      }
    }

    for (const e of out.empregos) {
      if (!e.vtr && !['permanencia', 'reserva', 'adm'].includes(e.tipo)) out.avisos.push(`GU sem VTR identificada (${e.membros.map((m) => m.nome).join(', ')})`);
      if (!e.inicio) out.avisos.push(`VTR ${e.vtr || '?'}: horário não identificado`);
    }
    return out;
  }

  async function extractItems(pdfjsLib, data) {
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const all = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        all.push({ page: p, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, str: it.str });
      }
    }
    return all;
  }

  const api = { parse, extractItems, parseMilitar, parseTimeRange, inferArea, AREAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EscalaParser = api;
})(typeof self !== 'undefined' ? self : this);
