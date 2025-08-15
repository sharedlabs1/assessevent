// Quick database test
require('dotenv').config();
const mysql = require('mysql2/promise');

async function quickTest() {
    console.log('Quick DB Test...');
    try {
        // Connect directly with database specified
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'ltimindtree_assessments',
            // Add this to handle MySQL 8.0 authentication
            authPlugins: {
                mysql_native_password: () => () => Buffer.alloc(0),
            }
        });
        
        console.log('✅ Connected successfully!');
        
        // Test query
        const [result] = await connection.query('SELECT 1 as test');
        console.log('✅ Query test:', result);
        
        await connection.end();
        console.log('✅ Connection closed properly');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code === 'ER_BAD_DB_ERROR') {
            console.log('📝 Database does not exist. This is expected on first run.');
        }
    }
}

quickTest();
