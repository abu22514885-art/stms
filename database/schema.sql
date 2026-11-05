 -- =====================================================================
-- Stock Management System - PostgreSQL schema (v3.1)
-- Fixes: session uniqueness, VAT invariants, payment balance sync,
--        stock ledger consistency, composite FKs, invoice sequence,
--        updated_at trigger, approval constraints, hot-path indexes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. Utility: updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. Users
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(150) NOT NULL,
    username        VARCHAR(60)  NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    role            VARCHAR(20)  NOT NULL CHECK (role IN ('Admin','Salesperson')),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    approval_status VARCHAR(20)  NOT NULL DEFAULT 'Pending'
                    CHECK (approval_status IN ('Pending','Approved','Rejected')),
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Approved/Rejected users must record who approved them and when
    CONSTRAINT chk_users_approval CHECK (
        approval_status = 'Pending'
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

CREATE TABLE password_reset_requests (
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

CREATE UNIQUE INDEX ux_password_reset_pending_user
    ON password_reset_requests(user_id) WHERE status = 'Pending';

CREATE TABLE push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Settings
-- ---------------------------------------------------------------------
CREATE TABLE settings (
    key   VARCHAR(60)  PRIMARY KEY,
    value VARCHAR(255) NOT NULL
);
INSERT INTO settings(key, value) VALUES
    ('vat_rate', '0.15'),
    ('company_name', 'My Company');

-- ---------------------------------------------------------------------
-- 4. Categories & Products
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku             VARCHAR(60)  NOT NULL,
    name            VARCHAR(200) NOT NULL,
    category_id     INT REFERENCES categories(id) ON DELETE RESTRICT,
    cost_price      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    price           NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    vat_amount      NUMERIC(14,2) NOT NULL CHECK (vat_amount >= 0),
    price_with_vat  NUMERIC(14,2) NOT NULL CHECK (price_with_vat >= 0),
    quantity        INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    stocked_quantity INT NOT NULL DEFAULT 0 CHECK (stocked_quantity >= 0),  -- stock level at last restock (25% alert)
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_products_price_vat CHECK (price_with_vat = price + vat_amount)
);

-- Case-insensitive uniqueness among active products
CREATE UNIQUE INDEX ux_products_sku  ON products (lower(sku))  WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX ux_products_name ON products (lower(name)) WHERE is_deleted = FALSE;

CREATE TRIGGER trg_products_updated
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ix_products_category ON products(category_id) WHERE is_deleted = FALSE;

-- ---------------------------------------------------------------------
-- 5. Payment methods & providers
-- ---------------------------------------------------------------------
CREATE TABLE payment_methods (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(60) NOT NULL UNIQUE,
    type      VARCHAR(20) NOT NULL CHECK (type IN ('Cash','MobileBanking','Wallet')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE payment_providers (
    id                SERIAL PRIMARY KEY,
    payment_method_id INT NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
    name              VARCHAR(80) NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (payment_method_id, name),
    UNIQUE (id, payment_method_id)   -- enables composite FK from payments
);

INSERT INTO payment_methods(name, type) VALUES
    ('Cash','Cash'),
    ('Mobile Banking','MobileBanking'),
    ('Wallet','Wallet');

-- Banks and wallets are NOT seeded: the admin adds them in Settings (payment_providers).

-- ---------------------------------------------------------------------
-- 6. Daily sales sessions (one OPEN session per salesperson)
-- ---------------------------------------------------------------------
CREATE TABLE sales_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salesperson_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    session_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_out_at TIMESTAMPTZ,
    CONSTRAINT chk_session_checkout CHECK (
        checked_out_at IS NULL OR checked_out_at >= started_at
    )
);

-- A salesperson can have at most ONE active session
CREATE UNIQUE INDEX ux_active_session
    ON sales_sessions (salesperson_id)
    WHERE checked_out_at IS NULL;

CREATE INDEX ix_sessions_salesperson_date
    ON sales_sessions (salesperson_id, session_date);

-- ---------------------------------------------------------------------
-- 7. Customers
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name  VARCHAR(150) NOT NULL,
    phone      VARCHAR(30)  NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_customers_updated
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 8. Invoice sequence
-- ---------------------------------------------------------------------
CREATE SEQUENCE invoice_seq;

-- ---------------------------------------------------------------------
-- 9. Sales
-- ---------------------------------------------------------------------
CREATE TABLE sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no      VARCHAR(30) NOT NULL UNIQUE
                    DEFAULT ('INV-' || to_char(now(),'YYYYMMDD') || '-' ||
                             lpad(nextval('invoice_seq')::text, 6, '0')),
    session_id      UUID NOT NULL REFERENCES sales_sessions(id) ON DELETE RESTRICT,
    salesperson_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    wants_receipt   BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE = sell at price_with_vat
    subtotal        NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
    vat_total       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (vat_total >= 0),
    total           NUMERIC(14,2) NOT NULL CHECK (total >= 0),
    amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('Paid','Loan','PartiallyPaid')),
    is_loan         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_sales_total   CHECK (total = subtotal + vat_total),
    CONSTRAINT chk_sales_overpay CHECK (amount_paid <= total),
    CONSTRAINT chk_sales_loan_customer CHECK (NOT is_loan OR customer_id IS NOT NULL),
    CONSTRAINT chk_sales_status_paid  CHECK (
        (status = 'Paid'          AND amount_paid = total)
     OR (status = 'PartiallyPaid' AND amount_paid > 0 AND amount_paid < total)
     OR (status = 'Loan'          AND amount_paid = 0)
    )
);

