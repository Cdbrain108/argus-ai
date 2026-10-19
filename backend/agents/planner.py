from __future__ import annotations

import json
import re
from typing import List

INTENT_TO_TOOL = {
    "relationship_analysis": "run_bivariate_analysis",
    "distribution_analysis": "run_univariate_analysis",
    "feature_importance": "run_feature_importance",
    "outlier_detection": "analyze_dataset_health",
    "missing_value_analysis": "clean_dataset",
    "data_cleaning": "clean_dataset",
    "summary_overview": "generate_dataset_summary",
    "correlation_analysis": "run_correlation_analysis",
    "multivariate": "run_multivariate_analysis",
    "custom": "custom_sandbox",
    "meta_identity": "meta_conversational",
    "dataset_suggestions": "dataset_suggestions",
    "out_of_domain": "out_of_domain",
}

VALID_INTENTS = set(INTENT_TO_TOOL)

# Plain-language statistics questions. These used to fall through to the custom
# code path and cost an LLM round-trip (or a timeout) for numbers the
# deterministic univariate/summary tools already compute.
_AGGREGATE_WORDS = (
    "average", "mean", "median", "mode", "sum", "total", "count", "how many",
    "max", "maximum", "min", "minimum", "highest", "lowest", "largest", "smallest",
    "range", "std", "deviation", "variance", "percentile", "quartile",
    "unique", "frequency", "value counts", "most common", "top ",
)


