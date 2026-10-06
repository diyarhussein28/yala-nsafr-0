import { MigrationInterface, QueryRunner } from "typeorm";

export class DriverSelfieAndVerifiedPassengers1791248585424 implements MigrationInterface {
    name = 'DriverSelfieAndVerifiedPassengers1791248585424'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trips" ADD "require_verified_passengers" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "users" ADD "selfie_photo_url" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "selfie_photo_url"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN "require_verified_passengers"`);
    }

}
