/* =============================================================================
 *  VMS  ·  Shell
 *  Renders the sidebar + topbar so every page doesn't have to duplicate the
 *  HTML. Pages just include <div id="shell"></div> and call Shell.mount().
 * ============================================================================= */

const Shell = (() => {

  const ITEMS = [
    { id: 'dashboard',  label: 'Dashboard',     href: 'dashboard.html', icon: '◧' },
    { id: 'record',     label: 'Record Video',  href: 'record.html',    icon: '●' },
    { id: 'history',    label: 'Video History', href: 'history.html',   icon: '≡' },
    { id: 'admin',      label: 'Admin Panel',   href: 'admin.html',     icon: '◆', adminOnly: true },
    { id: 'settings',   label: 'Settings',      href: 'settings.html',  icon: '⚙' },
  ];

  function mount({ active = '', crumbs = [] } = {}) {
    const sess = Auth.user();
    const host = document.getElementById('shell');
    if (!host) return;

    const cfg = window.VMS_CONFIG;
    const isAdmin = sess?.role === 'Admin';

    const sidebarItems = ITEMS
      .filter(i => !i.adminOnly || isAdmin)
      .map(i => `
        <a class="nav-item ${i.id === active ? 'active' : ''}" href="${i.href}">
          <span class="ic mono">${i.icon}</span>
          <span>${i.label}</span>
        </a>
      `).join('');

    const crumbHTML = crumbs.length
      ? crumbs.map((c, i) =>
          i === crumbs.length - 1 ? `<b>${c}</b>` : `${c} <span class="dim">/</span>`
        ).join(' ')
      : '<b>Dashboard</b>';

    host.outerHTML = `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="brand">
            <div class="brand-mark">V</div>
            <div class="brand-name">
              ${cfg.APP_NAME}
              <small>${cfg.APP_TAGLINE}</small>
            </div>
          </div>

          <nav class="nav">
            <div class="nav-section">
              <div class="nav-label">Workspace</div>
              ${sidebarItems}
            </div>
          </nav>

          <div class="sidebar-footer">
            <div class="user-chip" data-user-chip></div>
          </div>
        </aside>

        <main class="main">
          <header class="topbar">
            <button class="menu-toggle" id="menu-toggle" aria-label="Toggle navigation">≡</button>
            <div class="crumbs">${crumbHTML}</div>
            <div class="spacer"></div>
            <span class="status-pill" id="net-pill"><span class="dot"></span>ONLINE</span>
          </header>

          <div class="content" id="content"></div>
        </main>
      </div>
    `;

    // Wire user chip + logout
    Auth.paintUserChip(document);

    // Mobile menu
    const sidebar = document.getElementById('sidebar');
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Network status
    const pill = document.getElementById('net-pill');
    const setNet = () => {
      if (navigator.onLine) {
        pill.classList.remove('off');
        pill.lastChild.textContent = 'ONLINE';
      } else {
        pill.classList.add('off');
        pill.lastChild.textContent = 'OFFLINE';
      }
    };
    window.addEventListener('online',  setNet);
    window.addEventListener('offline', setNet);
    setNet();
  }

  return { mount };
})();
