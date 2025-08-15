#!/usr/bin/env node
// Simple server starter with error handling
require('dotenv').config();

console.log('🚀 Starting LTIMindtree Assessment Platform...');
console.log('================================================');

// Check environment variables
if (!process.env.DB_PASSWORD) {
    console.error('❌ ERROR: DB_PASSWORD not found in .env file');
    console.error('Please check your .env file exists and contains DB_PASSWORD=X9085565r@');
    process.exit(1);
}

console.log('✅ Environment variables loaded');
console.log('🔍 DB_HOST:', process.env.DB_HOST);
console.log('🔍 DB_USER:', process.env.DB_USER);
console.log('🔍 DB_NAME:', process.env.DB_NAME);

// Try to start the main server
try {
    require('./server.js');
} catch (error) {
    console.error('❌ Failed to start server:', error.message);
    console.error('Full error:', error);
    process.exit(1);
}
