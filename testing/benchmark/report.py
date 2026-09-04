"""Merge stress_full.json + throughput.json into endpoint_benchmark.csv and report.html.
argv: [cores] (label for the throughput column; default 4)."""
import json, os, sys, csv, html

HERE = os.path.dirname(os.path.abspath(__file__))
CORES = int(sys.argv[1]) if len(sys.argv) > 1 else 4
EXCLUDE = set(os.environ.get("BENCH_EXCLUDE", "").split(",")) - {""}

full = {m["name"]: m for m in json.load(open(os.path.join(HERE, "stress_full.json")))}
thru_path = os.path.join(HERE, "throughput.json")
thru = {t["name"]: t for t in json.load(open(thru_path))} if os.path.exists(thru_path) else {}

rows = []
for name, m in full.items():
    if m["ok"] != m["reps"] or name in EXCLUDE:
        continue
    t = thru.get(name, {})
    rows.append({
        "tool": name, "group": m["group"], "endpoint": m["endpoint"], "fixture": m["fixture"],
        "p50_s": m["p50_s"], "cpu_core_s": m["cpu_core_s"], "peak_mb": m["peak_mb"],
        "max_rps": t.get("rps_at_%dc" % CORES),
    })

cols = ["tool", "group", "endpoint", "fixture", "p50_s", "cpu_core_s", "peak_mb", "max_rps"]
with open(os.path.join(HERE, "endpoint_benchmark.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in sorted(rows, key=lambda x: -x["cpu_core_s"]):
        w.writerow({k: r[k] for k in cols})

GROUP_LABEL = {"convert": "Convert &amp; Export", "general": "Page Operations", "misc": "Utilities",
               "security": "Security", "form": "Forms", "filter": "Filters"}
GROUP_ORDER = ["convert", "general", "misc", "security", "form", "filter"]


def disp(tool):
    return (tool.split("_", 1)[1] if "_" in tool else tool).replace("-", " ").replace("_", " ")


def band(cs):
    return ("crit" if cs > 10 else ("warn" if cs >= 2 else "ok"))


for r in rows:
    r["_disp"] = disp(r["tool"])
    r["_chip"] = band(r["cpu_core_s"])
n_heavy = sum(1 for r in rows if r["cpu_core_s"] > 10)
n_mod = sum(1 for r in rows if 2 <= r["cpu_core_s"] <= 10)
n_light = sum(1 for r in rows if r["cpu_core_s"] < 2)


def rps_str(v):
    return ("%.0f" % v) if v and v >= 10 else (("%.2f" % v) if v else "-")


def group_html(g):
    items = sorted([r for r in rows if r["group"] == g], key=lambda x: -x["cpu_core_s"])
    if not items:
        return ""
    body = "\n".join(
        '<tr><td class="tool">%s</td><td class="dim mono">%s</td>'
        '<td class="n"><span class="chip %s">%.1f</span></td><td class="n">%s</td>'
        '<td class="n">%s</td><td class="n">%s</td></tr>' % (
            html.escape(r["_disp"]), html.escape(r["endpoint"].replace("/api/v1", "")),
            r["_chip"], r["cpu_core_s"], (str(r["p50_s"]) + "s") if r["p50_s"] else "-",
            rps_str(r["max_rps"]), r["peak_mb"]) for r in items)
    return ('<h3 class="grouphead">%s <span class="gcount">%d tools</span></h3>'
            '<div class="tablewrap"><table><thead><tr><th>Tool</th><th>Endpoint</th>'
            '<th>CPU / req</th><th>Latency</th><th>Max req/s</th><th>Peak MB</th></tr></thead>'
            '<tbody>%s</tbody></table></div>' % (GROUP_LABEL[g], len(items), body))


heavy = sorted(rows, key=lambda x: -x["cpu_core_s"])[:8]
heavy_html = "\n".join(
    '<tr><td class="tool">%s</td><td class="n hi2">%.0f cs</td><td class="n">%ss</td>'
    '<td class="n">%s</td><td class="dim">%s</td></tr>' % (
        html.escape(r["_disp"]), r["cpu_core_s"], r["p50_s"], rps_str(r["max_rps"]),
        html.escape(r["fixture"])) for r in heavy)
groups_html = "".join(group_html(g) for g in GROUP_ORDER)

TMPL = open(os.path.join(HERE, "report_template.html"), encoding="utf-8").read()
out = (TMPL.replace("__GROUPS__", groups_html).replace("__HEAVYROWS__", heavy_html)
       .replace("__NHEAVY__", str(n_heavy)).replace("__NMOD__", str(n_mod))
       .replace("__NLIGHT__", str(n_light)).replace("__NTOTAL__", str(len(rows)))
       .replace("__CORES__", str(CORES)))
open(os.path.join(HERE, "report.html"), "w", encoding="utf-8").write(out)
print("report.html + endpoint_benchmark.csv written (%d endpoints, heavy=%d)" % (len(rows), n_heavy))
