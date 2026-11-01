CREATE TABLE IF NOT EXISTS password_reset_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_password_hash   TEXT,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    status              VARCHAR(20) NOT NULL DEFAULT 'Pending'
                        CHECK (status IN ('Pending','Approved','Rejected')),
    reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    CONSTRAINT chk_password_reset_state CHECK (
        (status = 'Pending' AND new_password_hash IS NOT NULL)
        OR (status <> 'Pending' AND new_password_hash IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_password_reset_pending_user
    ON password_reset_requests(user_id) WHERE status = 'Pending';

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user_id
    ON push_subscriptions(user_id);