# Argus — An AI-Based Automated EDA Tool

Staring down a massive spreadsheet can be seriously intimidating. Usually you end up
wrestling with code just to get a basic graph to show up, rather than actually understanding
what the data is trying to say. **Argus** is a smart, automated study buddy for data analysis:
drop in a CSV or Excel file and it instantly produces an interactive dashboard, 10+ charts,
a dataset health score, anomaly flags, plain-English AI descriptions of every column, and a
chat interface to ask questions about your data.

The name comes from the all-seeing giant of Greek mythology — a watcher with a hundred eyes.
That's exactly what this tool does: it sees everything in your data that you might miss.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📊 Instant Overview | Health score (0–100), column breakdown, missing-value map, skewness and correlation summaries |
| 🧹 Smart Data Cleaning | Junk-value detection, type inference, imputation planning, non-destructive session copy |
| 📈 Univariate Analysis | Per-column statistics and chart data computed from the real dataframe |
| 🔗 Bivariate Analysis | Column-pair statistics: correlation, scatter and grouped-mean chart data |
| 🌐 Multivariate Analysis | Correlation grid, Random-Forest influencers, PCA + KMeans group profiles |
| 🌟 Feature Discovery | Auto-detects the likely target variable and ranks predictive features |
| 💬 AI Analyst | Ask in plain English; the planner picks a deterministic tool, runs it, then explains the numbers it got back |
| 📄 PDF Reports | Rolls the session's real computed results into a downloadable report |
| ⚡ Live Demo | One click loads the bundled sample dataset — no account, no file needed |

## 🧱 The stack

Argus is a FastAPI backend serving a React (Vite) single-page app. The original
Streamlit build supplied the design language, the copy, and the analysis logic;
the UI has since been rewritten in React and the analysis reimplemented behind a
tool registry. **Nothing under `backend/` imports Streamlit.**

```
backend/                     FastAPI service
├── main.py                  App factory, routers, SPA + static serving
├── api/                     HTTP layer: datasets, chat, analysis, cleaning,
│                            features, reports, sessions, auth
├── agents/
│   ├── planner.py           Column resolution + intent classification
│   ├── tool_router.py       Intent → deterministic tool
│   └── orchestrator.py      Plan → run tool → validate → explain
├── tools/registry.py        The deterministic tool surface the agent may call
├── analysis/                adapters.py (stats/charts), cleaning_adapter.py,
│                            schemas.py (result validation)
├── sandbox/runner.py        AST-gated, separate-process execution for generated code
├── services/                dataset / session / analysis / report services + LLM client
└── reports/                 PDF generation

frontend/                    Vite + React 18
├── index.html               Shell (fonts, favicon, theme colour)
└── src/
    ├── main.jsx             Entry; loads theme.css then styles.css
    ├── theme.css            Design tokens + landing-page styles (ported from the
    │                        Streamlit build so both halves share one identity)
    ├── styles.css           Workspace styles, built on the same tokens
    ├── Landing.jsx          Marketing page: hero, features, process, gallery, FAQ
    ├── App.jsx              Workspace: AI Analyst, Dataset, Explore, Cleaning,
    │                        Feature Discovery, Reports
    └── api.js               Typed fetch wrappers for every backend route
```

**Grounding.** Every statistic is computed locally by pandas / scikit-learn /
SciPy. The language model chooses which analysis fits your question and describes
what came back — it never generates a number. When no provider is reachable,
Argus says so instead of inventing an answer, and all deterministic analyses keep
working.

**Sandbox.** Questions no deterministic tool covers fall through to generated
code. That code is AST-validated (no imports outside an allowlist, no dunder
access, no filesystem or network), then executed in a separate spawned process
with restricted builtins and a wall-clock limit. Treat it as an application
sandbox — add a container boundary for production.

## 🚀 Quick Start

```bash
# 1. Install (Python 3.10+)
pip install -r requirements.txt

# 2. Backend, from the repository root
python -m uvicorn backend.main:app --reload --port 8000

# 3. Frontend, in a second terminal
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — the Vite dev server proxies `/api` and `/health`
to port 8000.

For a single-origin deployment, build the frontend and let the backend serve it:

```bash
cd frontend && npm run build
python -m uvicorn backend.main:app --port 8000   # then open http://localhost:8000
```

`backend/main.py` serves `frontend/dist/`. If the bundle is missing it returns a
`503` naming the build step rather than silently serving a different page — so
**re-run `npm run build` after changing anything under `frontend/src/`.**

### Configuration

| Variable | Purpose | Default |
|---|---|---|
| `NVIDIA_API_KEYS` / `api_keys.txt.txt` | NVIDIA NIM credentials (`nvapi-*`) — preferred provider | unset |
| `GROQ_API_KEY` / `GROQ_API_KEYS` | Groq credentials — failover provider | unset |
| `NVIDIA_MODEL` | NIM model id | `nvidia/nemotron-3-ultra-550b-a55b` |
| `GROQ_MODEL` | Groq model id | `llama-3.3-70b-versatile` |
| `ARGUS_LLM_TIMEOUT` | Per-attempt budget for short prompts | `20` (seconds) |
| `ARGUS_LLM_CODEGEN_TIMEOUT` | Per-attempt budget for code generation | `45` (seconds) |

Every call fails over down the candidate list, so a dead key or a wrong model id
moves to the next provider instead of failing the request. `GET /health` reports
which providers are configured. Credentials are gitignored.

Without any key, Argus runs fully: Explore, Data Cleaning, Feature Discovery and
Reports are all deterministic. Only free-form narration pauses.

## 🖥 CLI Usage

Run the cleaning + univariate pipeline from the terminal (no browser):

```bash
python main.py                      # analyses demo_data.csv
python main.py mydata.xlsx --target Survived
```

Writes `argus_univariate_<dataset>.pdf` next to the script.

## 🔒 Privacy

Uploaded datasets are parsed in the backend process and held in memory for the
session only. They are not written to a database or shared with third parties,
and they are dropped when the session ends.

## 📦 Legacy Streamlit build

The original app is kept as a reference for the design language and the analysis
logic. It is **not** part of the merged product and nothing in `backend/` imports
it:

- Root: `app.py`, `auth.py`, `home.py`, `utils.py`, `ratings.py`, `input_file.py`
- `existing_argus/`: the original analysis modules (`univariate.py`,
  `bivariate_analysis.py`, `multivariate_analysis.py`, `data_cleaning.py`,
  `ai_encoder.py`, `text_generation.py`, `feature_corr.py`)

Its extra dependencies (Streamlit, Groq SDK, Plotly, MongoDB, JWT, XGBoost,
LightGBM, ELI5, PyMuPDF) live in `requirements-legacy.txt`:

```bash
pip install -r requirements.txt -r requirements-legacy.txt
cp secrets.toml.example .streamlit/secrets.toml   # then add GROQ_API_KEY, MONGO_URI
streamlit run app.py
```

## 🛠 Troubleshooting

- **`503 Frontend bundle not found`** — run `npm run build` in `frontend/`.
- **Upload succeeds but the page looks unchanged** — you are on a stale bundle;
  rebuild.
- **AI narration says unavailable** — no reachable provider. Check `/health`;
  deterministic analyses still work.
- **Port already in use** — `python -m uvicorn backend.main:app --port 8001`, or
  `npm run dev -- --port 5174`.
