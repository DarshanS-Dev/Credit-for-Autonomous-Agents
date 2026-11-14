"""
memory_service.py

Owns all Hindsight AI memory interaction for the Credit platform.
Integrates with Hindsight Cloud (https://api.hindsight.vectorize.io).

Two memory banks (Hindsight `bank_id`s) are used:

  BANK_LENDER_BOOK = "lender-{lender_id}-book"
    Per-lender.  Accumulates loan outcome sentences about recipient +
    category combinations that belong to this lender's portfolio.  Used
    at loan-request time to recall cross-agent patterns such as:
      "loans to recipient SaaS-API-Inc in category data-labeling
       defaulted 3 of 4 times"
      "vouched cold-start graduates repay within 7 days"

  BANK_ROGUE_AGENTS = "rogue-agents-global"
    Platform-wide.  Every time an agent is revoked for wrong-recipient
    spend or anomalous behaviour a behaviour description is retained
    here.  At loan-request time the system reflects on whether a new
    applicant resembles known rogue agents — allowing the lender to
    soft-block loans to agents whose profile matches prior bad actors
    even when the raw score looks fine.

Deliberately out of scope:
  - Long-term chat / conversation history (platform has none).
  - Per-agent scores (AgentScore, managed by underwriting_service).
  - Repayment amounts / balances (ledger, managed by ledger_service).

Memory is ADVISORY everywhere:
  - Functions that read memory (recall_lender_pattern,
    assess_rogue_similarity) wrap all Hindsight calls in try/except and
    return neutral values on failure.  A network hiccup or Hindsight
    outage must NEVER cause a loan approval to be blocked.
  - Functions that write memory (record_loan_outcome, record_rogue_agent)
    are fire-and-forget: failures are silently swallowed so the caller's
    DB transaction is never rolled back due to memory I/O.
"""

import logging
from typing import Any

from hindsight_client import Hindsight

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton — created lazily on first use so tests that never
# call memory_service functions don't need a live Hindsight connection.
_client: Hindsight | None = None


def _get_client() -> Hindsight:
    global _client
    if _client is None:
        _client = Hindsight(
            base_url=settings.hindsight_base_url,
            api_key=settings.hindsight_api_key,
        )
    return _client


def _safe_retain(bank_id: str, content: str) -> None:
    """Fire-and-forget wrapper around client.retain()."""
    try:
        _get_client().retain(bank_id=bank_id, content=content)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Hindsight retain failed (bank=%s): %s", bank_id, exc)


def _safe_reflect(bank_id: str, query: str) -> str | None:
    """
    Wrapper around client.reflect(). Returns the answer string on success,
    None on any failure (network error, empty response, etc.).
    """
    try:
        answer = _get_client().reflect(bank_id=bank_id, query=query)
        return answer.strip() if answer and answer.strip() else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Hindsight reflect failed (bank=%s): %s", bank_id, exc)
        return None


# ── Use case 1: Lender's book — cross-agent outcome patterns ─────────────────

def record_loan_outcome(
    *,
    lender_id: int,
    agent_id: int,
    recipient: str,
    category: str | None,
    outcome: str,   # "repaid" | "defaulted"
    amount: float,
) -> None:
    """
    Called from ledger_service after a loan is resolved (REPAID or DEFAULTED).

    Retains a natural-language sentence describing the outcome into this
    lender's private memory bank.  Over time the bank accumulates a
    cross-agent view of which recipient / category combinations perform well
    or badly, surfaced at the next loan request via recall_lender_pattern().

    Example retained sentence:
      "Agent 42 borrowed 80.00 for recipient 'SaaS-API-Inc' in category
       'data-labeling' and DEFAULTED."
    """
    bank_id = f"lender-{lender_id}-book"
    cat_str = f"in category '{category}'" if category else "with no declared category"
    sentence = (
        f"Agent {agent_id} borrowed {amount:.2f} for recipient '{recipient}' "
        f"{cat_str} and {outcome.upper()}."
    )
    _safe_retain(bank_id, sentence)
    logger.debug("Hindsight retained outcome for lender %d: %s", lender_id, sentence)


