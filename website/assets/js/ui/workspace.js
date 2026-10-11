/**
 * Cravex role workspace — navigation & overview presentation (no auth logic).
 */
(function (global) {
  const ROLES = {
    master: {
      label: 'Master Admin',
      workspace: 'Platform Console',
      scope: 'All colleges · system configuration & analytics',
      badgeClass: 'rb-master',
      overview: {
        title: 'Platform overview',
        subtitle: 'Monitor institutions, usage, and academic signals across the Cravex network.',
        status: 'Multi-tenant platform',
      },
      quickActions: [
        { nav: 'colleges', icon: '◻', title: 'Register college', desc: 'Onboard a new institution' },
        { nav: 'analytics', icon: '◇', title: 'System analytics', desc: 'Messages, cache & bot usage' },
        { nav: 'risk', icon: '▲', title: 'Risk monitor', desc: 'Cross-college at-risk students' },
        { nav: 'teachers', icon: '◎', title: 'Faculty roster', desc: 'Teachers for selected college' },
      ],
    },
    principal: {
      label: 'Principal',
      workspace: 'Institution Console',
      scope: 'College-wide oversight · approvals · published settings',
      badgeClass: 'rb-principal',
      overview: {
        title: 'Institution overview',
        subtitle: 'Monitor academic health, pending approvals, and published configuration for your college.',
        status: 'Principal scope',
      },
      quickActions: [
        { nav: 'settings', icon: '⚙', title: 'Institution settings', desc: 'Published config & audit trail' },
        { nav: 'risk', icon: '▲', title: 'Academic risk', desc: 'At-risk students college-wide' },
        { nav: 'marks', icon: '◇', title: 'Assessment review', desc: 'Internal marks & submissions' },
        { nav: 'notices', icon: '☰', title: 'Announcements', desc: 'Notices sent to students' },
      ],
    },
    college_admin: {
      label: 'College Admin',
      workspace: 'Admin Console',
      scope: 'Institution settings · people · communications',
      badgeClass: 'rb-college_admin',
      overview: {
        title: 'Institution dashboard',
        subtitle: 'Configure departments, faculty, and college-wide academic operations from one place.',
        status: 'Configuration hub',
      },
      quickActions: [
        { nav: 'departments', icon: '▦', title: 'Departments', desc: 'HODs, codes & structure' },
        { nav: 'teachers', icon: '◎', title: 'Add teacher', desc: 'Provision faculty accounts' },
        { nav: 'broadcast', icon: '◈', title: 'Broadcast', desc: 'Message all students' },
        { nav: 'knowledge', icon: '◉', title: 'Knowledge base', desc: 'Upload branch PDFs' },
        { nav: 'settings', icon: '⚙', title: 'Admin settings', desc: 'Versioned configuration' },
      ],
    },
    hod: {
      label: 'HOD',
      workspace: 'Department Operations',
      scope: 'Your department · faculty · syllabus & approvals',
      badgeClass: 'rb-hod',
      overview: {
        title: 'Department dashboard',
        subtitle: 'Oversee faculty, lesson-plan coverage, marks verification, and department health.',
        status: 'Department scope',
      },
      quickActions: [
        { nav: 'mydept', icon: '▦', title: 'My department', desc: 'Teachers, subjects & HOD tools' },
        { nav: 'lessonplan', icon: '▤', title: 'Lesson plans', desc: 'Coverage across the department' },
        { nav: 'marks', icon: '◇', title: 'Internal marks', desc: 'Review IA & assessment records' },
        { nav: 'risk', icon: '▲', title: 'At-risk students', desc: 'Attendance & performance alerts' },
      ],
    },
    teacher: {
      label: 'Teacher',
      workspace: 'Teaching Workspace',
      scope: 'Your classes · attendance · marks · lesson delivery',
      badgeClass: 'rb-teacher',
      overview: {
        title: 'Teaching dashboard',
        subtitle: 'Run day-to-day class work—rosters, sessions, marks, and syllabus progress—in one workspace.',
        status: 'Assigned classes only',
      },
      quickActions: [
        { nav: 'sessions', icon: '◉', title: 'Attendance sessions', desc: 'View bot session history' },
        { nav: 'marks', icon: '◇', title: 'Enter marks', desc: 'IA, assignment & SEE' },
        { nav: 'lessonplan', icon: '▤', title: 'Lesson plan', desc: 'Topics, COs & coverage' },
        { nav: 'students', icon: '◉', title: 'Class roster', desc: 'Students in your sections' },
      ],
    },
  };

  function meta(role) {
    return ROLES[role] || ROLES.college_admin;
  }

  function navItem(id, label, icon) {
    return `<div class="nav-item" onclick="nav('${id}')" id="n-${id}"><span class="ni">${icon}</span> ${label}</div>`;
  }

  function navSection(title) {
    return `<div class="nav-sec">${title}</div>`;
  }

  function buildNav(role) {
    const isAdm = role === 'college_admin' || role === 'master';
    const isInst = isAdm || role === 'principal';
    const isMstr = role === 'master';
    const isHod = role === 'hod';
    const isTea = role === 'teacher';
    const isPrincipal = role === 'principal';

    let html = navSection('Overview') + navItem('overview', 'Dashboard', '◈');

    if (isHod) html += navItem('mydept', 'My Department', '▦');

    if (isMstr) {
      html +=
        navSection('Platform') +
        navItem('colleges', 'Colleges', '◻') +
        navItem('analytics', 'Analytics', '◇') +
        navSection('Institution') +
        navItem('students', 'Students', '◉') +
        navItem('sessions', 'Sessions', '◷') +
        navItem('teachers', 'Teachers', '◎') +
        navItem('departments', 'Departments', '▦') +
        navItem('settings', 'Settings', '⚙');
    } else if (role === 'college_admin') {
      html +=
        navSection('Configuration') +
        navItem('departments', 'Departments', '▦') +
        navItem('teachers', 'Teachers', '◎') +
        navItem('students', 'Students', '◉') +
        navItem('sessions', 'Sessions', '◷') +
        navItem('settings', 'Settings', '⚙');
    } else if (isPrincipal) {
      html +=
        navSection('Institution') +
        navItem('departments', 'Departments', '▦') +
        navItem('teachers', 'Teachers', '◎') +
        navItem('students', 'Students', '◉') +
        navItem('sessions', 'Sessions', '◷') +
        navItem('settings', 'Settings', '⚙');
    } else if (isHod) {
      html += navSection('People') + navItem('students', 'Students', '◉') + navItem('sessions', 'Sessions', '◷');
    } else if (isTea) {
      html +=
        navSection('My classes') +
        navItem('students', 'Students', '◉') +
        navItem('sessions', 'Sessions', '◷') +
        navItem('marks', 'Marks', '◇') +
        navSection('Teaching') +
        navItem('lessonplan', 'Lesson Plan', '▤') +
        navSection('Student success') +
        navItem('risk', 'Risk Monitor', '▲') +
        navSection('Communication') +
        navItem('broadcast', 'Broadcast', '◈') +
        navItem('notices', 'Notices', '☰') +
        navSection('Resources') +
        navItem('knowledge', 'Knowledge Base', '◉');
      return html;
    }

    html +=
      navSection('Academics') +
      navItem('lessonplan', 'Lesson Plan', '▤') +
      navItem('marks', 'Marks', '◇') +
      navItem('risk', 'Risk Monitor', '▲') +
      navSection('Communication') +
      navItem('broadcast', 'Broadcast', '◈') +
      navItem('notices', 'Notices', '☰') +
      navSection('Knowledge') +
      navItem('knowledge', 'Knowledge Base', '◉');

    if (isAdm && !isMstr) {
      /* college admin: no analytics */
    }

    return html;
  }

  function buildOverviewHeader(role, rbCls, rbLbl, colBar) {
    const m = meta(role);
    const ov = m.overview;
    const actions = (m.quickActions || [])
      .map(
        (a) =>
          `<button type="button" class="qa-card" onclick="nav('${a.nav}')"><div class="qa-icon">${a.icon}</div><div class="qa-title">${a.title}</div><div class="qa-desc">${a.desc}</div></button>`
      )
      .join('');

    return `
    ${colBar}
    <div class="workspace-hero">
      <div>
        <div class="role-badge ${rbCls}">${rbLbl}</div>
        <h2>${ov.title}</h2>
        <p>${ov.subtitle}</p>
      </div>
      <div class="workspace-hero-meta">
        <span class="pill-status"><i></i> ${ov.status}</span>
        <span style="font-size:11px;color:var(--muted);font-weight:300">${m.workspace}</span>
      </div>
    </div>
    <div class="quick-actions" aria-label="Quick actions">${actions}</div>`;
  }

  function applyShell(role) {
    const app = document.getElementById('app');
    if (!app) return;
    app.dataset.role = role || 'college_admin';
    const m = meta(role);
    const ws = document.getElementById('sb-workspace');
    if (ws) {
      ws.innerHTML = `
        <div class="sb-workspace-label">Workspace</div>
        <div class="sb-workspace-title">${m.workspace}</div>
        <div class="sb-workspace-scope">${m.scope}</div>`;
    }
    const mobileTitle = document.getElementById('mobile-page-title');
    if (mobileTitle) mobileTitle.textContent = m.workspace;
  }

  let mobileNavBound = false;

  function bindMobileNav() {
    if (mobileNavBound) return;
    mobileNavBound = true;

    document.addEventListener('click', (e) => {
      const app = document.getElementById('app');
      if (!app) return;
      const backdrop = document.getElementById('sidebar-backdrop');

      if (e.target.closest('#mobile-menu-btn')) {
        const open = app.classList.toggle('sidebar-open');
        if (backdrop) backdrop.classList.toggle('open', open);
        return;
      }

      if (e.target.closest('#sidebar-backdrop')) {
        app.classList.remove('sidebar-open');
        backdrop.classList.remove('open');
        return;
      }

      if (e.target.closest('.sb-nav .nav-item') && window.matchMedia('(max-width: 768px)').matches) {
        app.classList.remove('sidebar-open');
        if (backdrop) backdrop.classList.remove('open');
      }
    });
  }

  function bindLoginRolePicker() {
    const select = document.getElementById('l-role');
    const grid = document.getElementById('login-role-grid');
    if (!select || !grid) return;

    const options = [
      { value: 'master', title: 'Master Admin', desc: 'All colleges & platform analytics' },
      { value: 'college_admin', title: 'College Admin', desc: 'Institution configuration & staff' },
      { value: 'principal', title: 'Principal', desc: 'Institution oversight & settings' },
      { value: 'hod', title: 'HOD', desc: 'Department faculty & approvals' },
      { value: 'teacher', title: 'Teacher', desc: 'Classes, marks & lesson plans' },
    ];

    grid.innerHTML = options
      .map(
        (o) =>
          `<button type="button" class="login-role-opt" data-role="${o.value}"><strong>${o.title}</strong><span>${o.desc}</span></button>`
      )
      .join('');

    function pick(value) {
      select.value = value;
      grid.querySelectorAll('.login-role-opt').forEach((b) => b.classList.toggle('selected', b.dataset.role === value));
      if (typeof global.onRoleChange === 'function') global.onRoleChange(value);
    }

    grid.querySelectorAll('.login-role-opt').forEach((b) => {
      b.addEventListener('click', () => pick(b.dataset.role));
    });

    if (select.value) pick(select.value);
  }

  global.CvxWorkspace = {
    ROLES,
    meta,
    buildNav,
    buildOverviewHeader,
    applyShell,
    bindMobileNav,
    bindLoginRolePicker,
  };
})(typeof window !== 'undefined' ? window : globalThis);
