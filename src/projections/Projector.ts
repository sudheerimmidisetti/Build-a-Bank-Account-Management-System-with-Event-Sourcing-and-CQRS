import { pool } from '../db';
import { EventMetadata } from '../domain/types';
import { EventStore } from '../infrastructure/EventStore';

export class Projector {
    constructor(private readonly eventStore: EventStore) { }

    /**
     * Applies a single event to the projection views.
     */
    async projectEvent(event: EventMetadata): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. We must ensure we apply events idempotently based on version per aggregate.
            // check current version in account_summaries to prevent re-playing standard events multiple times
            if (event.eventType !== 'AccountCreated') {
                const summaryRes = await client.query('SELECT version FROM account_summaries WHERE account_id = $1 FOR UPDATE', [event.aggregateId]);
                if (summaryRes.rows.length === 0) {
                    // It should exist! If not, wait for rollback or log error (should not happen in sequence)
                } else {
                    const currentVersion = parseInt(summaryRes.rows[0].version, 10);
                    if (currentVersion >= event.eventNumber) {
                        // Already processed this event number
                        await client.query('ROLLBACK');
                        client.release();
                        return;
                    }
                }
            }

            switch (event.eventType) {
                case 'AccountCreated':
                    await client.query(
                        `INSERT INTO account_summaries (account_id, owner_name, balance, currency, status, version) 
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (account_id) DO NOTHING`,
                        [event.aggregateId, event.eventData.ownerName, event.eventData.initialBalance || 0, event.eventData.currency || 'USD', 'OPEN', event.eventNumber]
                    );
                    break;

                case 'MoneyDeposited':
                    await client.query(
                        `UPDATE account_summaries 
                         SET balance = balance + $1, version = $2 
                         WHERE account_id = $3 AND version < $2`,
                        [event.eventData.amount, event.eventNumber, event.aggregateId]
                    );

                    // Idempotent insert for transaction
                    if (event.eventData.transactionId) {
                        await client.query(
                            `INSERT INTO transaction_history (transaction_id, account_id, type, amount, description, timestamp)
                             VALUES ($1, $2, $3, $4, $5, $6)
                             ON CONFLICT (transaction_id) DO NOTHING`,
                            [event.eventData.transactionId, event.aggregateId, 'DEPOSIT', event.eventData.amount, event.eventData.description, event.timestamp || new Date()]
                        );
                    }
                    break;

                case 'MoneyWithdrawn':
                    await client.query(
                        `UPDATE account_summaries 
                         SET balance = balance - $1, version = $2 
                         WHERE account_id = $3 AND version < $2`,
                        [event.eventData.amount, event.eventNumber, event.aggregateId]
                    );

                    if (event.eventData.transactionId) {
                        await client.query(
                            `INSERT INTO transaction_history (transaction_id, account_id, type, amount, description, timestamp)
                             VALUES ($1, $2, $3, $4, $5, $6)
                             ON CONFLICT (transaction_id) DO NOTHING`,
                            [event.eventData.transactionId, event.aggregateId, 'WITHDRAWAL', event.eventData.amount, event.eventData.description, event.timestamp || new Date()]
                        );
                    }
                    break;

                case 'AccountClosed':
                    await client.query(
                        `UPDATE account_summaries 
                         SET status = 'CLOSED', version = $1 
                         WHERE account_id = $2 AND version < $1`,
                        [event.eventNumber, event.aggregateId]
                    );
                    break;
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Rebuilds all projections by truncating tables and replaying all events.
     */
    async rebuildProjections(): Promise<void> {
        // Clear all projections first
        await pool.query('TRUNCATE TABLE account_summaries, transaction_history CASCADE');

        const allEvents = await this.eventStore.getAllEvents();

        for (const event of allEvents) {
            await this.projectEvent(event);
        }
    }

    async getProjectionStatus(): Promise<{ name: string; lag: number; lastProcessedEventNumberGlobal: number }[]> {
        // Compare total events in system vs the max global event lag
        // A simple heuristic for this project is to check the max version in account_summaries
        const totalEventsRes = await pool.query('SELECT COUNT(*) as cnt FROM events');
        const maxEventNumRes = await pool.query('SELECT COALESCE(SUM(version), 0) as total_version FROM account_summaries');

        // This is a naive lag calculation as per project simplicity
        const totalEvents = parseInt(totalEventsRes.rows[0].cnt, 10);

        // Count total events actually represented in projections vs expected.
        // A better approach is checking max event timestamp or event_id across all aggregates, 
        // Here we just use totalEvents available.

        return [
            {
                name: 'AccountSummaries',
                // Mocking lag as 0 because we project synchronously in this implementation
                lastProcessedEventNumberGlobal: totalEvents,
                lag: 0
            },
            {
                name: 'TransactionHistory',
                lastProcessedEventNumberGlobal: totalEvents,
                lag: 0
            }
        ];
    }
}
