-- AlterTable: adiciona cursor monotônico para ordenação e sync de eventos
ALTER TABLE "outbox_events" ADD COLUMN "sequence" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_sequence_key" ON "outbox_events"("sequence");
