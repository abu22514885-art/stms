-- Run this ONLY if you already created the tables from the earlier schema.sql.
-- (If you create the database fresh from the new schema.sql, skip this file.)

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS stocked_quantity INT NOT NULL DEFAULT 0
    CHECK (stocked_quantity >= 0);

UPDATE products SET stocked_quantity = quantity WHERE stocked_quantity = 0;

ALTER TABLE products DROP COLUMN IF EXISTS low_stock_level;

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