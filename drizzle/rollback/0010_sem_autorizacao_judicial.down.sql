-- Reverte 0010_sem_autorizacao_judicial: volta a exigir a autorização judicial em evento que permite menores. RECUSA se já existir
-- evento com menores sem o número (a regra antiga não aceitaria a linha); resolva antes no painel ou com a PartyX.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "events"
     WHERE "allows_minors" AND length(btrim(coalesce("judicial_authorization", ''))) = 0
  ) THEN
    RAISE EXCEPTION 'Há evento que permite menores sem número de autorização judicial; a regra antiga o recusaria.';
  END IF;
END $$;
ALTER TABLE "events" DROP CONSTRAINT "events_minors_need_end";
ALTER TABLE "events" ADD CONSTRAINT "events_minors_need_authorization" CHECK (not "events"."allows_minors" or ("events"."ends_at" is not null and length(btrim(coalesce("events"."judicial_authorization", ''))) > 0));
