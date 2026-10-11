/**
 * F04 — HOD department operations (UI layer, department-scoped).
 */
(function (global) {
  const MEETINGS_LS_PREFIX = 'cvx_hod_meetings_v1_';

  function applyTheme() {
    document.documentElement.classList.remove('principal-console-theme', 'teacher-console-theme', 'college-admin-console-theme');
    document.documentElement.classList.add('hod-console-theme');
    const app = document.getElementById('app');
    if (app) app.setAttribute('data-role', 'hod');
    document.title = 'Cravex · HOD Console';
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.content = '#080a10';
  }

  function clearTheme() {
    document.documentElement.classList.remove('hod-console-theme');
  }

  async function ensureDepartmentContext(db, cu, collegeId) {
    if (!collegeId || !cu) return null;
    if (cu.department_id) return cu.department_id;
    const { data: byHod } = await db
      .from('departments')
      .select('id,code,name')
      .eq('college_id', collegeId)
      .eq('hod_user_id', cu.id)
      .eq('is_active', true)
      .maybeSingle();
    if (byHod?.id) {
      cu.department_id = byHod.id;
      return byHod.id;
    }
    const { data: first } = await db
      .from('departments')
      .select('id')
      .eq('college_id', collegeId)
      .eq('is_active', true)
      .order('name')
      .limit(1)
      .maybeSingle();
    if (first?.id && String(cu.id || '').startsWith('00000000-0000-4000')) {
      cu.department_id = first.id;
      return first.id;
    }
    return null;
  }

  async function getDept(db, collegeId, deptId) {
    if (!deptId) return null;
    const { data } = await db.from('departments').select('*').eq('id', deptId).eq('college_id', collegeId).maybeSingle();
    return data;
  }

  async function loadDeptKpis(db, collegeId, cu) {
    const el = document.getElementById('hod-dept-kpis');
    if (!el || !collegeId) return;
    const deptId = cu.department_id;
    const dept = await getDept(db, collegeId, deptId);
    if (!dept) {
      el.innerHTML = '';
      return;
    }
    const [{ count: teacherCount }, pendingRes, coverage] = await Promise.all([
      db.from('users').select('id', { count: 'exact', head: true }).eq('college_id', collegeId).eq('department_id', deptId).in('role', ['teacher', 'hod']),
      db.from('resources').select('id', { count: 'exact', head: true }).eq('college_id', collegeId).eq('status', 'pending').eq('branch', dept.code),
      db.from('lesson_plan_summary').select('coverage_percent').eq('college_id', collegeId).eq('branch', dept.code).then((r) => (r.error ? [] : r.data || [])),
    ]);
    const pending = pendingRes.error ? 0 : pendingRes.count ?? 0;
    const avgCov =
      coverage.length > 0
        ? Math.round(coverage.reduce((s, r) => s + (Number(r.coverage_percent) || 0), 0) / coverage.length)
        : '—';
    el.innerHTML = `
      <div class="stat"><div class="stat-lbl">Faculty</div><div class="stat-val">${teacherCount ?? 0}</div><div class="stat-sub">${dept.code}</div></div>
      <div class="stat"><div class="stat-lbl">Review queue</div><div class="stat-val">${pending}</div><div class="stat-sub">Pending resources</div></div>
      <div class="stat"><div class="stat-lbl">Syllabus coverage</div><div class="stat-val">${avgCov}${avgCov === '—' ? '' : '%'}</div><div class="stat-sub">Dept average</div></div>
      <div class="stat"><div class="stat-lbl">Module</div><div class="stat-val" style="font-size:18px">F04</div><div class="stat-sub">HOD console</div></div>`;
  }

  async function recordDecision(db, collegeId, cu, sourceType, sourceId, decision, comment) {
    const row = {
      college_id: collegeId,
      department_id: cu.department_id || null,
      source_type: sourceType,
      source_id: sourceId,
      decision,
      comment: comment || null,
      actor_user_id: cu.id || null,
      actor_phone: cu.phone_number || null,
      actor_role: 'hod',
    };
    const { error } = await db.from('hod_decision_audit').insert(row);
    if (error) console.warn('hod_decision_audit:', error.message);
  }

  async function loadReviewQueue(db, collegeId, cu, helpers) {
    const wrap = document.getElementById('hod-reviews-wrap');
    if (!wrap) return;
    const dept = await getDept(db, collegeId, cu.department_id);
    if (!dept) {
      wrap.innerHTML = helpers.empty('', 'No department assigned', 'Ask College Admin or Principal to link you as HOD.');
      return;
    }
    wrap.innerHTML = helpers.ld();
    const items = [];
    const { data: resources, error: re } = await db
      .from('resources')
      .select('id,title,branch,uploaded_by,created_at,status')
      .eq('college_id', collegeId)
      .eq('status', 'pending')
      .or(`branch.eq.${dept.code},branch.eq.All`)
      .order('created_at', { ascending: false })
      .limit(25);
    if (!re && resources?.length) {
      resources.forEach((r) =>
        items.push({ type: 'resource', id: r.id, title: r.title, sub: `Resource · ${r.uploaded_by || 'faculty'}`, at: r.created_at })
      );
    }
    wrap._hodCtx = { db, collegeId, cu, helpers, dept };
    if (!items.length) {
      wrap.innerHTML = helpers.empty('◇', 'Queue clear', 'Lesson plans, course files and marks returned for review will appear here.');
      return;
    }
    wrap.innerHTML = items
      .map(
        (it) => `
      <div class="approval-row" id="hod-review-${it.type}-${it.id}">
        <div>
          <div style="font-weight:500;font-size:14px">${helpers.esc(it.title)}</div>
          <div class="approval-meta">${helpers.esc(it.sub)} · ${helpers.fmtFull(it.at)}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:420px">
          <input type="text" placeholder="Reason (required to return/escalate)" id="hod-reason-${it.type}-${it.id}" style="flex:1;min-width:140px;font-size:12px;padding:6px 8px" />
          <button class="btn-sm" onclick="CvxHod.decideReview('${it.type}','${it.id}','returned')">Return</button>
          <button class="btn-sm" onclick="CvxHod.decideReview('${it.type}','${it.id}','escalated')">Escalate to Principal</button>
          <button class="btn-primary btn-sm" onclick="CvxHod.decideReview('${it.type}','${it.id}','approved')">Approve</button>
        </div>
      </div>`
      )
      .join('');
  }

  async function decideReview(type, id, decision) {
    const wrap = document.getElementById('hod-reviews-wrap');
    const ctx = wrap?._hodCtx;
    if (!ctx) return;
    const reasonEl = document.getElementById(`hod-reason-${type}-${id}`);
    const comment = reasonEl?.value?.trim() || '';
    if ((decision === 'returned' || decision === 'escalated') && !comment) {
      ctx.helpers.toast('Add a reason when returning or escalating', 'error');
      return;
    }
    if (decision === 'escalated') {
      await recordDecision(ctx.db, ctx.collegeId, ctx.cu, type, id, decision, comment);
      ctx.helpers.toast('Escalated to Principal — logged in audit');
      loadReviewQueue(ctx.db, ctx.collegeId, ctx.cu, ctx.helpers);
      loadDeptKpis(ctx.db, ctx.collegeId, ctx.cu);
      return;
    }
    if (type === 'resource') {
      const status = decision === 'approved' ? 'approved' : 'pending';
      const patch =
        decision === 'approved'
          ? { status, approved_by: ctx.cu.phone_number, approved_at: new Date().toISOString() }
          : { status: 'rejected' };
      const { error } = await ctx.db.from('resources').update(patch).eq('id', id).eq('college_id', ctx.collegeId);
      if (error) {
        ctx.helpers.toast('Update failed: ' + error.message, 'error');
        return;
      }
    }
    await recordDecision(ctx.db, ctx.collegeId, ctx.cu, type, id, decision, comment);
    ctx.helpers.toast(decision === 'approved' ? 'Approved' : 'Returned to faculty');
    loadReviewQueue(ctx.db, ctx.collegeId, ctx.cu, ctx.helpers);
    loadDeptKpis(ctx.db, ctx.collegeId, ctx.cu);
  }

  function meetingsKey(deptId) {
    return MEETINGS_LS_PREFIX + (deptId || 'none');
  }

  async function loadDeptMeetings(db, collegeId, cu, helpers) {
    const wrap = document.getElementById('hod-meetings-wrap');
    if (!wrap) return;
    const dept = await getDept(db, collegeId, cu.department_id);
    if (!dept) {
      wrap.innerHTML = helpers.empty('', 'No department assigned');
      return;
    }
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(meetingsKey(dept.id)) || '[]');
    } catch {
      list = [];
    }
    wrap._hodMeetCtx = { db, collegeId, dept, helpers, cu };
    const listHtml = !list.length
      ? helpers.empty('◷', 'No department meetings', 'Schedule faculty meetings and track action items.')
      : list
          .map(
            (m) => `<div class="meeting-card">
          <div style="font-weight:500">${helpers.esc(m.title)}</div>
          <div class="approval-meta">${m.when ? helpers.fmtFull(m.when) : '—'} · ${helpers.esc(m.status || 'scheduled')}</div>
          ${m.agenda ? `<div style="font-size:12px;margin-top:6px;color:var(--mid)">${helpers.esc(m.agenda)}</div>` : ''}
        </div>`
          )
          .join('');
    wrap.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-hd"><h3>Schedule department meeting</h3></div>
        <div style="padding:16px;display:grid;gap:10px;max-width:520px">
          <div class="field"><label>Title</label><input id="hm-title" placeholder="Faculty meeting / syllabus review" /></div>
          <div class="field"><label>Date & time</label><input type="datetime-local" id="hm-when" /></div>
          <div class="field"><label>Agenda</label><textarea id="hm-agenda" rows="2"></textarea></div>
          <button class="btn-primary" style="width:fit-content" onclick="CvxHod.createDeptMeeting()">Add meeting</button>
        </div>
      </div>
      <div class="card"><div class="card-hd"><h3>${helpers.esc(dept.name)} meetings</h3></div>${listHtml}</div>`;
  }

  function createDeptMeeting() {
    const wrap = document.getElementById('hod-meetings-wrap');
    const ctx = wrap?._hodMeetCtx;
    if (!ctx) return;
    const title = document.getElementById('hm-title')?.value?.trim();
    if (!title) {
      ctx.helpers.toast('Title required', 'error');
      return;
    }
    const when = document.getElementById('hm-when')?.value;
    const agenda = document.getElementById('hm-agenda')?.value?.trim();
    const list = JSON.parse(localStorage.getItem(meetingsKey(ctx.dept.id)) || '[]');
    list.unshift({ title, when: when ? new Date(when).toISOString() : null, agenda, status: 'scheduled' });
    localStorage.setItem(meetingsKey(ctx.dept.id), JSON.stringify(list.slice(0, 30)));
    ctx.helpers.toast('Meeting saved');
    loadDeptMeetings(ctx.db, ctx.collegeId, ctx.cu, ctx.helpers);
  }

  global.CvxHod = {
    applyTheme,
    clearTheme,
    ensureDepartmentContext,
    loadDeptKpis,
    loadReviewQueue,
    decideReview,
    loadDeptMeetings,
    createDeptMeeting,
  };
})(typeof window !== 'undefined' ? window : globalThis);
