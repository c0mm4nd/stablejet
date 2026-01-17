import fs from 'fs';
import { error } from './logger';
import path from 'path';
import { ChainConfig, TradingPair, ConfigData } from './types';

// Path to the config file
const CONFIG_PATH = path.join(process.cwd(), 'lib/config.json');

// Read Config (Server Side)
export function getConfig(): ConfigData {

    try {
        const fileContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(fileContent);
    } catch (err) {
        error('Failed to read config file, falling back to empty/default:', err);
        // Fallback or throw
        throw new Error('Could not load configuration');
    }
}

// Save Config (Server Side)
export function saveConfig(data: ConfigData): void {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        error('Failed to save config file:', err);
        throw error;
    }
}
