"""
csv_import_service.py

Parses and validates a principal-uploaded task-history CSV before any DB
write happens. All-or-nothing: a single malformed row rejects the entire
file, so we never end up with a partially-imported history skewing a
score computation off incomplete data.

Locked schema: task_id,completed_at,success,amount,recipient
"""

import csv
import io
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation


REQUIRED_COLUMNS = {"task_id", "completed_at", "success", "amount", "recipient"}

TRUE_VALUES = {"true", "1", "yes"}
FALSE_VALUES = {"false", "0", "no"}


class CSVValidationError(Exception):
    """Raised on any row/column problem. Caller (router) turns this into a 422."""
    pass


@dataclass
class ParsedTaskRow:
    task_id: str
    completed_at: datetime
    success: bool
    amount: Decimal
    recipient: str


def _parse_bool(raw: str, row_num: int) -> bool:
    val = raw.strip().lower()
    if val in TRUE_VALUES:
        return True
    if val in FALSE_VALUES:
        return False
    raise CSVValidationError(f"Row {row_num}: 'success' must be true/false, got '{raw}'")


def _parse_datetime(raw: str, row_num: int) -> datetime:
    try:
        dt = datetime.fromisoformat(raw.strip())
    except ValueError:
        raise CSVValidationError(
            f"Row {row_num}: 'completed_at' must be ISO-8601, got '{raw}'"
        )
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_amount(raw: str, row_num: int) -> Decimal:
    try:
        amount = Decimal(raw.strip())
    except (InvalidOperation, AttributeError):
        raise CSVValidationError(f"Row {row_num}: 'amount' must be numeric, got '{raw}'")
    if amount < 0:
        raise CSVValidationError(f"Row {row_num}: 'amount' cannot be negative, got '{raw}'")
    return amount


def parse_task_history_csv(raw_bytes: bytes) -> list[ParsedTaskRow]:
    """
    Validates the entire file before returning anything. Raises
    CSVValidationError on the first problem found (missing columns, or any
    row with a bad value) -- caller must not persist partial results.
    """
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CSVValidationError("File is not valid UTF-8 text")

    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        raise CSVValidationError("File has no header row")

    missing = REQUIRED_COLUMNS - set(reader.fieldnames)
    if missing:
        raise CSVValidationError(f"Missing required columns: {sorted(missing)}")

    rows: list[ParsedTaskRow] = []
    row_num = 1  # header is row 0

    for raw_row in reader:
        row_num += 1

        for col in REQUIRED_COLUMNS:
            if raw_row.get(col) is None or raw_row[col].strip() == "":
                raise CSVValidationError(f"Row {row_num}: missing value for '{col}'")

        task_id = raw_row["task_id"].strip()
        completed_at = _parse_datetime(raw_row["completed_at"], row_num)
        success = _parse_bool(raw_row["success"], row_num)
        amount = _parse_amount(raw_row["amount"], row_num)
        recipient = raw_row["recipient"].strip()

        rows.append(ParsedTaskRow(
            task_id=task_id,
            completed_at=completed_at,
            success=success,
            amount=amount,
            recipient=recipient,
        ))

    if not rows:
        raise CSVValidationError("File contains no data rows")

    return rows