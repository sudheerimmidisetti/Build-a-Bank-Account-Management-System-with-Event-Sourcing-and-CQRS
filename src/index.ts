import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { commandRouter } from './api/commandHandlers';
import { queryRouter } from './api/queryHandlers';
import { pool } from './db';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', commandRouter);
app.use('/api', queryRouter);

// Health check endpoint required by docker-compose
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).send('OK');
    } catch (e) {
        res.status(500).send('Database connection failed');
    }
});

const PORT = process.env.API_PORT || 8080;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
