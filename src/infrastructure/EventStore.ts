import { pool } from '../db';
import { EventMetadata } from '../domain/types';

export class EventStore {
    /**
     * Appends a list of events to the event store.
     * Uses a transaction to guarantee atomicity.
     * The database's UNIQUE constraint on (aggregate_id, event_number) ensures optimistic concurrency.
     */
    async appendEvents(events: EventMetadata[]): Promise<void> {
        if (events.length === 0) return;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const queryText = `
                INSERT INTO events (event_id, aggregate_id, aggregate_type, event_type, event_data, event_number, version)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;

            for (const event of events) {
                await client.query(queryText, [
                    event.eventId,
                    event.aggregateId,
                    event.aggregateType,
                    event.eventType,
                    event.eventData,
                    event.eventNumber,
                    event.version || 1
                ]);
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
     * Retrieves all events for a given aggregate.
     * Supports fetching events starting from a specific event number (useful when restoring from snapshot).
     */
    async getEvents(aggregateId: string, fromEventNumber: number = 0): Promise<EventMetadata[]> {
        const queryText = `
            SELECT * FROM events
            WHERE aggregate_id = $1 AND event_number > $2
            ORDER BY event_number ASC
        `;
        const result = await pool.query(queryText, [aggregateId, fromEventNumber]);

        return result.rows.map(row => ({
            eventId: row.event_id,
            aggregateId: row.aggregate_id,
            aggregateType: row.aggregate_type,
            eventType: row.event_type,
            eventData: row.event_data,
            eventNumber: row.event_number,
            timestamp: row.timestamp,
            version: row.version
        }));
    }

    /**
     * Retrieves events for time-travel queries up to a specific timestamp.
     */
    async getEventsToTimestamp(aggregateId: string, timestamp: Date): Promise<EventMetadata[]> {
        const queryText = `
            SELECT * FROM events
            WHERE aggregate_id = $1 AND timestamp <= $2
            ORDER BY event_number ASC
        `;
        const result = await pool.query(queryText, [aggregateId, timestamp]);

        return result.rows.map(row => ({
            eventId: row.event_id,
            aggregateId: row.aggregate_id,
            aggregateType: row.aggregate_type,
            eventType: row.event_type,
            eventData: row.event_data,
            eventNumber: row.event_number,
            timestamp: row.timestamp,
            version: row.version
        }));
    }

    /**
     * Retrieves ALL events from the event store. Used for rebuilding projections.
     */
    async getAllEvents(): Promise<EventMetadata[]> {
        const queryText = `
            SELECT * FROM events
            ORDER BY timestamp ASC, event_number ASC
        `;
        // In a real system you'd use a cursor for huge data, but for this project this is fine
        const result = await pool.query(queryText);
        return result.rows.map(row => ({
            eventId: row.event_id,
            aggregateId: row.aggregate_id,
            aggregateType: row.aggregate_type,
            eventType: row.event_type,
            eventData: row.event_data,
            eventNumber: row.event_number,
            timestamp: row.timestamp,
            version: row.version
        }));
    }

    async getEventCount(): Promise<number> {
        const result = await pool.query('SELECT COUNT(*) as count FROM events');
        return parseInt(result.rows[0].count, 10);
    }
}
