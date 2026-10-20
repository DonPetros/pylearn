# PyLearn run harness. Used in the browser (inside Pyodide, in a Web Worker)
# and by tools/verify_content.py on a normal python3, so both behave the same.
import sys, io, builtins, random

class _NeedInput(BaseException):
    pass

class _TooLong(BaseException):
    pass

MAX_OUT = 20000

def run(code, stdin=None, echo=True, after=None, interactive=False, seed=None, limit=None):
    """Run `code` as a fresh __main__ program.

    stdin       list of strings fed to input(), one per call
    echo        True: input() writes its prompt and the typed value (looks like a terminal)
                False: input() writes nothing (used when checking answers)
    after       extra code run in the same namespace; if given, only its output is returned
    interactive if input runs out, stop and report need_input instead of raising EOFError
    seed        seeds random so re-runs (interactive input) repeat the same results
    limit       max traced lines (verifier only; the browser uses a timeout instead)
    """
    lines = list(stdin or [])
    buf = io.StringIO()
    state = {"prompt": ""}

    def _input(prompt=""):
        p = str(prompt)
        if echo:
            buf.write(p)
        if not lines:
            if interactive:
                state["prompt"] = p
                raise _NeedInput()
            raise EOFError("the program asked for more input than was given")
        v = lines.pop(0)
        if echo:
            buf.write(v + "\n")
        return v

    res = {"out": "", "error": None, "error_type": None, "line": None, "need_input": False, "prompt": ""}
    old_out, old_err, old_in = sys.stdout, sys.stderr, builtins.input
    sys.stdout = buf
    sys.stderr = buf
    builtins.input = _input
    if seed is not None:
        random.seed(seed)
    tracer = None
    if limit:
        count = [0]
        def tracer(frame, event, arg):
            if event == "line":
                count[0] += 1
                if count[0] > limit:
                    raise _TooLong()
            return tracer
    g = {"__name__": "__main__", "__builtins__": builtins}
    try:
        if limit:
            sys.settrace(tracer)
        exec(compile(code, "<main.py>", "exec"), g)
        if after is not None:
            buf.seek(0); buf.truncate(0)
            exec(compile(after, "<test>", "exec"), g)
    except _NeedInput:
        res["need_input"] = True
        res["prompt"] = state["prompt"]
    except _TooLong:
        res["error_type"] = "Timeout"
        res["error"] = "Timeout: the code ran for too long"
    except SystemExit:
        pass
    except BaseException as e:
        res["error_type"] = type(e).__name__
        if isinstance(e, SyntaxError):
            res["error"] = f"{type(e).__name__}: {e.msg}"
            res["line"] = e.lineno
        else:
            res["error"] = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            tb = e.__traceback__
            while tb is not None:
                if tb.tb_frame.f_code.co_filename == "<main.py>":
                    res["line"] = tb.tb_lineno
                tb = tb.tb_next
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr, builtins.input = old_out, old_err, old_in
    out = buf.getvalue()
    if len(out) > MAX_OUT:
        out = out[:MAX_OUT] + "\n... output cut short ..."
    res["out"] = out
    return res

def norm(s):
    """Normalise output for comparison: ignore trailing spaces and trailing blank lines."""
    return "\n".join(l.rstrip() for l in s.replace("\r\n", "\n").split("\n")).rstrip("\n")
