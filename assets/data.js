/* ─────────────────────────────────────────────────────────────
   Diário Dev ITS — camada de dados (window.DV) integrada ao backend.
   O backend é a fonte oficial. Getters continuam SÍNCRONOS, lendo de um
   cache em memória hidratado no bootstrap (GET /api/v1/bootstrap). Escritas
   são otimistas (atualizam o cache, enviam ao servidor e reconciliam/rollback).
   Nenhuma tela HTML foi alterada. Ver backend/docs/INTEGRACAO_FRONTEND.md.

   Compatibilidade: as páginas fazem polling por window.DV; por isso só
   publicamos window.DV depois do bootstrap. Getters de datas usam serverNow.
   ───────────────────────────────────────────────────────────── */
(function () {
  var API = (window.DV_API || '') + '/api/v1';

  /* ── tokens/estilos visuais (idênticos ao protótipo) ── */
  var T = {
    sidebar: 'var(--brand)', orange: 'var(--accent)', bg: 'var(--bg)', white: '#ffffff',
    text: '#1e293b', muted: '#64748b', border: 'var(--border)',
    danger: '#dc2626', success: '#16a34a', warning: '#d97706', info: '#0284c7'
  };
  var CATS = [
    { name: 'Entrega', bg: 'var(--tint-green)', fg: '#16a34a', bd: 'var(--tint-green-bd)' },
    { name: 'Correção', bg: 'var(--tint-red)', fg: '#dc2626', bd: 'var(--tint-red-bd)' },
    { name: 'Estudo', bg: 'var(--tint-blue)', fg: 'var(--brand)', bd: 'var(--tint-blue-bd)' },
    { name: 'Descoberta', bg: 'var(--tint-orange)', fg: 'var(--accent)', bd: 'var(--tint-orange-bd)' },
    { name: 'Refatoração', bg: 'var(--surface-2)', fg: '#64748b', bd: 'var(--border)' },
    { name: 'Reunião', bg: 'var(--tint-sky)', fg: '#0284c7', bd: 'var(--tint-sky-bd)' },
    { name: 'Documentação', bg: 'var(--tint-amber)', fg: '#d97706', bd: 'var(--tint-amber-bd)' }
  ];

  /* ── cache central (fonte de leitura síncrona; não é a fonte oficial) ── */
  var state = {
    ready: false, error: null, user: null,
    people: [], categories: [], projects: [], activities: [], tasks: [],
    groups: [], integrations: [], integrationRuns: [], projectMap: {},
    appearance: {}, preferences: { collapsed: false, density: 'confortável', theme: 'light' },
    cursor: null, serverNow: null, timezone: 'America/Sao_Paulo', canAdminister: false
  };

  /* snapshot local só para aplicar tema/marca sem flash antes do bootstrap */
  function snapRead(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function snapWrite(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var readyCbs = [], errorCbs = [];
  function fireReady() { readyCbs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function fireError(e) { errorCbs.forEach(function (f) { try { f(e); } catch (e2) {} }); }

  /* força re-render de todos os componentes DCLogic montados (gancho do support.js) */
  function rerender() {
    var reg = window.__dcRegistry;
    if (!reg) return;
    for (var n in reg) { var e = reg[n]; if (e && e.subs) e.subs.forEach(function (f) { try { f(); } catch (_) {} }); }
  }

  /* mensagem de erro reutilizando o mecanismo visual existente (sem novos componentes) */
  function notifyError(err) {
    var msg = err && err.message ? err.message : 'Falha de comunicação com o servidor.';
    if (err && err.status === 401) { location.href = 'login.dc.html'; return; }
    try { if (window.location && console) console.warn('[DV]', msg); } catch (e) {}
    fireError(err);
  }

  /* ── HTTP ── */
  function http(method, path, body) {
    var opts = { method: method, credentials: 'include', headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return null; }).then(function (j) {
        if (!res.ok) {
          var err = new Error((j && j.error && j.error.message) || ('HTTP ' + res.status));
          err.status = res.status; err.code = j && j.error && j.error.code;
          throw err;
        }
        return j;
      });
    });
  }

  /* ── datas: base = serverNow (fuso da organização = fuso local nesta instalação) ── */
  function baseToday() { var d = state.serverNow ? new Date(state.serverNow) : new Date(); d.setHours(0, 0, 0, 0); return d; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayOffset(iso) { var o = new Date(iso); o.setHours(0, 0, 0, 0); var d = Math.round((baseToday() - o) / 86400000); return isNaN(d) ? 0 : d; }
  function timeOf(iso) { var d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function durToText(min) { if (min == null) return '—'; var h = Math.floor(min / 60), m = min % 60; if (h && m) return h + 'h ' + m + 'm'; if (h) return h + 'h'; return m + 'm'; }
  function durToMin(s) { if (!s || s === '—') return null; var h = /(\d+)\s*h/.exec(s), m = /(\d+)\s*m/.exec(s); var v = (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); return v || null; }
  function occurredFromDT(d, t) { var base = baseToday(); base.setDate(base.getDate() - (d || 0)); var p = (t || '12:00').split(':'); base.setHours(+p[0] || 12, +p[1] || 0, 0, 0); return base.toISOString(); }

  /* ── mapeamento backend → formato do frontend ── */
  function mapActivity(a) {
    return {
      id: a.id, who: a.who, proj: a.proj, cat: a.cat, title: a.title, desc: a.desc || '',
      d: dayOffset(a.occurredAt), t: timeOf(a.occurredAt), dur: durToText(a.durationMinutes),
      pri: a.priority, tags: a.tags || [], files: a.files || [],
      occurredAt: a.occurredAt, version: a.version, sourceTaskId: a.sourceTaskId
    };
  }
  function mapTask(t) {
    return {
      id: t.id, title: t.title, desc: t.desc || '', proj: t.proj, who: t.who, by: t.by,
      due: t.due, pri: t.pri, cat: t.cat, done: t.done, version: t.version,
      completionActivityId: t.completionActivityId
    };
  }

  function ensureProject(name) { if (name && state.projects.indexOf(name) === -1) state.projects.push(name); }
  function findIdx(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; }

  var DV = {
    T: T,
    get TODAY() { return baseToday(); },
    get todayLabel() { var dt = baseToday(); var wd = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dt.getDay()]; return wd + ', ' + this.longDate(0).replace(/^[a-zç]+, /, ''); },

    /* ── estado de prontidão (novo; telas não dependem disto) ── */
    ready: false,
    isReady: function () { return state.ready; },
    onReady: function (cb) { if (state.ready) cb(); else readyCbs.push(cb); },
    onError: function (cb) { errorCbs.push(cb); },

    /* ── coleções (leitura síncrona do cache) ── */
    acts: function () { return state.activities; },
    setActs: function (l) { state.activities = l; },
    people: function () { return state.people; },
    setPeople: function (l) {
      /* diff contra o cache → cria/edita/desativa usuários no backend */
      var current = state.people.slice();
      var byId = {}; current.forEach(function (p) { byId[p.id] = p; });
      var incoming = {}; l.forEach(function (p) { incoming[p.id] = 1; });
      var self = this, ps = [];
      l.forEach(function (p) {
        var prev = byId[p.id];
        var body = { name: p.name, role: p.role, email: p.email, initials: p.ini, color: p.color, level: p.level, active: p.active !== false };
        if (!prev) ps.push(http('POST', '/users', body));
        else if (prev.name !== p.name || prev.role !== p.role || prev.email !== p.email || prev.ini !== p.ini || prev.color !== p.color || prev.level !== p.level || prev.active !== p.active) {
          ps.push(http('PATCH', '/users/' + p.id, body));
        }
      });
      current.forEach(function (p) { if (!incoming[p.id]) ps.push(http('DELETE', '/users/' + p.id)); });
      state.people = l; rerender();
      Promise.all(ps).then(function () { self._reloadPeople(); }).catch(function (e) { notifyError(e); self._reloadPeople(); });
    },
    cats: function () { return state.categories.map(function (c) { return c.name; }); },
    setCats: function (l) {
      /* diff de nomes → cria as novas, arquiva as removidas */
      var current = state.categories.slice();
      var currentNames = current.map(function (c) { return c.name; });
      var toAdd = l.filter(function (n) { return currentNames.indexOf(n) === -1; });
      var toRemove = current.filter(function (c) { return l.indexOf(c.name) === -1; });
      // Otimista com as novas no início, coerente com a ordenação do servidor
      // (categorias novas têm sort_order 0). Evita a nova cair na página 2 e "sumir".
      var ordered = toAdd.concat(l.filter(function (n) { return currentNames.indexOf(n) > -1; }));
      this._setCatNames(ordered); rerender();
      var self = this, ps = [];
      toAdd.forEach(function (n) { ps.push(http('POST', '/categories', { name: n })); });
      toRemove.forEach(function (c) { if (c.id) ps.push(http('DELETE', '/categories/' + c.id)); });
      Promise.all(ps).then(function () { self._reloadCats(); }).catch(function (e) { notifyError(e); self._reloadCats(); });
    },
    projects: function () { return state.projects.slice(); },
    setProjects: function (l) { state.projects = l; },
    tasks: function () { return state.tasks; },
    setTasks: function (l) { state.tasks = l; },

    /* ── sessão ── */
    user: function () { return state.user; },
    /* Login real por e-mail e senha (POST /auth/login). Retorna Promise. */
    login: function (email, password) {
      return http('POST', '/auth/login', { email: email, password: password }).then(function (r) {
        state.user = r.data.user;
        return r.data.user;
      }).catch(function (err) {
        // mensagens claras para a tela, sem expor detalhe técnico
        if (err && err.status === 401) throw new Error('E-mail ou senha inválidos.');
        if (err && err.status === 403) throw new Error('Usuário inativo. Fale com o administrador.');
        if (err && err.status === 429) throw new Error('Muitas tentativas. Aguarde um instante.');
        if (err && err.status === 422) throw new Error('Informe um e-mail válido.');
        throw new Error('Não foi possível entrar. Verifique a conexão.');
      });
    },
    /* Solicita o e-mail de redefinição (POST /auth/password-reset/request).
       O servidor responde igual exista ou não a conta; a tela não deve inferir nada
       do retorno além de "pedido registrado". */
    requestPasswordReset: function (email) {
      return http('POST', '/auth/password-reset/request', { email: email }).then(function () {
        return true;
      }).catch(function (err) {
        if (err && err.status === 429) throw new Error('Muitos pedidos. Aguarde alguns minutos.');
        if (err && err.status === 422) throw new Error('Informe um e-mail válido.');
        throw new Error('Não foi possível enviar o e-mail. Verifique a conexão.');
      });
    },
    /* Conclui a redefinição com o token recebido por e-mail
       (POST /auth/password-reset/confirm). Todas as sessões do usuário são revogadas. */
    confirmPasswordReset: function (token, newPassword) {
      return http('POST', '/auth/password-reset/confirm', { token: token, newPassword: newPassword }).then(function () {
        return true;
      }).catch(function (err) {
        if (err && err.status === 401) throw new Error('Link inválido ou expirado. Peça um novo.');
        if (err && err.status === 429) throw new Error('Muitas tentativas. Aguarde um instante.');
        if (err && err.status === 422) throw new Error((err.message) || 'Senha não aceita. Use ao menos 8 caracteres.');
        throw new Error('Não foi possível redefinir a senha. Verifique a conexão.');
      });
    },
    /* Indicadores da tela de login. Sem sessão não há dados da equipe: devolve zeros
       (a lista de colaboradores não é exposta antes de autenticar). */
    loginStats: function () {
      var acts = state.activities;
      return {
        today: acts.filter(function (a) { return a.d === 0; }).length,
        week: acts.filter(function (a) { return a.d < 7; }).length,
        people: state.people.filter(function (p) { return p.active; }).length
      };
    },
    setUser: function (id) {
      /* "entrar como" do protótipo → dev-login. Bridge via localStorage porque a
         tela navega logo após setUser; a próxima página autentica antes do bootstrap. */
      snapWrite('dv.session.pending', id);
    },
    logout: function () {
      try { localStorage.removeItem('dv.session.pending'); } catch (e) {}
      state.user = null;
      // Navega só depois de encerrar a sessão (limpar cookies/revogar) no servidor.
      var go = function () { location.href = 'login.dc.html'; };
      http('POST', '/auth/logout').then(go, go);
    },
    isLogged: function () { return !!state.user; },

    /* ── tema ── */
    theme: function () { return state.preferences.theme || 'light'; },
    setTheme: function (t) { state.preferences.theme = t; snapWrite('dv.snap.theme', t); this.applyTheme(); this._savePrefs({ theme: t }); },
    toggleTheme: function () { this.setTheme(this.theme() === 'dark' ? 'light' : 'dark'); return this.theme(); },
    applyTheme: function () { try { document.documentElement.setAttribute('data-theme', this.theme()); this.applyBrand(); } catch (e) {} },

    /* ── marca/aparência ── */
    BRAND_DEFAULT: {
      mark: 'ITS', markImg: '', name: 'Diário Dev', sub: 'Registro de atividades',
      brand: '#183c5a', accent: '#E85928', radius: 10, density: 'confortável', sidebarStyle: 'sólida'
    },
    brand: function () { return Object.assign({}, this.BRAND_DEFAULT, state.appearance || {}); },
    setBrand: function (patch) {
      state.appearance = Object.assign({}, state.appearance, patch);
      snapWrite('dv.snap.brand', state.appearance);
      this.applyBrand();
      http('PUT', '/settings/appearance', patch).then(function (r) { state.appearance = r.data || state.appearance; }).catch(notifyError);
    },
    resetBrand: function () {
      state.appearance = {};
      snapWrite('dv.snap.brand', {});
      this.applyBrand();
      http('PUT', '/settings/appearance', {}).catch(notifyError);
    },
    applyBrand: function () {
      try { var b = this.brand(); var r = document.documentElement.style; r.setProperty('--brand', b.brand); r.setProperty('--accent', b.accent); r.setProperty('--radius', b.radius + 'px'); } catch (e) {}
    },
    logoVals: function (collapsed) {
      var b = this.brand();
      return {
        mark: b.markImg ? '' : (b.mark || 'ITS').slice(0, 3),
        markStyle: 'width:32px;height:32px;flex:0 0 32px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;color:#fff;overflow:hidden;background:' +
          (b.markImg ? '#fff url(' + b.markImg + ') center/contain no-repeat' : 'var(--accent)'),
        name: b.name, sub: b.sub
      };
    },

    /* ── preferências de UI ── */
    ui: function () {
      return {
        collapsed: !!state.preferences.collapsed,
        density: state.preferences.density || 'confortável',
        defaultProject: state.preferences.defaultProject || '',
        groups: state.groups, integrations: state.integrations, integrationRuns: state.integrationRuns
      };
    },
    setUi: function (patch) {
      if ('collapsed' in patch) { state.preferences.collapsed = patch.collapsed; this._savePrefs({ collapsed: patch.collapsed }); }
      if ('density' in patch) { state.preferences.density = patch.density; this._savePrefs({ density: patch.density }); }
      if ('defaultProject' in patch) {
        state.preferences.defaultProject = patch.defaultProject;
        this._savePrefs({ defaultProjectId: state.projectMap[patch.defaultProject] || null });
      }
      if ('groups' in patch) this._syncGroups(patch.groups);
      if ('integrations' in patch) this._syncIntegrations(patch.integrations);
      if ('integrationRuns' in patch) state.integrationRuns = patch.integrationRuns; // histórico é do backend; local apenas
    },
    _savePrefs: function (patch) { http('PUT', '/preferences', patch).catch(function () {}); },
    _setCatNames: function (names) {
      state.categories = names.map(function (n) {
        var ex = state.categories.filter(function (c) { return c.name === n; })[0];
        return ex || { id: null, name: n, slug: n, color: null, active: true };
      });
    },
    _eq: function (a, b) { return JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort()); },
    _syncGroups: function (groups) {
      var current = state.groups.slice();
      var byId = {}; current.forEach(function (g) { byId[g.id] = g; });
      var incoming = {}; groups.forEach(function (g) { incoming[g.id] = 1; });
      var self = this, ps = [];
      groups.forEach(function (g) {
        var prev = byId[g.id];
        if (!prev) {
          ps.push(http('POST', '/groups', { name: g.name, desc: g.desc || '', level: g.level || 'dev', perms: g.perms || [] })
            .then(function (r) { if ((g.members || []).length) return http('PUT', '/groups/' + r.data.id + '/members', { members: g.members }); }));
        } else {
          if (prev.name !== g.name || prev.desc !== g.desc || prev.level !== g.level || !self._eq(prev.perms, g.perms)) {
            ps.push(http('PATCH', '/groups/' + g.id, { name: g.name, desc: g.desc || '', level: g.level, perms: g.perms || [] }));
          }
          if (!self._eq(prev.members, g.members)) ps.push(http('PUT', '/groups/' + g.id + '/members', { members: g.members || [] }));
        }
      });
      current.forEach(function (g) { if (!incoming[g.id]) ps.push(http('DELETE', '/groups/' + g.id)); });
      state.groups = groups; rerender();
      Promise.all(ps).then(function () { self._reloadGroups(); self._reloadPeople(); })
        .catch(function (e) { notifyError(e); self._reloadGroups(); self._reloadPeople(); });
    },
    _syncIntegrations: function (list) {
      var current = state.integrations.slice();
      var byId = {}; current.forEach(function (i) { byId[i.id] = i; });
      var incoming = {}; list.forEach(function (i) { incoming[i.id] = 1; });
      var self = this, ps = [];
      list.forEach(function (i) {
        var prev = byId[i.id];
        var body = { name: i.name, abbr: i.abbr || null, type: i.type, enabled: i.enabled, endpoint: i.endpoint || null, events: i.events || [], notes: i.notes || null };
        if (i.secret) body.secret = i.secret; // só envia segredo se foi digitado
        if (!prev) ps.push(http('POST', '/integrations', body));
        else if (prev.name !== i.name || prev.abbr !== i.abbr || prev.type !== i.type || prev.enabled !== i.enabled || prev.endpoint !== i.endpoint || prev.notes !== i.notes || !self._eq(prev.events, i.events) || i.secret) {
          ps.push(http('PATCH', '/integrations/' + i.id, body));
        }
      });
      current.forEach(function (i) { if (!incoming[i.id]) ps.push(http('DELETE', '/integrations/' + i.id)); });
      state.integrations = list; rerender();
      Promise.all(ps).then(function () { self._reloadIntegrations(); }).catch(function (e) { notifyError(e); self._reloadIntegrations(); });
    },
    _reloadCats: function () { http('GET', '/categories').then(function (r) { state.categories = r.data || []; rerender(); }).catch(function () {}); },
    _reloadPeople: function () {
      http('GET', '/users').then(function (r) {
        state.people = (r.data || []).map(function (u) { return { id: u.id, name: u.name, role: u.role, email: u.email, ini: u.ini, color: u.color, active: u.active, level: u.level }; });
        rerender();
      }).catch(function () {});
    },
    _reloadGroups: function () { http('GET', '/groups').then(function (r) { state.groups = r.data || []; rerender(); }).catch(function () {}); },
    _reloadIntegrations: function () { http('GET', '/integrations').then(function (r) { state.integrations = r.data || []; rerender(); }).catch(function () {}); },

    /* ── níveis de acesso ── */
    LEVELS: { dev: { label: 'Desenvolvedor', rank: 1 }, gestor: { label: 'Gestor', rank: 2 }, ceo: { label: 'Diretoria', rank: 3 } },
    levelOf: function (p) { if (!p) return 'dev'; if (p.level) return p.level; return p.id === 'laerty' ? 'gestor' : p.id === 'marcelo' ? 'ceo' : 'dev'; },
    levelLabel: function (p) { return (this.LEVELS[this.levelOf(p)] || this.LEVELS.dev).label; },
    rankOf: function (p) { return (this.LEVELS[this.levelOf(p)] || this.LEVELS.dev).rank; },
    seesAll: function (p) { return this.rankOf(p) >= 2; },
    isExec: function (p) { return this.rankOf(p) >= 3; },
    visibleActs: function (p) { var all = this.acts(); return this.seesAll(p) ? all : all.filter(function (a) { return a.who === p.id; }); },

    /* ── listas: ordenação e paginação (idênticas ao protótipo) ── */
    PAGE_SIZE: 8,
    sortList: function (list, mode, textKey, numKey) {
      var l = list.slice();
      var txt = function (x) { return String(x[textKey] || '').toLowerCase(); };
      var num = function (x) { return Number(x[numKey] || 0); };
      if (mode === 'az') l.sort(function (a, b) { return txt(a).localeCompare(txt(b)); });
      else if (mode === 'za') l.sort(function (a, b) { return txt(b).localeCompare(txt(a)); });
      else if (mode === 'maior') l.sort(function (a, b) { return num(b) - num(a); });
      else if (mode === 'menor') l.sort(function (a, b) { return num(a) - num(b); });
      return l;
    },
    sortOptions: function (numLabel) {
      return [
        { value: 'az', label: 'A → Z' }, { value: 'za', label: 'Z → A' },
        { value: 'maior', label: (numLabel || 'Quantidade') + ': maior → menor' },
        { value: 'menor', label: (numLabel || 'Quantidade') + ': menor → maior' }
      ];
    },
    selectStyle: 'padding:8px 30px 8px 11px;border:1.5px solid var(--border);border-radius:6px;font-size:.79rem;font-weight:600;background-color:var(--surface);color:var(--text-muted);outline:none;cursor:pointer;appearance:none;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 15px) 53%,calc(100% - 10px) 53%;background-size:5px 5px,5px 5px;background-repeat:no-repeat',
    paginate: function (list, page, size, noun, onPage) {
      var per = size || this.PAGE_SIZE;
      var pages = Math.max(1, Math.ceil(list.length / per));
      var cur = Math.min(Math.max(1, page || 1), pages);
      var from = list.length ? (cur - 1) * per + 1 : 0;
      var to = Math.min(cur * per, list.length);
      var btn = function (enabled) {
        return 'width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;border:1.5px solid var(--border);' +
          (enabled ? 'color:var(--text-muted);cursor:pointer;background:var(--surface)' : 'color:var(--border-strong);background:var(--surface-2);cursor:default');
      };
      return {
        items: list.slice((cur - 1) * per, cur * per),
        page: cur, pages: pages, total: list.length,
        countLabel: list.length + ' ' + (noun || 'registros') + (list.length > per ? ' · exibindo ' + from + '–' + to : ''),
        pageLabel: 'Página ' + cur + ' de ' + pages, many: pages > 1,
        prevStyle: btn(cur > 1), nextStyle: btn(cur < pages),
        onPrev: function () { if (cur > 1 && onPage) onPage(cur - 1); },
        onNext: function () { if (cur < pages && onPage) onPage(cur + 1); },
        numbers: Array.apply(null, { length: pages }).map(function (x, i) {
          return {
            label: i + 1,
            style: 'min-width:30px;height:30px;padding:0 8px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;cursor:pointer;border:1.5px solid ' +
              (i + 1 === cur ? 'var(--brand);background:var(--brand);color:#fff' : 'var(--border);color:var(--text-muted);background:var(--surface)'),
            onClick: function () { if (onPage) onPage(i + 1); }
          };
        })
      };
    },

    /* ── export CSV (idêntico) ── */
    csv: function (header, rows) {
      var esc = function (v) { var s = v == null ? '' : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      return [header.map(esc).join(';')].concat(rows.map(function (r) { return r.map(esc).join(';'); })).join('\r\n');
    },
    download: function (filename, text) {
      var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
    },

    /* ── lookups ── */
    person: function (id) { var l = this.people(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; },
    cat: function (name) {
      for (var i = 0; i < CATS.length; i++) if (CATS[i].name === name) return CATS[i];
      var h = 0; for (var j = 0; j < (name || '').length; j++) h += name.charCodeAt(j);
      return CATS[h % CATS.length];
    },

    /* ── datas (baseadas em serverNow) ── */
    dateOf: function (d) { var dt = baseToday(); dt.setDate(dt.getDate() - d); return dt; },
    fmt: function (d) { var dt = this.dateOf(d); var m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][dt.getMonth()]; return pad(dt.getDate()) + ' ' + m; },
    longDate: function (d) { var dt = this.dateOf(d); var wd = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][dt.getDay()]; return wd + ', ' + this.fmt(d); },
    iso: function (d) { var dt = this.dateOf(d); return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); },
    offsetOf: function (isoStr) { var days = Math.round((this.dateOf(0) - new Date(isoStr + 'T12:00:00')) / 86400000); return isNaN(days) ? 0 : Math.max(0, days); },
    groupLabel: function (d) { return d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : d < 7 ? 'Esta semana' : 'Semanas anteriores'; },
    plural: function (n) { return n + (n === 1 ? ' registro' : ' registros'); },

    /* ── estilos compartilhados (idênticos) ── */
    avatar: function (p, size) {
      var s = size || 34;
      return 'width:' + s + 'px;height:' + s + 'px;border-radius:50%;flex:0 0 ' + s + 'px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:' +
        (s <= 24 ? .62 : s >= 56 ? 1.1 : s >= 44 ? .88 : .72) + 'rem;background:' + (p && p.color ? p.color : T.sidebar);
    },
    catText: function (c) { if (c.fg === 'var(--brand)') return 'var(--brand-text)'; if (c.fg === '#64748b') return 'var(--text-muted)'; return c.fg; },
    catStyle: function (name) {
      var c = this.cat(name);
      return 'display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:20px;font-size:.71rem;font-weight:600;white-space:nowrap;background:' + c.bg + ';color:' + this.catText(c) + ';border:1px solid ' + c.bd;
    },
    badge: function (kind) {
      var m = { green: ['var(--tint-green)', '#16a34a', 'var(--tint-green-bd)'], gray: ['var(--surface-2)', 'var(--text-muted)', 'var(--border)'], orange: ['var(--tint-orange)', 'var(--accent)', 'var(--tint-orange-bd)'], blue: ['var(--tint-blue)', 'var(--brand-text)', 'var(--tint-blue-bd)'] }[kind] || ['var(--surface-2)', '#64748b', 'var(--border)'];
      return 'display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:.71rem;font-weight:600;white-space:nowrap;background:' + m[0] + ';color:' + m[1] + ';border:1px solid ' + m[2];
    },
    chip: function (active, extra) {
      return 'display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .12s;white-space:nowrap;' +
        (active ? 'background:var(--brand);color:#fff;border:1.5px solid var(--brand);' : 'background:var(--surface);color:var(--text-muted);border:1.5px solid var(--border);') + (extra || '');
    },
    soft: function (hex, a) {
      var h = (hex || 'var(--brand)').replace('#', '');
      if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
      var n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    },
    priColor: function (p) { return p === 'alta' ? T.danger : p === 'média' ? T.warning : '#94a3b8'; },

    /* ── shell: navegação e sidebar (idênticos) ── */
    NAV: [
      { id: 'dashboard', label: 'Dashboard', icon: '◱', href: 'dashboard.dc.html' },
      { id: 'atividades', label: 'Atividades', icon: '≡', href: 'atividades.dc.html' },
      { id: 'colaboradores', label: 'Colaboradores', icon: '◍', href: 'colaboradores.dc.html' },
      { id: 'projetos', label: 'Projetos', icon: '◈', href: 'projetos.dc.html' },
      { id: 'relatorios', label: 'Relatórios', icon: '◔', href: 'relatorios.dc.html' },
      { id: 'pesquisa', label: 'Auditoria', icon: '⌕', href: 'pesquisa.dc.html' },
      { id: 'configuracoes', label: 'Configurações', icon: '⚙', href: 'configuracoes.dc.html' }
    ],
    nav: function (active, collapsed) {
      return this.NAV.map(function (n) {
        var on = n.id === active;
        return {
          label: n.label, icon: n.icon, href: n.href,
          style: 'display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:7px;font-size:.81rem;font-weight:' + (on ? 600 : 500) +
            ';text-decoration:none;transition:background .13s;overflow:hidden;white-space:nowrap;' + (collapsed ? 'justify-content:center;' : '') +
            (on ? 'background:var(--accent);color:#fff;' : 'color:rgba(255,255,255,.66);'),
          labelStyle: collapsed ? 'display:none' : 'flex:1'
        };
      });
    },
    shell: function (collapsed) {
      return {
        aside: 'width:' + (collapsed ? 68 : 238) + 'px;flex:0 0 ' + (collapsed ? 68 : 238) + 'px;background:var(--brand);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;transition:width .18s ease',
        logo: 'padding:16px 18px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.08);' + (collapsed ? 'justify-content:center;' : ''),
        brand: collapsed ? 'display:none' : 'min-width:0',
        userRow: 'display:flex;align-items:center;gap:9px;padding:8px;border-radius:7px;text-decoration:none;color:rgba(255,255,255,.72);' + (collapsed ? 'justify-content:center;' : ''),
        userText: collapsed ? 'display:none' : 'min-width:0;flex:1',
        toggle: 'display:flex;align-items:center;justify-content:' + (collapsed ? 'center' : 'flex-start') + ';gap:9px;padding:8px 10px;border-radius:7px;color:rgba(255,255,255,.5);font-size:.78rem;font-weight:600;cursor:pointer',
        btn: 'width:34px;height:34px;flex:0 0 34px;border:1.5px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:1rem;font-weight:700;cursor:pointer;background:var(--surface);transition:all .13s',
        caret: collapsed ? 'display:none' : 'color:rgba(255,255,255,.45);font-size:.8rem',
        toggleIcon: collapsed ? '»' : '«', toggleLabel: collapsed ? 'display:none' : ''
      };
    },

    /* ── projetos visíveis ── */
    visibleProjects: function (p) {
      var all = this.projects();
      if (this.seesAll(p)) return all;
      var mine = {};
      this.acts().forEach(function (a) { if (a.who === p.id) mine[a.proj] = 1; });
      this.tasks().forEach(function (t) { if (t.who === p.id) mine[t.proj] = 1; });
      return all.filter(function (n) { return mine[n]; });
    },
    canSeeProject: function (p, name) { return this.visibleProjects(p).indexOf(name) > -1; },
    canPlan: function (p) { return this.rankOf(p) >= 2; },

    /* ── prazos (idênticos, base serverNow) ── */
    daysLeft: function (iso) { var base = this.dateOf(0); base.setHours(12, 0, 0, 0); var d = Math.round((new Date(iso + 'T12:00:00') - base) / 86400000); return isNaN(d) ? 0 : d; },
    dueInfo: function (iso) {
      var n = this.daysLeft(iso);
      var label = n < 0 ? 'atrasada ' + Math.abs(n) + 'd' : n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : 'em ' + n + ' dias';
      var tone = n < 0 ? 'red' : n <= 2 ? 'orange' : 'gray';
      return { days: n, label: label, tone: tone, color: n < 0 ? T.danger : n <= 2 ? T.warning : '#64748b' };
    },
    dueLabel: function (iso) { var dt = new Date(iso + 'T12:00:00'); if (isNaN(dt)) return iso; var m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][dt.getMonth()]; return pad(dt.getDate()) + ' ' + m; },
    isoPlus: function (n) { var dt = this.dateOf(0); dt.setDate(dt.getDate() + n); return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); },

    /* ── tarefas (escrita otimista) ── */
    createTask: function (rec) {
      var temp = Object.assign({ done: false }, rec); temp.id = 'tmp-' + Date.now();
      state.tasks = [temp].concat(state.tasks); rerender();
      http('POST', '/tasks', { title: rec.title, desc: rec.desc || '', proj: rec.proj, who: rec.who || null, due: rec.due || null, pri: rec.pri || 'média', cat: rec.cat || null, clientMutationId: temp.id })
        .then(function (r) { var i = findIdx(state.tasks, temp.id); if (i > -1) state.tasks[i] = mapTask(r.data); rerender(); })
        .catch(function (e) { state.tasks = state.tasks.filter(function (t) { return t.id !== temp.id; }); rerender(); notifyError(e); });
      return temp;
    },
    updateTask: function (id, rec) {
      var i = findIdx(state.tasks, id); if (i < 0) return; var prev = state.tasks[i];
      state.tasks[i] = Object.assign({}, prev, rec); rerender();
      var done = state.tasks[i];
      var p;
      if (rec.done === true && !prev.done) p = http('POST', '/tasks/' + id + '/complete');
      else if (rec.done === false && prev.done) p = http('POST', '/tasks/' + id + '/reopen');
      else p = http('PATCH', '/tasks/' + id, { title: done.title, desc: done.desc || '', proj: done.proj, who: done.who || null, due: done.due || null, pri: done.pri || 'média', cat: done.cat || null, version: prev.version || 1 });
      p.then(function (r) { var j = findIdx(state.tasks, id); if (j > -1 && r && r.data) state.tasks[j] = mapTask(r.data); rerender(); })
        .catch(function (e) { var j = findIdx(state.tasks, id); if (j > -1) state.tasks[j] = prev; rerender(); notifyError(e); });
    },
    removeTask: function (id) {
      var i = findIdx(state.tasks, id); if (i < 0) return; var prev = state.tasks[i];
      state.tasks.splice(i, 1); rerender();
      http('DELETE', '/tasks/' + id).catch(function (e) { state.tasks.splice(i, 0, prev); rerender(); notifyError(e); });
    },

    /* ── atividades (escrita otimista) ── */
    create: function (rec) {
      var temp = Object.assign({}, rec); temp.id = 'tmp-' + Date.now();
      if (!temp.who && state.user) temp.who = state.user.id;
      if (temp.d == null) temp.d = 0;
      if (!temp.t) temp.t = timeOf(new Date().toISOString());
      if (!temp.files) temp.files = [];
      state.activities = [temp].concat(state.activities); ensureProject(temp.proj); rerender();
      var payload = {
        proj: temp.proj, cat: temp.cat, title: temp.title, desc: temp.desc || '',
        occurredAt: occurredFromDT(temp.d, temp.t), durationMinutes: durToMin(temp.dur),
        priority: temp.pri || 'média', tags: temp.tags || [], clientMutationId: temp.id,
        sourceTaskId: rec.sourceTaskId || null
      };
      http('POST', '/activities', payload)
        .then(function (r) { var i = findIdx(state.activities, temp.id); if (i > -1) state.activities[i] = mapActivity(r.data); rerender(); })
        .catch(function (e) { state.activities = state.activities.filter(function (a) { return a.id !== temp.id; }); rerender(); notifyError(e); });
      return temp;
    },
    update: function (id, rec) {
      var i = findIdx(state.activities, id); if (i < 0) return; var prev = state.activities[i];
      var merged = Object.assign({}, prev, rec); state.activities[i] = merged; ensureProject(merged.proj); rerender();
      var payload = {
        proj: merged.proj, cat: merged.cat, title: merged.title, desc: merged.desc || '',
        occurredAt: merged.occurredAt || occurredFromDT(merged.d, merged.t), durationMinutes: durToMin(merged.dur),
        priority: merged.pri || 'média', tags: merged.tags || [], version: prev.version || 1
      };
      http('PATCH', '/activities/' + id, payload)
        .then(function (r) { var j = findIdx(state.activities, id); if (j > -1) state.activities[j] = mapActivity(r.data); rerender(); })
        .catch(function (e) { var j = findIdx(state.activities, id); if (j > -1) state.activities[j] = prev; rerender(); notifyError(e); });
    },
    remove: function (id) {
      var i = findIdx(state.activities, id); if (i < 0) return; var prev = state.activities[i];
      state.activities.splice(i, 1); rerender();
      http('DELETE', '/activities/' + id).catch(function (e) { state.activities.splice(i, 0, prev); rerender(); notifyError(e); });
    },
    reset: function () { /* sem efeito com backend; recarrega do servidor */ location.reload(); },

    /* ── sync incremental após reconexão ── */
    _applyEvent: function (env) {
      if (!env || !env.event) return;
      var ev = env.event;
      // Recarrega a coleção afetada de forma simples e segura (evita dessincronizar o cache).
      if (ev.indexOf('activity.') === 0) this._reload('activities');
      else if (ev.indexOf('task.') === 0) this._reload('tasks');
      else if (ev.indexOf('integration.run') === 0 || ev.indexOf('integration.') === 0) this._reload('integrationRuns');
      if (env.cursor) state.cursor = env.cursor;
    },
    _reload: function (what) {
      var self = this;
      if (what === 'activities') {
        http('GET', '/activities?perPage=500').then(function (r) { state.activities = (r.data || []).map(mapActivity); rerender(); }).catch(function () {});
      } else if (what === 'tasks') {
        http('GET', '/tasks?perPage=500').then(function (r) { state.tasks = (r.data || []).map(mapTask); rerender(); }).catch(function () {});
      } else if (what === 'integrationRuns' && state.canAdminister) {
        http('GET', '/integration-runs').then(function (r) { state.integrationRuns = r.data || []; rerender(); }).catch(function () {});
      }
      void self;
    }
  };

  /* ── aplica tema/marca do snapshot antes do bootstrap (evita flash) ── */
  try {
    var snapT = snapRead('dv.snap.theme', 'light'); state.preferences.theme = snapT;
    var snapB = snapRead('dv.snap.brand', {}); state.appearance = snapB;
    document.documentElement.setAttribute('data-theme', snapT);
    DV.applyBrand();
  } catch (e) {}

  /* ── carga do estado a partir do bootstrap ── */
  function hydrate(data) {
    state.user = data.user; state.people = data.people || [];
    state.categories = data.categories || [];
    var projRows = data.projects || [];
    state.projects = projRows.map(function (p) { return p.name; });
    state.projectMap = {}; var idToName = {};
    projRows.forEach(function (p) { state.projectMap[p.name] = p.id; idToName[p.id] = p.name; });
    state.activities = (data.activities || []).map(mapActivity);
    state.tasks = (data.tasks || []).map(mapTask);
    state.groups = data.groups || []; state.integrations = data.integrations || []; state.integrationRuns = data.integrationRuns || [];
    state.appearance = data.appearance || {}; state.preferences = Object.assign({ collapsed: false, density: 'confortável', theme: 'light' }, data.preferences || {});
    state.preferences.defaultProject = idToName[state.preferences.defaultProjectId] || '';
    state.serverNow = data.serverNow; state.timezone = data.timezone || 'America/Sao_Paulo';
    state.cursor = data.cursor; state.canAdminister = !!data.canAdminister;
    snapWrite('dv.snap.theme', state.preferences.theme); snapWrite('dv.snap.brand', state.appearance);
  }

  /* ── Socket.IO: carrega o client servido pelo backend e conecta ── */
  function connectSocket() {
    if (window.io) { openSocket(); return; }
    var s = document.createElement('script');
    s.src = (window.DV_API || '') + '/socket.io/socket.io.js';
    s.onload = openSocket; s.onerror = function () {};
    document.head.appendChild(s);
  }
  function openSocket() {
    try {
      var sock = window.io(window.DV_API || undefined, { withCredentials: true });
      sock.on('dv:event', function (env) { DV._applyEvent(env); });
      sock.on('connect', function () {
        if (state.cursor) http('GET', '/sync?cursor=' + encodeURIComponent(state.cursor)).then(function (r) {
          (r.data.events || []).forEach(function (e) { DV._applyEvent(e); });
        }).catch(function () {});
      });
    } catch (e) {}
  }

  function publish() { state.ready = true; DV.ready = true; window.DV = DV; DV.applyTheme(); rerender(); fireReady(); }

  function isLoginPage() { return /login\.dc\.html/.test(location.pathname) || /login/.test(location.pathname); }

  /* ── inicialização assíncrona (não bloqueia; telas fazem polling por window.DV) ── */
  function init() {
    var pending = snapRead('dv.session.pending', null);
    var pre = pending ? http('POST', '/auth/dev-login', { publicKey: pending }).then(function () { try { localStorage.removeItem('dv.session.pending'); } catch (e) {} }).catch(function () { try { localStorage.removeItem('dv.session.pending'); } catch (e) {} }) : Promise.resolve();

    var boot = function () { return http('GET', '/bootstrap'); };
    pre.then(boot)
      .catch(function (err) {
        // Access token expirado: tenta renovar pelo refresh antes de desistir.
        if (err && err.status === 401 && !isLoginPage()) return http('POST', '/auth/refresh').then(boot);
        throw err;
      })
      .then(function (r) { hydrate(r.data); publish(); connectSocket(); })
      .catch(function (err) {
        if (err && err.status === 401) {
          if (isLoginPage()) {
            // Sem sessão na tela de login: publica o DV vazio. A lista de
            // colaboradores NÃO é exposta antes de autenticar; o login é por
            // e-mail e senha (DV.login).
            publish();
          } else {
            location.href = 'login.dc.html';
          }
        } else {
          state.error = err; publish(); notifyError(err);
        }
      });
  }

  init();
})();