class Planner:
    def __init__(self, dataset_profile: dict):
        self.profile = dataset_profile
        self.column_names: List[str] = [
            c.get("name", "") for c in dataset_profile.get("column_summary", []) if c.get("name")
        ]

    def classify_intent(self, question: str, history: list[dict] | None = None, columns: list[str] | None = None) -> dict:
        history = history or []
        heuristic = self._heuristic_intent(question, columns)
        if heuristic.get("confidence", 0) >= 0.8:
            return heuristic

        # Only spend a network round-trip when a provider is actually configured;
        # otherwise the deterministic guess is the best answer available.
        from backend.services.llm import is_configured

        if not is_configured():
            return heuristic

        try:
            from backend.services.llm import chat_completion

            compact = [
                {"role": item.get("role"), "content": str(item.get("content", ""))[:500]}
                for item in history[-4:]
            ]
            prompt = (
                "You are an intent classifier for ARGUS, an automated data analysis system.\n"
                "Available intents:\n"
                "- meta_identity: Greeting, identity ('who are you'), creator ('who made this'), or project purpose ('what is this for').\n"
                "- dataset_suggestions: Asking for analytical ideas, suggestions, or what to explore in this dataset.\n"
                "- out_of_domain: Completely off-topic inquiries unrelated to data science, statistics, or this dataset (e.g. poetry, recipes, trivia).\n"
                "- summary_overview: High-level dataset summary, rows/columns overview, or health.\n"
                "- distribution_analysis: Single-column distribution, spread, or histogram.\n"
                "- relationship_analysis: Simple two-column relationship or correlation between two specific columns.\n"
                "- correlation_analysis: Overall correlation matrix or searching for highest correlated features across the dataset.\n"
                "- feature_importance: Identifying key predictive drivers or target variable ranking.\n"
                "- outlier_detection: Detecting outliers or anomalies.\n"
                "- missing_value_analysis: Checking missing values or null percentages.\n"
                "- data_cleaning: Cleaning, imputing, or fixing dirty data.\n"
                "- multivariate: General unsupervised clustering (K-Means) or PCA dimensionality reduction across the dataset when no specific multi-feature plot is requested.\n"
                "- custom: Multi-feature relationships (3+ columns), cohort comparisons, custom plots between variables, formulas, aggregations across groups, filtering, or business inquiries.\n\n"
                f"Dataset columns: {self.column_names}\nHistory: {compact}\nQuestion: {question}\n\n"
                "Return JSON with keys 'intent' and 'confidence' only."
            )
            text = chat_completion(prompt, system_prompt="You are a strict JSON classifier.", max_tokens=120, temperature=0)
            match = re.search(r"\{.*?\}", text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                if parsed.get("intent") in VALID_INTENTS:
                    return {"intent": parsed["intent"], "confidence": float(parsed.get("confidence", 0.7))}
        except Exception:
            pass
        return heuristic

    def _heuristic_intent(self, question: str, columns: list[str] | None = None) -> dict:
        q = question.lower().strip()
        matched = columns or []

        # 1. Meta / Identity / Creator / Project Purpose / Greeting
        if any(w in q for w in (
            "who made", "who created", "who built", "who designed", "who developed",
            "creator of", "author of", "maker of", "who wrote",
            "who are you", "what are you", "what is your name", "introduce yourself",
            "what is this project", "what is argus", "purpose of this project", "purpose of this tool",
            "what can you do", "what does this project do"
        )):
            return {"intent": "meta_identity", "confidence": 1.0}
        if q in ("hi", "hello", "hey", "hola", "good morning", "good evening", "good afternoon"):
            return {"intent": "meta_identity", "confidence": 1.0}
        if any(w in q for w in ("how are you", "how're you", "how are you doing")):
            return {"intent": "meta_identity", "confidence": 1.0}

        # 2. Suggestions / Recommendations for the Dataset
        if any(w in q for w in (
            "what can i ask", "what should i analyze", "give me suggestions", "give suggestions",
            "recommend an analysis", "recommend analyses", "suggest something", "what to explore",
            "suggest next steps", "give me ideas", "what questions can i ask"
        )):
            return {"intent": "dataset_suggestions", "confidence": 1.0}

        # 3. Out of Domain Guardrail (Off-topic queries)
        has_data_keywords = any(w in q for w in (
            "data", "dataset", "column", "row", "feature", "variable", "metric", "table", "record",
            "mean", "median", "mode", "std", "variance", "average", "sum", "count", "min", "max",
            "distribut", "correlat", "outlier", "skew", "null", "missing", "clean", "impute",
            "chart", "graph", "plot", "histogram", "scatter", "bar", "box", "heatmap",
            "predict", "target", "cluster", "trend", "ratio", "rate", "percent", "compare",
            "group", "filter", "highest", "lowest", "top", "bottom", "most", "least", "analyze", "analysis",
            "eda", "insight", "pattern"
        ))
        if not matched and not has_data_keywords:
            if any(w in q for w in (
                "poem", "story", "joke", "riddle", "song", "lyrics", "recipe", "cook", "bake",
                "president", "prime minister", "capital of", "weather", "movie", "game", "sports",
                "football", "cricket", "who won", "bitcoin", "crypto", "blockchain", "write code for a website",
                "write a python script to download", "translate", "french", "spanish"
            )):
                return {"intent": "out_of_domain", "confidence": 0.95}

        # 4. Custom Feature Engineering, Arithmetic, Formulas, Binning, and Multi-step Slicing
        has_formula = bool(re.search(r"(\+|\-|\*|\/)\s*(\d+|[a-zA-Z_])", q))
        has_custom_binning = any(w in q for w in (
            "group passengers into", "group into", "categorize into", "bin into", "bucket into",
            "split into", "rate based on", "ratio of", "feature engineering", "derive a column",
            "create a feature", "highest rate", "lowest rate"
        ))
        has_custom_aggregation = any(w in q for w in (
            "grouped by", "group by", "average by", "mean by", "sum by", "count by", "rate by",
            "per class", "per group", "by gender", "by class", "by category"
        ))
        has_filtering = any(w in q for w in (
            "where ", "filter ", "greater than", "less than", "older than", "younger than",
            "who paid", "only passengers", "only rows", "subset of"
        ))
        has_transformation = any(w in q for w in (
            "create column", "add column", "new column", "drop column", "remove column",
            "filter", "filter rows", "subset", "impute", "fillna", "fill missing",
            "transform", "normalize", "standardize", "encode", "one-hot", "scale",
            "mutate", "feature engineering", "derive", "extract", "clean dataset by",
            "clean the dataset by", "clean data by", "clean the data by", "replace values",
            "convert column", "rename column", "drop duplicates", "deduplicate",
        ))
        if has_formula or has_custom_binning or has_custom_aggregation or has_filtering or has_transformation:
            return {"intent": "custom", "confidence": 0.95}

        # 4b. Multi-feature relationships and multivariate visualizations (3+ columns or comparison inquiries)
        if len(matched) >= 3 or any(w in q for w in ("between them", "plot between", "compare them", "multivariate plot", "relationship between them", "breakdown between")):
            return {"intent": "custom", "confidence": 0.95}

        # 5. Target variable, predictive drivers, and feature importance inquiries
        if any(w in q for w in ("target", "target variable", "predict", "predictive", "driver", "drivers", "importance", "important feature", "key feature", "influences")):
            return {"intent": "feature_importance", "confidence": 0.95}

        # 6. Open correlation inquiries (e.g. "which columns are correlated with X")
        if any(w in q for w in ("which column", "which feature", "what column", "what feature", "which variable", "correlations with", "correlated with")) and "correlat" in q:
            if any(w in q for w in ("target", "target variable", "predict", "outcome", "dependent", "label", "goal", "response")):
                return {"intent": "feature_importance", "confidence": 0.95}
            return {"intent": "correlation_analysis", "confidence": 0.95}

        if "correlat" in q:
            is_open = any(w in q for w in ("which", "what", "all", "top", "list", "find"))
            intent = "relationship_analysis" if (len(matched) == 2 and not is_open) else "correlation_analysis"
            return {"intent": intent, "confidence": 0.95}

        # 7. Unsupervised Clustering & Dimensionality Reduction (K-Means / PCA / Archetypes)
        # Note: Canned tool runs dataset-wide clustering; queries asking for plots/relationships between specific columns belong in custom sandbox.
        if any(w in q for w in ("cluster", "clustering", "segmentation", "kmeans", "k-means", "pca", "unsupervised", "archetype", "archetypes")):
            return {"intent": "multivariate", "confidence": 0.85}
        if "multivariate" in q and not matched:
            return {"intent": "multivariate", "confidence": 0.8}

        # 8. Outliers & Health
        if any(w in q for w in ("outlier", "anomaly", "unusual", "health score")):
            return {"intent": "outlier_detection", "confidence": 0.9}

        # 9. Missing Values & Cleaning
        if any(w in q for w in ("missing", "null", "duplicate", "blank cells")):
            return {"intent": "missing_value_analysis", "confidence": 0.9}
        if any(w in q for w in ("clean", "impute", "sanitize", "cleaning")):
            return {"intent": "data_cleaning", "confidence": 0.85}

        # 10. Distribution of a Single Column
        if any(w in q for w in ("distribution", "spread", "histogram", "describe")):
            return {"intent": "distribution_analysis" if len(matched) <= 1 else "relationship_analysis", "confidence": 0.85}

        # 11. Simple Aggregates
        if any(w in q for w in _AGGREGATE_WORDS):
            intent = "distribution_analysis" if matched else "summary_overview"
            return {"intent": intent, "confidence": 0.85}

        # 12. Summary Overview
        if any(w in q for w in ("summary", "overview", "dataset overview", "about this dataset")):
            return {"intent": "summary_overview", "confidence": 0.8}

        # 13. Direct Column comparisons
        if len(matched) >= 3:
            return {"intent": "custom", "confidence": 0.95}
        if len(matched) == 2:
            return {"intent": "relationship_analysis", "confidence": 0.8}
        if len(matched) == 1:
            return {"intent": "distribution_analysis", "confidence": 0.8}

        return {"intent": "custom", "confidence": 0.5}

    def resolve_columns(self, question: str, history: list[dict] | None = None) -> dict:
        def _extract_from(text_str: str) -> list[str]:
            lowered = text_str.casefold()
            tokens = re.findall(r"\b[a-z0-9_]+\b", lowered)
            found: list[str] = []

            # 1. Exact or token matches
            for col in self.column_names:
                c_low = col.casefold()
                pattern = r"(?<![A-Za-z0-9_])" + re.escape(c_low) + r"(?![A-Za-z0-9_])"
                if re.search(pattern, lowered) or c_low in tokens:
                    if col not in found:
                        found.append(col)

            # 2. Generalized stem, plural, and prefix matches
            for col in self.column_names:
                if col in found:
                    continue
                c_low = col.casefold()
                # Singular/plural normalization (e.g. fares -> fare, classes -> class)
                c_norm = c_low.rstrip("s")
                stem = c_low[:4] if len(c_low) >= 4 else c_low
                for token in tokens:
                    t_norm = token.rstrip("s")
                    if (len(t_norm) >= 3 and t_norm == c_norm) or (len(token) >= 4 and (token.startswith(stem) or c_low.startswith(token[:4]))):
                        found.append(col)
                        break

            # 3. Dynamic category value matching: match columns if the query names one of their sample values
            for col_info in self.profile.get("column_summary", []):
                col_name = col_info.get("name")
                if not col_name or col_name in found:
                    continue
                samples = [str(s).casefold() for s in col_info.get("samples", []) if s]
                for token in tokens:
                    if len(token) >= 3 and token in samples:
                        found.append(col_name)
                        break
            return found

        # 1. Extract columns explicitly named in the current question
        matched = _extract_from(question)

        # 2. History context resolution:
        # DO NOT pull columns from history if:
        # - The user is asking an open question to find/list/rank columns (e.g. "which columns", "what features")
        # - The user already specified a target variable or asks an independent question.
        # ONLY borrow from history if:
        # - The question has 0 columns and uses anaphoric pronouns ("it", "its", "that column", "show distribution"),
        # - OR the question has 1 column and explicitly asks for a comparison against the prior context ("compare with", "against that").
        lowered_q = question.lower()
        is_open_inquiry = any(
            phrase in lowered_q for phrase in (
                "which column", "which feature", "what column", "what feature",
                "which variable", "what variable", "which factor", "what factor",
                "top feature", "top column", "all column", "correlated with", "target variable", "target"
            )
        )
        has_anaphoric = any(
            re.search(r"\b" + re.escape(w) + r"\b", lowered_q)
            for w in ("it", "its", "that", "this", "them", "both", "the column", "that column", "the other", "previous")
        )

        if not is_open_inquiry and history:
            if len(matched) == 0 and has_anaphoric:
                hist_text = " ".join(str(x.get("content", "")) for x in history[-2:])
                from_hist = _extract_from(hist_text)
                for col in from_hist:
                    if col not in matched:
                        matched.append(col)
                    if len(matched) >= 1:
                        break
            elif len(matched) == 1 and any(w in lowered_q for w in ("compare", "vs", "versus", "against", "relation with that")):
                hist_text = " ".join(str(x.get("content", "")) for x in history[-2:])
                from_hist = _extract_from(hist_text)
                for col in from_hist:
                    if col not in matched:
                        matched.append(col)
                    if len(matched) >= 2:
                        break

        return {"columns": matched, "ambiguous": [], "available_columns": self.column_names}
