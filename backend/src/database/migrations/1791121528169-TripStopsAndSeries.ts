import { MigrationInterface, QueryRunner } from "typeorm";

export class TripStopsAndSeries1791121528169 implements MigrationInterface {
    name = 'TripStopsAndSeries1791121528169'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trips" ADD "stops" jsonb`);
        await queryRunner.query(`ALTER TABLE "trips" ADD "series_id" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_9da4a819101cf939b1e92449ba" ON "trips"  ("series_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_9da4a819101cf939b1e92449ba"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN "series_id"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN "stops"`);
    }

}
