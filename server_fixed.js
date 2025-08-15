// LTIMindtree Assessment Platform - MySQL Backend API
// Run with: node server.js

// CRITICAL: Load environment variables FIRST before anything else
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ltimindtree_assessment_secret_2024';

// Debug: Show what environment variables are loaded
console.log('🔍 Environment Debug Information:');
console.log('DB_HOST:', process.env.DB_HOST || 'NOT SET');
console.log('DB_USER:', process.env.DB_USER || 'NOT SET');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET (length: ' + process.env.DB_PASSWORD.length + ')' : 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME || 'NOT SET');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting for API protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use(limiter);

// MySQL Connection Configuration - Fixed for your password
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'ltimindtree_assessments',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: false
};

console.log('🔄 Connecting to MySQL...');
console.log('📍 Host:', dbConfig.host);
console.log('👤 User:', dbConfig.user);
console.log('🔑 Password:', dbConfig.password ? `SET (length: ${dbConfig.password.length})` : 'NOT SET');
console.log('🗃️ Database:', dbConfig.database);

// CRITICAL CHECK: Ensure password is set
if (!dbConfig.password) {
  console.error('❌ CRITICAL ERROR: Database password is not set!');
  console.error('🔧 Troubleshooting steps:');
  console.error('1. Check if .env file exists in the same folder as server.js');
  console.error('2. Verify .env file contains: DB_PASSWORD=X9085565r@');
  console.error('3. Make sure there are no extra spaces or quotes around the password');
  process.exit(1);
}

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Database initialization
async function initializeDatabase() {
  try {
    console.log('🔄 Attempting database connection...');
    const connection = await pool.getConnection();
    console.log('✅ MySQL connection successful!');
    
    // Create database if it doesn't exist
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    console.log('📊 Database created/verified');
    
    await connection.execute(`USE ${dbConfig.database}`);
    console.log('🎯 Using database:', dbConfig.database);
    
    // Create quizzes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        questions JSON NOT NULL,
        points_per_question INT DEFAULT 1,
        is_custom BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at)
      )
    `);
    console.log('📋 Quizzes table created/verified');
    
    // Create results table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS assessment_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        assessment_track VARCHAR(255) NOT NULL,
        track_id VARCHAR(50) NOT NULL,
        login_date_time DATETIME NOT NULL,
        completion_time DATETIME NOT NULL,
        max_score INT NOT NULL,
        achieved_score INT NOT NULL,
        total_questions INT NOT NULL,
        duration_seconds INT NOT NULL,
        answers JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_track_id (track_id),
        INDEX idx_completion_time (completion_time),
        INDEX idx_created_at (created_at)
      )
    `);
    console.log('📊 Results table created/verified');
    
    // Create admin users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('👥 Admin users table created/verified');
    
    // Insert default admin user if not exists
    const adminPassword = await bcrypt.hash('ltimindtree2024', 10);
    await connection.execute(`
      INSERT IGNORE INTO admin_users (username, password_hash) 
      VALUES ('admin', ?)
    `, [adminPassword]);
    console.log('🔑 Default admin user ensured');
    
    // Insert default quizzes if table is empty
    const [quizCount] = await connection.execute('SELECT COUNT(*) as count FROM quizzes');
    if (quizCount[0].count === 0) {
      await insertDefaultQuizzes(connection);
      console.log('📚 Default quizzes inserted');
    } else {
      console.log('📚 Existing quizzes found:', quizCount[0].count);
    }
    
    connection.release();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    console.error('💡 Troubleshooting tips:');
    console.error('   1. Check if MySQL service is running');
    console.error('   2. Verify your password by running: mysql -u root -pX9085565r@');
    console.error('   3. Check if .env file has the correct password');
    process.exit(1);
  }
}

