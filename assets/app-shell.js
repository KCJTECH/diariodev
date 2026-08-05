/* Diário Dev — casca da aplicação (sidebar + topbar).
   Fonte única do layout: todas as telas montam <app-shell> e só entregam o conteúdo.

   Uso:
     <x-import component-from-global-scope="app-shell" from="./assets/app-shell.js"
               page="dashboard" heading="Dashboard" subtitle="o que está acontecendo agora"
               hint-size="100%,100%">
       <div slot="actions"> … botões da direita da topbar … </div>
       <div slot="tabs">    … segunda linha da topbar (opcional) … </div>
       <main> … conteúdo da página … </main>
     </x-import>

   Depende de assets/data.js (window.DV) para menu, marca, usuário e tema.
   No back real: trocar DV.nav/DV.user pelos dados da sessão; o markup não muda. */
(function () {
  if (customElements.get('app-shell')) return;

  /* estilos da casca — injetados uma vez, escopados por app-shell */
  var CSS = `
app-shell{display:block}
app-shell .as-wrap{display:flex;align-items:stretch;min-height:100vh;background:var(--bg)}
app-shell .as-aside{display:flex;flex-direction:column;position:sticky;top:0;height:100vh;
  background:var(--brand);transition:width .18s ease,flex-basis .18s ease;overflow:hidden}
app-shell .as-logo{display:flex;align-items:center;gap:11px;padding:16px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
app-shell .as-mark{width:32px;height:32px;flex:0 0 32px;border-radius:7px;display:flex;align-items:center;
  justify-content:center;font-weight:900;font-size:11px;color:#fff;overflow:hidden}
app-shell .as-brand{min-width:0;flex:1}
app-shell .as-brand b{display:block;color:#fff;font-weight:700;font-size:.87rem;line-height:1.25;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
app-shell .as-brand i{display:block;color:rgba(255,255,255,.4);font-size:.67rem;font-style:normal;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
app-shell .as-nav{padding:13px 8px;display:flex;flex-direction:column;gap:2px}
app-shell .as-nav a{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:7px;
  font-size:.83rem;font-weight:500;text-decoration:none;color:rgba(255,255,255,.68);transition:background .13s,color .13s}
app-shell .as-nav a:hover{background:rgba(255,255,255,.10);color:#fff}
app-shell .as-nav a[aria-current="page"]{background:rgba(255,255,255,.13);color:#fff;font-weight:600}
app-shell .as-nav a em{width:18px;text-align:center;font-size:.95rem;font-style:normal;flex:0 0 18px}
app-shell .as-foot{margin-top:auto;padding:10px;border-top:1px solid rgba(255,255,255,.08);position:relative}
app-shell .as-user{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer;transition:background .13s}
app-shell .as-user:hover{background:rgba(255,255,255,.08)}
app-shell .as-av{width:30px;height:30px;flex:0 0 30px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:.72rem;font-weight:700;color:#fff}
app-shell .as-utxt{min-width:0;flex:1}
app-shell .as-utxt b{display:block;font-size:.78rem;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
app-shell .as-utxt i{display:block;font-size:.68rem;font-style:normal;color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
app-shell .as-caret{color:rgba(255,255,255,.45);font-size:.8rem}
app-shell .as-menu{position:absolute;bottom:calc(100% - 2px);left:10px;right:10px;background:var(--surface);
  border:1px solid var(--border);border-radius:calc(var(--radius) - 1px);box-shadow:0 8px 32px rgba(0,0,0,.24);overflow:hidden;z-index:40}
app-shell .as-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:10px 13px;border:0;background:none;
  font:inherit;font-size:.82rem;font-weight:600;color:var(--text);text-align:left;cursor:pointer;border-bottom:1px solid var(--border-soft)}
app-shell .as-menu button:last-child{border-bottom:0;color:#dc2626}
app-shell .as-menu button:hover{background:var(--surface-2)}
app-shell .as-menu button em{width:16px;text-align:center;font-style:normal}
app-shell .as-col{flex:1;min-width:0;display:flex;flex-direction:column}
app-shell .as-header{position:sticky;top:0;z-index:20;background:var(--surface);border-bottom:1px solid var(--border);
  padding:0;display:flex;flex-direction:column}
app-shell .as-bar{min-height:62px;display:flex;align-items:center;gap:16px;flex-wrap:nowrap;width:100%;max-width:1600px;margin:0 auto;padding:0 28px}
app-shell .as-tabs{width:100%;max-width:1600px;margin:0 auto;padding:0 28px}
app-shell .as-btn{width:34px;height:34px;flex:0 0 34px;border:1.5px solid var(--border);border-radius:8px;display:flex;
  align-items:center;justify-content:center;color:var(--text-muted);font-size:1rem;font-weight:700;
  cursor:pointer;background:var(--surface);transition:border-color .13s,color .13s}
app-shell .as-btn:hover{border-color:var(--brand-text);color:var(--brand-text)}
app-shell .as-title{min-width:140px;flex:1 1 auto;overflow:hidden}
app-shell .as-title b{display:block;font-size:.95rem;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
app-shell .as-title i{display:block;font-size:.74rem;font-style:normal;color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
app-shell .as-actions{display:flex;align-items:center;gap:12px;flex-wrap:nowrap;justify-content:flex-end;min-width:0}
app-shell .as-actions > *{flex-wrap:nowrap !important;min-width:0}
app-shell .as-content{flex:1;display:flex;flex-direction:column;min-width:0}
app-shell .as-content > main{align-self:center;max-width:1600px !important}
@media (max-width:1040px){
  app-shell .as-aside{width:68px !important;flex:0 0 68px !important}
  app-shell .as-brand,app-shell .as-utxt,app-shell .as-caret,app-shell .as-nav a span{display:none !important}
  app-shell .as-nav a,app-shell .as-logo,app-shell .as-user{justify-content:center !important}
  app-shell [data-role="sidebar-toggle"]{display:none}
}
@media (max-width:880px){
  app-shell .as-bar{flex-wrap:wrap;row-gap:10px;padding:10px 16px}
  app-shell .as-tabs{padding:8px 16px}
}
@media print{
  app-shell .as-aside,app-shell .as-header{display:none !important}
}
`;

  if (!document.getElementById('as-style')) {
    var st = document.createElement('style');
    st.id = 'as-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var MENU = [
    ['Minha conta', '◍', 'usuario.dc.html'],
    ['Alterar senha', '⚿', 'usuario.dc.html?senha=1'],
    ['Sair da conta', '⏻', '__logout']
  ];

  var AppShell = class extends HTMLElement {
    static get observedAttributes() { return ['page', 'heading', 'subtitle']; }

    connectedCallback() {
      if (!this._built) { this._built = true; this.build(); }
      this.adopt();
      this.render();
      if (!this._wait) this._wait = setInterval(() => { if (window.DV) { clearInterval(this._wait); this._wait = 0; this.render(); } }, 25);
    }

    disconnectedCallback() {
      clearInterval(this._wait); this._wait = 0;
      if (this._obs) this._obs.disconnect();
      document.removeEventListener('click', this._onDoc, true);
    }

    attributeChangedCallback() { if (this._built) this.render(); }

    /* monta a moldura (light DOM, para o preview conseguir capturar e editar) */
    build() {
      var mk = (tag, cls, html) => {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (html != null) el.innerHTML = html;
        return el;
      };
      var wrap = mk('div', 'as-wrap');
      var aside = mk('aside', 'as-aside');
      var logo = mk('div', 'as-logo');
      this._mark = mk('div', 'as-mark');
      this._brand = mk('div', 'as-brand', '<b></b><i></i>');
      logo.append(this._mark, this._brand);

      this._nav = mk('nav', 'as-nav');
      this._foot = mk('div', 'as-foot');
      this._user = mk('div', 'as-user');
      this._av = mk('div', 'as-av');
      this._utxt = mk('div', 'as-utxt', '<b></b><i></i>');
      this._caret = mk('span', 'as-caret', '⌃');
      this._user.append(this._av, this._utxt, this._caret);
      this._user.addEventListener('click', (e) => { e.stopPropagation(); this._menu = !this._menu; this.render(); });
      this._foot.append(this._user);
      aside.append(logo, this._nav, this._foot);

      var col = mk('div', 'as-col');
      var header = mk('header', 'as-header');
      var bar = mk('div', 'as-bar');

      this._sbBtn = mk('div', 'as-btn',
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">' +
        '<rect x="3" y="4.5" width="18" height="15" rx="3"></rect><line x1="10" y1="4.5" x2="10" y2="19.5"></line></svg>');
      this._sbBtn.setAttribute('data-role', 'sidebar-toggle');
      this._sbBtn.title = 'Recolher ou expandir o menu';
      this._sbBtn.addEventListener('click', () => { window.DV.setUi({ collapsed: !window.DV.ui().collapsed }); this.render(); });

      this._thBtn = mk('div', 'as-btn');
      this._thBtn.setAttribute('data-role', 'theme-toggle');
      this._thBtn.addEventListener('click', () => { window.DV.toggleTheme(); this.render(); });

      this._title = mk('div', 'as-title', '<b></b><i></i>');
      this._actions = mk('div', 'as-actions');
      bar.append(this._sbBtn, this._thBtn, this._title, mk('div', '', ''), this._actions);
      bar.children[3].style.flex = '1';

      this._tabs = mk('div', 'as-tabs');
      header.append(bar, this._tabs);
      this._content = mk('div', 'as-content');
      col.append(header, this._content);
      wrap.append(aside, col);

      this._aside = aside;
      this._logo = logo;
      this._chrome = wrap;
      this.appendChild(wrap);

      /* conteúdo entregue pela página vai para os lugares certos, mesmo se chegar depois */
      this._obs = new MutationObserver(() => this.adopt());
      this._obs.observe(this, { childList: true });
      this._onDoc = () => { if (this._menu) { this._menu = false; this.render(); } };
      document.addEventListener('click', this._onDoc, true);
    }

    adopt() {
      var kids = Array.prototype.slice.call(this.children);
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k === this._chrome) continue;
        var slot = k.getAttribute && k.getAttribute('slot');
        var host = slot === 'actions' ? this._actions : slot === 'tabs' ? this._tabs : this._content;
        if (k.parentNode !== host) host.appendChild(k);
      }
    }

    render() {
      var D = window.DV;
      if (!D || !this._built) return;
      var collapsed = !!D.ui().collapsed;
      var logo = D.logoVals(collapsed);
      var u = D.user();
      var w = collapsed ? 68 : 238;

      this._aside.style.width = w + 'px';
      this._aside.style.flex = '0 0 ' + w + 'px';
      this._logo.style.justifyContent = collapsed ? 'center' : 'flex-start';
      this._brand.style.display = collapsed ? 'none' : 'block';
      this._mark.textContent = logo.mark;
      this._mark.style.background = (logo.markStyle.split('background:')[1] || 'var(--accent)');
      this._brand.querySelector('b').textContent = logo.name;
      this._brand.querySelector('i').textContent = logo.sub;

      var page = this.getAttribute('page') || '';
      this._nav.innerHTML = D.NAV.map(function (n) {
        return '<a href="' + n.href + '" title="' + n.label + '"' + (n.id === page ? ' aria-current="page"' : '') +
          (collapsed ? ' style="justify-content:center"' : '') + '><em>' + n.icon + '</em>' +
          (collapsed ? '' : '<span>' + n.label + '</span>') + '</a>';
      }).join('');

      this._user.style.justifyContent = collapsed ? 'center' : 'flex-start';
      this._av.textContent = u.ini;
      this._av.style.background = u.color;
      this._utxt.style.display = collapsed ? 'none' : 'block';
      this._utxt.querySelector('b').textContent = u.name;
      this._utxt.querySelector('i').textContent = u.role;
      this._caret.style.display = collapsed ? 'none' : 'inline';

      var old = this._foot.querySelector('.as-menu');
      if (old) old.remove();
      if (this._menu) {
        var m = document.createElement('div');
        m.className = 'as-menu';
        MENU.forEach(function (it) {
          var b = document.createElement('button');
          b.innerHTML = '<em>' + it[1] + '</em>' + it[0];
          b.addEventListener('click', function (e) {
            e.stopPropagation();
            if (it[2] === '__logout') { D.logout(); window.location.href = 'login.dc.html'; }
            else window.location.href = it[2];
          });
          m.appendChild(b);
        });
        this._foot.insertBefore(m, this._foot.firstChild);
      }

      var dark = D.theme() === 'dark';
      this._thBtn.textContent = dark ? '☀' : '☾';
      this._thBtn.title = dark ? 'Voltar ao tema claro' : 'Ativar tema escuro';

      this._title.querySelector('b').textContent = this.getAttribute('heading') || '';
      this._title.querySelector('i').textContent = this.getAttribute('subtitle') || '';
      this._tabs.style.display = this._tabs.children.length ? 'block' : 'none';
    }
  };

  customElements.define('app-shell', AppShell);
})();
