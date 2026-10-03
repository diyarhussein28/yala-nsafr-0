import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import databaseConfig from '../config/database.config';

// Used by the TypeORM CLI (migration:generate / run / revert). The app itself builds its
// connection from the same databaseConfig through Nest's ConfigModule.
loadEnv();

export default new DataSource(databaseConfig() as DataSourceOptions);
