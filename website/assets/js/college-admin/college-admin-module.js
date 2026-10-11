/**
 * F02 — College Admin institution setup & readiness (UI layer, single-college scope).
 */
(function (global) {
  function applyTheme() {
    document.documentElement.classList.remove('principal-console-theme', 'hod-console-theme', 'teacher-console-theme');
    document.documentElement.classList.add('college-admin-console-theme');
    const app = document.getElementById('app');
    if (app) app.setAttribute('data-role', 'college_admin');
    document.title = 'Cravex · College Admin';
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.content = '#080a10';
  }

  function clearTheme() {
    document.documentElement.classList.remove('college-admin-console-theme');
  }

  async function loadSetupKpis(db, collegeId) {
    const el = document.getElementById('college-admin-setup-kpis');
    if (!el || !collegeId) return;
    const checks = await runReadinessChecks(db, collegeId);
    const open = checks.filter((c) => !c.ok).length;
    el.innerHTML = `
      <div class="stat"><div class="stat-lbl">Setup items</div><div class="stat-val">${checks.length}</div><div class="stat-sub">Readiness checklist</div></div>
      <div class="stat"><div class="stat-lbl">Open</div><div class="stat-val">${open}</div><div class="stat-sub">Needs attention</div></div>
      <div class="stat"><div class="stat-lbl">Departments</div><div class="stat-val">${checks.find((c) => c.id === 'depts')?.meta ?? '—'}</div><div class="stat-sub">Active</div></div>
      <div class="stat"><div class="stat-lbl">Module</div><div class="stat-val" style="font-size:18px">F02</div><div class="stat-sub">College Admin</div></div>`;
  }

  async function runReadinessChecks(db, collegeId) {
    const [{ data: college }, { data: depts }, { count: teacherCount }, { count: studentCount }, { count: assignCount }] =
      await Promise.all([
        db.from('colleges').select('id,name').eq('id', collegeId).maybeSingle(),
        db.from('departments').select('id,hod_user_id').eq('college_id', collegeId).eq('is_active', true),
        db.from('users').select('id', { count: 'exact', head: true }).eq('college_id', collegeId).eq('role', 'teacher').is('deleted_at', null),
        db.from('students').select('id', { count: 'exact', head: true }).eq('college_id', collegeId).is('deleted_at', null),
        db.from('subject_assignments').select('id', { count: 'exact', head: true }).eq('college_id', collegeId).eq('is_active', true),
      ]);
    const deptList = depts || [];
    const noHod = deptList.filter((d) => !d.hod_user_id).length;
    return [
      { id: 'profile', label: 'College profile', ok: !!(college && college.name), hint: college?.name || 'Missing college name', nav: 'settings' },
      { id: 'depts', label: 'At least one department', ok: deptList.length > 0, meta: deptList.length, hint: `${deptList.length} department(s)`, nav: 'departments' },
      { id: 'hod', label: 'HOD assigned per department', ok: deptList.length > 0 && noHod === 0, hint: noHod ? `${noHod} without HOD` : 'All assigned', nav: 'departments' },
      { id: 'teachers', label: 'Faculty accounts', ok: (teacherCount ?? 0) > 0, hint: `${teacherCount ?? 0} teachers`, nav: 'teachers' },
      { id: 'assign', label: 'Subject assignments', ok: (assignCount ?? 0) > 0, hint: `${assignCount ?? 0} active`, nav: 'teachers' },
      { id: 'students', label: 'Student roster', ok: (studentCount ?? 0) > 0, hint: `${studentCount ?? 0} students`, nav: 'students' },
    ];
  }

  async function loadReadinessPage(db, collegeId, helpers) {
    const wrap = document.getElementById('readiness-wrap');
    if (!wrap) return;
    if (!collegeId) {
      wrap.innerHTML = helpers.empty('', 'No college scope');
      return;
    }
    wrap.innerHTML = helpers.ld();
    const checks = await runReadinessChecks(db, collegeId);
    wrap.innerHTML = `<div class="card"><div class="card-hd"><h3>Institution setup checklist</h3><span style="font-size:11px;color:var(--mid)">One college · operational readiness</span></div>
      ${checks
        .map(
          (c) => `<div class="readiness-row">
          <div>
            <div style="font-weight:500">${helpers.esc(c.label)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${helpers.esc(c.hint)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="${c.ok ? 'readiness-ok' : 'readiness-warn'}">${c.ok ? '✓ Ready' : '○ Open'}</span>
            <button class="btn-sm" onclick="nav('${c.nav}')">Go →</button>
          </div>
        </div>`
        )
        .join('')}
    </div>
    <div class="card" style="margin-top:16px"><div class="card-hd"><h3>Role boundaries</h3></div>
      <div style="padding:16px;font-size:12px;color:var(--mid);line-height:1.55">
        College Admin manages setup and users for <strong>this college only</strong>. You do not approve final IA marks unless policy assigns that duty to you.
        Principal assigns HODs; HOD verifies department submissions; teachers work on assigned classes.
      </div>
    </div>`;
  }

  global.CvxCollegeAdmin = {
    applyTheme,
    clearTheme,
    loadSetupKpis,
    loadReadinessPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