// Insert default quiz data
async function insertDefaultQuizzes(connection) {
  const defaultQuizzes = [
    {
      id: 'javascript',
      name: 'JavaScript Fundamentals',
      description: 'Test your knowledge of JavaScript basics and ES6+ features',
      questions: [
        {
          question: 'What is the correct way to declare a variable in JavaScript?',
          options: ['var myVar = 5;', 'variable myVar = 5;', 'v myVar = 5;', 'declare myVar = 5;'],
          correct: 0
        },
        {
          question: 'Which method is used to add an element to the end of an array?',
          options: ['append()', 'push()', 'add()', 'insert()'],
          correct: 1
        },
        {
          question: 'What does "===" operator do in JavaScript?',
          options: ['Assignment', 'Equality without type checking', 'Strict equality with type checking', 'Not equal'],
          correct: 2
        },
        {
          question: 'Which of the following is NOT a JavaScript data type?',
          options: ['Number', 'String', 'Boolean', 'Float'],
          correct: 3
        },
        {
          question: 'What is the output of: console.log(typeof null)?',
          options: ['null', 'undefined', 'object', 'boolean'],
          correct: 2
        }
      ],
      points_per_question: 1,
      is_custom: false
    },
    {
      id: 'python',
      name: 'Python Programming',
      description: 'Assess your Python programming skills and best practices',
      questions: [
        {
          question: 'Which of the following is the correct way to create a list in Python?',
          options: ['list = []', 'list = ()', 'list = {}', 'list = ""'],
          correct: 0
        },
        {
          question: 'What is the output of: print(3 ** 2)?',
          options: ['6', '9', '32', 'Error'],
          correct: 1
        },
        {
          question: 'Which keyword is used to define a function in Python?',
          options: ['function', 'def', 'define', 'func'],
          correct: 1
        },
        {
          question: 'What does the len() function do?',
          options: ['Returns the length of an object', 'Creates a new list', 'Sorts a list', 'Removes duplicates'],
          correct: 0
        },
        {
          question: 'Which of the following is used for comments in Python?',
          options: ['//', '/* */', '#', '<!-- -->'],
          correct: 2
        }
      ],
      points_per_question: 1,
      is_custom: false
    },
    {
      id: 'react',
      name: 'React Development',
      description: 'Test your React.js knowledge and component-based development',
      questions: [
        {
          question: 'What is JSX in React?',
          options: ['A JavaScript library', 'A syntax extension for JavaScript', 'A CSS framework', 'A database'],
          correct: 1
        },
        {
          question: 'Which hook is used to manage state in functional components?',
          options: ['useEffect', 'useState', 'useContext', 'useReducer'],
          correct: 1
        },
        {
          question: 'What is the virtual DOM?',
          options: ['A real DOM element', 'A JavaScript representation of the real DOM', 'A CSS property', 'A React component'],
          correct: 1
        },
        {
          question: 'How do you pass data from parent to child component?',
          options: ['Using state', 'Using props', 'Using context', 'Using refs'],
          correct: 1
        },
        {
          question: 'What is the purpose of useEffect hook?',
          options: ['To manage state', 'To handle side effects', 'To create components', 'To style components'],
          correct: 1
        }
      ],
      points_per_question: 1,
      is_custom: false
    }
  ];
  
  for (const quiz of defaultQuizzes) {
    await connection.execute(`
      INSERT INTO quizzes (id, name, description, questions, points_per_question, is_custom)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [quiz.id, quiz.name, quiz.description, JSON.stringify(quiz.questions), quiz.points_per_question, quiz.is_custom]);
  }
}

// Admin authentication middleware
async function authenticateAdmin(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const [users] = await pool.execute(
      'SELECT * FROM admin_users WHERE username = ?',
      [username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, username: user.username });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all quizzes
app.get('/api/quizzes', async (req, res) => {
  try {
    const [quizzes] = await pool.execute('SELECT * FROM quizzes ORDER BY created_at DESC');
    
    const formattedQuizzes = {};
    quizzes.forEach(quiz => {
      formattedQuizzes[quiz.id] = {
        name: quiz.name,
        description: quiz.description,
        questions: JSON.parse(quiz.questions),
        pointsPerQuestion: quiz.points_per_question,
        isCustom: quiz.is_custom
      };
    });
    
    res.json(formattedQuizzes);
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
});

// Get specific quiz
app.get('/api/quizzes/:id', async (req, res) => {
  try {
    const [quizzes] = await pool.execute(
      'SELECT * FROM quizzes WHERE id = ?',
      [req.params.id]
    );
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    res.json({
      name: quiz.name,
      description: quiz.description,
      questions: JSON.parse(quiz.questions),
      pointsPerQuestion: quiz.points_per_question,
      isCustom: quiz.is_custom
    });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz' });
  }
});

// Create new quiz (Admin only)
app.post('/api/quizzes', authenticateAdmin, async (req, res) => {
  try {
    const { id, name, description, questions, pointsPerQuestion } = req.body;
    
    // Validate required fields
    if (!id || !name || !description || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if quiz already exists
    const [existing] = await pool.execute('SELECT id FROM quizzes WHERE id = ?', [id]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Quiz ID already exists' });
    }
    
    // Insert new quiz
    await pool.execute(`
      INSERT INTO quizzes (id, name, description, questions, points_per_question, is_custom)
      VALUES (?, ?, ?, ?, ?, TRUE)
    `, [id, name, description, JSON.stringify(questions), pointsPerQuestion || 1]);
    
    res.status(201).json({ message: 'Quiz created successfully' });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ error: 'Failed to create quiz' });
  }
});

// Update quiz (Admin only)
app.put('/api/quizzes/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, questions, pointsPerQuestion } = req.body;
    
    const [result] = await pool.execute(`
      UPDATE quizzes 
      SET name = ?, description = ?, questions = ?, points_per_question = ?
      WHERE id = ? AND is_custom = TRUE
    `, [name, description, JSON.stringify(questions), pointsPerQuestion || 1, req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Quiz not found or cannot be modified' });
    }
    
    res.json({ message: 'Quiz updated successfully' });
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
});

// Delete quiz (Admin only)
app.delete('/api/quizzes/:id', authenticateAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM quizzes WHERE id = ? AND is_custom = TRUE',
      [req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Quiz not found or cannot be deleted' });
    }
    
    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});

// Submit assessment result
app.post('/api/results', async (req, res) => {
  try {
    const {
      name,
      email,
      assessmentTrack,
      trackId,
      loginDateTime,
      completionTime,
      maxScore,
      achievedScore,
      totalQuestions,
      duration,
      answers
    } = req.body;
    
    // Validate required fields
    if (!name || !email || !assessmentTrack || !trackId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate email format (LTIMindtree only)
    if (!email.endsWith('@ltimindtree.com')) {
      return res.status(400).json({ error: 'Only LTIMindtree email addresses are allowed' });
    }
    
    await pool.execute(`
      INSERT INTO assessment_results (
        name, email, assessment_track, track_id, login_date_time, 
        completion_time, max_score, achieved_score, total_questions, 
        duration_seconds, answers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, email, assessmentTrack, trackId, 
      new Date(loginDateTime), new Date(completionTime),
      maxScore, achievedScore, totalQuestions, duration,
      JSON.stringify(answers)
    ]);
    
    res.status(201).json({ message: 'Result saved successfully' });
  } catch (error) {
    console.error('Save result error:', error);
    res.status(500).json({ error: 'Failed to save result' });
  }
});

