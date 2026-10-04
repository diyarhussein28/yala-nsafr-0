import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminAuditLog1791074030338 implements MigrationInterface {
    name = 'AdminAuditLog1791074030338'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "admin_audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "admin_id" uuid NOT NULL, "action" character varying(60) NOT NULL, "target_type" character varying(30) NOT NULL, "target_id" character varying(64), "details" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9425be48a9c753f5753017c61b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fae3c2a824a6f5fa62a475f3f4" ON "admin_audit_log"  ("admin_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3fe25b0c313e7af4a42d6f622f" ON "admin_audit_log"  ("target_type", "target_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f5c04c9384762261d79b65c6e5" ON "admin_audit_log"  ("created_at") `);
        await queryRunner.query(`ALTER TABLE "admin_audit_log" ADD CONSTRAINT "FK_fae3c2a824a6f5fa62a475f3f4e" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admin_audit_log" DROP CONSTRAINT "FK_fae3c2a824a6f5fa62a475f3f4e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f5c04c9384762261d79b65c6e5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3fe25b0c313e7af4a42d6f622f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fae3c2a824a6f5fa62a475f3f4"`);
        await queryRunner.query(`DROP TABLE "admin_audit_log"`);
    }

}
