#!/usr/bin/env python3
"""Static checks for the Cravex connected Netlify handoff package."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
checks = []
def check(name, ok):
    checks.append((name, bool(ok)))

netlify = (ROOT / "netlify.toml").read_text()
site = ROOT / "website"
index = (site / "index.html").read_text()
dashboard = (site / "pages/dashboard.html").read_text()
redirects = (site / "_redirects").read_text()
headers = (site / "_headers").read_text()
warning = (ROOT / "TEMPORARY_SECURITY_STATUS.md").read_text()

check("Netlify publishes only website/", bool(re.search(r'publish\s*=\s*["\']website["\']', netlify)))
check("Dashboard CTA is beside pilot CTA", 'class="navdash" href="/dashboard"' in index and 'class="navcta"' in index and 'class="navactions"' in index)
check("Dashboard route rewrite exists", bool(re.search(r"^/dashboard\s+/pages/dashboard\.html\s+200", redirects, re.M)))
check("Direct dashboard file exists", (site / "pages/dashboard.html").is_file())
check("Connected Supabase URL is present", bool(re.search(r"SUPABASE_URL\s*=\s*[\"']https://[a-z0-9-]+\.supabase\.co", dashboard)))
check("Public anon key is present", bool(re.search(r"SUPABASE_ANON_KEY\s*=\s*[\"']eyJ", dashboard)))
check("Dashboard targets send-otp", "/functions/v1/send-otp" in dashboard)
check("No service-role/provider secret in public dashboard", not any(x in dashboard for x in ["SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_ACCESS_TOKEN", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"]))
check("No old DevTools telemetry block", "cravex-telemetry.supabase.co" not in dashboard and "devtools_open" not in dashboard)
check("No client-side right-click/selection blockers", "addEventListener('contextmenu'" not in dashboard and "addEventListener('selectstart'" not in dashboard)
check("No auth restoration in localStorage", "localStorage.getItem('cravex_cu')" not in dashboard and "localStorage.setItem('cravex_cu'" not in dashboard)
check("Dashboard response is no-store", "/dashboard" in headers and "Cache-Control: no-store" in headers)
check("Temporary security warning is included", "test/demo use" in warning and "anon" in warning.lower())
check("Supabase source remains outside public publish folder", (ROOT / "supabase/schema.sql").is_file() and not (site / "supabase").exists())
check("Required templates are present", all((site / n).is_file() for n in ["cravex_student_template.xlsx", "cravex_attendance_template.xlsx", "cravex_lesson_plan_template.xlsx"]))

for name, ok in checks:
    print(("PASS" if ok else "FAIL") + "  " + name)
print(f"{sum(ok for _, ok in checks)}/{len(checks)} checks passed")
raise SystemExit(0 if all(ok for _, ok in checks) else 1)