// Get all results (Admin only)
app.get('/api/results', authenticateAdmin, async (req, res) => {
  try {
    const [results] = await pool.execute(`
      SELECT * FROM assessment_results 
      ORDER BY completion_time DESC
    `);
    
    const formattedResults = results.map(result => ({
      name: result.name,
      email: result.email,
      assessmentTrack: result.assessment_track,
      trackId: result.track_id,
      loginDateTime: result.login_date_time.toISOString(),
      completionTime: result.completion_time.toISOString(),
      maxScore: result.max_score,
      achievedScore: result.achieved_score,
      totalQuestions: result.total_questions,
      duration: result.duration_seconds,
      answers: JSON.parse(result.answers || '[]')
    }));
    
    res.json(formattedResults);
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Get recent results (last 2 hours)
app.get('/api/results/recent', authenticateAdmin, async (req, res) => {
  try {
    const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000));
    
    const [results] = await pool.execute(`
      SELECT * FROM assessment_results 
      WHERE completion_time >= ?
      ORDER BY completion_time DESC
    `, [twoHoursAgo]);
    
    const formattedResults = results.map(result => ({
      name: result.name,
      email: result.email,
      assessmentTrack: result.assessment_track,
      trackId: result.track_id,
      loginDateTime: result.login_date_time.toISOString(),
      completionTime: result.completion_time.toISOString(),
      maxScore: result.max_score,
      achievedScore: result.achieved_score,
      totalQuestions: result.total_questions,
      duration: result.duration_seconds,
      answers: JSON.parse(result.answers || '[]')
    }));
    
    res.json(formattedResults);
  } catch (error) {
    console.error('Get recent results error:', error);
    res.status(500).json({ error: 'Failed to fetch recent results' });
  }
});

// Get statistics
app.get('/api/stats', authenticateAdmin, async (req, res) => {
  try {
    const [participantCount] = await pool.execute(
      'SELECT COUNT(DISTINCT email) as count FROM assessment_results'
    );
    
    const [assessmentCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM assessment_results'
    );
    
    const [quizCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM quizzes'
    );
    
    const [avgScore] = await pool.execute(`
      SELECT AVG((achieved_score / max_score) * 100) as avg_score 
      FROM assessment_results 
      WHERE max_score > 0
    `);
    
    res.json({
      totalParticipants: participantCount[0].count,
      totalAssessments: assessmentCount[0].count,
      totalQuizzes: quizCount[0].count,
      averageScore: Math.round(avgScore[0].avg_score || 0)
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Clear all results (Admin only)
app.delete('/api/results', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM assessment_results');
    res.json({ message: 'All results cleared successfully' });
  } catch (error) {
    console.error('Clear results error:', error);
    res.status(500).json({ error: 'Failed to clear results' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 LTIMindtree Assessment API Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🎉 Ready for August 14th, 2025 event!`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

module.exports = app;
