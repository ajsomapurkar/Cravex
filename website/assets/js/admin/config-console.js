/**
 * Admin Console — institution configuration via admin-console Edge Function.
 */
(function (global) {
  const API_SUFFIX = "/functions/v1/admin-console";

  function apiUrl() {
    const base = global.SUPABASE_URL || "";
    return base.replace(/\/+$/, "") + API_SUFFIX;
  }

  async function call(action, payload) {
    const token = global.window?._cvxSession || global._cvxSession || "";
    if (!token) throw new Error("Not signed in");
    const res = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
    return data;
  }

  async function loadSettingsPage(collegeId) {
    const wrap = document.getElementById("settings-wrap");
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="loading"><div class="spin"></div> Loading configuration…</div>';
    try {
      const { entries } = await call("list_entries", { college_id: collegeId });
      const { audit } = await call("list_audit", { college_id: collegeId, limit: 30 });
      wrap.innerHTML = renderSettings(entries || [], audit || []);
      bindSettingsHandlers(collegeId, entries || []);
    } catch (e) {
      wrap.innerHTML =
        '<div class="empty"><div class="empty-icon">⚙</div><p>Could not load settings</p><small>' +
        (e.message || "Unknown error") +
        "</small></div>";
    }
  }

  function renderSettings(entries, audit) {
    const rows = entries
      .map((e) => {
        const pub = e.published;
        const preview = pub?.value ? esc(JSON.stringify(pub.value)) : "—";
        return `<tr>
          <td><span style="font-weight:500">${esc(e.namespace)}</span><div class="file-sub">${esc(e.config_key)}</div></td>
          <td style="color:var(--mid);font-size:12px;max-width:280px">${esc(e.description || "")}</td>
          <td><span class="badge ${pub ? "b-green" : "b-gray"}">${pub ? "v" + pub.version_number + " published" : "No publish"}</span></td>
          <td style="font-size:12px;color:var(--mid);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${preview}</td>
          <td><button class="btn-sm" data-edit="${esc(e.namespace)}::${esc(e.config_key)}">Edit draft</button></td>
        </tr>`;
      })
      .join("");

    const auditRows = audit
      .map(
        (a) =>
          `<tr><td style="font-size:12px;color:var(--muted)">${fmt(a.created_at)}</td><td><span class="badge b-blue">${esc(a.action)}</span></td><td style="font-size:12px">${esc(a.actor_role || "")}</td><td style="font-size:12px;color:var(--mid)">${esc(a.metadata?.config_key || a.metadata?.namespace || "")}</td></tr>`,
      )
      .join("");

    return `
      <div class="card"><div class="card-hd"><h3>Published configuration</h3><span class="pill-status"><i></i> Changes are versioned & audited</span></div>
        <table><thead><tr><th>Key</th><th>Description</th><th>Status</th><th>Value</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="color:var(--mid);padding:24px">No entries yet.</td></tr>'}</tbody></table>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-hd"><h3>Configuration audit trail</h3></div>
        <table><thead><tr><th>When</th><th>Action</th><th>Role</th><th>Context</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4" style="color:var(--mid);padding:24px">No audit events yet.</td></tr>'}</tbody></table>
      </div>
      <div class="modal-overlay" id="m-config-edit"><div class="modal" style="max-width:520px"><h3>Edit configuration draft</h3>
        <p id="cfg-edit-label" style="font-size:12px;color:var(--mid);margin:-8px 0 16px"></p>
        <div class="field"><label>JSON value</label><textarea id="cfg-edit-json" rows="8" placeholder='{"enabled":true}'></textarea></div>
        <div class="field"><label>Change summary</label><input type="text" id="cfg-edit-summary" placeholder="What changed and why" /></div>
        <div class="modal-actions"><button class="btn-cancel" onclick="closeM('m-config-edit')">Cancel</button><button class="btn-primary" id="cfg-save-btn">Save draft</button></div>
      </div></div>`;
  }

  let _editCtx = null;

  function bindSettingsHandlers(collegeId, entries) {
    document.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [namespace, config_key] = btn.getAttribute("data-edit").split("::");
        const entry = entries.find((e) => e.namespace === namespace && e.config_key === config_key);
        _editCtx = { collegeId, namespace, config_key, entry };
        document.getElementById("cfg-edit-label").textContent = namespace + " / " + config_key;
        document.getElementById("cfg-edit-json").value = entry?.published?.value
          ? JSON.stringify(entry.published.value, null, 2)
          : "{}";
        document.getElementById("cfg-edit-summary").value = "";
        openM("m-config-edit");
      });
    });

    const saveBtn = document.getElementById("cfg-save-btn");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!_editCtx) return;
        let value;
        try {
          value = JSON.parse(document.getElementById("cfg-edit-json").value || "{}");
        } catch {
          toast("Invalid JSON", "error");
          return;
        }
        saveBtn.disabled = true;
        try {
          const { draft } = await call("save_draft", {
            college_id: _editCtx.collegeId,
            namespace: _editCtx.namespace,
            config_key: _editCtx.config_key,
            value,
            change_summary: document.getElementById("cfg-edit-summary").value || "Dashboard edit",
          });
          await call("publish", {
            college_id: _editCtx.collegeId,
            version_id: draft.id,
          });
          closeM("m-config-edit");
          toast("Configuration published");
          loadSettingsPage(_editCtx.collegeId);
        } catch (e) {
          toast(e.message || "Save failed", "error");
        } finally {
          saveBtn.disabled = false;
        }
      };
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmt(d) {
    return d
      ? new Date(d).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  }

  global.CvxAdminConfig = { loadSettingsPage, call };
})(typeof window !== "undefined" ? window : globalThis);
