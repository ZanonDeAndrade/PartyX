-- Reverte 0000_schema_inicial. APAGA TODOS OS DADOS. Só em ambiente descartável ou com backup restaurável.
DROP TABLE IF EXISTS "audit_log", "email_log", "payment_events", "checkins", "tickets", "reservations",
  "order_items", "orders", "promoters", "ticket_types", "events", "login_attempts", "sessions",
  "consents", "password_resets", "users" CASCADE;
DROP SEQUENCE IF EXISTS "order_number_seq";
DROP TYPE IF EXISTS "checkin_method", "checkin_result", "email_status", "email_template", "event_status",
  "order_status", "payment_method", "reservation_status", "ticket_status", "user_role";
