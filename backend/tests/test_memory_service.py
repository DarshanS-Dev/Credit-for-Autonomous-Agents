"""
test_memory_service.py

Unit tests for memory_service.py.  All Hindsight client calls are mocked
so the tests run without a live Hindsight connection.

Coverage:
  - record_loan_outcome / record_rogue_agent: correct sentence is passed
    to client.retain(), failures are silently swallowed.
  - recall_lender_pattern: correct query is passed to client.reflect(),
    result forwarded; None returned on failure or empty answer.
  - assess_rogue_similarity: positive and negative phrase detection works,
    None returned on client failure.
"""

from unittest.mock import MagicMock, patch, PropertyMock
import types
import sys

import pytest

# ---------------------------------------------------------------------------
# Isolate memory_service from real settings and real Hindsight I/O.
#
# Strategy: patch `app.config` with a stub module containing a fake `settings`
# object BEFORE memory_service (which does `from app.config import settings`)
# is imported.  This prevents pydantic-settings from trying to read .env.
# We also patch `hindsight_client.Hindsight` so no TCP connection is opened.
# ---------------------------------------------------------------------------

FAKE_SETTINGS = MagicMock()
FAKE_SETTINGS.hindsight_base_url = "https://api.hindsight.vectorize.io"
FAKE_SETTINGS.hindsight_api_key = "test-key"

# Stub out app.config before anything imports it
_config_stub = types.ModuleType("app.config")
_config_stub.settings = FAKE_SETTINGS  # type: ignore[attr-defined]
sys.modules.setdefault("app.config", _config_stub)

# Stub out hindsight_client so no real client is ever constructed
MOCK_CLIENT_INSTANCE = MagicMock()
_hindsight_stub = types.ModuleType("hindsight_client")
_hindsight_stub.Hindsight = MagicMock(return_value=MOCK_CLIENT_INSTANCE)  # type: ignore[attr-defined]
sys.modules.setdefault("hindsight_client", _hindsight_stub)

# Now it's safe to import memory_service
import app.services.memory_service as _ms  # noqa: E402
_ms._client = MOCK_CLIENT_INSTANCE  # pre-inject the mock singleton

MOCK_CLIENT = MOCK_CLIENT_INSTANCE


@pytest.fixture(autouse=True)
def reset_mock_client():
    """Reset call history AND side_effects between tests."""
    MOCK_CLIENT.reset_mock()
    # Explicitly clear side_effects so a failure set in one test
    # does not bleed into the next.
    MOCK_CLIENT.retain.side_effect = None
    MOCK_CLIENT.reflect.side_effect = None
    _ms._client = MOCK_CLIENT
    yield
    _ms._client = MOCK_CLIENT



# ── record_loan_outcome ──────────────────────────────────────────────────────

class TestRecordLoanOutcome:
    def test_retain_called_with_correct_sentence(self):
        from app.services.memory_service import record_loan_outcome

        record_loan_outcome(
            lender_id=1,
            agent_id=42,
            recipient="SaaS-API-Inc",
            category="data-labeling",
            outcome="defaulted",
            amount=80.0,
        )

        MOCK_CLIENT.retain.assert_called_once()
        call_kwargs = MOCK_CLIENT.retain.call_args.kwargs
        assert call_kwargs["bank_id"] == "lender-1-book"
        assert "Agent 42" in call_kwargs["content"]
        assert "SaaS-API-Inc" in call_kwargs["content"]
        assert "DEFAULTED" in call_kwargs["content"]

    def test_retain_failure_is_swallowed(self):
        """A Hindsight error must never propagate to the caller."""
        from app.services.memory_service import record_loan_outcome

        MOCK_CLIENT.retain.side_effect = Exception("network error")
        # Should not raise
        record_loan_outcome(
            lender_id=1,
            agent_id=5,
            recipient="Acme",
            category=None,
            outcome="repaid",
            amount=50.0,
        )

    def test_no_category_uses_fallback_text(self):
        from app.services.memory_service import record_loan_outcome

        record_loan_outcome(
            lender_id=2,
            agent_id=7,
            recipient="GenericCo",
            category=None,
            outcome="repaid",
            amount=100.0,
        )
        content = MOCK_CLIENT.retain.call_args.kwargs["content"]
        assert "no declared category" in content


