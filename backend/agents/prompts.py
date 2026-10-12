"""
Agent prompt templates — intent classification, column mapping,
custom code generation triggers (spec sections 5.1-5.2).
"""
from __future__ import annotations

INTENT_CLASSIFICATION_PROMPT = """
You are an intent classifier for a data analyst agent. Classify the user's question
into one of these intents. Return ONLY the JSON object, no other text.

Possible intents:
- relationship_analysis: asking about relationship between 2 variables
- distribution_analysis: asking about distribution of a single column
- feature_importance: asking which features matter / what drives X
- outlier_detection: asking about outliers or anomalies
- missing_value_analysis: asking about missing/empty values
- data_cleaning: asking to clean or fix data
- summary_overview: asking for dataset summary or overview
- correlation_analysis: asking about strongest correlations
- multivariate: asking about groups, clusters, segments
- custom: anything not covered above (rarely used)

User question: "{question}"

JSON:
{{"intent": "...", "confidence": 0.0-1.0, "explanation": "..." }}
"""

COLUMN_MAPPING_PROMPT = """
Given the user's question and the dataset columns, identify which columns are relevant.
Return ONLY a JSON object with the matched columns.

User question: "{question}"
Available columns: {columns}

JSON:
{{"columns": ["col1", "col2"], "ambiguous": ["col_if_any"], "explanation": "..."}}
"""

CUSTOM_CODE_PROMPT = """
You are a code generator for a data analysis sandbox. Generate ONLY valid Python code
that operates on a pandas DataFrame variable named 'df'. Do NOT include explanations,
markdown, or print statements. Use only pandas, numpy, sklearn, and scipy.

Task: {question}

Available columns: {columns}

Return only the Python code (no markdown fences, no explanation):
"""

INSIGHT_INTERPRETATION_PROMPT = """
You are an AI data analyst. Given the analysis result below, write a concise,
friendly explanation of what the numbers mean. Keep it under 120 words, use the
exact values provided, and do not fabricate anything.

Analysis: {title}
Statistics: {statistics}
Columns: {columns}

Explanation:
"""
