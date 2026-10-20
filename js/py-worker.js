/* Module Web Worker that runs Python with Pyodide. Created only when code needs to run. */
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";
const INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
let py = null;

async function boot() {
  py = await loadPyodide({ indexURL: INDEX_URL });
  const src = await (await fetch(new URL("../py/harness.py", import.meta.url))).text();
  py.FS.writeFile("/home/pyodide/harness.py", src);
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide'); import harness, json");
  py.runPython("import os; os.makedirs('/home/pyodide/work', exist_ok=True); os.chdir('/home/pyodide/work')");
}
const ready = boot().then(
  () => postMessage({ type: "ready", version: py.runPython("import sys; sys.version.split()[0]") }),
  e => postMessage({ type: "loaderror", error: String(e && e.message || e) })
);

onmessage = async ev => {
  const { id, code, stdin, echo, after, interactive, seed } = ev.data;
  try {
    await ready;
    if (!py) throw new Error("Python did not load");
    // Pass arguments as JSON so JS null becomes Python None (not jsnull).
    py.globals.set("_args_json", JSON.stringify({ code, stdin: stdin || [], echo: !!echo, after: after || null, interactive: !!interactive, seed: seed == null ? null : seed }));
    const json = py.runPython("_a = json.loads(_args_json)\njson.dumps(harness.run(_a['code'], _a['stdin'], echo=_a['echo'], after=_a['after'], interactive=_a['interactive'], seed=_a['seed']))");
    postMessage({ type: "result", id, result: JSON.parse(json) });
  } catch (e) {
    postMessage({ type: "result", id, result: { out: "", error: "InternalError: " + (e && e.message || e), error_type: "InternalError" } });
  }
};
