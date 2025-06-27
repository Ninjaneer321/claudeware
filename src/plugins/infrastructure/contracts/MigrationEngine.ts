import type { Database } from 'better-sqlite3';
import { IContractEvolution, IMigrationStep, IMigrationContext } from '../interfaces/contracts/IContractEvolution';
import { IEvolutionOptions, IEvolutionResult } from '../interfaces/contracts/IContractManager';

/**
 * Executes contract migrations and schema evolutions
 */
export class MigrationEngine {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Execute a contract evolution
   */
  async execute(
    evolution: IContractEvolution,
    context: IMigrationContext,
    options?: IEvolutionOptions
  ): Promise<IEvolutionResult> {
    const startTime = Date.now();
    const executedSteps: string[] = [];
    let currentStep = 0;
    let error: Error | undefined;
    let rolledBack = false;

    try {
      // Pre-check validation
      if (evolution.preCheck) {
        context.log('Running pre-migration checks...');
        const preCheckPassed = await evolution.preCheck(context);
        if (!preCheckPassed) {
          throw new Error('Pre-migration validation failed');
        }
      }

      // Begin transaction if requested
      if (options?.transactional && !options.dryRun) {
        this.db.exec('BEGIN TRANSACTION');
      }

      // Execute each migration step
      for (const [index, step] of evolution.migrations.entries()) {
        currentStep = index + 1;

        // Progress callback
        if (options?.onProgress) {
          options.onProgress(currentStep, evolution.migrations.length, step.description);
        }

        // Log step
        context.log(`Step ${currentStep}/${evolution.migrations.length}: ${step.description}`);

        if (options?.dryRun) {
          context.log(`[DRY RUN] Would execute: ${step.sql || 'custom handler'}`);
        } else {
          await this.executeStep(step, context);
        }

        executedSteps.push(step.description);
      }

      // Post-check validation
      if (evolution.postCheck && !options?.dryRun) {
        context.log('Running post-migration checks...');
        const postCheckPassed = await evolution.postCheck(context);
        if (!postCheckPassed) {
          throw new Error('Post-migration validation failed');
        }
      }

      // Commit transaction
      if (options?.transactional && !options?.dryRun) {
        this.db.exec('COMMIT');
      }

      return {
        success: true,
        executedSteps: executedSteps.length,
        totalSteps: evolution.migrations.length,
        duration: Date.now() - startTime,
        log: []
      };

    } catch (err) {
      error = err as Error;
      context.log(`Error in step ${currentStep}: ${error.message}`);

      // Attempt rollback if in transaction
      if (options?.transactional && !options?.dryRun) {
        try {
          context.log('Rolling back transaction...');
          this.db.exec('ROLLBACK');
          rolledBack = true;
        } catch (rollbackErr) {
          context.log(`Rollback failed: ${(rollbackErr as Error).message}`);
        }
      }

      // Attempt step-by-step rollback if not transactional
      if (!options?.transactional && !options?.dryRun && executedSteps.length > 0) {
        rolledBack = await this.attemptRollback(
          evolution.migrations.slice(0, executedSteps.length),
          context
        );
      }

      return {
        success: false,
        executedSteps: executedSteps.length,
        totalSteps: evolution.migrations.length,
        duration: Date.now() - startTime,
        error,
        rolledBack,
        log: []
      };
    }
  }

  /**
   * Execute a single migration step
   */
  private async executeStep(step: IMigrationStep, context: IMigrationContext): Promise<void> {
    if (step.sql) {
      // Execute SQL
      await context.query(step.sql);
    } else if (step.handler) {
      // Execute custom handler
      await step.handler(context);
    } else {
      throw new Error('Migration step must have either sql or handler');
    }
  }

  /**
   * Attempt to rollback executed steps
   */
  private async attemptRollback(
    executedSteps: IMigrationStep[],
    context: IMigrationContext
  ): Promise<boolean> {
    context.log('Attempting to rollback executed steps...');

    // Rollback in reverse order
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const step = executedSteps[i];

      if (!step.reversible) {
        context.log(`Step "${step.description}" is not reversible`);
        return false;
      }

      try {
        if (typeof step.rollback === 'string') {
          await context.query(step.rollback);
        } else if (typeof step.rollback === 'function') {
          await step.rollback(context);
        } else {
          context.log(`No rollback defined for step "${step.description}"`);
          return false;
        }

        context.log(`Rolled back: ${step.description}`);
      } catch (err) {
        context.log(`Failed to rollback "${step.description}": ${(err as Error).message}`);
        return false;
      }
    }

    context.log('Rollback completed successfully');
    return true;
  }
}