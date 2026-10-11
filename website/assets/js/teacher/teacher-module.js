/**
 * F05 — Teacher dashboard & faculty workspace (assignment-scoped UI).
 */
(function (global) {
  const SUBMIT_LS = 'cvx_teacher_submissions_v1_';

  function submitKey(phone) {
    return SUBMIT_LS + (phone || 'anon');
  }

  function readSubmissions(phone) {
    try {
      return JSON.parse(localStorage.getItem(submitKey(phone)) || '{}');
    } catch {
      return {};
    }
  }

  function writeSubmissions(phone, data) {
    localStorage.setItem(submitKey(phone), JSON.stringify(data));
  }

  function applyTheme() {
    document.documentElement.classList.remove('principal-console-theme', 'hod-console-theme', 'college-admin-console-theme');
    document.documentElement.classList.add('teacher-console-theme');
    const app = document.getElementById('app');
    if (app) app.setAttribute('data-role', 'teacher');
    document.title = 'Cravex · Teaching Workspace';
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.content = '#080a10';
  }

  function clearTheme() {
    document.documentElement.classList.remove('teacher-console-theme');
  }

  async function fetchAssignments(db, collegeId, phone) {
    if (!phone || !collegeId) return [];
    const { data, error } = await db
      .from('subject_assignments')
      .select('id,branch,semester,division,component,batch,is_active,subjects(name,code)')
      .eq('college_id', collegeId)
      .eq('teacher_phone', phone)
      .eq('is_active', true);
    return error ? [] : data || [];
  }

  async function loadTeachingKpis(db, collegeId, cu) {
    const el = document.getElementById('teacher-teaching-kpis');
    if (!el || !collegeId || !cu?.phone_number) return;
    const assignments = await fetchAssignments(db, collegeId, cu.phone_number);
    let studentCount = 0;
    if (assignments.length) {
      const branches = [...new Set(assignments.map((a) => a.branch).filter(Boolean))];
      if (branches.length) {
        const { count } = await db
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('college_id', collegeId)
          .in('branch', branches)
          .is('deleted_at', null);
        studentCount = count ?? 0;
      }
    }
    const subs = readSubmissions(cu.phone_number);
    const pendingHod = Object.values(subs).filter((s) => s.status === 'submitted').length;
    el.innerHTML = `
      <div class="stat"><div class="stat-lbl">My classes</div><div class="stat-val">${assignments.length}</div><div class="stat-sub">Active assignments</div></div>
      <div class="stat"><div class="stat-lbl">Students</div><div class="stat-val">${studentCount}</div><div class="stat-sub">In your branches</div></div>
      <div class="stat"><div class="stat-lbl">With HOD</div><div class="stat-val">${pendingHod}</div><div class="stat-sub">Awaiting review</div></div>
      <div class="stat"><div class="stat-lbl">Module</div><div class="stat-val" style="font-size:18px">F05</div><div class="stat-sub">Teaching workspace</div></div>`;
  }

  async function loadMyClasses(db, collegeId, cu, helpers) {
    const wrap = document.getElementById('myclasses-wrap');
    if (!wrap) return;
    if (!cu?.phone_number) {
      wrap.innerHTML = helpers.empty('', 'Missing teacher phone on profile');
      return;
    }
    wrap.innerHTML = helpers.ld();
    const assignments = await fetchAssignments(db, collegeId, cu.phone_number);
    if (!assignments.length) {
      wrap.innerHTML = helpers.empty('▤', 'No classes assigned yet', 'Ask College Admin to assign subjects to your account.');
      return;
    }
    const timetableNote = `<div class="card" style="margin-bottom:12px"><div class="card-hd"><h3>Timetable</h3></div><div style="padding:14px;font-size:12px;color:var(--mid)">Published schedule and substitutions (F06) will appear here when the institution enables versioned timetables.</div></div>`;
    wrap.innerHTML = timetableNote + assignments
      .map((a) => {
        const sub = a.subjects?.name || 'Subject';
        const code = a.subjects?.code ? ` (${a.subjects.code})` : '';
        const sec = [a.branch, `Sem ${a.semester}`, a.division ? `Div ${a.division}` : '', a.component, a.batch].filter(Boolean).join(' · ');
        return `<div class="class-card">
          <div>
            <div style="font-weight:500">${helpers.esc(sub)}${helpers.esc(code)}</div>
            <div class="approval-meta">${helpers.esc(sec)}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-sm" onclick="nav('students')">Roster</button>
            <button class="btn-sm" onclick="nav('lessonplan')">Lesson plan</button>
            <button class="btn-sm" onclick="nav('marks')">Marks</button>
          </div>
        </div>`;
      })
      .join('');
  }

  async function loadSubmissions(db, collegeId, cu, helpers) {
    const wrap = document.getElementById('submissions-wrap');
    if (!wrap) return;
    wrap.innerHTML = helpers.ld();
    const phone = cu.phone_number;
    const local = readSubmissions(phone);
    const { data: resources } = await db
      .from('resources')
      .select('id,title,status,created_at,branch')
      .eq('college_id', collegeId)
      .eq('uploaded_by', phone)
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = [];
    (resources || []).forEach((r) => {
      rows.push({
        kind: 'Course file',
        title: r.title,
        status: r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Returned' : r.status === 'pending' ? 'With HOD' : r.status,
        at: r.created_at,
      });
    });
    Object.entries(local).forEach(([key, v]) => {
      rows.push({
        kind: v.kind || 'Submission',
        title: v.title || key,
        status: v.status || 'draft',
        at: v.at,
        localKey: key,
        comment: v.hodComment || '',
      });
    });
    wrap._teaCtx = { db, collegeId, cu, helpers };
    if (!rows.length) {
      wrap.innerHTML = `
        <div class="card"><div style="padding:16px">
          <p style="font-size:13px;color:var(--mid);margin-bottom:12px">Track marks and lesson deliveries submitted to your HOD.</p>
          <button class="btn-primary btn-sm" onclick="CvxTeacher.submitMarksDraft()">Submit marks (demo)</button>
          <button class="btn-sm" onclick="CvxTeacher.submitLessonPlanDraft()" style="margin-left:8px">Submit lesson plan (demo)</button>
        </div></div>`;
      return;
    }
    const statusLabel = (s) =>
      ({ draft: 'Draft', submitted: 'With HOD', returned: 'Returned', approved: 'Approved' }[s] || s);
    wrap.innerHTML = `<div class="card"><div class="card-hd"><h3>Submission status</h3><div style="display:flex;gap:8px"><button class="btn-sm" onclick="CvxTeacher.submitMarksDraft()">+ Marks</button><button class="btn-sm" onclick="CvxTeacher.submitLessonPlanDraft()">+ Lesson plan</button></div></div>
      ${rows
        .map((r) => {
          const st = r.status === 'Approved' || r.status === 'approved' ? 'Approved' : r.status === 'Returned' || r.status === 'returned' || r.status === 'rejected' ? 'Returned' : r.status === 'With HOD' || r.status === 'submitted' || r.status === 'pending' ? 'With HOD' : statusLabel(r.status);
          const resubmit =
            r.localKey && (r.status === 'returned' || st === 'Returned')
              ? `<button class="btn-sm" onclick="CvxTeacher.resubmitLocal('${r.localKey}')">Resubmit</button>`
              : '';
          return `<div class="class-card">
          <div><div style="font-weight:500">${helpers.esc(r.title)}</div><div class="approval-meta">${helpers.esc(r.kind)} · ${helpers.fmtFull(r.at)}${r.comment ? ' · ' + helpers.esc(r.comment) : ''}</div></div>
          <div style="display:flex;align-items:center;gap:8px">${resubmit}<span class="badge ${st === 'Approved' ? 'b-green' : st === 'Returned' ? 'b-red' : 'b-amber'}">${helpers.esc(st)}</span></div>
        </div>`;
        })
        .join('')}</div>`;
  }

  function submitMarksDraft() {
    const wrap = document.getElementById('submissions-wrap');
    const ctx = wrap?._teaCtx;
    if (!ctx?.cu?.phone_number) return;
    const subs = readSubmissions(ctx.cu.phone_number);
    const id = 'marks-' + Date.now();
    subs[id] = {
      kind: 'Internal marks',
      title: 'IA bundle · ' + new Date().toLocaleDateString('en-IN'),
      status: 'submitted',
      at: new Date().toISOString(),
    };
    writeSubmissions(ctx.cu.phone_number, subs);
    ctx.helpers.toast('Submitted to HOD for review');
    loadSubmissions(ctx.db, ctx.collegeId, ctx.cu, ctx.helpers);
    loadTeachingKpis(ctx.db, ctx.collegeId, ctx.cu);
  }

  function submitLessonPlanDraft() {
    const wrap = document.getElementById('submissions-wrap');
    const ctx = wrap?._teaCtx;
    if (!ctx?.cu?.phone_number) return;
    const subs = readSubmissions(ctx.cu.phone_number);
    const id = 'lp-' + Date.now();
    subs[id] = {
      kind: 'Lesson plan',
      title: 'Syllabus coverage · ' + new Date().toLocaleDateString('en-IN'),
      status: 'submitted',
      at: new Date().toISOString(),
    };
    writeSubmissions(ctx.cu.phone_number, subs);
    ctx.helpers.toast('Lesson plan submitted to HOD');
    loadSubmissions(ctx.db, ctx.collegeId, ctx.cu, ctx.helpers);
    loadTeachingKpis(ctx.db, ctx.collegeId, ctx.cu);
  }

  function resubmitLocal(key) {
    const wrap = document.getElementById('submissions-wrap');
    const ctx = wrap?._teaCtx;
    if (!ctx?.cu?.phone_number) return;
    const subs = readSubmissions(ctx.cu.phone_number);
    if (!subs[key]) return;
    subs[key].status = 'submitted';
    subs[key].at = new Date().toISOString();
    subs[key].hodComment = '';
    writeSubmissions(ctx.cu.phone_number, subs);
    ctx.helpers.toast('Resubmitted to HOD');
    loadSubmissions(ctx.db, ctx.collegeId, ctx.cu, ctx.helpers);
    loadTeachingKpis(ctx.db, ctx.collegeId, ctx.cu);
  }

  /** Demo helper: mark a local submission returned (simulates HOD return). */
  function simulateHodReturn(key, comment) {
    const phone = document.getElementById('submissions-wrap')?._teaCtx?.cu?.phone_number;
    if (!phone) return;
    const subs = readSubmissions(phone);
    if (!subs[key]) return;
    subs[key].status = 'returned';
    subs[key].hodComment = comment || 'Please revise and resubmit.';
    writeSubmissions(phone, subs);
  }

  global.CvxTeacher = {
    applyTheme,
    clearTheme,
    loadTeachingKpis,
    loadMyClasses,
    loadSubmissions,
    submitMarksDraft,
    submitLessonPlanDraft,
    resubmitLocal,
    simulateHodReturn,
  };
})(typeof window !== 'undefined' ? window : globalThis);
