-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_core_user_id" TEXT NOT NULL,
    "actor_core_role" VARCHAR(20) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "target_kind" VARCHAR(30) NOT NULL,
    "target_id" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_core_user_id_created_at_idx" ON "audit_logs"("actor_core_user_id", "created_at");