# ── record_rogue_agent ───────────────────────────────────────────────────────

class TestRecordRogueAgent:
    def test_retain_called_on_rogue_bank(self):
        from app.services.memory_service import record_rogue_agent, BANK_ROGUE

        record_rogue_agent(
            agent_id=7,
            principal_id=2,
            score_at_revocation=61.5,
            category="data-labeling",
            recipient="FraudCo",
            reason="wrong_recipient",
        )

        call_kwargs = MOCK_CLIENT.retain.call_args.kwargs
        assert call_kwargs["bank_id"] == BANK_ROGUE
        assert "Agent 7" in call_kwargs["content"]
        assert "FraudCo" in call_kwargs["content"]
        assert "wrong_recipient" in call_kwargs["content"]

    def test_failure_swallowed(self):
        from app.services.memory_service import record_rogue_agent

        MOCK_CLIENT.retain.side_effect = RuntimeError("timeout")
        record_rogue_agent(
            agent_id=99,
            principal_id=1,
            score_at_revocation=50.0,
            category=None,
            recipient="X",
            reason="wrong_recipient",
        )


# ── recall_lender_pattern ────────────────────────────────────────────────────

class TestRecallLenderPattern:
    def test_returns_reflect_answer(self):
        from app.services.memory_service import recall_lender_pattern

        MOCK_CLIENT.reflect.return_value = "3 of 4 loans to SaaS-API-Inc defaulted."

        result = recall_lender_pattern(
            lender_id=1,
            recipient="SaaS-API-Inc",
            category="data-labeling",
        )

        assert result == "3 of 4 loans to SaaS-API-Inc defaulted."
        call_kwargs = MOCK_CLIENT.reflect.call_args.kwargs
        assert "SaaS-API-Inc" in call_kwargs["query"]
        assert "data-labeling" in call_kwargs["query"]

    def test_returns_none_on_empty_answer(self):
        from app.services.memory_service import recall_lender_pattern

        MOCK_CLIENT.reflect.return_value = "   "
        assert recall_lender_pattern(lender_id=1, recipient="X", category=None) is None

    def test_returns_none_on_exception(self):
        from app.services.memory_service import recall_lender_pattern

        MOCK_CLIENT.reflect.side_effect = ConnectionError("down")
        assert recall_lender_pattern(lender_id=1, recipient="X", category=None) is None


# ── assess_rogue_similarity ──────────────────────────────────────────────────

class TestAssessRogueSimilarity:
    def test_no_match_returns_false(self):
        from app.services.memory_service import assess_rogue_similarity

        MOCK_CLIENT.reflect.return_value = "No similar rogue agents found."

        flag, explanation = assess_rogue_similarity(
            agent_id=10,
            principal_id=3,
            score=72.0,
            category="trading",
            requested_recipient="LegitVendor",
        )
        assert flag is False
        assert explanation is None

    def test_match_returns_true_with_summary(self):
        from app.services.memory_service import assess_rogue_similarity

        MOCK_CLIENT.reflect.return_value = (
            "Agent 7 (principal 2, score 61.5) was revoked for sending "
            "funds to 'FraudCo'. This applicant has a matching profile."
        )

        flag, explanation = assess_rogue_similarity(
            agent_id=11,
            principal_id=2,
            score=63.0,
            category="data-labeling",
            requested_recipient="FraudCo",
        )
        assert flag is True
        assert "FraudCo" in explanation

    def test_returns_false_on_exception(self):
        from app.services.memory_service import assess_rogue_similarity

        MOCK_CLIENT.reflect.side_effect = TimeoutError("hindsight unreachable")
        flag, explanation = assess_rogue_similarity(
            agent_id=5,
            principal_id=1,
            score=55.0,
            category=None,
            requested_recipient="AnyRecipient",
        )
        assert flag is False
        assert explanation is None