CREATE INDEX ix_sales_created     ON sales (created_at);
CREATE INDEX ix_sales_session     ON sales (session_id);
CREATE INDEX ix_sales_salesperson ON sales (salesperson_id);
CREATE INDEX ix_sales_customer    ON sales (customer_id);

-- ---------------------------------------------------------------------
-- 10. Sale items
-- ---------------------------------------------------------------------
CREATE TABLE sale_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id      UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_sku  VARCHAR(60)  NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity     INT NOT NULL CHECK (quantity > 0),
    unit_price   NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),  -- VAT-excl
    unit_cost    NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
    vat_amount   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
    line_total   NUMERIC(14,2) NOT NULL CHECK (line_total >= 0),
    CONSTRAINT chk_sale_items_line
        CHECK (line_total = quantity * unit_price + vat_amount)
);

CREATE INDEX ix_sale_items_sale    ON sale_items (sale_id);
CREATE INDEX ix_sale_items_product ON sale_items (product_id);

-- ---------------------------------------------------------------------
-- 11. Payments
-- ---------------------------------------------------------------------
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id             UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    payment_method_id   INT  NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
    payment_provider_id INT,
    transaction_ref     VARCHAR(100),
    receipt_image_path  TEXT,
    amount              NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    received_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    paid_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_loan_repayment   BOOLEAN NOT NULL DEFAULT FALSE,

    -- Provider must belong to the chosen method
    CONSTRAINT fk_payments_provider
        FOREIGN KEY (payment_provider_id, payment_method_id)
        REFERENCES payment_providers(id, payment_method_id)
        ON DELETE RESTRICT,

    -- E-payments must carry a transaction ref AND a receipt screenshot
    CONSTRAINT chk_payments_provider_ref CHECK (
        payment_provider_id IS NULL
        OR (transaction_ref IS NOT NULL AND receipt_image_path IS NOT NULL)
    )
);

CREATE UNIQUE INDEX ux_payments_txref
    ON payments (payment_provider_id, transaction_ref)
    WHERE transaction_ref IS NOT NULL;

CREATE INDEX ix_payments_sale    ON payments (sale_id);
CREATE INDEX ix_payments_paid_at ON payments (paid_at);

-- ---------------------------------------------------------------------
-- 12. Stock movements (ledger)
-- ---------------------------------------------------------------------
CREATE TABLE stock_movements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    change_qty   INT  NOT NULL CHECK (change_qty <> 0),
    reason       VARCHAR(30) NOT NULL
                 CHECK (reason IN ('Sale','Restock','Adjustment','Return','Damage','Initial')),
    sale_id      UUID REFERENCES sales(id)      ON DELETE SET NULL,
    sale_item_id UUID REFERENCES sale_items(id) ON DELETE SET NULL,
    user_id      UUID REFERENCES users(id)      ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_stock_movements_product ON stock_movements (product_id, created_at);
CREATE INDEX ix_stock_movements_sale    ON stock_movements (sale_id);

-- ---------------------------------------------------------------------
-- 13. Stock -> products.quantity consistency trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE products
           SET quantity = quantity + NEW.change_qty,
               stocked_quantity = CASE
                   WHEN NEW.reason IN ('Initial','Restock') THEN quantity + NEW.change_qty
                   ELSE GREATEST(stocked_quantity, quantity + NEW.change_qty)
               END
         WHERE id = NEW.product_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Unknown product %', NEW.product_id;
        END IF;
        -- Will fail on products.quantity >= 0 if insufficient stock
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE products
           SET quantity = quantity - OLD.change_qty
         WHERE id = OLD.product_id;
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE products
           SET quantity = quantity - OLD.change_qty
         WHERE id = OLD.product_id;
        UPDATE products
           SET quantity = quantity + NEW.change_qty
         WHERE id = NEW.product_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movements_apply
    AFTER INSERT OR UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- ---------------------------------------------------------------------
-- 14. Payments -> sales.amount_paid & status sync trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_sale_payment_state(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total  NUMERIC(14,2);
    v_paid   NUMERIC(14,2);
    v_status VARCHAR(20);
BEGIN
    SELECT total INTO v_total FROM sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM payments WHERE sale_id = p_sale_id;

    IF v_paid > v_total THEN
        RAISE EXCEPTION 'Overpayment on sale %: paid % > total %',
            p_sale_id, v_paid, v_total;
    END IF;

    IF v_paid = v_total THEN
        v_status := 'Paid';
    ELSIF v_paid = 0 THEN
        v_status := 'Loan';
    ELSE
        v_status := 'PartiallyPaid';
    END IF;

    UPDATE sales
       SET amount_paid = v_paid,
           status      = v_status
     WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_payments_after() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP IN ('INSERT','UPDATE')) THEN
        PERFORM refresh_sale_payment_state(NEW.sale_id);
    END IF;
    IF (TG_OP IN ('UPDATE','DELETE')) THEN
        PERFORM refresh_sale_payment_state(OLD.sale_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_sync
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION trg_payments_after();

-- ---------------------------------------------------------------------
-- 15. seed: bootstrap admin (approved)
--    Replace password_hash before running in production.
-- ---------------------------------------------------------------------
WITH a AS (SELECT gen_random_uuid() AS id)
INSERT INTO users (id, full_name, username, password_hash, role,
                   is_active, approval_status, approved_by, approved_at)
SELECT id, 'System Admin', 'admin',
       '$2b$12$REPLACE_WITH_REAL_HASH',
       'Admin', TRUE, 'Approved', id, now()
FROM a
ON CONFLICT (username) DO NOTHING;
