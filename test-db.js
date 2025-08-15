// Simple database connection test
require('dotenv').config();

console.log('🔍 Testing Database Connection...');
console.log('DB_HOST:', process.env.DB_HOST || 'NOT SET');
console.log('DB_USER:', process.env.DB_USER || 'NOT SET');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET (length: ' + process.env.DB_PASSWORD.length + ')' : 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME || 'NOT SET');

const mysql = require('mysql2/promise');

async function testConnection() {
    try {
        console.log('Attempting to connect to MySQL...');
        
        // First, connect without specifying database
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
        });
        
        console.log('✅ MySQL connection successful!');
        
        // Check if database exists using a simple query instead of USE command
        const databaseName = process.env.DB_NAME || 'ltimindtree_assessments';
        console.log(`🔍 Checking if database '${databaseName}' exists...`);
        
        const [databases] = await connection.query('SHOW DATABASES LIKE ?', [databaseName]);
        
        if (databases.length === 0) {
            console.log(`⚠️ Database '${databaseName}' does not exist. Creating it...`);
            await connection.query(`CREATE DATABASE \`${databaseName}\``);
            console.log(`✅ Database '${databaseName}' created successfully!`);
        } else {
            console.log(`✅ Database '${databaseName}' already exists!`);
        }
        
        // Close the connection and create a new one with the database specified
        await connection.end();
        
        // Now connect directly to the specific database
        const dbConnection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: databaseName,
        });
        
        console.log(`✅ Connected to database '${databaseName}' successfully!`);
        
        // Test a simple query
        const [tables] = await dbConnection.query('SHOW TABLES');
        console.log(`📊 Found ${tables.length} tables in database`);
        
        if (tables.length > 0) {
            console.log('📋 Existing tables:');
            tables.forEach(table => {
                console.log(`  - ${Object.values(table)[0]}`);
            });
        }
        
        await dbConnection.end();
        console.log('✅ Database connection test completed successfully!');
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('Full error:', error);
    }
}

testConnection();
