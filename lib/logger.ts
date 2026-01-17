export function log(...args: any[]) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}]`, ...args);
}

export function error(...args: any[]) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}]`, ...args);
}

export function warn(...args: any[]) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}]`, ...args);
}
