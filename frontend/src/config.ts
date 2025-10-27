// Empty string means same origin (when served from backend)
// Otherwise use the env variable or default to localhost:8000
export const API_URL = process.env.REACT_APP_API_URL === undefined
    ? 'http://localhost:8000'
    : process.env.REACT_APP_API_URL;

console.log('API URL configured as:', API_URL || 'same origin');