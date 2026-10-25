/**
 * F03 — Principal dashboard & institutional governance (UI layer).
 * Product spec: documentation/features/principal.md
 */
(function (global) {
  function loadSpecPanel(helpers) {
    const el = document.getElementById('role-spec-panel');
    if (!el || !global.CvxRoleFeatures) return;
    el.innerHTML = global.CvxRoleFeatures.render('principal', helpers);
  }
  const MEETINGS_LS_PREFIX = 'cvx_principal_meetings_v1_';

  function meetingsStorageKey(collegeId) {
    return MEETINGS_LS_PREFIX + (collegeId || 'none');
  }

  function readLocalMeetings(collegeId) {
    try {
      const raw = localStorage.getItem(meetingsStorageKey(collegeId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeLocalMeetings(collegeId, list) {
    localStorage.setItem(meetingsStorageKey(collegeId), JSON.stringify(list));
  }

  function applyTheme() {
    document.documentElement.classList.remove('hod-console-theme', 'teacher-console-theme', 'college-admin-console-theme');
    document.documentElement.classList.add('principal-console-theme');
    const app = document.getElementById('app');
    if (app) app.setAttribute('data-role', 'principal');
    document.title = 'Cravex · Principal Console';
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.content = '#080a10';
  }

  function clearTheme() {
    document.documentElement.classList.remove('principal-console-theme');
  }

  async function loadGovernanceKpis(db, collegeId) {
    const el = document.getElementById('principal-gov-kpis');
    if (!el || !collegeId) return;
    const pending = { evidence: 0, resources: 0, deptsNoHod: 0, openRisk: 0 };
    async function countTable(table, filters) {
      let q = db.from(table).select('id', { count: 'exact', head: true });
      filters.forEach(([col, val]) => { q = q.eq(col, val); });
      const { count, error } = await q;
      return error ? 0 : count ?? 0;
    }
    const [packCount, resCount, depts, riskCount] = await Promise.all([
      countTable('evidence_packs', [['college_id', collegeId], ['status', 'pending_approval']]),
      countTable('resources', [['college_id', collegeId], ['status', 'pending']]),
      db.from('departments').select('id,hod_user_id').eq('college_id', collegeId).eq('is_active', true).then((r) => (r.error ? [] : r.data || [])),
      countTable('risk_cases', [['college_id', collegeId], ['status', 'open']]),
    ]);
    pending.evidence = packCount;
    pending.resources = resCount;
    pending.deptsNoHod = depts.filter((d) => !d.hod_user_id).length;
    pending.openRisk = riskCount;
    const totalApprovals = pending.evidence + pending.resources;
    el.innerHTML = `
      <div class="stat"><div class="stat-lbl">Approval queue</div><div class="stat-val">${totalApprovals}</div><div class="stat-sub">Evidence & resources</div></div>
      <div class="stat"><div class="stat-lbl">Depts without HOD</div><div class="stat-val">${pending.deptsNoHod}</div><div class="stat-sub">Assign in HOD governance</div></div>
      <div class="stat"><div class="stat-lbl">Open risk cases</div><div class="stat-val">${pending.openRisk}</div><div class="stat-sub">Escalations</div></div>
      <div class="stat"><div class="stat-lbl">Module</div><div class="stat-val" style="font-size:18px">F03</div><div class="stat-sub">Principal console</div></div>`;
  }

  async function recordDecision(db, collegeId, cu, sourceType, sourceId, decision, comment) {
    const row = {
      college_id: collegeId,
      source_type: sourceType,
      source_id: sourceId,
      decision,
      comment: comment || null,
      actor_user_id: cu.id || null,
      actor_phone: cu.phone_number || null,
      actor_role: 'principal',
      metadata: {},
    };
    const { error } = await db.from('principal_decision_audit').insert(row);
    if (error) {
      console.warn('principal_decision_audit insert failed (migration may be pending)', error.message);
    }
  }

  async function loadApprovals(db, collegeId, cu, helpers) {
    const wrap = document.getElementById('approvals-wrap');
    if (!wrap) return;
    if (!collegeId) {
      wrap.innerHTML = helpers.empty('', 'No college scope');
      return;
    }
    wrap.innerHTML = helpers.ld();
    const items = [];
    const { data: packs, error: pe } = await db
      .from('evidence_packs')
      .select('id,title,academic_year,branch,status,generated_at')
      .eq('college_id', collegeId)
      .eq('status', 'pending_approval')
      .order('generated_at', { ascending: false })
      .limit(20);
    if (!pe && packs?.length) {
      packs.forEach((p) =>
        items.push({
          type: 'evidence_pack',
          id: p.id,
          title: p.title,
          sub: `${p.branch || 'All branches'} · ${p.academic_year || '—'}`,
          at: p.generated_at,
        })
      );
    }
    const { data: resources, error: re } = await db
      .from('resources')
      .select('id,title,branch,created_at')
      .eq('college_id', collegeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!re && resources?.length) {
      resources.forEach((r) =>
        items.push({
          type: 'resource',
          id: r.id,
          title: r.title,
          sub: `Resource · ${r.branch || 'All'}`,
          at: r.created_at,
        })
      );
    }
    if (!items.length) {
      wrap.innerHTML = helpers.empty('◇', 'No pending approvals', 'Evidence packs and course resources awaiting principal review will appear here.');
      return;
    }
    wrap.innerHTML = items
      .map(
        (it) => `
      <div class="approval-row" id="approval-${it.type}-${it.id}">
        <div>
          <div style="font-weight:500;font-size:14px">${helpers.esc(it.title)}</div>
          <div class="approval-meta">${helpers.esc(it.sub)} · ${helpers.fmtFull(it.at)}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <input type="text" placeholder="Comment (required to return/escalate)" id="ap-comment-${it.type}-${it.id}" style="max-width:180px;font-size:12px;padding:6px 8px" />
          <button class="btn-sm" onclick="CvxPrincipal.decideApproval('${it.type}','${it.id}','returned')">Return</button>
          <button class="btn-sm" onclick="CvxPrincipal.decideApproval('${it.type}','${it.id}','escalated')">Escalate</button>
          <button class="btn-sm danger" onclick="CvxPrincipal.decideApproval('${it.type}','${it.id}','rejected')">Reject</button>
          <button class="btn-primary btn-sm" onclick="CvxPrincipal.decideApproval('${it.type}','${it.id}','approved')">Approve</button>
        </div>
      </div>`
      )
      .join('');
    wrap._principalCtx = { db, collegeId, cu, helpers };
  }

  async function decideApproval(type, id, decision) {
    const wrap = document.getElementById('approvals-wrap');
    const ctx = wrap?._principalCtx;
    if (!ctx) return;
    const { db, collegeId, cu, helpers } = ctx;
    const commentEl = document.getElementById(`ap-comment-${type}-${id}`);
    const comment = commentEl?.value?.trim() || '';
    if ((decision === 'returned' || decision === 'escalated') && !comment) {
      helpers.toast('Add a comment when returning or escalating', 'error');
      return;
    }
    if (decision === 'escalated') {
      await recordDecision(db, collegeId, cu, type, id, decision, comment);
      helpers.toast('Escalated — recorded in audit; item stays in queue');
      loadApprovals(db, collegeId, cu, helpers);
      return;
    }
    if (type === 'evidence_pack') {
      const status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'draft';
      const { error } = await db
        .from('evidence_packs')
        .update({
          status,
          approved_by: decision === 'approved' ? cu.phone_number : null,
          approved_at: decision === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .eq('college_id', collegeId);
      if (error) {
        helpers.toast('Could not update evidence pack: ' + error.message, 'error');
        return;
      }
    } else if (type === 'resource') {
      const status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'pending';
      const { error } = await db
        .from('resources')
        .update({
          status,
          approved_by: decision === 'approved' ? cu.phone_number : null,
          approved_at: decision === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .eq('college_id', collegeId);
      if (error) {
        helpers.toast('Could not update resource: ' + error.message, 'error');
        return;
      }
    }
    await recordDecision(db, collegeId, cu, type, id, decision, comment);
    helpers.toast(decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'Returned for changes');
    loadApprovals(db, collegeId, cu, helpers);
    loadGovernanceKpis(db, collegeId);
  }

  async function loadMeetings(db, collegeId, cu, helpers) {
    const wrap = document.getElementById('meetings-wrap');
    if (!wrap) return;
    if (!collegeId) {
      wrap.innerHTML = helpers.empty('', 'No college scope');
      return;
    }
    wrap.innerHTML = helpers.ld();
    let meetings = [];
    let useDb = true;
    const { data, error } = await db
      .from('institution_meetings')
      .select('*')
      .eq('college_id', collegeId)
      .order('scheduled_at', { ascending: false })
      .limit(30);
    if (error) {
      useDb = false;
      meetings = readLocalMeetings(collegeId);
    } else {
      meetings = data || [];
    }
    wrap._meetingsCtx = { db, collegeId, cu, helpers, useDb };
    const listHtml = !meetings.length
      ? helpers.empty('◷', 'No meetings scheduled', 'Create a faculty senate, IQAC, or department review meeting.')
      : meetings
          .map((m) => {
            const when = m.scheduled_at ? helpers.fmtFull(m.scheduled_at) : '—';
            return `<div class="meeting-card">
            <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <div style="font-weight:500">${helpers.esc(m.title)}</div>
                <div class="approval-meta">${when} · ${helpers.esc(m.status || 'scheduled')}${m.location_or_link ? ' · ' + helpers.esc(m.location_or_link) : ''}</div>
                ${m.agenda ? `<div style="font-size:12px;margin-top:8px;color:var(--mid)">${helpers.esc(m.agenda)}</div>` : ''}
              </div>
            </div>
          </div>`;
          })
          .join('');
    wrap.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-hd"><h3>Schedule meeting</h3></div>
        <div style="padding:16px;display:grid;gap:10px;max-width:520px">
          <div class="field"><label>Title</label><input id="mt-title" placeholder="Academic council / IQAC review" /></div>
          <div class="field"><label>Date & time</label><input type="datetime-local" id="mt-when" /></div>
          <div class="field"><label>Location or link</label><input id="mt-loc" placeholder="Room 301 or Google Meet URL" /></div>
          <div class="field"><label>Agenda</label><textarea id="mt-agenda" rows="3" placeholder="Topics to cover…"></textarea></div>
          <button class="btn-primary" style="width:fit-content" onclick="CvxPrincipal.createMeeting()">Create meeting</button>
        </div>
      </div>
      <div class="card"><div class="card-hd"><h3>Upcoming & recent</h3><span style="font-size:11px;color:var(--mid)">${useDb ? 'Synced to database' : 'Local demo (apply F03 migration for persistence)'}</span></div>${listHtml}</div>`;
  }

  async function createMeeting() {
    const wrap = document.getElementById('meetings-wrap');
    const ctx = wrap?._meetingsCtx;
    if (!ctx) return;
    const title = document.getElementById('mt-title')?.value?.trim();
    if (!title) {
      ctx.helpers.toast('Title is required', 'error');
      return;
    }
    const when = document.getElementById('mt-when')?.value;
    const loc = document.getElementById('mt-loc')?.value?.trim();
    const agenda = document.getElementById('mt-agenda')?.value?.trim();
    const payload = {
      college_id: ctx.collegeId,
      title,
      scheduled_at: when ? new Date(when).toISOString() : null,
      location_or_link: loc || null,
      agenda: agenda || null,
      status: 'scheduled',
      created_by_phone: ctx.cu.phone_number,
    };
    if (ctx.useDb) {
      const { error } = await ctx.db.from('institution_meetings').insert(payload);
      if (error) {
        ctx.helpers.toast('Save failed: ' + error.message, 'error');
        return;
      }
    } else {
      const list = readLocalMeetings(ctx.collegeId);
      list.unshift({
        id: 'local-' + Date.now(),
        ...payload,
        actions: [],
        status: 'scheduled',
      });
      writeLocalMeetings(ctx.collegeId, list);
    }
    ctx.helpers.toast('Meeting scheduled');
    loadMeetings(ctx.db, ctx.collegeId, ctx.cu, ctx.helpers);
  }

  async function loadTimetableOversight(db, collegeId, helpers) {
    const wrap = document.getElementById('principal-timetable-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="card"><div class="card-hd"><h3>Institution timetable (F06)</h3></div>
      <div style="padding:16px;font-size:13px;color:var(--mid);line-height:1.55">
        <p>Principal reviews published timetable revisions when institutional policy requires approval; otherwise maintains read-only oversight.</p>
        <ol style="margin:10px 0 0 18px;font-size:12px">
          <li>HOD drafts department schedule & clash validation</li>
          <li>Optional Principal approval step</li>
          <li>Publish version → notify affected faculty & sections</li>
        </ol>
        <p style="margin-top:12px;font-size:12px">Versioned timetable tables and Realtime propagation are not yet in the live schema.</p>
      </div></div>`;
  }

  global.CvxPrincipal = {
    applyTheme,
    clearTheme,
    loadGovernanceKpis,
    loadApprovals,
    decideApproval,
    loadMeetings,
    createMeeting,
    loadSpecPanel,
    loadTimetableOversight,
  };
})(typeof window !== 'undefined' ? window : globalThis);
