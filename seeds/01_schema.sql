-- 01_schema.sql
-- Create events table
CREATE TABLE IF NOT EXISTS events (
    event_id UUID PRIMARY KEY NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    event_data JSONB NOT NULL,
    event_number INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT unique_aggregate_event UNIQUE (aggregate_id, event_number)
);

CREATE INDEX IF NOT EXISTS idx_events_aggregate_id ON events (aggregate_id);

-- Create snapshots table
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id UUID PRIMARY KEY NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL UNIQUE,
    snapshot_data JSONB NOT NULL,
    last_event_number INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_id ON snapshots (aggregate_id);

-- Create account_summaries table
CREATE TABLE IF NOT EXISTS account_summaries (
    account_id VARCHAR(255) PRIMARY KEY NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    balance DECIMAL(19, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(50) NOT NULL,
    version BIGINT NOT NULL
);

-- Create transaction_history table
CREATE TABLE IF NOT EXISTS transaction_history (
    transaction_id VARCHAR(255) PRIMARY KEY NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    description TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL
);
