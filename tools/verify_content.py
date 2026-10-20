"""Verify every code example and every answer in content/course.json with real python3.

Checks:
  card     code runs; stdout (with typed input echoed, like a terminal) == "out"; error matches if given
  output   the option marked correct == real output; no other option also equals it
  mcq      if it has code + error, running the code raises that error
  fill     answers substituted into the blanks give "expect"; no other chip combination does
  order    the correct order gives "expect"; no other order of the lines does
  code     the model solution passes every test; the starter code does not
  text     no emojis, options unique, a few US spellings flagged
"""
import json, os, sys, re, tempfile, itertools
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "py"))
import harness

course = json.load(open(os.path.join(HERE, "..", "content", "course.json"), encoding="utf-8"))
fails, n_checks, n_runs = [], 0, 0

def run(code, stdin=None, echo=False, after=None):
    global n_runs
    n_runs += 1
    cwd = os.getcwd()
    with tempfile.TemporaryDirectory() as d:
        os.chdir(d)
        try:
            return harness.run(code, stdin, echo=echo, after=after, limit=200000)
        finally:
            os.chdir(cwd)

def ok_out(r, expect):
    return r["error"] is None and not r["need_input"] and harness.norm(r["out"]) == harness.norm(expect)

def fail(where, msg):
    fails.append(f"{where}: {msg}")

EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F]")
US = re.compile(r"\b(color|colors|favorite|center|behavior|organize|realize|analyze|program me)\b", re.I)

def text_fields(step):
    for k in ("title", "text", "q", "explain", "hint", "note"):
        if k in step: yield step[k]
    for o in step.get("options", []): yield o

for unit in course["units"]:
    for lesson in unit["lessons"]:
        for i, s in enumerate(lesson["steps"], 1):
            where = f"{lesson['id']} step {i} ({s['type']})"
            n_checks += 1
            for t in text_fields(s):
                if EMOJI.search(t): fail(where, f"emoji in text: {t!r}")
                m = US.search(t)
                if m and "code" not in s: fail(where, f"US spelling? {m.group(0)}")
            t = s["type"]
            if t == "card":
                if "code" in s:
                    r = run(s["code"], s.get("stdin"), echo=True)
                    if s.get("error"):
                        if r["error"] != s["error"]: fail(where, f"expected error {s['error']!r}, got {r['error']!r}")
                        if harness.norm(r["out"]) != harness.norm(s.get("out", "")): fail(where, f"out {r['out']!r} != {s.get('out')!r}")
                    elif not ok_out(r, s.get("out", "\u0000")):
                        fail(where, f"card output mismatch. got {r['out']!r} err={r['error']} expected {s.get('out')!r}")
            elif t in ("mcq", "output"):
                opts = s["options"]
                if len(set(opts)) != len(opts): fail(where, "duplicate options")
                if not 0 <= s["answer"] < len(opts): fail(where, "answer index out of range")
                if t == "output":
                    r = run(s["code"], s.get("stdin"), echo=False)
                    real = harness.norm(r["out"]) if r["error"] is None else "Error"
                    if harness.norm(opts[s["answer"]]) != real:
                        fail(where, f"correct option {opts[s['answer']]!r} != real output {real!r} ({r['error']})")
                    others = [o for j, o in enumerate(opts) if j != s["answer"] and harness.norm(o) == real]
                    if others: fail(where, f"another option also matches: {others}")
                elif s.get("error"):
                    r = run(s["code"], echo=False)
                    if r["error_type"] != s["error"]: fail(where, f"expected {s['error']}, got {r['error_type']}")
            elif t == "fill":
                code, ans = s["code"], s["answers"]
                nb = code.count("___")
                if nb != len(ans): fail(where, f"{nb} blanks but {len(ans)} answers"); continue
                def sub(vals):
                    c = code
                    for v in vals: c = c.replace("___", v, 1)
                    return c
                if not ok_out(run(sub(ans), s.get("stdin")), s["expect"]):
                    r = run(sub(ans), s.get("stdin")); fail(where, f"answer gives {r['out']!r} {r['error']}")
                bank = ans + s["distractors"]
                if len(set(bank)) != len(bank): fail(where, "duplicate chips")
                for combo in itertools.permutations(bank, nb):
                    if list(combo) == ans: continue
                    if ok_out(run(sub(combo), s.get("stdin")), s["expect"]):
                        fail(where, f"ambiguous: {combo} also gives the expected output")
            elif t == "order":
                lines = s["lines"]
                if not ok_out(run("\n".join(lines), s.get("stdin")), s["expect"]):
                    r = run("\n".join(lines), s.get("stdin")); fail(where, f"correct order gives {r['out']!r} {r['error']}")
                for perm in itertools.permutations(range(len(lines))):
                    if list(perm) == list(range(len(lines))): continue
                    if ok_out(run("\n".join(lines[p] for p in perm), s.get("stdin")), s["expect"]):
                        fail(where, f"ambiguous: order {perm} also works")
            elif t == "code":
                for k, test in enumerate(s["tests"], 1):
                    r = run(s["solution"], test.get("stdin"), echo=False, after=test.get("after"))
                    if not ok_out(r, test["expected"]):
                        fail(where, f"solution fails test {k}: got {r['out']!r} {r['error']}")
                for req in s.get("require", []):
                    if req["text"] not in s["solution"]: fail(where, f"solution lacks required {req['text']!r}")
                starter_pass = all(ok_out(run(s["starter"], t2.get("stdin"), echo=False, after=t2.get("after")), t2["expected"]) for t2 in s["tests"])
                if starter_pass and s["starter"].strip(): fail(where, "starter code already passes")
            else:
                fail(where, f"unknown type {t}")

types = {}
for u in course["units"]:
    for l in u["lessons"]:
        for s in l["steps"]:
            types[s["type"]] = types.get(s["type"], 0) + 1
print(f"steps checked: {n_checks}, python runs: {n_runs}, by type: {types}")
print(f"python: {sys.version.split()[0]}")
if fails:
    print(f"FAILED: {len(fails)}")
    for f in fails: print("  -", f)
    sys.exit(1)
print("ALL CONTENT CHECKS PASSED")
