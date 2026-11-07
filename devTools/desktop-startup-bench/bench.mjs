// Times desktop backend startup the way the Tauri app launches it (see src-tauri/src/commands/backend.rs).
// usage: node bench.mjs <label> <runs> <dataDir> --java <java> --jar <jar> [--fresh] [-- <extra jvm opts>]
// env: FIRSTOP=1 also times two merges after ready; AFFINITY=<hex mask> pins CPUs (Windows only).
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const dd = argv.indexOf("--");
const extra = dd >= 0 ? argv.slice(dd + 1) : [];
const main = dd >= 0 ? argv.slice(0, dd) : argv;
const [label, runsStr, dataDirArg] = main;
const flag = (n) => (main.includes(n) ? main[main.indexOf(n) + 1] : undefined);
const java = flag("--java");
const jar = flag("--jar");
if (!label || !java || !jar) throw new Error("usage: bench.mjs <label> <runs> <dataDir> --java <java> --jar <jar>");
const isWin = process.platform === "win32";
const samplePdf = fs.readFileSync(path.join(import.meta.dirname, "../../app/core/src/test/resources/pdftexteditor/mushroom-life.pdf"));

function kill(pid) {
  try { isWin ? execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" }) : process.kill(pid, "SIGKILL"); } catch {}
}

function once(i) {
  return new Promise((resolve) => {
    const dataDir = path.resolve(dataDirArg);
    if (main.includes("--fresh")) fs.rmSync(dataDir, { recursive: true, force: true });
    const logDir = path.join(dataDir, "logs");
    const cfgDir = path.join(dataDir, "configs");
    for (const d of [dataDir, logDir, cfgDir]) fs.mkdirSync(d, { recursive: true });
    const stop = path.join(dataDir, `.backend-stop-bench-${Date.now()}`);
    const opts = [
      "-Xmx2g", "-DBROWSER_OPEN=false", "-DSTIRLING_PDF_TAURI_MODE=true",
      `-Dlogging.file.path=${logDir}`, "-Dlogging.file.name=stirling-pdf.log",
      "-Dserver.port=0", "-Dserver.forward-headers-strategy=none",
      "-Dsecurity.enableLogin=false", "-Dsecurity.csrfDisabled=true",
      ...extra, "-jar", jar,
    ];
    const aff = isWin ? process.env.AFFINITY : undefined;
    const t0 = performance.now();
    const child = spawn(aff ? "cmd.exe" : java, aff ? ["/c", "start", '""', "/b", "/wait", "/affinity", aff, java, ...opts] : opts, {
      windowsVerbatimArguments: !!aff,
      cwd: dataDir,
      env: { ...process.env, TAURI_PARENT_PID: String(process.pid), STIRLING_PDF_CONFIG_DIR: cfgDir,
        STIRLING_PDF_LOG_DIR: logDir, STIRLING_PDF_WORK_DIR: dataDir, STIRLING_PDF_SHUTDOWN_FILE: stop },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const r = { run: i };
    let buf = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      fs.writeFileSync(stop, "stop");
      const killer = setTimeout(() => kill(child.pid), Number(process.env.KILL_MS || 15000));
      child.on("exit", () => { clearTimeout(killer); fs.rmSync(stop, { force: true }); resolve(r); });
    };
    const onData = (d) => {
      buf += d.toString();
      if (process.env.BENCH_ECHO) process.stdout.write(d);
      const m = buf.match(/running on port: (\d+)/);
      if (m && !r.port) { r.port = Number(m[1]); r.portMs = Math.round(performance.now() - t0); poll(); }
      const st = buf.match(/Started \w+ in ([\d.]+) seconds/);
      if (st && !r.springS) r.springS = Number(st[1]);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (c) => { if (!done) { r.exit = c; r.tail = buf.slice(-1500); done = true; resolve(r); } });
    async function poll() {
      while (!done) {
        try {
          const res = await fetch(`http://127.0.0.1:${r.port}/api/v1/config/app-config`);
          if (res.ok && (await res.json()).dependenciesReady === true) {
            r.readyMs = Math.round(performance.now() - t0);
            if (process.env.FIRSTOP) {
              for (const k of ["firstOpMs", "secondOpMs"]) {
                const fd = new FormData();
                for (const n of ["a.pdf", "b.pdf"]) fd.append("fileInput", new Blob([samplePdf], { type: "application/pdf" }), n);
                const t = performance.now();
                const op = await fetch(`http://127.0.0.1:${r.port}/api/v1/general/merge-pdfs`, { method: "POST", body: fd });
                await op.arrayBuffer();
                r[k] = op.ok ? Math.round(performance.now() - t) : -op.status;
              }
            }
            return finish();
          }
        } catch {}
        await new Promise((s) => setTimeout(s, 50));
      }
    }
    setTimeout(() => { if (!done) { r.timeout = true; finish(); } }, 300000).unref();
  });
}

const results = [];
for (let i = 0; i < Number(runsStr); i++) {
  const r = await once(i);
  console.log(JSON.stringify({ label, ...r }));
  results.push(r);
}
const med = (k) => { const v = results.map((x) => x[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log(`SUMMARY ${label}: median readyMs=${med("readyMs")} springS=${med("springS")} firstOpMs=${med("firstOpMs")} (n=${results.length})`);
