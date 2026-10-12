BLOCKED_MODULES = {
    "os", "sys", "subprocess", "socket", "requests",
    "shutil", "pathlib", "ctypes", "pickle",
    "sqlite3", "pymongo", "threading", "multiprocessing",
}

BLOCKED_BUILTINS = {
    "open", "eval", "exec", "compile", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "breakpoint", "__import__",
    "memoryview", "exit", "quit", "help",
}

ALLOWED_MODULES = {
    "pandas", "numpy", "sklearn", "scipy", "math", "statistics",
    "pd", "np", "itertools", "functools", "collections",
}

MAX_TIMEOUT_SECONDS = 30
MAX_MEMORY_MB = 256
MAX_OUTPUT_CHARS = 20000
