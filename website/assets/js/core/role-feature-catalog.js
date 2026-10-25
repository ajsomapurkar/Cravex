/**
 * Maps documentation/features/*.md to UI modules (live · partial · planned).
 * Spec: documentation/features/README.md
 */
(function (global) {
  const CATALOG = {
    college_admin: [
      {
        title: 'College profile & master data',
        items: [
          { label: 'College profile, academic years & semesters', nav: 'settings', status: 'partial' },
          { label: 'Departments, programmes, sections & subject catalogue', nav: 'departments', status: 'partial' },
          { label: 'Scheme / calendar references with review before apply', nav: 'settings', status: 'planned' },
        ],
      },
      {
        title: 'User & roster administration',
        items: [
          { label: 'Faculty accounts & department membership', nav: 'teachers', status: 'partial' },
          { label: 'Student roster & validated bulk import preview', nav: 'students', status: 'partial' },
          { label: 'Subject assignments (scoped provisioning)', nav: 'teachers', status: 'partial' },
          { label: 'Server-side role grant validation', nav: 'readiness', status: 'planned' },
        ],
      },
      {
        title: 'Operational support & readiness',
        items: [
          { label: 'Setup readiness checklist', nav: 'readiness', status: 'live' },
          { label: 'Announcements, notices & broadcast', nav: 'broadcast', status: 'partial' },
          { label: 'Integration health & import job monitoring', nav: 'imports', status: 'planned' },
          { label: 'Versioned config publish & audit', nav: 'settings', status: 'partial' },
        ],
      },
    ],
    principal: [
      {
        title: 'Institutional overview',
        items: [
          { label: 'College KPIs & academic risk summary', nav: 'overview', status: 'partial' },
          { label: 'Syllabus coverage & overdue lesson plans', nav: 'lessonplan', status: 'partial' },
          { label: 'Marks submissions awaiting review', nav: 'marks', status: 'partial' },
          { label: 'Timetable conflicts & escalations', nav: 'principaltimetable', status: 'planned' },
        ],
      },
      {
        title: 'HOD & department leadership',
        items: [
          { label: 'Assign / change HOD with effective dates', nav: 'departments', status: 'partial' },
          { label: 'Acting HOD delegation & expiry', nav: 'departments', status: 'planned' },
          { label: 'Department readiness & pending work', nav: 'departments', status: 'partial' },
        ],
      },
      {
        title: 'Approvals & governance',
        items: [
          { label: 'Approval queue (evidence & resources)', nav: 'approvals', status: 'live' },
          { label: 'Return / reject / escalate with audit', nav: 'approvals', status: 'live' },
          { label: 'Final marks freeze per institutional policy', nav: 'marks', status: 'planned' },
        ],
      },
      {
        title: 'Meetings, callouts & quality',
        items: [
          { label: 'Institution meetings & agenda', nav: 'meetings', status: 'partial' },
          { label: 'Targeted callouts & acknowledgements', nav: 'notices', status: 'partial' },
          { label: 'IQAC / CO-PO institutional reports', nav: 'knowledge', status: 'partial' },
        ],
      },
    ],
    hod: [
      {
        title: 'Department home',
        items: [
          { label: 'Faculty roster & subject allocation', nav: 'mydept', status: 'live' },
          { label: 'Pending review queue', nav: 'hodreviews', status: 'live' },
          { label: 'Readiness KPIs with drill-down', nav: 'overview', status: 'partial' },
        ],
      },
      {
        title: 'Faculty & timetable',
        items: [
          { label: 'Theory / lab / batch assignments', nav: 'mydept', status: 'partial' },
          { label: 'Department timetable draft & publish', nav: 'hoddttimetable', status: 'planned' },
          { label: 'Clash validation before publish', nav: 'hoddttimetable', status: 'planned' },
        ],
      },
      {
        title: 'Lesson plans & assessments',
        items: [
          { label: 'Lesson plan review & return with comments', nav: 'lessonplan', status: 'partial' },
          { label: 'IA marks verify, return & department freeze', nav: 'marks', status: 'partial' },
          { label: 'Escalate to Principal for final verification', nav: 'hodreviews', status: 'live' },
        ],
      },
      {
        title: 'Course files, meetings & QA',
        items: [
          { label: 'Course file & resource review', nav: 'hodreviews', status: 'live' },
          { label: 'Department meetings & action items', nav: 'hodmeetings', status: 'partial' },
          { label: 'CO/PO & audit evidence packs', nav: 'knowledge', status: 'partial' },
        ],
      },
    ],
    teacher: [
      {
        title: 'My classes & timetable',
        items: [
          { label: 'Assigned subjects, sections & lab batches', nav: 'myclasses', status: 'live' },
          { label: 'Published timetable & substitutions (F06)', nav: 'myclasses', status: 'planned' },
          { label: 'Class roster (assignment-scoped)', nav: 'students', status: 'partial' },
        ],
      },
      {
        title: 'Lesson delivery',
        items: [
          { label: 'Lesson plan, CO mapping & coverage', nav: 'lessonplan', status: 'partial' },
          { label: 'Submit plan/evidence to HOD', nav: 'submissions', status: 'partial' },
          { label: 'Planned vs actual syllabus tracking', nav: 'lessonplan', status: 'partial' },
        ],
      },
      {
        title: 'Attendance & marks',
        items: [
          { label: 'Session attendance for assigned classes', nav: 'sessions', status: 'partial' },
          { label: 'IA / lab marks entry & validation', nav: 'marks', status: 'partial' },
          { label: 'Submit, return, resubmit workflow', nav: 'submissions', status: 'partial' },
        ],
      },
      {
        title: 'Resources & communication',
        items: [
          { label: 'Course files & upload status', nav: 'knowledge', status: 'partial' },
          { label: 'Meetings & notices for your assignments', nav: 'notices', status: 'partial' },
          { label: 'Classroom link & chatbot (delegated)', nav: 'knowledge', status: 'planned' },
        ],
      },
    ],
  };

  function statusClass(s) {
    if (s === 'live') return 'spec-st-live';
    if (s === 'partial') return 'spec-st-partial';
    return 'spec-st-planned';
  }

  function render(role, helpers) {
    const sections = CATALOG[role];
    if (!sections?.length) return '';
    const esc = helpers?.esc || ((x) => String(x ?? ''));
    const body = sections
      .map(
        (sec) => `<div class="spec-section">
        <div class="spec-section-title">${esc(sec.title)}</div>
        ${sec.items
          .map(
            (it) => `<div class="spec-feature-row">
            <div class="spec-feature-label">${esc(it.label)}</div>
            <span class="spec-status ${statusClass(it.status)}">${esc(it.status)}</span>
            ${it.nav ? `<button type="button" class="btn-sm" onclick="nav('${it.nav}')">Open</button>` : ''}
          </div>`
          )
          .join('')}
      </div>`
      )
      .join('');
    return `<div class="card role-spec-card"><div class="card-hd"><h3>Role capabilities</h3><span style="font-size:11px;color:var(--mid)">From documentation/features · server enforcement (F01) still required</span></div><div class="spec-sections">${body}</div></div>`;
  }

  global.CvxRoleFeatures = { CATALOG, render };
})(typeof window !== 'undefined' ? window : globalThis);
