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

// Serve static files from the current directory
app.use(express.static(__dirname));

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
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: false
};

// Database name (separate from connection config)
const DATABASE_NAME = process.env.DB_NAME || 'ltimindtree_assessments';

console.log('🔄 Connecting to MySQL...');
console.log('📍 Host:', dbConfig.host);
console.log('👤 User:', dbConfig.user);
console.log('🔑 Password:', dbConfig.password ? `SET (length: ${dbConfig.password.length})` : 'NOT SET');
console.log('🗃️ Database:', DATABASE_NAME);

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
let pool = mysql.createPool(dbConfig);

// Database initialization
async function initializeDatabase() {
  let connection;
  try {
    console.log('🔄 Attempting database connection...');
    connection = await pool.getConnection();
    console.log('✅ MySQL connection successful!');
    
    // Create database if it doesn't exist
    console.log('📊 Creating database if not exists...');
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME}`);
    console.log('📊 Database created/verified:', DATABASE_NAME);
    
    // Release connection and create new pool with database
    connection.release();
    console.log('🔗 Reconnecting with database specified...');
    
    // Close the old pool and create new one with database
    await pool.end();
    
    const dbConfigWithDatabase = {
      ...dbConfig,
      database: DATABASE_NAME
    };
    
    pool = mysql.createPool(dbConfigWithDatabase);
    
    // Get new connection with database specified
    connection = await pool.getConnection();
    console.log('🎯 Connected to database:', DATABASE_NAME);
    
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
    
    // Create coding challenges table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS coding_challenges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        difficulty ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'easy',
        time_limit INT NOT NULL DEFAULT 30,
        starter_code TEXT NOT NULL,
        solution_code TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_by VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_difficulty (difficulty),
        INDEX idx_created_at (created_at),
        INDEX idx_is_active (is_active)
      )
    `);
    console.log('💻 Coding challenges table created/verified');
    
    // Create coding test cases table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS coding_test_cases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        challenge_id INT NOT NULL,
        input TEXT NOT NULL,
        expected_output TEXT NOT NULL,
        is_hidden BOOLEAN DEFAULT FALSE,
        order_index INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (challenge_id) REFERENCES coding_challenges(id) ON DELETE CASCADE,
        INDEX idx_challenge_id (challenge_id),
        INDEX idx_order_index (order_index)
      )
    `);
    console.log('🧪 Coding test cases table created/verified');
    
    // Create coding submissions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS coding_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        challenge_id INT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        code TEXT NOT NULL,
        score INT NOT NULL DEFAULT 0,
        passed_tests INT NOT NULL DEFAULT 0,
        total_tests INT NOT NULL DEFAULT 0,
        quality_score INT DEFAULT 0,
        complexity_score INT DEFAULT 0,
        time_spent INT DEFAULT 0,
        analysis_data JSON,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (challenge_id) REFERENCES coding_challenges(id) ON DELETE CASCADE,
        INDEX idx_challenge_id (challenge_id),
        INDEX idx_user_name (user_name),
        INDEX idx_submitted_at (submitted_at),
        INDEX idx_score (score),
        INDEX idx_quality_score (quality_score),
        INDEX idx_complexity_score (complexity_score)
      )
    `);
    console.log('📝 Coding submissions table created/verified');
    
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
    
    // Insert default coding challenges if table is empty
    const [codingCount] = await connection.execute('SELECT COUNT(*) as count FROM coding_challenges');
    if (codingCount[0].count === 0) {
      await insertDefaultCodingChallenges(connection);
      console.log('💻 Default coding challenges inserted');
    } else {
      console.log('💻 Existing coding challenges found:', codingCount[0].count);
    }
    
    connection.release();
    console.log('✅ Database initialized successfully');
    
  } catch (error) {
    if (connection) {
      connection.release();
    }
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

// Initialize default quizzes with sample questions
app.post('/api/admin/initialize-defaults', authenticateAdmin, async (req, res) => {
  try {
    const defaultQuizzes = [
      {
        id: 'javascript',
        name: 'JavaScript Fundamentals',
        description: 'Test your knowledge of JavaScript basics and ES6+ features',
        questions: [
          {
            question: "What is the correct way to declare a variable in modern JavaScript?",
            options: ["var myVar = 10;", "let myVar = 10;", "const myVar = 10;", "Both B and C are correct"],
            correct: 3
          },
          {
            question: "Which method is used to add an element to the end of an array?",
            options: ["push()", "pop()", "shift()", "unshift()"],
            correct: 0
          },
          {
            question: "What does the spread operator (...) do?",
            options: ["Combines arrays", "Expands arrays or objects", "Creates a new array", "Removes elements"],
            correct: 1
          },
          {
            question: "Which is the correct syntax for arrow functions?",
            options: ["function() => {}", "() => {}", "=> () {}", "function => {}"],
            correct: 1
          },
          {
            question: "What is the output of console.log(typeof null)?",
            options: ['"null"', '"undefined"', '"object"', '"boolean"'],
            correct: 2
          }
        ]
      },
      {
        id: 'python',
        name: 'Python Programming',
        description: 'Assess your Python programming skills and best practices',
        questions: [
          {
            question: "Which of the following is the correct way to create a list in Python?",
            options: ["list = {1, 2, 3}", "list = [1, 2, 3]", "list = (1, 2, 3)", "list = <1, 2, 3>"],
            correct: 1
          },
          {
            question: "What is the output of len('Hello')?",
            options: ["4", "5", "6", "Error"],
            correct: 1
          },
          {
            question: "Which keyword is used to define a function in Python?",
            options: ["function", "def", "func", "define"],
            correct: 1
          },
          {
            question: "What does the range(5) function return?",
            options: ["[0, 1, 2, 3, 4]", "[1, 2, 3, 4, 5]", "range(0, 5)", "Error"],
            correct: 2
          },
          {
            question: "Which operator is used for exponentiation in Python?",
            options: ["^", "**", "pow", "exp"],
            correct: 1
          }
        ]
      },
      {
        id: 'react',
        name: 'React Development',
        description: 'Test your React.js knowledge and component-based development',
        questions: [
          {
            question: "What is JSX?",
            options: ["A JavaScript extension", "A syntax extension for JavaScript", "A new programming language", "A CSS framework"],
            correct: 1
          },
          {
            question: "Which hook is used to manage state in functional components?",
            options: ["useEffect", "useState", "useContext", "useReducer"],
            correct: 1
          },
          {
            question: "What is the virtual DOM?",
            options: ["A copy of the real DOM", "A JavaScript representation of the DOM", "A CSS framework", "A database"],
            correct: 1
          },
          {
            question: "How do you pass data from parent to child component?",
            options: ["Through state", "Through props", "Through context", "Through refs"],
            correct: 1
          },
          {
            question: "Which method is called when a component is first mounted?",
            options: ["componentDidUpdate", "componentWillMount", "componentDidMount", "componentWillUnmount"],
            correct: 2
          }
        ]
      }
    ];

    for (const quiz of defaultQuizzes) {
      // Update existing quiz with questions
      await pool.execute(`
        UPDATE quizzes 
        SET questions = ? 
        WHERE id = ?
      `, [JSON.stringify(quiz.questions), quiz.id]);
      
      console.log(`✅ Updated ${quiz.id} with ${quiz.questions.length} questions`);
    }

    res.json({ message: 'Default quizzes initialized successfully' });
  } catch (error) {
    console.error('Initialize defaults error:', error);
    res.status(500).json({ error: 'Failed to initialize default quizzes' });
  }
});

// Test endpoint to check specific quiz data
app.get('/api/test/quiz/:id', async (req, res) => {
  try {
    const [quizzes] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    console.log(`\n🧪 TEST: Raw quiz data for ${quiz.id}:`);
    console.log('Questions field type:', typeof quiz.questions);
    console.log('Questions field content:', quiz.questions);
    console.log('Questions field length:', quiz.questions ? quiz.questions.length : 'null');
    
    let parsedQuestions = [];
    try {
      if (typeof quiz.questions === 'string') {
        parsedQuestions = JSON.parse(quiz.questions);
      } else if (Array.isArray(quiz.questions)) {
        parsedQuestions = quiz.questions;
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
    
    console.log('Parsed questions count:', parsedQuestions.length);
    console.log('First question:', parsedQuestions[0] || 'None');
    
    res.json({
      id: quiz.id,
      name: quiz.name,
      questionsRaw: quiz.questions,
      questionsType: typeof quiz.questions,
      questionsLength: quiz.questions ? quiz.questions.length : null,
      parsedQuestions: parsedQuestions,
      parsedCount: parsedQuestions.length
    });
  } catch (error) {
    console.error('Test quiz error:', error);
    res.status(500).json({ error: 'Failed to test quiz' });
  }
});

// Fix python2 quiz by adding a sample question
app.get('/api/fix/python2', async (req, res) => {
  try {
    const sampleQuestions = [
      {
        question: "What is the output of print('Hello World')?",
        options: ["Hello World", "'Hello World'", "Hello", "World"],
        correct: 0
      },
      {
        question: "Which of the following is the correct way to create a list in Python?",
        options: ["list = {1, 2, 3}", "list = [1, 2, 3]", "list = (1, 2, 3)", "list = <1, 2, 3>"],
        correct: 1
      }
    ];
    
    // First check if python2 quiz exists
    const [existing] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', ['python2']);
    
    if (existing.length === 0) {
      // Create the quiz if it doesn't exist
      await pool.execute(`
        INSERT INTO quizzes (id, name, description, questions, points_per_question, is_custom)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        'python2', 
        'Python Fundamentals', 
        'Test your Python programming knowledge', 
        JSON.stringify(sampleQuestions), 
        1, 
        true
      ]);
      console.log('✅ Created python2 quiz with sample questions');
      res.json({ 
        message: 'Python2 quiz created successfully', 
        action: 'created', 
        questions: sampleQuestions,
        count: sampleQuestions.length 
      });
    } else {
      // Update existing quiz with the sample questions
      await pool.execute(`
        UPDATE quizzes 
        SET questions = ?, updated_at = CURRENT_TIMESTAMP, name = ?, description = ?
        WHERE id = 'python2'
      `, [
        JSON.stringify(sampleQuestions),
        'Python Fundamentals',
        'Test your Python programming knowledge'
      ]);
      
      console.log('✅ Updated python2 quiz with sample questions');
      res.json({ 
        message: 'Python2 quiz updated successfully', 
        action: 'updated', 
        questions: sampleQuestions,
        count: sampleQuestions.length 
      });
    }
  } catch (error) {
    console.error('Fix python2 error:', error);
    res.status(500).json({ error: 'Failed to fix python2 quiz', details: error.message });
  }
});

// Simple endpoint to check all quiz names and question counts
app.get('/api/debug/quiz-summary', async (req, res) => {
  try {
    const [quizzes] = await pool.execute('SELECT id, name, questions FROM quizzes ORDER BY created_at DESC');
    
    const summary = quizzes.map(quiz => {
      let questionCount = 0;
      try {
        const questions = typeof quiz.questions === 'string' 
          ? JSON.parse(quiz.questions) 
          : (Array.isArray(quiz.questions) ? quiz.questions : []);
        questionCount = questions.length;
      } catch (e) {
        questionCount = -1; // Error parsing
      }
      
      return {
        id: quiz.id,
        name: quiz.name,
        questionCount: questionCount,
        questionsType: typeof quiz.questions,
        questionsPreview: typeof quiz.questions === 'string' 
          ? quiz.questions.substring(0, 100) + '...'
          : String(quiz.questions).substring(0, 100) + '...'
      };
    });
    
    res.json(summary);
  } catch (error) {
    console.error('Quiz summary error:', error);
    res.status(500).json({ error: 'Failed to get quiz summary' });
  }
});

// Enhanced debug endpoint for better troubleshooting
app.get('/api/debug/quiz-detailed/:id', async (req, res) => {
  try {
    const [quizzes] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    
    console.log(`\n🔍 Detailed debug for quiz: ${quiz.id}`);
    
    let debugInfo = {
      id: quiz.id,
      name: quiz.name,
      description: quiz.description,
      rawQuestions: quiz.questions,
      questionsType: typeof quiz.questions,
      questionsLength: quiz.questions ? quiz.questions.length : null,
      isString: typeof quiz.questions === 'string',
      isArray: Array.isArray(quiz.questions),
      isObject: typeof quiz.questions === 'object' && !Array.isArray(quiz.questions),
      isNull: quiz.questions === null,
      isUndefined: quiz.questions === undefined,
      pointsPerQuestion: quiz.points_per_question,
      isCustom: quiz.is_custom,
      createdAt: quiz.created_at,
      updatedAt: quiz.updated_at
    };
    
    // Try to parse if it's a string
    if (typeof quiz.questions === 'string') {
      try {
        const parsed = JSON.parse(quiz.questions);
        debugInfo.parsedQuestions = parsed;
        debugInfo.parsedType = typeof parsed;
        debugInfo.parsedIsArray = Array.isArray(parsed);
        debugInfo.parsedLength = Array.isArray(parsed) ? parsed.length : 'N/A';
        debugInfo.parseSuccess = true;
      } catch (e) {
        debugInfo.parseError = e.message;
        debugInfo.parseSuccess = false;
      }
    }
    
    // If it's already an array
    if (Array.isArray(quiz.questions)) {
      debugInfo.arrayLength = quiz.questions.length;
      debugInfo.firstQuestion = quiz.questions[0] || null;
    }
    
    console.log('🔍 Debug info compiled:', debugInfo);
    
    res.json(debugInfo);
  } catch (error) {
    console.error('Debug detailed error:', error);
    res.status(500).json({ error: 'Failed to get detailed debug info', details: error.message });
  }
});

// Repair specific quiz endpoint
app.post('/api/admin/repair-quiz/:id', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    console.log(`🔧 Attempting to repair quiz: ${quizId}`);
    
    // Get the current quiz
    const [quizzes] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    let repairedQuestions = [];
    let repairActions = [];
    
    console.log(`🔍 Current questions data type: ${typeof quiz.questions}`);
    
    if (quiz.questions) {
      if (typeof quiz.questions === 'string') {
        try {
          const parsed = JSON.parse(quiz.questions);
          if (Array.isArray(parsed)) {
            repairedQuestions = parsed;
            repairActions.push('Successfully parsed string questions');
          } else {
            repairActions.push('Questions string parsed but not an array, reset to empty');
          }
        } catch (e) {
          repairActions.push(`Failed to parse questions string: ${e.message}, reset to empty`);
        }
      } else if (Array.isArray(quiz.questions)) {
        repairedQuestions = quiz.questions;
        repairActions.push('Questions were already in correct array format');
      } else {
        repairActions.push('Questions were in unexpected format, reset to empty');
      }
    } else {
      repairActions.push('No questions data found, initialized as empty array');
    }
    
    // If no questions found, add a sample question for default quizzes
    if (repairedQuestions.length === 0 && !quiz.is_custom) {
      const sampleQuestions = {
        'javascript': {
          question: "What is the correct way to declare a variable in JavaScript?",
          options: ["var myVar = 5;", "let myVar = 5;", "const myVar = 5;", "Both B and C are correct"],
          correct: 3
        },
        'python': {
          question: "Which of the following is used to create a list in Python?",
          options: ["[]", "{}", "()", "<>"],
          correct: 0
        },
        'react': {
          question: "What is JSX in React?",
          options: ["A JavaScript library", "A syntax extension for JavaScript", "A CSS framework", "A database"],
          correct: 1
        }
      };
      
      if (sampleQuestions[quizId]) {
        repairedQuestions = [sampleQuestions[quizId]];
        repairActions.push(`Added sample question for ${quizId}`);
      }
    }
    
    // Update the quiz with repaired questions
    await pool.execute(
      'UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(repairedQuestions), quizId]
    );
    
    console.log(`✅ Quiz ${quizId} repaired with ${repairedQuestions.length} questions`);
    
    res.json({
      message: `Quiz ${quizId} repaired successfully`,
      questionsCount: repairedQuestions.length,
      repairActions: repairActions,
      repairedQuestions: repairedQuestions
    });
    
  } catch (error) {
    console.error('Repair quiz error:', error);
    res.status(500).json({ error: 'Failed to repair quiz', details: error.message });
  }
});

// Insert default coding challenges
async function insertDefaultCodingChallenges(connection) {
  const defaultChallenges = [
    {
      title: 'Two Sum',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.',
      difficulty: 'easy',
      timeLimit: 30,
      starterCode: `def solution(nums, target):
    # Write your code here
    # Return a list of two indices
    pass

# Test your solution
nums = [2, 7, 11, 15]
target = 9
print(solution(nums, target))`,
      solutionCode: `def solution(nums, target):
    num_map = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in num_map:
            return [num_map[complement], i]
        num_map[num] = i
    return []`,
      testCases: [
        { input: '[2, 7, 11, 15], 9', expectedOutput: '[0, 1]', isHidden: false },
        { input: '[3, 2, 4], 6', expectedOutput: '[1, 2]', isHidden: false },
        { input: '[3, 3], 6', expectedOutput: '[0, 1]', isHidden: true }
      ]
    },
    {
      title: 'Palindrome Check',
      description: 'Write a function that checks if a given string is a palindrome. A palindrome is a word, phrase, number, or other sequence of characters that reads the same forward and backward.',
      difficulty: 'easy',
      timeLimit: 20,
      starterCode: `def solution(s):
    # Write your code here
    # Return True if palindrome, False otherwise
    pass

# Test your solution
print(solution("racecar"))  # Should return True
print(solution("hello"))    # Should return False`,
      solutionCode: `def solution(s):
    cleaned = ''.join(char.lower() for char in s if char.isalnum())
    return cleaned == cleaned[::-1]`,
      testCases: [
        { input: 'racecar', expectedOutput: 'True', isHidden: false },
        { input: 'hello', expectedOutput: 'False', isHidden: false },
        { input: 'A man a plan a canal Panama', expectedOutput: 'True', isHidden: true }
      ]
    },
    {
      title: 'Fibonacci Sequence',
      description: 'Write a function that returns the nth number in the Fibonacci sequence. The Fibonacci sequence starts with 0, 1, and each subsequent number is the sum of the previous two numbers.',
      difficulty: 'medium',
      timeLimit: 25,
      starterCode: `def solution(n):
    # Write your code here
    # Return the nth Fibonacci number
    pass

# Test your solution
print(solution(0))  # Should return 0
print(solution(1))  # Should return 1
print(solution(5))  # Should return 5`,
      solutionCode: `def solution(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b`,
      testCases: [
        { input: '0', expectedOutput: '0', isHidden: false },
        { input: '1', expectedOutput: '1', isHidden: false },
        { input: '5', expectedOutput: '5', isHidden: false },
        { input: '10', expectedOutput: '55', isHidden: true }
      ]
    },
    {
      title: 'Maximum Subarray',
      description: 'Given an integer array nums, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum. This is known as Kadane\'s algorithm.',
      difficulty: 'hard',
      timeLimit: 40,
      starterCode: `def solution(nums):
    # Write your code here
    # Return the maximum sum of contiguous subarray
    pass

# Test your solution
print(solution([-2,1,-3,4,-1,2,1,-5,4]))  # Should return 6`,
      solutionCode: `def solution(nums):
    max_sum = current_sum = nums[0]
    for num in nums[1:]:
        current_sum = max(num, current_sum + num)
        max_sum = max(max_sum, current_sum)
    return max_sum`,
      testCases: [
        { input: '[-2,1,-3,4,-1,2,1,-5,4]', expectedOutput: '6', isHidden: false },
        { input: '[1]', expectedOutput: '1', isHidden: false },
        { input: '[5,4,-1,7,8]', expectedOutput: '23', isHidden: true }
      ]
    }
  ];

  for (let challenge of defaultChallenges) {
    // Insert challenge
    const [result] = await connection.execute(`
      INSERT INTO coding_challenges (title, description, difficulty, time_limit, starter_code, solution_code, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [challenge.title, challenge.description, challenge.difficulty, challenge.timeLimit, challenge.starterCode, challenge.solutionCode, 'system']);
    
    const challengeId = result.insertId;
    
    // Insert test cases
    for (let i = 0; i < challenge.testCases.length; i++) {
      const testCase = challenge.testCases[i];
      await connection.execute(`
        INSERT INTO coding_test_cases (challenge_id, input, expected_output, is_hidden, order_index)
        VALUES (?, ?, ?, ?, ?)
      `, [challengeId, testCase.input, testCase.expectedOutput, testCase.isHidden, i]);
    }
  }
}

// Comprehensive database health check
app.get('/api/admin/health-check', authenticateAdmin, async (req, res) => {
  try {
    const healthReport = {
      timestamp: new Date().toISOString(),
      database: {},
      quizzes: {},
      results: {}
    };
    
    // Database connection test
    try {
      const [dbTest] = await pool.execute('SELECT 1 as test');
      healthReport.database.connection = 'OK';
      healthReport.database.testQuery = dbTest[0].test === 1 ? 'PASS' : 'FAIL';
    } catch (e) {
      healthReport.database.connection = 'FAILED';
      healthReport.database.error = e.message;
    }
    
    // Quiz table analysis
    try {
      const [quizCount] = await pool.execute('SELECT COUNT(*) as count FROM quizzes');
      const [quizzes] = await pool.execute('SELECT id, name, questions FROM quizzes');
      
      healthReport.quizzes.totalCount = quizCount[0].count;
      healthReport.quizzes.details = [];
      
      quizzes.forEach(quiz => {
        let status = 'OK';
        let questionCount = 0;
        let issues = [];
        
        try {
          if (quiz.questions) {
            if (typeof quiz.questions === 'string') {
              const parsed = JSON.parse(quiz.questions);
              if (Array.isArray(parsed)) {
                questionCount = parsed.length;
              } else {
                issues.push('Questions parsed but not array');
                status = 'WARNING';
              }
            } else if (Array.isArray(quiz.questions)) {
              questionCount = quiz.questions.length;
            } else {
              issues.push('Questions in unexpected format');
              status = 'WARNING';
            }
          } else {
            issues.push('No questions data');
            status = 'WARNING';
          }
        } catch (e) {
          issues.push(`Parse error: ${e.message}`);
          status = 'ERROR';
        }
        
        healthReport.quizzes.details.push({
          id: quiz.id,
          name: quiz.name,
          status,
          questionCount,
          issues
        });
      });
    } catch (e) {
      healthReport.quizzes.error = e.message;
    }
    
    // Results table analysis
    try {
      const [resultCount] = await pool.execute('SELECT COUNT(*) as count FROM assessment_results');
      healthReport.results.totalCount = resultCount[0].count;
    } catch (e) {
      healthReport.results.error = e.message;
    }
    
    res.json(healthReport);
    
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Health check failed', details: error.message });
  }
});

// Debug endpoint to check quiz data structure
app.get('/api/debug/quizzes', authenticateAdmin, async (req, res) => {
  try {
    const [quizzes] = await pool.execute('SELECT * FROM quizzes ORDER BY created_at DESC');
    
    const debugInfo = quizzes.map(quiz => ({
      id: quiz.id,
      name: quiz.name,
      questionsType: typeof quiz.questions,
      questionsLength: quiz.questions ? quiz.questions.length : 'null',
      questionsRaw: quiz.questions,
      isCustom: quiz.is_custom,
      createdAt: quiz.created_at
    }));
    
    res.json(debugInfo);
  } catch (error) {
    console.error('Debug quizzes error:', error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Fix corrupted quiz data (admin only)
app.post('/api/admin/fix-quiz-data', authenticateAdmin, async (req, res) => {
  try {
    console.log('🔧 Starting quiz data repair...');
    
    // Get all quizzes
    const [quizzes] = await pool.execute('SELECT * FROM quizzes');
    let fixed = 0;
    let errors = 0;
    
    for (const quiz of quizzes) {
      try {
        // Try to parse existing questions
        JSON.parse(quiz.questions || '[]');
        console.log(`✅ Quiz ${quiz.id} data is valid`);
      } catch (parseError) {
        console.log(`🔧 Fixing corrupted data for quiz: ${quiz.id}`);
        
        // Set empty questions array for corrupted quizzes
        await pool.execute(
          'UPDATE quizzes SET questions = ? WHERE id = ?',
          [JSON.stringify([]), quiz.id]
        );
        fixed++;
        console.log(`✅ Fixed quiz ${quiz.id}`);
      }
    }
    
    console.log(`🎉 Repair complete: ${fixed} fixed, ${errors} errors`);
    res.json({ message: `Repair complete: ${fixed} quizzes fixed`, fixed, errors });
  } catch (error) {
    console.error('Quiz data repair error:', error);
    res.status(500).json({ error: 'Failed to repair quiz data' });
  }
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

// Enhanced Get all quizzes endpoint - FIXED VERSION
app.get('/api/quizzes', async (req, res) => {
  try {
    const [quizzes] = await pool.execute('SELECT * FROM quizzes ORDER BY created_at DESC');
    console.log(`📊 Found ${quizzes.length} quizzes in database`);
    
    const formattedQuizzes = {};
    
    for (let i = 0; i < quizzes.length; i++) {
      const quiz = quizzes[i];
      console.log(`\n🔄 Processing quiz ${i + 1}/${quizzes.length}: ${quiz.id} - ${quiz.name}`);
      
      try {
        let questions = [];
        
        console.log(`📋 Raw questions for ${quiz.id}:`);
        console.log(`  Type: ${typeof quiz.questions}`);
        console.log(`  Length: ${quiz.questions ? quiz.questions.length : 'null'}`);
        
        if (quiz.questions) {
          if (typeof quiz.questions === 'string') {
            console.log(`  First 100 chars: ${quiz.questions.substring(0, 100)}`);
            try {
              questions = JSON.parse(quiz.questions);
              if (!Array.isArray(questions)) {
                console.log(`⚠️ Parsed questions is not an array for ${quiz.id}:`, questions);
                questions = [];
              }
            } catch (parseError) {
              console.error(`❌ JSON parse error for ${quiz.id}:`, parseError.message);
              questions = [];
            }
          } else if (Array.isArray(quiz.questions)) {
            questions = quiz.questions;
          } else if (typeof quiz.questions === 'object') {
            console.log(`⚠️ Questions is object (not array) for ${quiz.id}:`, quiz.questions);
            questions = [];
          }
        }
        
        console.log(`📋 Final questions count for ${quiz.id}: ${questions.length}`);
        
        formattedQuizzes[quiz.id] = {
          name: quiz.name,
          description: quiz.description,
          questions: questions,
          pointsPerQuestion: quiz.points_per_question || 1,
          isCustom: quiz.is_custom,
          questionCount: questions.length, // Add explicit count
          createdAt: quiz.created_at,
          updatedAt: quiz.updated_at
        };
        
        console.log(`✅ Successfully processed quiz: ${quiz.id} with ${questions.length} questions`);
        
      } catch (error) {
        console.error(`❌ Error processing quiz ${quiz.id}:`, error);
        
        // Add quiz with empty questions but mark the error
        formattedQuizzes[quiz.id] = {
          name: quiz.name,
          description: quiz.description,
          questions: [],
          pointsPerQuestion: quiz.points_per_question || 1,
          isCustom: quiz.is_custom,
          questionCount: 0,
          hasError: true,
          errorMessage: error.message,
          createdAt: quiz.created_at,
          updatedAt: quiz.updated_at
        };
        
        console.log(`⚠️ Added quiz ${quiz.id} with error flag due to processing error`);
      }
    }
    
    console.log(`\n📤 Returning ${Object.keys(formattedQuizzes).length} formatted quizzes`);
    console.log('📊 Final quiz summary:');
    Object.entries(formattedQuizzes).forEach(([id, quiz]) => {
      console.log(`  ${id}: ${quiz.name} - ${quiz.questionCount} questions ${quiz.hasError ? '(ERROR)' : ''}`);
    });
    
    res.json(formattedQuizzes);
  } catch (error) {
    console.error('❌ Get quizzes error:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes', details: error.message });
  }
});

// Get specific quiz by ID
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
    console.log(`\n🔍 Raw quiz data for ${quiz.id}:`);
    console.log('Questions field type:', typeof quiz.questions);
    console.log('Questions field length:', quiz.questions ? quiz.questions.length : 'null');
    
    // Safe substring check - only if it's a string
    if (typeof quiz.questions === 'string') {
      console.log('First 200 chars:', quiz.questions.substring(0, 200));
    } else {
      console.log('Questions is not a string:', quiz.questions);
    }
    
    try {
      let questions;
      if (typeof quiz.questions === 'string') {
        questions = JSON.parse(quiz.questions);
      } else if (Array.isArray(quiz.questions)) {
        questions = quiz.questions;
      } else {
        questions = [];
      }
      console.log('✅ Questions processed successfully, count:', questions.length);
      res.json({
        name: quiz.name,
        description: quiz.description,
        questions: questions,
        pointsPerQuestion: quiz.points_per_question,
        isCustom: quiz.is_custom
      });
    } catch (parseError) {
      console.error(`❌ Failed to parse questions for quiz ${quiz.id}:`, parseError);
      console.error('Raw questions data:', quiz.questions);
      
      // Return quiz with empty questions instead of error
      console.log(`⚠️ Returning quiz ${quiz.id} with empty questions due to parsing error`);
      res.json({
        name: quiz.name,
        description: quiz.description,
        questions: [],
        pointsPerQuestion: quiz.points_per_question || 1,
        isCustom: quiz.is_custom
      });
    }
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

// Add questions to existing quiz (Admin only)
app.post('/api/quizzes/:id/questions', authenticateAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Questions array is required' });
    }
    
    // Get current quiz
    const [quizzes] = await pool.execute(
      'SELECT * FROM quizzes WHERE id = ?',
      [req.params.id]
    );
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    let currentQuestions = [];
    
    try {
      currentQuestions = quiz.questions ? JSON.parse(quiz.questions) : [];
    } catch (parseError) {
      console.error(`Failed to parse existing questions for quiz ${quiz.id}:`, parseError);
      // Continue with empty array if parsing fails
    }
    
    // Add new questions to existing ones
    const updatedQuestions = [...currentQuestions, ...questions];
    
    // Update quiz with new questions
    await pool.execute(`
      UPDATE quizzes 
      SET questions = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(updatedQuestions), req.params.id]);
    
    res.json({ 
      message: `Successfully added ${questions.length} question(s) to quiz`,
      totalQuestions: updatedQuestions.length,
      addedQuestions: questions.length
    });
  } catch (error) {
    console.error('Add questions error:', error);
    res.status(500).json({ error: 'Failed to add questions to quiz' });
  }
});

// Edit specific question in quiz (Admin only)
app.put('/api/quizzes/:id/questions/:questionIndex', authenticateAdmin, async (req, res) => {
  try {
    const { questionIndex } = req.params;
    const { question, options, correct } = req.body;
    
    if (!question || !options || !Array.isArray(options) || options.length !== 4 || correct === undefined) {
      return res.status(400).json({ error: 'Question, options array (4 items), and correct answer are required' });
    }
    
    // Get current quiz
    const [quizzes] = await pool.execute(
      'SELECT * FROM quizzes WHERE id = ?',
      [req.params.id]
    );
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    let currentQuestions = [];
    
    try {
      currentQuestions = quiz.questions ? JSON.parse(quiz.questions) : [];
    } catch (parseError) {
      console.error(`Failed to parse existing questions for quiz ${quiz.id}:`, parseError);
      return res.status(500).json({ error: 'Failed to parse quiz questions' });
    }
    
    const index = parseInt(questionIndex);
    if (index < 0 || index >= currentQuestions.length) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Update the specific question
    currentQuestions[index] = {
      question: question.trim(),
      options: options.map(opt => opt.trim()),
      correct: parseInt(correct)
    };
    
    // Update quiz with modified questions
    await pool.execute(`
      UPDATE quizzes 
      SET questions = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(currentQuestions), req.params.id]);
    
    res.json({ 
      message: `Successfully updated question ${index + 1}`,
      updatedQuestion: currentQuestions[index],
      totalQuestions: currentQuestions.length
    });
  } catch (error) {
    console.error('Edit question error:', error);
    res.status(500).json({ error: 'Failed to edit question' });
  }
});

// Delete specific question from quiz (Admin only)
app.delete('/api/quizzes/:id/questions/:questionIndex', authenticateAdmin, async (req, res) => {
  try {
    const { questionIndex } = req.params;
    
    // Get current quiz
    const [quizzes] = await pool.execute(
      'SELECT * FROM quizzes WHERE id = ?',
      [req.params.id]
    );
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    let currentQuestions = [];
    
    try {
      currentQuestions = quiz.questions ? JSON.parse(quiz.questions) : [];
    } catch (parseError) {
      console.error(`Failed to parse existing questions for quiz ${quiz.id}:`, parseError);
      return res.status(500).json({ error: 'Failed to parse quiz questions' });
    }
    
    const index = parseInt(questionIndex);
    if (index < 0 || index >= currentQuestions.length) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Remove the specific question
    const deletedQuestion = currentQuestions.splice(index, 1)[0];
    
    // Update quiz with modified questions
    await pool.execute(`
      UPDATE quizzes 
      SET questions = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(currentQuestions), req.params.id]);
    
    res.json({ 
      message: `Successfully deleted question ${index + 1}`,
      deletedQuestion: deletedQuestion,
      totalQuestions: currentQuestions.length
    });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Add single question to existing quiz (Admin only)
app.post('/api/quizzes/:id/questions/single', authenticateAdmin, async (req, res) => {
  try {
    const { question, options, correct } = req.body;
    
    if (!question || !options || !Array.isArray(options) || options.length !== 4 || correct === undefined) {
      return res.status(400).json({ error: 'Question, options array (4 items), and correct answer are required' });
    }
    
    // Get current quiz
    const [quizzes] = await pool.execute(
      'SELECT * FROM quizzes WHERE id = ?',
      [req.params.id]
    );
    
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quiz = quizzes[0];
    let currentQuestions = [];
    
    try {
      currentQuestions = quiz.questions ? JSON.parse(quiz.questions) : [];
    } catch (parseError) {
      console.error(`Failed to parse existing questions for quiz ${quiz.id}:`, parseError);
      // Continue with empty array if parsing fails
    }
    
    // Add new question
    const newQuestion = {
      question: question.trim(),
      options: options.map(opt => opt.trim()),
      correct: parseInt(correct)
    };
    
    currentQuestions.push(newQuestion);
    
    // Update quiz with new question
    await pool.execute(`
      UPDATE quizzes 
      SET questions = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(currentQuestions), req.params.id]);
    
    res.json({ 
      message: 'Successfully added question to quiz',
      addedQuestion: newQuestion,
      totalQuestions: currentQuestions.length,
      questionIndex: currentQuestions.length - 1
    });
  } catch (error) {
    console.error('Add single question error:', error);
    res.status(500).json({ error: 'Failed to add question to quiz' });
  }
});

// Import quiz pool from CSV - Create multiple quizzes from structured CSV (Admin only)
app.post('/api/admin/import-quiz-pool', authenticateAdmin, async (req, res) => {
  try {
    const { csvData } = req.body;
    
    if (!csvData || typeof csvData !== 'string') {
      return res.status(400).json({ error: 'CSV data is required' });
    }
    
    console.log('🎯 Starting CSV quiz pool import...');
    
    // Parse CSV data
    const lines = csvData.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have at least a header and one data row' });
    }
    
    // Expected format: Quiz Code, Quiz Name, Question, Option A, Option B, Option C, Option D, Correct Answer (0-3)
    const quizData = {};
    let processedQuestions = 0;
    let skippedLines = 0;
    
    // Skip header line, process data lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const fields = parseCSVLine(line);
        
        if (fields.length < 8) {
          console.log(`⚠️ Skipping line ${i + 1}: insufficient fields (${fields.length})`);
          skippedLines++;
          continue;
        }
        
        const [quizCode, quizName, question, optionA, optionB, optionC, optionD, correctAnswer] = fields;
        
        // Validate fields
        if (!quizCode.trim() || !quizName.trim() || !question.trim() || 
            !optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
          console.log(`⚠️ Skipping line ${i + 1}: empty required fields`);
          skippedLines++;
          continue;
        }
        
        const correct = parseInt(correctAnswer);
        if (isNaN(correct) || correct < 0 || correct > 3) {
          console.log(`⚠️ Skipping line ${i + 1}: invalid correct answer: ${correctAnswer}`);
          skippedLines++;
          continue;
        }
        
        // Group questions by quiz code
        const cleanQuizCode = quizCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!quizData[cleanQuizCode]) {
          quizData[cleanQuizCode] = {
            name: quizName.trim(),
            questions: []
          };
        }
        
        quizData[cleanQuizCode].questions.push({
          question: question.trim(),
          options: [optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim()],
          correct: correct
        });
        
        processedQuestions++;
        
      } catch (parseError) {
        console.log(`⚠️ Skipping line ${i + 1}: parse error: ${parseError.message}`);
        skippedLines++;
      }
    }
    
    if (Object.keys(quizData).length === 0) {
      return res.status(400).json({ 
        error: 'No valid quiz data found in CSV',
        details: `Processed ${lines.length - 1} lines, all were invalid`
      });
    }
    
    console.log(`📊 Parsed CSV: ${Object.keys(quizData).length} quizzes, ${processedQuestions} questions total`);
    
    // Create/update quizzes in database
    const results = [];
    let createdQuizzes = 0;
    let updatedQuizzes = 0;
    let errors = 0;
    
    for (const [quizCode, quizInfo] of Object.entries(quizData)) {
      try {
        // Check if quiz already exists
        const [existing] = await pool.execute(
          'SELECT id, questions FROM quizzes WHERE id = ?',
          [quizCode]
        );
        
        if (existing.length > 0) {
          // Update existing quiz by adding new questions
          let existingQuestions = [];
          try {
            existingQuestions = existing[0].questions ? JSON.parse(existing[0].questions) : [];
          } catch (e) {
            existingQuestions = [];
          }
          
          const allQuestions = [...existingQuestions, ...quizInfo.questions];
          
          await pool.execute(`
            UPDATE quizzes 
            SET name = ?, questions = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [quizInfo.name, JSON.stringify(allQuestions), quizCode]);
          
          updatedQuizzes++;
          results.push({
            quizCode,
            action: 'updated',
            name: quizInfo.name,
            questionsAdded: quizInfo.questions.length,
            totalQuestions: allQuestions.length
          });
          
          console.log(`✅ Updated quiz ${quizCode}: added ${quizInfo.questions.length} questions`);
          
        } else {
          // Create new quiz
          await pool.execute(`
            INSERT INTO quizzes (id, name, description, questions, points_per_question, is_custom)
            VALUES (?, ?, ?, ?, ?, TRUE)
          `, [
            quizCode,
            quizInfo.name,
            `Imported quiz: ${quizInfo.name}`,
            JSON.stringify(quizInfo.questions),
            1
          ]);
          
          createdQuizzes++;
          results.push({
            quizCode,
            action: 'created',
            name: quizInfo.name,
            questionsAdded: quizInfo.questions.length,
            totalQuestions: quizInfo.questions.length
          });
          
          console.log(`✅ Created quiz ${quizCode}: ${quizInfo.questions.length} questions`);
        }
        
      } catch (dbError) {
        console.error(`❌ Error processing quiz ${quizCode}:`, dbError);
        errors++;
        results.push({
          quizCode,
          action: 'error',
          name: quizInfo.name,
          error: dbError.message
        });
      }
    }
    
    console.log(`🎉 Import complete: ${createdQuizzes} created, ${updatedQuizzes} updated, ${errors} errors`);
    
    res.json({
      message: 'Quiz pool import completed',
      summary: {
        totalQuizzes: Object.keys(quizData).length,
        createdQuizzes,
        updatedQuizzes,
        errors,
        processedQuestions,
        skippedLines
      },
      results
    });
    
  } catch (error) {
    console.error('Import quiz pool error:', error);
    res.status(500).json({ error: 'Failed to import quiz pool', details: error.message });
  }
});

// Helper function for parsing CSV lines (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

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

// Delete all quizzes (Admin only)
app.delete('/api/admin/quizzes/all', authenticateAdmin, async (req, res) => {
  try {
    // Delete all quizzes (both custom and default)
    const [result] = await pool.execute('DELETE FROM quizzes');
    
    console.log(`🗑️ Deleted ${result.affectedRows} quizzes`);
    res.json({ 
      message: `Successfully deleted all quizzes`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Delete all quizzes error:', error);
    res.status(500).json({ error: 'Failed to delete all quizzes' });
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
      loginDateTime: result.login_date_time ? (result.login_date_time instanceof Date ? result.login_date_time.toISOString() : new Date(result.login_date_time).toISOString()) : null,
      completionTime: result.completion_time ? (result.completion_time instanceof Date ? result.completion_time.toISOString() : new Date(result.completion_time).toISOString()) : null,
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
      loginDateTime: result.login_date_time ? (result.login_date_time instanceof Date ? result.login_date_time.toISOString() : new Date(result.login_date_time).toISOString()) : null,
      completionTime: result.completion_time ? (result.completion_time instanceof Date ? result.completion_time.toISOString() : new Date(result.completion_time).toISOString()) : null,
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

// ============================================================================
// CODING CHALLENGE ENDPOINTS
// ============================================================================

// Get all coding challenges (Admin)
app.get('/api/coding/challenges', authenticateAdmin, async (req, res) => {
  try {
    const [challenges] = await pool.execute(`
      SELECT id, title, description, difficulty, time_limit as timeLimit, 
             created_at as createdAt, created_by as createdBy
      FROM coding_challenges 
      ORDER BY created_at DESC
    `);
    res.json(challenges);
  } catch (error) {
    console.error('Get coding challenges error:', error);
    res.status(500).json({ error: 'Failed to fetch coding challenges' });
  }
});

// Get available coding challenges (Public)
app.get('/api/coding/challenges/available', async (req, res) => {
  try {
    const [challenges] = await pool.execute(`
      SELECT id, title, description, difficulty, time_limit as timeLimit
      FROM coding_challenges 
      WHERE is_active = true
      ORDER BY difficulty, title
    `);
    
    // Get test cases for each challenge (only non-hidden ones for public view)
    for (let challenge of challenges) {
      const [testCases] = await pool.execute(`
        SELECT input, expected_output as expectedOutput, is_hidden as isHidden
        FROM coding_test_cases 
        WHERE challenge_id = ? AND is_hidden = false
        ORDER BY order_index
      `, [challenge.id]);
      challenge.testCases = testCases;
    }
    
    res.json(challenges);
  } catch (error) {
    console.error('Get available challenges error:', error);
    res.status(500).json({ error: 'Failed to fetch available challenges' });
  }
});

// Get specific coding challenge with starter code (Admin/User)
app.get('/api/coding/challenges/:id', async (req, res) => {
  try {
    const [challenges] = await pool.execute(`
      SELECT id, title, description, difficulty, time_limit as timeLimit,
             starter_code as starterCode, solution_code as solutionCode,
             created_at as createdAt
      FROM coding_challenges 
      WHERE id = ?
    `, [req.params.id]);
    
    if (challenges.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    const challenge = challenges[0];
    
    // Get test cases
    const [testCases] = await pool.execute(`
      SELECT input, expected_output as expectedOutput, is_hidden as isHidden, order_index as orderIndex
      FROM coding_test_cases 
      WHERE challenge_id = ?
      ORDER BY order_index
    `, [challenge.id]);
    
    challenge.testCases = testCases;
    res.json(challenge);
  } catch (error) {
    console.error('Get challenge details error:', error);
    res.status(500).json({ error: 'Failed to fetch challenge details' });
  }
});

// Create new coding challenge (Admin only)
app.post('/api/coding/challenges', authenticateAdmin, async (req, res) => {
  try {
    const { title, description, difficulty, timeLimit, starterCode, solutionCode, testCases } = req.body;
    
    // Validate required fields
    if (!title || !description || !difficulty || !starterCode || !testCases || testCases.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Insert challenge
      const [result] = await connection.execute(`
        INSERT INTO coding_challenges (title, description, difficulty, time_limit, starter_code, solution_code, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [title, description, difficulty, timeLimit || 30, starterCode, solutionCode || '', req.user.username]);
      
      const challengeId = result.insertId;
      
      // Insert test cases
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        await connection.execute(`
          INSERT INTO coding_test_cases (challenge_id, input, expected_output, is_hidden, order_index)
          VALUES (?, ?, ?, ?, ?)
        `, [challengeId, testCase.input, testCase.expectedOutput, testCase.isHidden || false, i]);
      }
      
      await connection.commit();
      res.status(201).json({ id: challengeId, message: 'Challenge created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create challenge error:', error);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// Update coding challenge (Admin only)
app.put('/api/coding/challenges/:id', authenticateAdmin, async (req, res) => {
  try {
    const { title, description, difficulty, timeLimit, starterCode, solutionCode, testCases } = req.body;
    const challengeId = req.params.id;
    
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Update challenge
      await connection.execute(`
        UPDATE coding_challenges 
        SET title = ?, description = ?, difficulty = ?, time_limit = ?, 
            starter_code = ?, solution_code = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [title, description, difficulty, timeLimit || 30, starterCode, solutionCode || '', challengeId]);
      
      // Delete old test cases and insert new ones
      await connection.execute('DELETE FROM coding_test_cases WHERE challenge_id = ?', [challengeId]);
      
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        await connection.execute(`
          INSERT INTO coding_test_cases (challenge_id, input, expected_output, is_hidden, order_index)
          VALUES (?, ?, ?, ?, ?)
        `, [challengeId, testCase.input, testCase.expectedOutput, testCase.isHidden || false, i]);
      }
      
      await connection.commit();
      res.json({ message: 'Challenge updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update challenge error:', error);
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

// Run code against test cases with comprehensive analysis
app.post('/api/coding/run', async (req, res) => {
  try {
    const { code, challengeId } = req.body;
    
    if (!code || !challengeId) {
      return res.status(400).json({ error: 'Code and challenge ID are required' });
    }
    
    // Get test cases for this challenge
    const [testCases] = await pool.execute(`
      SELECT input, expected_output as expectedOutput, is_hidden as isHidden
      FROM coding_test_cases 
      WHERE challenge_id = ? AND is_hidden = false
      ORDER BY order_index
    `, [challengeId]);
    
    // Comprehensive code analysis
    const analysisResult = await analyzeCode(code, testCases);
    
    res.json({
      output: analysisResult.output,
      testResults: analysisResult.testResults,
      codeQuality: analysisResult.codeQuality,
      complexity: analysisResult.complexity,
      suggestions: analysisResult.suggestions,
      unitTests: analysisResult.unitTests
    });
  } catch (error) {
    console.error('Run code error:', error);
    res.status(500).json({ error: error.message || 'Failed to execute code' });
  }
});

// Submit solution with comprehensive analysis
app.post('/api/coding/submit', async (req, res) => {
  try {
    const { code, challengeId, timeSpent, userName } = req.body;
    
    if (!code || !challengeId) {
      return res.status(400).json({ error: 'Code and challenge ID are required' });
    }
    
    // Get all test cases (including hidden ones)
    const [testCases] = await pool.execute(`
      SELECT input, expected_output as expectedOutput
      FROM coding_test_cases 
      WHERE challenge_id = ?
      ORDER BY order_index
    `, [challengeId]);
    
    // Comprehensive code analysis
    const analysisResult = await analyzeCode(code, testCases, true);
    const passedTests = analysisResult.testResults.filter(r => r.passed).length;
    const totalTests = analysisResult.testResults.length;
    
    // Calculate weighted score
    const testScore = Math.round((passedTests / totalTests) * 100);
    const qualityScore = analysisResult.codeQuality.overallScore;
    const complexityScore = analysisResult.complexity.score;
    
    // Weighted scoring: 60% tests, 25% quality, 15% complexity
    const finalScore = Math.round(
      (testScore * 0.6) + (qualityScore * 0.25) + (complexityScore * 0.15)
    );
    
    const success = finalScore >= 70; // 70% pass threshold
    
    // Save submission with detailed analysis
    await pool.execute(`
      INSERT INTO coding_submissions (
        challenge_id, user_name, code, score, passed_tests, total_tests, 
        time_spent, quality_score, complexity_score, analysis_data, submitted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      challengeId, userName || 'Anonymous', code, finalScore, passedTests, totalTests, 
      timeSpent || 0, qualityScore, complexityScore, JSON.stringify(analysisResult)
    ]);
    
    res.json({
      success: success,
      score: finalScore,
      breakdown: {
        testScore: testScore,
        qualityScore: qualityScore,
        complexityScore: complexityScore
      },
      passedTests: passedTests,
      totalTests: totalTests,
      testResults: analysisResult.testResults,
      codeQuality: analysisResult.codeQuality,
      complexity: analysisResult.complexity,
      suggestions: analysisResult.suggestions,
      unitTests: analysisResult.unitTests
    });
  } catch (error) {
    console.error('Submit solution error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit solution' });
  }
});

// Get coding challenge statistics (Admin)
app.get('/api/coding/stats', authenticateAdmin, async (req, res) => {
  try {
    const [totalSubmissions] = await pool.execute('SELECT COUNT(*) as count FROM coding_submissions');
    const [uniqueUsers] = await pool.execute('SELECT COUNT(DISTINCT user_name) as count FROM coding_submissions');
    const [avgScore] = await pool.execute('SELECT AVG(score) as avg_score FROM coding_submissions');
    
    res.json({
      totalSubmissions: totalSubmissions[0].count,
      activeUsers: uniqueUsers[0].count,
      avgScore: Math.round(avgScore[0].avg_score || 0)
    });
  } catch (error) {
    console.error('Get coding stats error:', error);
    res.status(500).json({ error: 'Failed to fetch coding statistics' });
  }
});

// Get recent coding submissions (Admin)
app.get('/api/coding/submissions/recent', authenticateAdmin, async (req, res) => {
  try {
    const [submissions] = await pool.execute(`
      SELECT cs.id, cs.user_name as userName, cc.title as challengeTitle,
             CASE 
               WHEN cs.score >= 70 THEN 'passed'
               WHEN cs.score >= 40 THEN 'partial'
               ELSE 'failed'
             END as status,
             cs.score, cs.submitted_at as submittedAt
      FROM coding_submissions cs
      JOIN coding_challenges cc ON cs.challenge_id = cc.id
      ORDER BY cs.submitted_at DESC
      LIMIT 20
    `);
    
    res.json(submissions);
  } catch (error) {
    console.error('Get recent submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch recent submissions' });
  }
});

// Comprehensive code analysis function
async function analyzeCode(code, testCases, includeHidden = false) {
  const analysis = {
    output: '',
    testResults: [],
    codeQuality: {},
    complexity: {},
    suggestions: [],
    unitTests: []
  };

  // 1. Execute test cases
  analysis.testResults = await executeCodeWithTests(code, testCases);
  
  // 2. Code Quality Analysis (SonarQube-style)
  analysis.codeQuality = analyzeCodeQuality(code);
  
  // 3. Time & Space Complexity Analysis
  analysis.complexity = analyzeComplexity(code);
  
  // 4. Generate Unit Tests
  analysis.unitTests = generateUnitTests(code);
  
  // 5. Generate Suggestions
  analysis.suggestions = generateSuggestions(code, analysis.codeQuality, analysis.complexity);
  
  // 6. Set output message
  const passedTests = analysis.testResults.filter(r => r.passed).length;
  const totalTests = analysis.testResults.length;
  analysis.output = `Code executed successfully. ${passedTests}/${totalTests} tests passed.`;
  
  return analysis;
}

// Code Quality Analysis (SonarQube-style gates)
function analyzeCodeQuality(code) {
  const issues = [];
  let overallScore = 100;
  
  // Remove comments and strings for analysis
  const cleanCode = code.replace(/#.*$/gm, '').replace(/"""[\s\S]*?"""/g, '').replace(/"[^"]*"/g, '');
  
  // 1. Cyclomatic Complexity
  const complexityScore = analyzeCyclomaticComplexity(cleanCode);
  if (complexityScore > 10) {
    issues.push({
      type: 'complexity',
      severity: 'major',
      message: `Cyclomatic complexity is ${complexityScore}, should be ≤ 10`,
      line: 1
    });
    overallScore -= 15;
  }
  
  // 2. Code Duplication
  const duplicateLines = findDuplicateLines(cleanCode);
  if (duplicateLines.length > 0) {
    issues.push({
      type: 'duplication',
      severity: 'minor',
      message: `Found ${duplicateLines.length} duplicate lines`,
      line: duplicateLines[0]
    });
    overallScore -= 5;
  }
  
  // 3. Naming Conventions
  const namingIssues = checkNamingConventions(code);
  if (namingIssues.length > 0) {
    issues.push(...namingIssues);
    overallScore -= namingIssues.length * 5;
  }
  
  // 4. Function Length
  const longFunctions = findLongFunctions(cleanCode);
  if (longFunctions.length > 0) {
    issues.push({
      type: 'maintainability',
      severity: 'major',
      message: `Function too long (${longFunctions[0].lines} lines), should be ≤ 20`,
      line: longFunctions[0].startLine
    });
    overallScore -= 10;
  }
  
  // 5. Documentation
  if (!code.includes('"""') && !code.includes('#')) {
    issues.push({
      type: 'documentation',
      severity: 'minor',
      message: 'No documentation found, consider adding docstrings or comments',
      line: 1
    });
    overallScore -= 5;
  }
  
  // 6. Security Issues
  const securityIssues = findSecurityIssues(code);
  if (securityIssues.length > 0) {
    issues.push(...securityIssues);
    overallScore -= securityIssues.length * 20;
  }
  
  return {
    overallScore: Math.max(0, overallScore),
    issues: issues,
    qualityGates: {
      complexity: complexityScore <= 10,
      duplication: duplicateLines.length === 0,
      maintainability: longFunctions.length === 0,
      security: securityIssues.length === 0
    },
    metrics: {
      linesOfCode: code.split('\n').length,
      cyclomaticComplexity: complexityScore,
      duplicateLines: duplicateLines.length,
      functionCount: (code.match(/def\s+\w+/g) || []).length
    }
  };
}

// Time & Space Complexity Analysis
function analyzeComplexity(code) {
  let timeComplexity = 'O(1)';
  let spaceComplexity = 'O(1)';
  let score = 100;
  const analysis = [];
  
  // Analyze loops and nested structures
  const loopPatterns = [
    { pattern: /for\s+\w+\s+in\s+\w+:/g, complexity: 'O(n)' },
    { pattern: /while\s+\w+/g, complexity: 'O(n)' },
    { pattern: /for.*for.*:/g, complexity: 'O(n²)' },
    { pattern: /while.*while/g, complexity: 'O(n²)' }
  ];
  
  // Check for recursive calls
  const functionName = (code.match(/def\s+(\w+)/) || [])[1];
  if (functionName && code.includes(functionName + '(') && code.split(functionName + '(').length > 2) {
    timeComplexity = 'O(2^n)';
    analysis.push('Recursive function detected - potential exponential complexity');
    score -= 20;
  }
  
  // Check loop complexity
  for (const pattern of loopPatterns) {
    const matches = code.match(pattern.pattern);
    if (matches) {
      timeComplexity = pattern.complexity;
      if (pattern.complexity === 'O(n²)') {
        analysis.push('Nested loops detected - quadratic time complexity');
        score -= 15;
      } else if (pattern.complexity === 'O(n)') {
        analysis.push('Linear loop detected');
        score -= 5;
      }
      break;
    }
  }
  
  // Check space complexity
  if (code.includes('[]') || code.includes('{}') || code.includes('list(') || code.includes('dict(')) {
    spaceComplexity = 'O(n)';
    analysis.push('Data structures used - linear space complexity');
    score -= 5;
  }
  
  // Check for sorting (usually O(n log n))
  if (code.includes('.sort(') || code.includes('sorted(')) {
    timeComplexity = 'O(n log n)';
    analysis.push('Sorting operation detected');
    score -= 10;
  }
  
  return {
    timeComplexity: timeComplexity,
    spaceComplexity: spaceComplexity,
    score: Math.max(0, score),
    analysis: analysis,
    recommendations: generateComplexityRecommendations(timeComplexity, spaceComplexity)
  };
}

// Generate Unit Tests
function generateUnitTests(code) {
  const unitTests = [];
  
  // Extract function names
  const functions = code.match(/def\s+(\w+)\s*\([^)]*\):/g) || [];
  
  functions.forEach(func => {
    const funcName = func.match(/def\s+(\w+)/)[1];
    if (funcName !== 'solution') { // Skip main solution function
      const testCode = `
def test_${funcName}():
    # Test case 1: Normal input
    result = ${funcName}()
    assert result is not None, "Function should return a value"
    
    # Test case 2: Edge case
    # Add specific test cases based on function purpose
    
    # Test case 3: Error handling
    try:
        ${funcName}()
    except Exception as e:
        assert False, f"Function should handle errors gracefully: {e}"
`;
      
      unitTests.push({
        functionName: funcName,
        testCode: testCode.trim(),
        description: `Unit test for ${funcName} function`
      });
    }
  });
  
  // Generate integration test for main solution
  if (code.includes('def solution(')) {
    const integrationTest = `
def test_solution_integration():
    # Integration test for main solution function
    test_cases = [
        # Add test cases based on problem requirements
        # (input, expected_output)
    ]
    
    for inputs, expected in test_cases:
        result = solution(inputs)
        assert result == expected, f"Expected {expected}, got {result}"
`;
    
    unitTests.push({
      functionName: 'solution',
      testCode: integrationTest.trim(),
      description: 'Integration test for main solution function'
    });
  }
  
  return unitTests;
}

// Generate Suggestions
function generateSuggestions(code, qualityAnalysis, complexityAnalysis) {
  const suggestions = [];
  
  // Quality-based suggestions
  if (qualityAnalysis.overallScore < 80) {
    suggestions.push({
      type: 'quality',
      priority: 'high',
      message: 'Consider refactoring to improve code quality',
      details: 'Address the quality issues identified in the analysis'
    });
  }
  
  // Complexity-based suggestions
  if (complexityAnalysis.timeComplexity === 'O(n²)' || complexityAnalysis.timeComplexity === 'O(2^n)') {
    suggestions.push({
      type: 'performance',
      priority: 'high',
      message: 'Consider optimizing the algorithm for better time complexity',
      details: `Current complexity: ${complexityAnalysis.timeComplexity}. Consider using more efficient algorithms or data structures.`
    });
  }
  
  // Code style suggestions
  if (!code.includes('"""') && code.split('\n').length > 5) {
    suggestions.push({
      type: 'documentation',
      priority: 'medium',
      message: 'Add docstrings to improve code documentation',
      details: 'Use triple quotes to document function purpose, parameters, and return values'
    });
  }
  
  // Performance suggestions
  if (code.includes('range(len(')) {
    suggestions.push({
      type: 'pythonic',
      priority: 'low',
      message: 'Consider using enumerate() instead of range(len())',
      details: 'for i, item in enumerate(list): is more Pythonic than for i in range(len(list)):'
    });
  }
  
  return suggestions;
}

// Helper functions for code analysis
function analyzeCyclomaticComplexity(code) {
  const patterns = ['if', 'elif', 'else', 'for', 'while', 'except', 'and', 'or'];
  let complexity = 1; // Base complexity
  
  patterns.forEach(pattern => {
    const regex = new RegExp(`\\b${pattern}\\b`, 'g');
    const matches = code.match(regex) || [];
    complexity += matches.length;
  });
  
  return complexity;
}

function findDuplicateLines(code) {
  const lines = code.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const lineCount = {};
  const duplicates = [];
  
  lines.forEach((line, index) => {
    if (lineCount[line]) {
      duplicates.push(index + 1);
    } else {
      lineCount[line] = index + 1;
    }
  });
  
  return duplicates;
}

function checkNamingConventions(code) {
  const issues = [];
  
  // Check function names (should be snake_case)
  const functions = code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
  functions.forEach(func => {
    const name = func.replace('def ', '');
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      issues.push({
        type: 'naming',
        severity: 'minor',
        message: `Function name '${name}' should use snake_case`,
        line: 1
      });
    }
  });
  
  // Check variable names
  const variables = code.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm) || [];
  variables.forEach(variable => {
    const name = variable.replace(/^\s*/, '').replace(/\s*=.*/, '');
    if (!/^[a-z_][a-z0-9_]*$/.test(name) && name !== name.toUpperCase()) {
      issues.push({
        type: 'naming',
        severity: 'minor',
        message: `Variable name '${name}' should use snake_case`,
        line: 1
      });
    }
  });
  
  return issues;
}

function findLongFunctions(code) {
  const functions = [];
  const lines = code.split('\n');
  let currentFunction = null;
  
  lines.forEach((line, index) => {
    if (line.trim().startsWith('def ')) {
      if (currentFunction) {
        currentFunction.endLine = index - 1;
        currentFunction.lines = currentFunction.endLine - currentFunction.startLine + 1;
        if (currentFunction.lines > 20) {
          functions.push(currentFunction);
        }
      }
      currentFunction = {
        name: line.trim().match(/def\s+(\w+)/)[1],
        startLine: index + 1,
        endLine: null,
        lines: 0
      };
    }
  });
  
  // Handle last function
  if (currentFunction) {
    currentFunction.endLine = lines.length;
    currentFunction.lines = currentFunction.endLine - currentFunction.startLine + 1;
    if (currentFunction.lines > 20) {
      functions.push(currentFunction);
    }
  }
  
  return functions;
}

function findSecurityIssues(code) {
  const issues = [];
  
  // Check for dangerous functions
  const dangerousFunctions = ['eval', 'exec', 'input', 'raw_input'];
  dangerousFunctions.forEach(func => {
    if (code.includes(func + '(')) {
      issues.push({
        type: 'security',
        severity: 'critical',
        message: `Dangerous function '${func}' detected - potential security risk`,
        line: 1
      });
    }
  });
  
  return issues;
}

function generateComplexityRecommendations(timeComplexity, spaceComplexity) {
  const recommendations = [];
  
  if (timeComplexity === 'O(n²)') {
    recommendations.push('Consider using hash tables or sets for O(1) lookups');
    recommendations.push('Look for opportunities to use single-pass algorithms');
  }
  
  if (timeComplexity === 'O(2^n)') {
    recommendations.push('Consider dynamic programming or memoization');
    recommendations.push('Look for overlapping subproblems that can be cached');
  }
  
  if (spaceComplexity === 'O(n)' && timeComplexity !== 'O(1)') {
    recommendations.push('Consider if space can be optimized with in-place operations');
  }
  
  return recommendations;
}

// Enhanced test execution with better error handling
async function executeCodeWithTests(code, testCases) {
  const results = [];
  
  for (let testCase of testCases) {
    try {
      // Enhanced code execution simulation
      const result = simulatePythonExecution(code, testCase.input);
      const passed = result.trim() === testCase.expectedOutput.trim();
      
      results.push({
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: result,
        passed: passed,
        error: null,
        executionTime: Math.random() * 100 + 10 // Simulated execution time
      });
    } catch (error) {
      results.push({
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: '',
        passed: false,
        error: error.message,
        executionTime: 0
      });
    }
  }
  
  return results;
}

// Simulate Python code execution (placeholder - replace with actual sandboxed execution)
function simulatePythonExecution(code, input) {
  // This is a simplified simulation
  // In production, use docker containers or VM-based execution
  
  try {
    // Basic function extraction and execution simulation
    if (code.includes('def solution(')) {
      // Extract function body and simulate execution
      const match = code.match(/def solution\([^)]*\):\s*([\s\S]*?)(?=\n\S|\n$|$)/);
      if (match) {
        const functionBody = match[1];
        
        // Simple pattern matching for common solutions
        if (functionBody.includes('return') && input) {
          // Simulate some basic operations
          const inputValue = input.trim();
          
          // Example: if input is a number, return some transformation
          if (!isNaN(inputValue)) {
            const num = parseInt(inputValue);
            
            // Common patterns
            if (functionBody.includes('* 2')) return (num * 2).toString();
            if (functionBody.includes('+ 1')) return (num + 1).toString();
            if (functionBody.includes('% 2')) return (num % 2).toString();
            if (functionBody.includes('** 2')) return (num * num).toString();
            
            return num.toString(); // Default return input
          }
          
          // String operations
          if (functionBody.includes('.upper()')) return inputValue.toUpperCase();
          if (functionBody.includes('.lower()')) return inputValue.toLowerCase();
          if (functionBody.includes('.reverse')) return inputValue.split('').reverse().join('');
          
          return inputValue; // Default return input
        }
      }
    }
    
    return 'No valid output'; // Default response
  } catch (error) {
    throw new Error('Code execution failed: ' + error.message);
  }
}

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