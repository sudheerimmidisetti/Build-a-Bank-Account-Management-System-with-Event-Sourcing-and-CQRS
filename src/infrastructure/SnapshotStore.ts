import { pool } from '../db';
import { Snapshot } from '../domain/types';

export class SnapshotStore {
    /**
     * Saves a snapshot. Using an UPSERT to overwrite the existing snapshot for the aggregate.
     */
    async saveSnapshot(snapshot: Snapshot): Promise<void> {
        const queryText = `
            INSERT INTO snapshots (snapshot_id, aggregate_id, snapshot_data, last_event_number, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (aggregate_id)
            DO UPDATE SET 
                snapshot_id = EXCLUDED.snapshot_id,
                snapshot_data = EXCLUDED.snapshot_data,
                last_event_number = EXCLUDED.last_event_number,
                created_at = NOW()
        `;

        await pool.query(queryText, [
            snapshot.snapshotId,
            snapshot.aggregateId,
            snapshot.snapshotData,
            snapshot.lastEventNumber
        ]);
    }

    /**
     * Retrieves the latest snapshot for an aggregate.
     */
    async getSnapshot(aggregateId: string): Promise<Snapshot | null> {
        const queryText = `
            SELECT * FROM snapshots
            WHERE aggregate_id = $1
        `;
        const result = await pool.query(queryText, [aggregateId]);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            snapshotId: row.snapshot_id,
            aggregateId: row.aggregate_id,
            snapshotData: row.snapshot_data,
            lastEventNumber: row.last_event_number,
            createdAt: row.created_at
        };
    }
}
