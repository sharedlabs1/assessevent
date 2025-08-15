// Fix MySQL Connection - Run this script to diagnose and fix connection issues
// Run with: node fix-connection.js

const fs = require('fs');
const mysql = require('mysql2/promise');

console.log('🔧 LTIMindtree Assessment Platform - Connection Fix Tool\n');

// Function to create .env file with correct password
function createEnvFile(password) {
    const envContent = `# LTIMindtree Assessment Platform - Environment Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=${password}
DB_NAME=ltimindtree_assessments
JWT_SECRET=ltimindtree_secret_key_2024
PORT=3000
NODE_ENV=development
`;
    
    fs.writeFileSync('.env', envContent);
    console.log('✅ Created .env file with your password');
}

// Function to test MySQL connection
async function testConnection(password) {
    try {
        console.log(`🔍 Testing connection with password: ${password}`);
        
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: password
        });
        
        await connection.execute('SELECT 1');
        await connection.end();
        
        console.log('✅ MySQL connection successful!');
        return true;
    } catch (error) {
        console.log(`❌ Connection failed: ${error.message}`);
        return false;
    }
}

// Main function
async function fixConnection() {
    console.log('Step 1: Testing your known password...');
    const yourPassword = 'X9085565r@';
    
    const connectionWorked = await testConnection(yourPassword);
    
    if (connectionWorked) {
        console.log('\nStep 2: Creating .env file with correct password...');
        createEnvFile(yourPassword);
        
        console.log('\nStep 3: Testing with .env file...');
        require('dotenv').config();
        
        if (process.env.DB_PASSWORD === yourPassword) {
            console.log('✅ .env file is correctly configured');
            console.log('\n🎉 Connection issue fixed!');
            console.log('\nNow run: node server.js');
        } else {
            console.log('❌ .env file not loaded correctly');
        }
    } else {
        console.log('\n❌ Cannot connect with the provided password');
        console.log('\n🔧 Troubleshooting steps:');
        console.log('1. Make sure MySQL service is running');
        console.log('2. Try connecting manually: mysql -u root -p');
        console.log('3. If you forgot the password, reset it:');
        console.log('   - Stop MySQL service');
        console.log('   - Start MySQL with: mysqld --skip-grant-tables');
        console.log('   - Connect and reset: ALTER USER "root"@"localhost" IDENTIFIED BY "newpassword";');
    }
}

// Check if dependencies are installed
try {
    require('mysql2');
    require('dotenv');
    fixConnection();
} catch (error) {
    console.log('❌ Required packages not installed');
    console.log('Run: npm install mysql2 dotenv');
    console.log('Then run this script again');
}