def record_vouched_coldstart_outcome(
    *,
    lender_id: int,
    agent_id: int,
    recipient: str,
    amount: float,
    outcome: str,   # "repaid" | "defaulted"
) -> None:
    """
    Variant of record_loan_outcome specifically for cold-start agents that
    received a sibling vouching boost.  Stored with an explicit tag so
    recall_lender_pattern() can surface patterns like:
      "vouched cold-start graduates repay fine."

    Called from ledger_service in the same locations as record_loan_outcome
    when the loan was originally issued with is_cold_start=True.
    """
    bank_id = f"lender-{lender_id}-book"
    sentence = (
        f"Vouched cold-start agent {agent_id} borrowed {amount:.2f} for "
        f"recipient '{recipient}' and {outcome.upper()}."
    )
    _safe_retain(bank_id, sentence)
    logger.debug(
        "Hindsight retained vouched cold-start outcome for lender %d: %s",
        lender_id,
        sentence,
    )


def recall_lender_pattern(
    *,
    lender_id: int,
    recipient: str,
    category: str | None,
) -> str | None:
    """
    Called from policy_engine.evaluate_loan_request() before the final
    approval decision is returned.

    Asks Hindsight to reflect on this lender's historical outcomes for the
    given recipient + category combination, synthesising a human-readable
    risk summary across all retained outcome sentences.

    Returns:
      str  — a risk summary (e.g. "3 of 4 loans to 'SaaS-API-Inc' in
              category 'data-labeling' defaulted; this recipient appears
              high-risk for this lender.")
      None — if no relevant memory exists or Hindsight is unavailable.
    """
    bank_id = f"lender-{lender_id}-book"
    cat_clause = f" in category '{category}'" if category else ""
    query = (
        f"What is the historical repayment pattern for recipient '{recipient}'"
        f"{cat_clause} across all agents in this lender's portfolio?  "
        f"Have loans to this recipient defaulted or repaid well?  "
        f"Also mention if vouched cold-start agents have performed differently."
    )
    return _safe_reflect(bank_id, query)


# ── Use case 2: Rogue-agent behavioral clustering ─────────────────────────────

BANK_ROGUE = "rogue-agents-global"


def record_rogue_agent(
    *,
    agent_id: int,
    principal_id: int,
    score_at_revocation: float,
    category: str | None,
    recipient: str,
    reason: str,
) -> None:
    """
    Called from monitoring_service._handle_default() after revoke_agent().

    Retains a behaviour description of this rogue agent into the
    platform-wide rogue bank so future loan applicants can be compared
    against it via assess_rogue_similarity().

    Example retained sentence:
      "Agent 7 (principal 2, score 61.5, category 'data-labeling') was
       revoked for sending funds to unauthorized recipient 'FraudCo'.
       Pattern: wrong_recipient."
    """
    cat_str = f"'{category}'" if category else "unknown"
    sentence = (
        f"Agent {agent_id} (principal {principal_id}, score {score_at_revocation:.1f}, "
        f"category {cat_str}) was revoked for sending funds to unauthorized "
        f"recipient '{recipient}'. Pattern: {reason}."
    )
    _safe_retain(BANK_ROGUE, sentence)
    logger.debug("Hindsight retained rogue agent profile: %s", sentence)


def assess_rogue_similarity(
    *,
    agent_id: int,
    principal_id: int,
    score: float,
    category: str | None,
    requested_recipient: str,
) -> tuple[bool, str | None]:
    """
    Called from policy_engine.evaluate_loan_request() before the final
    approval decision.

    Asks Hindsight to reflect on whether a new loan applicant resembles
    any previously revoked or rogue agents stored in the global rogue bank.

    Returns:
      (False, None)        — no concerning similarity found, or Hindsight
                             unavailable; approve normally.
      (True,  explanation) — applicant resembles known rogue agents; the
                             caller should reduce the approved limit and
                             include the explanation in the rationale.
    """
    cat_str = f"'{category}'" if category else "unspecified"
    query = (
        f"Does a loan applicant with principal_id {principal_id}, "
        f"score {score:.1f}, category {cat_str}, requesting funds for "
        f"recipient '{requested_recipient}' resemble any previously revoked "
        f"or rogue agents?  If yes, summarise the similarity concisely.  "
        f"If no clear match exists, say 'no similar rogue agents found'."
    )
    answer = _safe_reflect(BANK_ROGUE, query)
    if not answer:
        return False, None

    negative_phrases = (
        "no similar",
        "no match",
        "no rogue",
        "no known",
        "no concerning",
        "no clear match",
    )
    if any(phrase in answer.lower() for phrase in negative_phrases):
        return False, None

    return True, answer
