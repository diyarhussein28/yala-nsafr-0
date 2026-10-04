import { MigrationInterface, QueryRunner } from "typeorm";

export class DriverLedgerAndCommissionPayments1791073553912 implements MigrationInterface {
    name = 'DriverLedgerAndCommissionPayments1791073553912'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."driver_ledger_type_enum" AS ENUM('cancellation_compensation', 'cash_commission_payment', 'adjustment')`);
        await queryRunner.query(`CREATE TABLE "driver_ledger" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_id" uuid NOT NULL, "type" "public"."driver_ledger_type_enum" NOT NULL, "amount" numeric(10,2) NOT NULL, "booking_id" uuid, "commission_payment_id" uuid, "created_by_admin_id" uuid, "note" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_264219361a10cd478d64982331b" UNIQUE ("commission_payment_id"), CONSTRAINT "PK_388a4f61629b638753d82078d60" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2ba9a2e4a42bbaf75eab9b3741" ON "driver_ledger"  ("booking_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_c4fb74c474afe6a77b2b5c1a83" ON "driver_ledger"  ("driver_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."commission_payments_status_enum" AS ENUM('pending', 'paid', 'failed')`);
        await queryRunner.query(`CREATE TABLE "commission_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_id" character varying NOT NULL, "amount" numeric(10,2) NOT NULL, "status" "public"."commission_payments_status_enum" NOT NULL DEFAULT 'pending', "merchant_order_id" character varying(64) NOT NULL, "gateway_session_id" character varying, "paid_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_acd76a7c1fc7895415bf945ae17" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d8a7ce199a4b8ced13c76c3bd5" ON "commission_payments"  ("merchant_order_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_eff0903946eb5806cdad1697ed" ON "commission_payments"  ("driver_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "driver_ledger" ADD CONSTRAINT "FK_318d68bbd0154a21ecd04f7d81f" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "driver_ledger" DROP CONSTRAINT "FK_318d68bbd0154a21ecd04f7d81f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eff0903946eb5806cdad1697ed"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d8a7ce199a4b8ced13c76c3bd5"`);
        await queryRunner.query(`DROP TABLE "commission_payments"`);
        await queryRunner.query(`DROP TYPE "public"."commission_payments_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c4fb74c474afe6a77b2b5c1a83"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2ba9a2e4a42bbaf75eab9b3741"`);
        await queryRunner.query(`DROP TABLE "driver_ledger"`);
        await queryRunner.query(`DROP TYPE "public"."driver_ledger_type_enum"`);
    }

}
