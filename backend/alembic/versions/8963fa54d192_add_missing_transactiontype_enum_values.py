"""add missing transactiontype enum values

Revision ID: 8963fa54d192
Revises: 8dc3292d50a6
Create Date: 2026-08-02 14:27:33.083730

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8963fa54d192'
down_revision: Union[str, None] = '8dc3292d50a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'CROSS_AGENT_CLAWBACK'")
    op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'INSURANCE_CONTRIBUTION'")
    op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'INSURANCE_PAYOUT'")



def downgrade() -> None:
    pass
