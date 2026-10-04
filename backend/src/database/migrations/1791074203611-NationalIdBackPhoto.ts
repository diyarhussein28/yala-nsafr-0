import { MigrationInterface, QueryRunner } from "typeorm";

export class NationalIdBackPhoto1791074203611 implements MigrationInterface {
    name = 'NationalIdBackPhoto1791074203611'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "national_id_back_photo_url" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "national_id_back_photo_url"`);
    }

}
