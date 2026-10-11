# F13 — Course Files, Resources, PPTs and Question Papers

**Priority:** P1  
**Current state:** Resource/document processing foundations exist; secure resource workflow is partial  
**Document type:** Feature specification and implementation contract

## 1. Objective

Define a safe, maintainable, role-aware production workflow for course files, resources, ppts and question papers, without breaking verified Cravex functionality.

## 2. Current implementation — confirmed versus unverified

Live `uploaded_files`, `documents`, `doc_chunks`, `manual_embeddings` tables and `process-pdf` function exist. Browser notes show Resources and Evidence Packs views. The source tree includes several deployed-function snapshots older than active live versions. Anonymous read policies exist on uploaded files and doc chunks.

## 3. Scope

- Course file structure per academic year, scheme, branch, semester, subject and faculty.
- Support PPT, PDF, DOC/DOCX, spreadsheets, lab manual, question paper, valuation scheme, notes, assignment and evidence links.
- Metadata: title, type, topic/unit, CO, version, uploader, upload date, approval/release state, source/storage key and checksum.
- Question-paper confidentiality, moderation/review, release window and versioning.
- Secure object storage; short-lived signed download links when required.
- Processing status (queued/extracting/indexed/failed/retry) with clear UI.
- Retention, replacement, archive and delete policy; preserve evidence references when files are superseded.

## 4. Required workflows

Upload → authorize class/subject → store file privately → create metadata → enqueue processing → extract/chunk/index if enabled → record status and provenance → teacher/HOD review → publish to permitted audience → download using access-checked path.

## 5. Data and API implications

Use `uploaded_files` as a starting point, but verify whether binaries currently live in Supabase Storage or another bucket. Use storage object keys, not public URLs by default. Connect file IDs to subject, assignment, timetable/lesson topic, assessment and evidence record with stable IDs. Use background jobs for large files.

## 6. Authorization and audit requirements

Students must never see unreleased question papers or valuation schemes. Teachers see assigned subjects; HOD sees department files; Principal sees approved institutional evidence as policy dictates. Validate file MIME/type/size, scan where available, normalize filenames and prevent direct access to private object keys.

## 7. Backward-compatibility and change-safety rules

Do not delete chunks or original files without checking references and legal/academic retention policy. Replacing a resource should create a new version. Run processing from active function only after reviewing deployed source and compatibility. Do not redeploy older repo function snapshots just to match source layout.

## 8. Tests required

- Upload permission and file-size/type tests.
- Private file URL expires and unauthorized access is rejected.
- Failed document processing can retry without duplicate chunks.
- Question paper access is blocked before release date.
- File replacement preserves previous version and evidence links.

## 9. Acceptance criteria

- [ ] Every file has scope, type, owner and lifecycle state.
- [ ] Private content isn't publicly readable via anon or bucket policy.
- [ ] Processing failures are visible/retryable and traceable to one source file.
- [ ] HOD review and question-paper confidentiality are enforced.

## 10. Dependencies

F01, F02, F05, F10, F11, F12, F15, F17.

## 11. Rollout plan

Audit current object storage and policies first. Add metadata/versioning without moving existing file binaries in bulk. Test one resource type at a time, then scale processing.

## 12. Definition of done

- [ ] UI, API/database, permissions, audit trail and automated tests are connected end-to-end.
- [ ] Loading, empty, validation, permission-denied, failure and retry states are handled.
- [ ] No secrets, privileged keys or server-only authorization logic are shipped to the browser.
- [ ] Tests pass in a non-production environment using synthetic data.
- [ ] Operations and rollback notes are updated before release.
