"""Enforce unique external authentication identities.

Revision ID: b6d7e8f9a0b1
Revises: f3a2b4c5d6e7
Create Date: 2026-07-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b6d7e8f9a0b1"
down_revision: str | None = "f3a2b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    duplicates = connection.execute(
        sa.text(
            """
            SELECT provider_id, COUNT(*) AS identity_count
            FROM users
            WHERE provider_id IS NOT NULL
            GROUP BY provider_id
            HAVING COUNT(*) > 1
            LIMIT 5
            """
        )
    ).fetchall()
    if duplicates:
        raise RuntimeError(
            "Cannot enforce unique Google identities: duplicate provider_id "
            "values exist. Resolve the affected users before retrying the migration."
        )

    # Older Google-login code populated provider_id but accidentally retained
    # provider=LOCAL. Those exact subject-linked rows are safe to upgrade.
    connection.execute(
        sa.text(
            """
            UPDATE users
            SET provider = 'GOOGLE', password_hash = NULL
            WHERE provider = 'LOCAL' AND provider_id IS NOT NULL
            """
        )
    )
    op.create_index(
        "uq_users_provider_identity",
        "users",
        ["provider", "provider_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_users_provider_identity", table_name="users")
