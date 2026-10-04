import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('Exclusive');
let dataSource: DataSource | null = null;

/** Registers the DataSource the @Exclusive decorator locks through. */
@Injectable()
export class JobLockRegistrar implements OnModuleInit {
  constructor(private readonly ds: DataSource) {}
  onModuleInit() {
    dataSource = this.ds;
  }
}

/** Stable 32-bit key for a job name (FNV-1a), used as the advisory-lock id. */
function lockKey(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/**
 * Runs a scheduled job on one instance at a time.
 *
 * Every API instance runs every @Cron. With more than one instance, each reminder,
 * capture retry, SLA ruling and payout reconciliation would run once per instance —
 * duplicate notifications at best, duplicate gateway calls at worst. The job takes a
 * PostgreSQL transaction-level advisory lock (the database is the one thing all
 * instances share, so no extra infrastructure is needed); an instance that cannot get
 * the lock skips that run, and the lock is released when the job finishes.
 */
export function Exclusive(name?: string): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const job = name ?? `${target.constructor.name}.${String(propertyKey)}`;
    const key = lockKey(job);

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      if (!dataSource?.isInitialized) return original.apply(this, args);

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        const [{ locked }] = await runner.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [key]);
        if (!locked) {
          logger.debug(`${job} already running on another instance — skipped`);
          await runner.commitTransaction();
          return undefined;
        }
        try {
          return await original.apply(this, args);
        } finally {
          await runner.commitTransaction();
        }
      } finally {
        await runner.release();
      }
    };
    return descriptor;
  };
}
