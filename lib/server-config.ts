import fs from 'fs';
import { error } from './logger';
import path from 'path';
import { ChainConfig, TradingPair, ConfigData } from './types';

// Path to the config file. Config is baked into the image from lib/config.json;
// UI edits are written back to the container filesystem (ephemeral — commit
// lib/config.json to persist them across deploys). CONFIG_PATH can still
// override the location if needed.
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(process.cwd(), 'lib/config.json');
const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'lib/config.json');

function ensureConfigFile() {
    if (fs.existsSync(CONFIG_PATH)) {
        return;
    }

    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });

    if (CONFIG_PATH !== DEFAULT_CONFIG_PATH && fs.existsSync(DEFAULT_CONFIG_PATH)) {
        fs.copyFileSync(DEFAULT_CONFIG_PATH, CONFIG_PATH);
    }
}

// Read Config (Server Side)
export function getConfig(): ConfigData {

    try {
        ensureConfigFile();
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
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        error('Failed to save config file:', err);
        throw error;
    }
}
