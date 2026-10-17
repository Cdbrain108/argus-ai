from __future__ import annotations

import json
import re
from typing import Any

from backend.agents.planner import Planner
from backend.agents.tool_router import route_tool
from backend.analysis.schemas import validate_result
from backend.services import dataset_service as ds
from backend.services import session_service as ss
from backend.services.llm import LLMUnavailable, codegen_timeout, is_configured

_FRIENDLY_ERRORS = {
    "llm_timeout": (
        "The AI planner took too long to respond. Try a more specific question "
        "(naming the columns you mean), or pick an analysis from Explore."
    ),
    "llm_not_configured": (
        "No AI provider is configured, so free-form questions are unavailable. "
        "Deterministic analyses in Explore, Data Cleaning, and Feature Discovery still work."
    ),
    "llm_auth": "The configured AI provider rejected the API key. Check the key and try again.",
    "llm_payment_required": "AI provider quota exhausted. Switched to deterministic offline analysis.",
    "llm_model_not_found": "The configured AI model name was not recognised by the provider.",
    "llm_rate_limited": "The AI provider is rate-limiting requests. Wait a moment and try again.",
    "llm_error": "The AI planner could not be reached. Try again, or run an analysis from Explore.",
}


class AgentOrchestrator:
    def handle_query(
        self,
        dataset_id: str,
        message: str,
        history: list[dict] | None = None,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        session = ds.get_dataset(dataset_id)
        if session is None:
            return {
                "status": "error",
                "error_type": "dataset_not_found",
                "error": f"Dataset {dataset_id} not found",
                "reply": "That dataset is no longer loaded. Upload it again to continue.",
                "retryable": False,
                "analysis": None,
            }
        conversation = ss.get_or_create(session_id, dataset_id)
        prior = list(history or conversation.history)
        ss.append_message(conversation, "user", message)
        profile = ds.get_profile(dataset_id)
        planner = Planner(profile)

        # Check if the user is asking to explain an existing finding or previous result
        lowered_msg = message.lower()
        is_explain_query = any(w in lowered_msg for w in ("explain", "elaborate", "tell me more", "interpret", "what does this mean", "deep dive"))
        if is_explain_query and session.analysis_history:
            # Find matching analysis or use the latest one
            target_analysis = session.analysis_history[-1]
            for a in reversed(session.analysis_history):
                t = (a.get("title") or a.get("analysis_name") or "").lower()
                if t and t in lowered_msg:
                    target_analysis = a
                    break
            
            explanation = self._explain(message, target_analysis, deep_dive=True)
            target_analysis["explanation"] = explanation
            ss.append_message(conversation, "assistant", explanation, analysis_id=target_analysis.get("analysis_id"))
            return {
                "status": "ok",
                "session_id": conversation.session_id,
                "message": message,
                "reply": explanation,
                "intent": {"intent": "explanation", "confidence": 1.0},
                "columns": target_analysis.get("columns", []),
                "status_steps": [
                    "Analyzing analytical results",
                    "Synthesizing key patterns & drivers",
                    "Interpreting statistical significance",
                    "Generating executive explanation",
                ],
                "requires_custom_code": False,
                "analysis": target_analysis,
                "verbose_trace": {
                    "intent": "explanation",
                    "confidence": 1.0,
                    "columns": target_analysis.get("columns", []),
                    "strategy": "LangGraph Finding Synthesis & Deep Dive Node",
                    "code": None,
                    "retries": 0,
                    "steps": [
                        "Analyzing analytical results",
                        "Synthesizing key patterns & drivers",
                        "Interpreting statistical significance",
                        "Generating executive explanation",
                    ],
                    "agent_framework": "LangGraph Multi-Agent StateGraph v0.2",
                },
            }

        # Run the LangGraph Multi-Agent StateGraph
        from backend.agents.graph import get_analyst_graph
        graph = get_analyst_graph()

        initial_state = {
            "dataset_id": dataset_id,
            "message": message,
            "history": prior,
            "session_id": conversation.session_id,
            "profile": profile,
            "df": session.df,
        }

        output_state = graph.invoke(initial_state)

        analysis = output_state.get("analysis")
        reply = output_state.get("reply", "Analysis completed.")
        if analysis:
            session.analysis_history.append(analysis)
            ss.append_message(conversation, "assistant", reply, analysis_id=analysis.get("analysis_id"))
        else:
            ss.append_message(conversation, "assistant", reply)

        intent_val = output_state.get("intent", "custom")
        conf_val = output_state.get("confidence", 0.85)
        cols_val = output_state.get("columns", [])
        code_val = output_state.get("code")
        steps_val = output_state.get("status_steps", [
            "Understanding your question",
            "Executing LangGraph agent nodes",
            "Validating results",
        ])

        verbose_trace = {
            "intent": intent_val,
            "confidence": conf_val,
            "columns": cols_val,
            "strategy": (
                "Direct Conversational Node" if intent_val in ("meta_identity", "dataset_suggestions", "out_of_domain")
                else ("Safe Python AST-Gated Sandbox" if output_state.get("requires_custom_code")
                else f"Deterministic Analytic Engine ({intent_val})")
            ),
            "code": code_val,
            "retries": output_state.get("retry_count", 0),
            "steps": steps_val,
            "agent_framework": "LangGraph Multi-Agent StateGraph v0.2",
        }

        return {
            "status": "ok" if not output_state.get("error") else "error",
            "session_id": conversation.session_id,
            "message": message,
            "reply": reply,
            "intent": {
                "intent": intent_val,
                "confidence": conf_val,
            },
            "columns": cols_val,
            "status_steps": steps_val,
            "requires_custom_code": bool(output_state.get("requires_custom_code", False)),
            "analysis": analysis,
            "verbose_trace": verbose_trace,
        }

    def _error_envelope(self, conversation, message, intent_info, columns, steps, failure: dict) -> dict[str, Any]:
        error_type = failure.get("error_type", "analysis_failed")
        reply = failure.get("reply") or _FRIENDLY_ERRORS.get(
            error_type, "That analysis could not be completed. Try rephrasing the question."
        )
        ss.append_message(conversation, "assistant", reply)
        return {
            "status": "error",
            "session_id": conversation.session_id,
            "message": message,
            "reply": reply,
            "error_type": error_type,
            "error": failure.get("error", ""),
            "retryable": bool(failure.get("retryable", True)),
            "intent": intent_info,
            "columns": columns,
            "status_steps": steps,
            "analysis": None,
        }

    def _explain(self, question: str, result: dict, history: list[dict] | None = None, deep_dive: bool = False) -> str:
        if not is_configured():
            return self._fallback_explanation(result)
        try:
            from backend.services.llm import chat_completion

            prompt_focus = (
                "Provide an in-depth analytical breakdown of this finding. Explain the key statistical drivers, "
                "practical business implications, and actionable takeaways in 3 to 4 articulate paragraphs."
                if deep_dive else
                "Explain what the computed numbers mean in 2 to 3 concise, highly informative sentences. "
                "Do not mention thinking steps. Start your response directly with the analytical finding."
            )

            context_block = ""
            if history:
                recent = [
                    f"{m.get('role', 'user')}: {str(m.get('content', ''))[:160]}"
                    for m in history[-3:]
                    if m.get("content")
                ]
                if recent:
                    context_block = "Recent conversation context:\n" + "\n".join(recent) + "\n\n"

            return chat_completion(
                prompt=(
                    f"{context_block}"
                    f"Current user question: {question}\n"
                    f"Computed analysis statistics and result: {json.dumps(result, default=str)[:7000]}\n\n"
                    f"{prompt_focus}"
                ),
                system_prompt=(
                    "You are ARGUS, an expert senior AI data analyst. "
                    "Provide a direct, authoritative, and plain-English answer based solely on the computed data. "
                    "Maintain conversational continuity with prior discussion if relevant, but prioritize answering the CURRENT question directly. "
                    "Highlight significant correlations, distributions, or anomalies with clear quantitative context. "
                    "Never hallucinate numbers. Never say 'The user is asking' or 'Based on the prompt'."
                ),
                max_tokens=450 if deep_dive else 250,
                temperature=0.3,
            )
        except Exception:
            # The numbers are already computed and correct; describe the real result
            return self._fallback_explanation(result)

    def _fallback_explanation(self, result: dict) -> str:
        title = result.get("title") or result.get("analysis_name") or "the analysis"
        parts = [f"Analysis completed: {title}."]
        insights = [str(i) for i in (result.get("insights") or [])][:4]
        if insights:
            parts.append(" ".join(insights))
        stats = result.get("statistics") or {}
        if stats:
            shown = []
            for key, value in list(stats.items())[:5]:
                label = str(key).replace("_", " ").title()
                if isinstance(value, float):
                    shown.append(f"{label}: {value:.3f}")
                elif isinstance(value, (int, str)):
                    shown.append(f"{label}: {value}")
            if shown and not insights:
                parts.append("Key metrics: " + ", ".join(shown) + ".")
        return " ".join(parts)
