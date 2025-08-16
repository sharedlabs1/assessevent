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
const createProctoringRouter = require('./proctoring-module');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'ltimindtree_assessment_secret_2024';

// FIX 1: Enable trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Debug: Show what environment variables are loaded
console.log('🔍 Environment Debug Information:');
console.log('DB_HOST:', process.env.DB_HOST || 'NOT SET');
console.log('DB_USER:', process.env.DB_USER || 'NOT SET');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET (length: ' + process.env.DB_PASSWORD.length + ')' : 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME || 'NOT SET');

// Enhanced CORS setup
app.use(cors({
  origin: [
    'https://events.learnlytica.in',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true
}));

// Additional CORS headers for proctoring
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: '10mb' }));

// Serve static files from ./public (move admin.html here)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Serve admin.html at root for convenience
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Rate limiting for API protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use(limiter);

// FIX 2: Enhanced MySQL Configuration with better database handling
const DATABASE_NAME = process.env.DB_NAME || 'ltimindtree_assessments';

// FIX: Remove invalid MySQL connection options
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: false
  // Removed: acquireTimeout and timeout (invalid options)
};

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
  console.error('2. Verify .env file contains: DB_PASSWORD=your_password');
  console.error('3. Make sure there are no extra spaces or quotes around the password');
  process.exit(1);
}

// Create connection pool (without database initially)
let pool = mysql.createPool(dbConfig);

// Global variables for proctoring
let proctoringRouter, proctoringManager;

// FIX 4: Safe JSON parsing utility function
function safeJSONParse(jsonString, fallback = null) {
  // Handle null/undefined
  if (jsonString === null || jsonString === undefined) {
    return fallback;
  }
  // If already an array or object, return as is
  if (typeof jsonString === 'object') {
    return jsonString;
  }
  // Only operate on strings from here
  if (typeof jsonString !== 'string') {
    // Defensive: log and return fallback
    console.warn('safeJSONParse: Not a string -', typeof jsonString, jsonString);
    return fallback;
  }
  // Trim and check for empty string
  const trimmed = jsonString.trim();
  if (!trimmed || trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
    return fallback;
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn('JSON parse error:', error.message, 'Input:', trimmed.substring(0, 100));
    return fallback;
  }
}

// FIX: Admin authentication middleware (was missing!)
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

// Utility function to shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Utility function to randomize question options
function randomizeQuestionOptions(question) {
  if (!question.options || !Array.isArray(question.options)) {
    return question;
  }

  const correctAnswer = question.options[question.correct];
  const shuffledOptions = shuffleArray(question.options);
  const newCorrectIndex = shuffledOptions.indexOf(correctAnswer);

  return {
    ...question,
    options: shuffledOptions,
    correct: newCorrectIndex,
    originalOrder: question.options // Keep track of original order for admin reference
  };
}

// Utility function to randomize questions and their options
function randomizeQuiz(questions, randomizeQuestions = true, randomizeOptions = true, questionLimit = null) {
  let processedQuestions = [...questions];

  // Randomize options within each question
  if (randomizeOptions) {
    processedQuestions = processedQuestions.map(randomizeQuestionOptions);
  }

  // Randomize question order
  if (randomizeQuestions) {
    processedQuestions = shuffleArray(processedQuestions);
  }

  // Limit number of questions if specified
  if (questionLimit && questionLimit > 0 && questionLimit < processedQuestions.length) {
    processedQuestions = processedQuestions.slice(0, questionLimit);
  }

  return processedQuestions;
}

// Helper function to update bucket question counts
async function updateBucketCounts(bucketId) {
  try {
    const [counts] = await pool.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
      FROM questions 
      WHERE bucket_id = ? AND is_active = TRUE
    `, [bucketId]);
    
    if (counts.length > 0) {
      await pool.execute(`
        UPDATE question_buckets 
        SET total_questions = ?, easy_count = ?, medium_count = ?, hard_count = ?
        WHERE id = ?
      `, [counts[0].total, counts[0].easy, counts[0].medium, counts[0].hard, bucketId]);
    }
  } catch (error) {
    console.error('Error updating bucket counts:', error);
  }
}

// FIX 3: Improved Database initialization with better error handling
async function initializeDatabase() {
  let connection;
  try {
    console.log('🔄 Attempting database connection...');
    connection = await pool.getConnection();
    console.log('✅ MySQL connection successful!');
    
    // Create database if it doesn't exist
    console.log('📊 Creating database if not exists...');
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\``);
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
    
    // Verify we can use the database
    const [dbCheck] = await connection.execute('SELECT DATABASE() as current_db');
    console.log('📋 Current database:', dbCheck[0].current_db);
    
    if (dbCheck[0].current_db !== DATABASE_NAME) {
      throw new Error(`Database selection failed. Expected: ${DATABASE_NAME}, Got: ${dbCheck[0].current_db}`);
    }
    
    // Create quizzes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        questions JSON NOT NULL,
        points_per_question INT DEFAULT 1,
        is_custom BOOLEAN DEFAULT TRUE,
        randomization_settings JSON DEFAULT NULL,
        proctoring_settings JSON DEFAULT NULL,
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

    // Create question buckets table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS question_buckets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(100) NOT NULL,
        total_questions INT DEFAULT 0,
        easy_count INT DEFAULT 0,
        medium_count INT DEFAULT 0,
        hard_count INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_subject (subject),
        INDEX idx_is_active (is_active),
        INDEX idx_created_at (created_at),
        UNIQUE KEY unique_name_subject (name, subject)
      )
    `);
    console.log('🪣 Question buckets table created/verified');

    // Create questions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bucket_id INT NOT NULL,
        question_text TEXT NOT NULL,
        options JSON NOT NULL,
        correct_answer INT NOT NULL,
        difficulty ENUM('easy', 'medium', 'hard') NOT NULL,
        points INT DEFAULT 1,
        explanation TEXT,
        tags JSON,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (bucket_id) REFERENCES question_buckets(id) ON DELETE CASCADE,
        INDEX idx_bucket_id (bucket_id),
        INDEX idx_difficulty (difficulty),
        INDEX idx_is_active (is_active),
        INDEX idx_created_at (created_at)
      )
    `);
    console.log('❓ Questions table created/verified');

    // Create quiz bucket mappings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS quiz_bucket_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id VARCHAR(50) NOT NULL,
        bucket_id INT NOT NULL,
        easy_count INT DEFAULT 0,
        medium_count INT DEFAULT 0,
        hard_count INT DEFAULT 0,
        total_questions INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY (bucket_id) REFERENCES question_buckets(id) ON DELETE CASCADE,
        INDEX idx_quiz_id (quiz_id),
        INDEX idx_bucket_id (bucket_id),
        UNIQUE KEY unique_quiz_bucket (quiz_id, bucket_id)
      )
    `);
    console.log('🔗 Quiz bucket mappings table created/verified');
    
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

    // Insert default question buckets if table is empty
    const [bucketCount] = await connection.execute('SELECT COUNT(*) as count FROM question_buckets');
    if (bucketCount[0].count === 0) {
      await insertDefaultQuestionBuckets(connection);
      console.log('🪣 Default question buckets inserted');
    } else {
      console.log('🪣 Existing question buckets found:', bucketCount[0].count);
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
    console.error('   2. Verify your password by connecting manually');
    console.error('   3. Check if .env file has the correct password');
    throw error; // Re-throw to prevent server startup with broken DB
  }
}

// Enhanced Proctoring Module Initialization
async function initializeProctoringModule() {
  try {
    console.log('📹 Initializing proctoring module...');
    
    // Import the proctoring module
    const proctoringModule = createProctoringRouter(pool);
    proctoringRouter = proctoringModule.router;
    proctoringManager = proctoringModule.proctoringManager;
    
    // Mount proctoring routes BEFORE other routes
    app.use('/api/proctoring', proctoringRouter);
    
    console.log('📹 Proctoring routes mounted at /api/proctoring');
    console.log('📹 Available endpoints:');
    console.log('   - POST /api/proctoring/start');
    console.log('   - POST /api/proctoring/log'); 
    console.log('   - POST /api/proctoring/end');
    console.log('   - GET /api/proctoring/stats');
    console.log('   - GET /api/proctoring/sessions');
    console.log('   - GET /api/proctoring/session/:id');
    
    // Test the proctoring endpoints
    try {
      await proctoringManager.getStatistics('24h');
      console.log('✅ Proctoring module initialized successfully');
    } catch (testError) {
      console.warn('⚠️ Proctoring module loaded but test failed:', testError.message);
    }
    
    return { proctoringRouter, proctoringManager };
  } catch (error) {
    console.error('❌ Failed to initialize proctoring module:', error);
    console.error('Stack trace:', error.stack);
    
    // Create dummy endpoints to prevent 404 errors
    app.get('/api/proctoring/stats', (req, res) => {
      res.json({
        totalSessions: 0,
        activeSessions: 0,
        flaggedSessions: 0,
        totalViolations: 0,
        violationsByType: [],
        timeframe: '24h'
      });
    });
    
    app.get('/api/proctoring/sessions', (req, res) => {
      res.json([]);
    });
    
    console.log('📹 Created dummy proctoring endpoints to prevent errors');
    return null;
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

// Insert default question buckets and migrate existing quiz questions
async function insertDefaultQuestionBuckets(connection) {
  const defaultBuckets = [
    {
      name: 'JavaScript Fundamentals',
      description: 'Basic JavaScript concepts, syntax, and core features',
      subject: 'Programming'
    },
    {
      name: 'Python Basics',
      description: 'Python fundamentals, data structures, and syntax',
      subject: 'Programming'
    },
    {
      name: 'Data Structures',
      description: 'Arrays, objects, stacks, queues, and basic algorithms',
      subject: 'Computer Science'
    },
    {
      name: 'Web Development',
      description: 'HTML, CSS, DOM manipulation, and web technologies',
      subject: 'Programming'
    },
    {
      name: 'Database Concepts',
      description: 'SQL, database design, and data management',
      subject: 'Database'
    }
  ];

  // Create default buckets
  for (let bucket of defaultBuckets) {
    const [result] = await connection.execute(`
      INSERT INTO question_buckets (name, description, subject)
      VALUES (?, ?, ?)
    `, [bucket.name, bucket.description, bucket.subject]);
    
    const bucketId = result.insertId;
    
    // Migrate questions from existing quizzes to appropriate buckets
    await migrateQuizQuestionsToQuestions(connection, bucketId, bucket.subject);
  }
}

// Migrate existing quiz questions to new question system
async function migrateQuizQuestionsToQuestions(connection, bucketId, subject) {
  try {
    const [quizzes] = await connection.execute('SELECT id, name, questions FROM quizzes WHERE is_custom = FALSE');
    
    for (let quiz of quizzes) {
      if (!quiz.questions) continue;
      
      let questions;
      try {
        questions = typeof quiz.questions === 'string' ? JSON.parse(quiz.questions) : quiz.questions;
      } catch (e) {
        console.log(`Skipping quiz ${quiz.id} due to invalid questions format`);
        continue;
      }
      
      if (!Array.isArray(questions)) continue;
      
      // Determine bucket based on quiz name/id
      let targetBucketId = bucketId;
      if (quiz.id.includes('javascript') || quiz.name.toLowerCase().includes('javascript')) {
        const [jsBucket] = await connection.execute('SELECT id FROM question_buckets WHERE name = "JavaScript Fundamentals"');
        if (jsBucket.length > 0) targetBucketId = jsBucket[0].id;
      } else if (quiz.id.includes('python') || quiz.name.toLowerCase().includes('python')) {
        const [pythonBucket] = await connection.execute('SELECT id FROM question_buckets WHERE name = "Python Basics"');
        if (pythonBucket.length > 0) targetBucketId = pythonBucket[0].id;
      }
      
      // Insert questions with difficulty assignment
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        
        // Auto-assign difficulty based on position (demo logic)
        let difficulty = 'easy';
        if (i >= Math.floor(questions.length * 0.6)) difficulty = 'hard';
        else if (i >= Math.floor(questions.length * 0.3)) difficulty = 'medium';
        
        await connection.execute(`
          INSERT INTO questions (bucket_id, question_text, options, correct_answer, difficulty, points)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          targetBucketId,
          q.question,
          JSON.stringify(q.options),
          q.correct,
          difficulty,
          1
        ]);
      }
      
      // Update bucket counts
      const [counts] = await connection.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
          SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
        FROM questions WHERE bucket_id = ?
      `, [targetBucketId]);
      
      if (counts.length > 0) {
        await connection.execute(`
          UPDATE question_buckets 
          SET total_questions = ?, easy_count = ?, medium_count = ?, hard_count = ?
          WHERE id = ?
        `, [counts[0].total, counts[0].easy, counts[0].medium, counts[0].hard, targetBucketId]);
      }
    }
  } catch (error) {
    console.error('Error migrating quiz questions:', error);
  }
}

// Create participants table
async function createParticipantsTable() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS quiz_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        department VARCHAR(255),
        access_token VARCHAR(255) UNIQUE NOT NULL,
        invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY),
        accessed_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        INDEX idx_quiz_id (quiz_id),
        INDEX idx_email (email),
        INDEX idx_access_token (access_token),
        INDEX idx_expires_at (expires_at),
        UNIQUE KEY unique_quiz_participant (quiz_id, email)
      )
    `);
    console.log('📋 Quiz participants table created/verified');
  } catch (error) {
    console.error('Error creating participants table:', error);
  }
}

// =================== ROUTES ===================

// Health check endpoint
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

// Get specific quiz by ID with randomization options
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
    
    // Get admin-configured randomization settings
    let randomizationSettings = {
      randomizeQuestions: false,
      randomizeOptions: false,
      questionLimit: null
    };
    
    let proctoringSettings = {
      enabled: false,
      level: 'basic',
      strictMode: false
    };
    
    if (quiz.randomization_settings) {
      try {
        randomizationSettings = JSON.parse(quiz.randomization_settings);
      } catch (e) {
        console.warn('Failed to parse randomization settings:', e);
      }
    }
    
    if (quiz.proctoring_settings) {
      try {
        proctoringSettings = JSON.parse(quiz.proctoring_settings);
      } catch (e) {
        console.warn('Failed to parse proctoring settings:', e);
      }
    }
    
    // Use admin settings, but allow override via query parameters for testing
    const randomizeQuestions = req.query.randomize_questions !== undefined ? 
      req.query.randomize_questions === 'true' : randomizationSettings.randomizeQuestions;
    const randomizeOptions = req.query.randomize_options !== undefined ? 
      req.query.randomize_options === 'true' : randomizationSettings.randomizeOptions;
    const questionLimit = req.query.question_limit ? 
      parseInt(req.query.question_limit) : randomizationSettings.questionLimit;
    const sessionId = req.query.session_id; // For tracking randomized versions
    
    console.log(`\n🎲 Quiz ${quiz.id} requested with randomization options:`);
    console.log(`  Randomize Questions: ${randomizeQuestions}`);
    console.log(`  Randomize Options: ${randomizeOptions}`);
    console.log(`  Question Limit: ${questionLimit}`);
    console.log(`  Session ID: ${sessionId}`);
    
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
      
      // Apply randomization if requested
      if (randomizeQuestions || randomizeOptions || questionLimit) {
        questions = randomizeQuiz(questions, randomizeQuestions, randomizeOptions, questionLimit);
        console.log(`🎲 Applied randomization - Final question count: ${questions.length}`);
        
        // Log randomization to proctoring system if session_id provided
        if (sessionId && (randomizeQuestions || randomizeOptions)) {
          try {
            // This would be logged to proctoring system
            console.log(`📹 Logging randomization for session ${sessionId}`);
          } catch (proctoringError) {
            console.error('Failed to log randomization:', proctoringError);
          }
        }
      }
      
      res.json({
        name: quiz.name,
        description: quiz.description,
        questions: questions,
        pointsPerQuestion: quiz.points_per_question,
        isCustom: quiz.is_custom,
        randomizationApplied: {
          questions: randomizeQuestions,
          options: randomizeOptions,
          questionLimit: questionLimit,
          finalQuestionCount: questions.length
        },
        proctoringSettings: proctoringSettings
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
        isCustom: quiz.is_custom,
        randomizationApplied: {
          questions: false,
          options: false,
          questionLimit: null,
          finalQuestionCount: 0
        },
        proctoringSettings: proctoringSettings
      });
    }
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz' });
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

// FIX 2: Update the /api/results endpoint with improved logging and robust parsing
app.get('/api/results', authenticateAdmin, async (req, res) => {
  try {
    const [results] = await pool.execute(`
      SELECT * FROM assessment_results 
      ORDER BY completion_time DESC
    `);
    
    console.log(`📊 Processing ${results.length} results from database`);
    
    const formattedResults = results.map((result, index) => {
      console.log(`🔄 Processing result ${index + 1}/${results.length} for ${result.email}`);
      // FIX: Use safeJSONParse for answers field
      let answers = [];
      if (result.answers) {
        console.log(`  Answers type: ${typeof result.answers}, length: ${result.answers?.length || 'N/A'}`);
        answers = safeJSONParse(result.answers, []);
        console.log(`  Parsed answers count: ${Array.isArray(answers) ? answers.length : 'Invalid'}`);
      }
      return {
        name: result.name,
        email: result.email,
        assessmentTrack: result.assessment_track,
        trackId: result.track_id,
        loginDateTime: result.login_date_time ? 
          (result.login_date_time instanceof Date ? 
            result.login_date_time.toISOString() : 
            new Date(result.login_date_time).toISOString()) : null,
        completionTime: result.completion_time ? 
          (result.completion_time instanceof Date ? 
            result.completion_time.toISOString() : 
            new Date(result.completion_time).toISOString()) : null,
        maxScore: result.max_score,
        achievedScore: result.achieved_score,
        totalQuestions: result.total_questions,
        duration: result.duration_seconds,
        answers: answers
      };
    });
    
    console.log(`✅ Successfully processed ${formattedResults.length} results`);
    res.json(formattedResults);
  } catch (error) {
    console.error('❌ Get results error:', error);
    res.status(500).json({ error: 'Failed to fetch results', details: error.message });
  }
});

// FIX 3: Update the /api/results/recent endpoint with improved logging and robust parsing
app.get('/api/results/recent', authenticateAdmin, async (req, res) => {
  try {
    const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000));
    const [results] = await pool.execute(`
      SELECT * FROM assessment_results 
      WHERE completion_time >= ?
      ORDER BY completion_time DESC
    `, [twoHoursAgo]);
    
    console.log(`📊 Processing ${results.length} recent results from database`);
    
    const formattedResults = results.map((result, index) => {
      console.log(`🔄 Processing recent result ${index + 1}/${results.length} for ${result.email}`);
      // FIX: Use safeJSONParse for answers field
      let answers = [];
      if (result.answers) {
        console.log(`  Answers type: ${typeof result.answers}, length: ${result.answers?.length || 'N/A'}`);
        answers = safeJSONParse(result.answers, []);
        console.log(`  Parsed answers count: ${Array.isArray(answers) ? answers.length : 'Invalid'}`);
      }
      return {
        name: result.name,
        email: result.email,
        assessmentTrack: result.assessment_track,
        trackId: result.track_id,
        loginDateTime: result.login_date_time ? 
          (result.login_date_time instanceof Date ? 
            result.login_date_time.toISOString() : 
            new Date(result.login_date_time).toISOString()) : null,
        completionTime: result.completion_time ? 
          (result.completion_time instanceof Date ? 
            result.completion_time.toISOString() : 
            new Date(result.completion_time).toISOString()) : null,
        maxScore: result.max_score,
        achievedScore: result.achieved_score,
        totalQuestions: result.total_questions,
        duration: result.duration_seconds,
        answers: answers
      };
    });
    
    console.log(`✅ Successfully processed ${formattedResults.length} recent results`);
    res.json(formattedResults);
  } catch (error) {
    console.error('❌ Get recent results error:', error);
    res.status(500).json({ error: 'Failed to fetch recent results', details: error.message });
  }
});

// FIX 4: Add database cleanup function to handle corrupted data
async function cleanupCorruptedData() {
  try {
    console.log('🧹 Starting database cleanup...');
    // Find and fix NULL or empty answers
    const [nullAnswers] = await pool.execute(`
      SELECT id, email, answers FROM assessment_results 
      WHERE answers IS NULL OR answers = '' OR answers = 'null'
    `);
    if (nullAnswers.length > 0) {
      console.log(`🔧 Found ${nullAnswers.length} records with NULL/empty answers - fixing...`);
      await pool.execute(`
        UPDATE assessment_results 
        SET answers = '[]' 
        WHERE answers IS NULL OR answers = '' OR answers = 'null'
      `);
      console.log(`✅ Fixed ${nullAnswers.length} records with empty answers`);
    }
    // Find and fix malformed JSON
    const [allResults] = await pool.execute(`
      SELECT id, email, answers FROM assessment_results 
      WHERE answers IS NOT NULL AND answers != ''
    `);
    let fixedCount = 0;
    for (const result of allResults) {
      if (typeof result.answers === 'string') {
        try {
          JSON.parse(result.answers);
        } catch (error) {
          console.log(`🔧 Fixing malformed JSON for ${result.email}`);
          await pool.execute(`
            UPDATE assessment_results 
            SET answers = '[]' 
            WHERE id = ?
          `, [result.id]);
          fixedCount++;
        }
      }
    }
    if (fixedCount > 0) {
      console.log(`✅ Fixed ${fixedCount} records with malformed JSON`);
    }
    console.log('🧹 Database cleanup completed');
  } catch (error) {
    console.error('❌ Database cleanup error:', error);
  }
}

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

// Database health check and repair endpoint
app.post('/api/admin/repair-database', authenticateAdmin, async (req, res) => {
  try {
    console.log('🔧 Starting database repair...');
    let repairLog = [];
    
    // Check and fix NULL or empty JSON fields in assessment_results
    const [invalidResults] = await pool.execute(`
      SELECT id, answers FROM assessment_results 
      WHERE answers IS NULL OR answers = '' OR answers = 'null'
    `);
    
    if (invalidResults.length > 0) {
      repairLog.push(`Found ${invalidResults.length} results with invalid answers JSON`);
      
      // Fix them by setting to empty array
      await pool.execute(`
        UPDATE assessment_results 
        SET answers = '[]' 
        WHERE answers IS NULL OR answers = '' OR answers = 'null'
      `);
      
      repairLog.push(`Fixed ${invalidResults.length} invalid answers fields`);
    }
    
    // Check for any other JSON field issues
    const [invalidQuizzes] = await pool.execute(`
      SELECT id, questions FROM quizzes 
      WHERE questions IS NULL OR questions = '' OR questions = 'null'
    `);
    
    if (invalidQuizzes.length > 0) {
      repairLog.push(`Found ${invalidQuizzes.length} quizzes with invalid questions JSON`);
      
      await pool.execute(`
        UPDATE quizzes 
        SET questions = '[]' 
        WHERE questions IS NULL OR questions = '' OR questions = 'null'
      `);
      
      repairLog.push(`Fixed ${invalidQuizzes.length} invalid questions fields`);
    }
    
    console.log('✅ Database repair completed');
    res.json({ 
      message: 'Database repair completed',
      repairLog: repairLog
    });
  } catch (error) {
    console.error('Database repair error:', error);
    res.status(500).json({ error: 'Database repair failed', details: error.message });
  }
});

// =================== BUCKET MANAGEMENT ENDPOINTS (Admin only) ===================
// Get all question buckets
app.get('/api/admin/buckets', authenticateAdmin, async (req, res) => {
  try {
    const [buckets] = await pool.execute(`
      SELECT * FROM question_buckets 
      WHERE is_active = TRUE 
      ORDER BY subject, name
    `);
    // Always return consistent data shape
    res.json(buckets.map(b => ({
      ...b,
      description: b.description || '',
      total_questions: b.total_questions || 0,
      easy_count: b.easy_count || 0,
      medium_count: b.medium_count || 0,
      hard_count: b.hard_count || 0,
      is_active: b.is_active !== false // always boolean
    })));
  } catch (error) {
    console.error('Get buckets error:', error);
    res.status(500).json({ error: 'Failed to get question buckets', details: error.message });
  }
});

// Get bucket details with questions
app.get('/api/admin/buckets/:id', authenticateAdmin, async (req, res) => {
  try {
    const bucketId = req.params.id;
    const [buckets] = await pool.execute(`
      SELECT * FROM question_buckets WHERE id = ? AND is_active = TRUE
    `, [bucketId]);
    if (buckets.length === 0) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    const [questions] = await pool.execute(`
      SELECT * FROM questions 
      WHERE bucket_id = ? AND is_active = TRUE 
      ORDER BY difficulty, created_at
    `, [bucketId]);
    res.json({
      bucket: buckets[0],
      questions: questions.map(q => ({
        ...q,
        options: safeJSONParse(q.options, []),
        tags: q.tags ? safeJSONParse(q.tags, []) : []
      }))
    });
  } catch (error) {
    console.error('Get bucket details error:', error);
    res.status(500).json({ error: 'Failed to get bucket details' });
  }
});

// Create new question bucket
app.post('/api/admin/buckets', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, subject } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Bucket name is required and must be a non-empty string.' });
    }
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required and must be a non-empty string.' });
    }
    const [result] = await pool.execute(`
      INSERT INTO question_buckets (name, description, subject)
      VALUES (?, ?, ?)
    `, [name.trim(), description ? description.trim() : '', subject.trim()]);
    // Return the full bucket object
    const [buckets] = await pool.execute('SELECT * FROM question_buckets WHERE id = ?', [result.insertId]);
    res.json({ message: 'Bucket created successfully', bucket: buckets[0] });
  } catch (error) {
    console.error('Create bucket error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Bucket with this name already exists in the subject.' });
    } else {
      res.status(500).json({ error: 'Failed to create bucket', details: error.message });
    }
  }
});

// Update question bucket
app.put('/api/admin/buckets/:id', authenticateAdmin, async (req, res) => {
  try {
    const bucketId = req.params.id;
    const { name, description, subject, is_active } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Bucket name is required and must be a non-empty string.' });
    }
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required and must be a non-empty string.' });
    }
    await pool.execute(`
      UPDATE question_buckets 
      SET name = ?, description = ?, subject = ?, is_active = ?
      WHERE id = ?
    `, [name.trim(), description ? description.trim() : '', subject.trim(), is_active !== false, bucketId]);
    // Return the updated bucket
    const [buckets] = await pool.execute('SELECT * FROM question_buckets WHERE id = ?', [bucketId]);
    res.json({ message: 'Bucket updated successfully', bucket: buckets[0] });
  } catch (error) {
    console.error('Update bucket error:', error);
    res.status(500).json({ error: 'Failed to update bucket', details: error.message });
  }
});

// Add question to bucket
app.post('/api/admin/buckets/:id/questions', authenticateAdmin, async (req, res) => {
  try {
    const bucketId = req.params.id;
    let { question_text, options, correct_answer, difficulty, points, explanation, tags } = req.body;
    if (!question_text || typeof question_text !== 'string' || !question_text.trim()) {
      return res.status(400).json({ error: 'Question text is required and must be a non-empty string.' });
    }
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Options must be an array with at least 2 items.' });
    }
    if (typeof correct_answer !== 'number' || correct_answer < 0 || correct_answer >= options.length) {
      return res.status(400).json({ error: 'Correct answer index is invalid.' });
    }
    if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'Difficulty must be one of: easy, medium, hard.' });
    }
    if (!Array.isArray(tags)) tags = [];
    const [result] = await pool.execute(`
      INSERT INTO questions (bucket_id, question_text, options, correct_answer, difficulty, points, explanation, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      bucketId,
      question_text.trim(),
      JSON.stringify(options),
      correct_answer,
      difficulty,
      points || 1,
      explanation ? explanation.trim() : '',
      tags.length > 0 ? JSON.stringify(tags) : null
    ]);
    await updateBucketCounts(bucketId);
    // Return the full question object
    const [questions] = await pool.execute('SELECT * FROM questions WHERE id = ?', [result.insertId]);
    res.json({ message: 'Question added successfully', question: questions[0] });
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({ error: 'Failed to add question', details: error.message });
  }
});

// Update question in bucket
app.put('/api/admin/questions/:id', authenticateAdmin, async (req, res) => {
  try {
    const questionId = req.params.id;
    const { question_text, options, correct_answer, difficulty, points, explanation, tags, is_active } = req.body;
    const [result] = await pool.execute(`
      UPDATE questions 
      SET question_text = ?, options = ?, correct_answer = ?, difficulty = ?, 
          points = ?, explanation = ?, tags = ?, is_active = ?
      WHERE id = ?
    `, [
      question_text,
      JSON.stringify(options),
      correct_answer,
      difficulty,
      points || 1,
      explanation || '',
      tags ? JSON.stringify(tags) : null,
      is_active,
      questionId
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const [question] = await pool.execute('SELECT bucket_id FROM questions WHERE id = ?', [questionId]);
    if (question.length > 0) {
      await updateBucketCounts(question[0].bucket_id);
    }
    res.json({ message: 'Question updated successfully' });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question from bucket
app.delete('/api/admin/questions/:id', authenticateAdmin, async (req, res) => {
  try {
    const questionId = req.params.id;
    const [question] = await pool.execute('SELECT bucket_id FROM questions WHERE id = ?', [questionId]);
    const [result] = await pool.execute('DELETE FROM questions WHERE id = ?', [questionId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (question.length > 0) {
      await updateBucketCounts(question[0].bucket_id);
    }
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Create quiz from bucket
app.post('/api/admin/quizzes/from-bucket', authenticateAdmin, async (req, res) => {
  try {
    const { 
      quizId, 
      quizName, 
      description, 
      bucketId, 
      easyCount, 
      mediumCount, 
      hardCount,
      randomization_settings,
      proctoring_settings,
      totalQuestions,
      selectedQuestions
    } = req.body;

    // ...existing code to select questions from bucket...
    // (Assume selectedQuestions and quizQuestions are prepared above)

    // Prepare quizQuestions array if not already
    const quizQuestions = (selectedQuestions || []).map(q => ({
      ...q,
      options: JSON.parse(q.options),
      correct: q.correct_answer,
      points: q.points
    }));

    // Create the quiz
    await pool.execute(`
      INSERT INTO quizzes (id, name, description, questions, points_per_question, is_custom, randomization_settings, proctoring_settings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      quizId,
      quizName,
      description,
      JSON.stringify(quizQuestions),
      1, // Default points per question
      true,
      JSON.stringify(randomization_settings || {}),
      JSON.stringify(proctoring_settings || {})
    ]);

    // Record the bucket mapping
    await pool.execute(`
      INSERT INTO quiz_bucket_mappings (quiz_id, bucket_id, easy_count, medium_count, hard_count, total_questions)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [quizId, bucketId, easyCount, mediumCount, hardCount, totalQuestions]);

    res.json({ 
      message: 'Quiz created successfully from bucket',
      quizId,
      questionsSelected: selectedQuestions ? selectedQuestions.length : 0
    });
  } catch (error) {
    console.error('Create quiz from bucket error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Quiz with this ID already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create quiz from bucket' });
    }
  }
});

// =================== CODING CHALLENGE ENDPOINTS ===================
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

// =================== PARTICIPANT/INVITATION ENDPOINTS ===================
// Send email invitations to participants (Admin only)
app.post('/api/admin/send-invitations', authenticateAdmin, async (req, res) => {
  try {
    const { quizId, participants, customMessage, assessmentLink } = req.body;
    if (!quizId || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Quiz ID and participants array are required' });
    }
    const [quiz] = await pool.execute('SELECT name FROM quizzes WHERE id = ?', [quizId]);
    if (quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const quizName = quiz[0].name;
    const results = [];
    for (const participant of participants) {
      try {
        const accessToken = generateAccessToken(participant.email, quizId);
        const personalizedLink = `${assessmentLink}&token=${accessToken}`;
        await pool.execute(`
          INSERT INTO quiz_participants (quiz_id, name, email, department, access_token, invited_at)
          VALUES (?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), invited_at = NOW()
        `, [quizId, participant.name, participant.email, participant.department || '', accessToken]);
        // Simulate email sending
        results.push({
          email: participant.email,
          status: 'sent',
          accessToken: accessToken,
          personalizedLink: personalizedLink
        });
      } catch (error) {
        results.push({
          email: participant.email,
          status: 'failed',
          error: error.message
        });
      }
    }
    const successCount = results.filter(r => r.status === 'sent').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    res.json({
      message: `Invitations processed: ${successCount} sent, ${failedCount} failed`,
      results,
      summary: {
        total: participants.length,
        sent: successCount,
        failed: failedCount
      }
    });
  } catch (error) {
    console.error('Send invitations error:', error);
    res.status(500).json({ error: 'Failed to send invitations' });
  }
});

// Get participant list for a quiz (Admin only)
app.get('/api/admin/quizzes/:id/participants', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    const [participants] = await pool.execute(`
      SELECT qp.*, ar.completion_time, ar.achieved_score, ar.max_score
      FROM quiz_participants qp
      LEFT JOIN assessment_results ar ON qp.email = ar.email AND qp.quiz_id = ar.track_id
      WHERE qp.quiz_id = ?
      ORDER BY qp.invited_at DESC
    `, [quizId]);
    res.json(participants);
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

// Verify participant access token
app.get('/api/verify-access/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const [participants] = await pool.execute(`
      SELECT qp.*, q.name as quiz_name, q.questions, q.proctoring_settings, q.randomization_settings
      FROM quiz_participants qp
      JOIN quizzes q ON qp.quiz_id = q.id
      WHERE qp.access_token = ? AND qp.expires_at > NOW()
    `, [token]);
    if (participants.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired access token' });
    }
    const participant = participants[0];
    res.json({
      valid: true,
      participant: {
        name: participant.name,
        email: participant.email,
        quizId: participant.quiz_id,
        quizName: participant.quiz_name
      },
      quiz: {
        id: participant.quiz_id,
        name: participant.quiz_name,
        questions: JSON.parse(participant.questions || '[]'),
        proctoringSettings: JSON.parse(participant.proctoring_settings || '{}'),
        randomizationSettings: JSON.parse(participant.randomization_settings || '{}')
      }
    });
  } catch (error) {
    console.error('Verify access token error:', error);
    res.status(500).json({ error: 'Failed to verify access token' });
  }
});

// Helper function to generate access tokens
function generateAccessToken(email, quizId) {
  const crypto = require('crypto');
  const data = `${email}-${quizId}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// =================== ADMIN QUIZ MANAGEMENT ENDPOINTS ===================

// Create new quiz (Admin)
app.post('/api/quizzes', authenticateAdmin, async (req, res) => {
  try {
    const { id, name, description, questions, pointsPerQuestion, randomizationSettings, proctoringSettings } = req.body;
    
    if (!id || !name || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Quiz ID, name, and questions array are required' });
    }
    
    await pool.execute(`
      INSERT INTO quizzes (id, name, description, questions, points_per_question, is_custom, randomization_settings, proctoring_settings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      name,
      description || '',
      JSON.stringify(questions),
      pointsPerQuestion || 1,
      true,
      randomizationSettings ? JSON.stringify(randomizationSettings) : null,
      proctoringSettings ? JSON.stringify(proctoringSettings) : null
    ]);
    
    res.status(201).json({ message: 'Quiz created successfully', quizId: id });
  } catch (error) {
    console.error('Create quiz error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Quiz with this ID already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create quiz' });
    }
  }
});

// Update quiz (Admin)
app.put('/api/quizzes/:id', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    const { name, description, questions, pointsPerQuestion, randomizationSettings, proctoringSettings } = req.body;
    
    const [result] = await pool.execute(`
      UPDATE quizzes 
      SET name = ?, description = ?, questions = ?, points_per_question = ?, 
          randomization_settings = ?, proctoring_settings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name,
      description,
      JSON.stringify(questions),
      pointsPerQuestion,
      randomizationSettings ? JSON.stringify(randomizationSettings) : null,
      proctoringSettings ? JSON.stringify(proctoringSettings) : null,
      quizId
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    res.json({ message: 'Quiz updated successfully' });
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
});

// Delete quiz (Admin)
app.delete('/api/quizzes/:id', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    
    const [result] = await pool.execute('DELETE FROM quizzes WHERE id = ? AND is_custom = TRUE', [quizId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Quiz not found or cannot be deleted (default quiz)' });
    }
    
    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});

// Add question to existing quiz (Admin)
app.post('/api/quizzes/:id/questions/single', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    const { question, options, correct } = req.body;
    
    if (!question || !options || !Array.isArray(options) || correct === undefined) {
      return res.status(400).json({ error: 'Question, options array, and correct answer are required' });
    }
    
    // Get current quiz
    const [quiz] = await pool.execute('SELECT questions FROM quizzes WHERE id = ?', [quizId]);
    if (quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Parse current questions
    let questions = [];
    try {
      questions = JSON.parse(quiz[0].questions || '[]');
    } catch (e) {
      questions = [];
    }
    
    // Add new question
    questions.push({ question, options, correct });
    
    // Update quiz
    await pool.execute(`
      UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [JSON.stringify(questions), quizId]);
    
    res.json({ message: 'Question added successfully', questionCount: questions.length });
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

// Update specific question in quiz (Admin)
app.put('/api/quizzes/:id/questions/:index', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    const questionIndex = parseInt(req.params.index);
    const { question, options, correct } = req.body;
    
    if (!question || !options || !Array.isArray(options) || correct === undefined) {
      return res.status(400).json({ error: 'Question, options array, and correct answer are required' });
    }
    
    // Get current quiz
    const [quiz] = await pool.execute('SELECT questions FROM quizzes WHERE id = ?', [quizId]);
    if (quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Parse current questions
    let questions = [];
    try {
      questions = JSON.parse(quiz[0].questions || '[]');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid questions format in quiz' });
    }
    
    if (questionIndex < 0 || questionIndex >= questions.length) {
      return res.status(404).json({ error: 'Question index out of range' });
    }
    
    // Update question
    questions[questionIndex] = { question, options, correct };
    
    // Update quiz
    await pool.execute(`
      UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [JSON.stringify(questions), quizId]);
    
    res.json({ message: 'Question updated successfully' });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete specific question from quiz (Admin)
app.delete('/api/quizzes/:id/questions/:index', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    const questionIndex = parseInt(req.params.index);
    
    // Get current quiz
    const [quiz] = await pool.execute('SELECT questions FROM quizzes WHERE id = ?', [quizId]);
    if (quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Parse current questions
    let questions = [];
    try {
      questions = JSON.parse(quiz[0].questions || '[]');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid questions format in quiz' });
    }
    
    if (questionIndex < 0 || questionIndex >= questions.length) {
      return res.status(404).json({ error: 'Question index out of range' });
    }
    
    // Remove question
    questions.splice(questionIndex, 1);
    
    // Update quiz
    await pool.execute(`
      UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [JSON.stringify(questions), quizId]);
    
    res.json({ message: 'Question deleted successfully', questionCount: questions.length });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Add multiple questions to quiz (Admin)
app.post('/api/quizzes/:id/questions', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    const { questions } = req.body;
    
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions array is required' });
    }
    
    // Get current quiz
    const [quiz] = await pool.execute('SELECT questions FROM quizzes WHERE id = ?', [quizId]);
    if (quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Parse current questions
    let currentQuestions = [];
    try {
      currentQuestions = JSON.parse(quiz[0].questions || '[]');
    } catch (e) {
      currentQuestions = [];
    }
    
    // Add new questions
    currentQuestions.push(...questions);
    
    // Update quiz
    await pool.execute(`
      UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [JSON.stringify(currentQuestions), quizId]);
    
    res.json({ 
      message: 'Questions added successfully', 
      questionsAdded: questions.length,
      totalQuestions: currentQuestions.length 
    });
  } catch (error) {
    console.error('Add questions error:', error);
    res.status(500).json({ error: 'Failed to add questions' });
  }
});

// =================== ADMIN UTILITY ENDPOINTS ===================

// Initialize default quizzes (Admin)
app.post('/api/admin/initialize-defaults', authenticateAdmin, async (req, res) => {
  try {
    console.log('🔧 Initializing default quizzes...');
    
    // Check which default quizzes need questions
    const [quizzes] = await pool.execute(`
      SELECT id, name, questions FROM quizzes WHERE is_custom = FALSE
    `);
    
    let updatedCount = 0;
    
    for (const quiz of quizzes) {
      let questions;
      try {
        questions = JSON.parse(quiz.questions || '[]');
      } catch (e) {
        questions = [];
      }
      
      if (questions.length === 0) {
        // Add sample questions based on quiz type
        let sampleQuestions = [];
        
        if (quiz.id === 'javascript') {
          sampleQuestions = [
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
            }
          ];
        } else if (quiz.id === 'python') {
          sampleQuestions = [
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
            }
          ];
        } else if (quiz.id === 'react') {
          sampleQuestions = [
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
            }
          ];
        }
        
        if (sampleQuestions.length > 0) {
          await pool.execute(`
            UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [JSON.stringify(sampleQuestions), quiz.id]);
          updatedCount++;
          console.log(`✅ Added ${sampleQuestions.length} questions to ${quiz.name}`);
        }
      }
    }
    
    res.json({ 
      message: `Default quizzes initialized successfully. Updated ${updatedCount} quizzes.`,
      updatedCount 
    });
  } catch (error) {
    console.error('Initialize defaults error:', error);
    res.status(500).json({ error: 'Failed to initialize default quizzes' });
  }
});

// Repair quiz data (Admin)
app.post('/api/admin/repair-quiz/:id', authenticateAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    
    // Get quiz
    const [quiz] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quizData = quiz[0];
    let questions = [];
    let repaired = false;
    
    // Try to parse questions
    try {
      if (typeof quizData.questions === 'string') {
        questions = JSON.parse(quizData.questions);
      } else if (Array.isArray(quizData.questions)) {
        questions = quizData.questions;
      }
    } catch (e) {
      // Questions are corrupted, use empty array
      questions = [];
      repaired = true;
    }
    
    // Ensure questions is an array
    if (!Array.isArray(questions)) {
      questions = [];
      repaired = true;
    }
    
    // Update the quiz with fixed questions
    if (repaired) {
      await pool.execute(`
        UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [JSON.stringify(questions), quizId]);
    }
    
    res.json({
      message: `Quiz ${quizId} repair completed`,
      repaired: repaired,
      questionsCount: questions.length
    });
  } catch (error) {
    console.error('Repair quiz error:', error);
    res.status(500).json({ error: 'Failed to repair quiz' });
  }
});

// Fix quiz data (Admin)
app.post('/api/admin/fix-quiz-data', authenticateAdmin, async (req, res) => {
  try {
    console.log('🔧 Starting quiz data repair...');
    
    const [quizzes] = await pool.execute('SELECT id, questions FROM quizzes');
    let repairedCount = 0;
    
    for (const quiz of quizzes) {
      let needsRepair = false;
      let questions = [];
      
      try {
        if (quiz.questions === null || quiz.questions === '') {
          needsRepair = true;
          questions = [];
        } else if (typeof quiz.questions === 'string') {
          questions = JSON.parse(quiz.questions);
          if (!Array.isArray(questions)) {
            needsRepair = true;
            questions = [];
          }
        } else if (!Array.isArray(quiz.questions)) {
          needsRepair = true;
          questions = [];
        } else {
          questions = quiz.questions;
        }
      } catch (e) {
        needsRepair = true;
        questions = [];
      }
      
      if (needsRepair) {
        await pool.execute(`
          UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [JSON.stringify(questions), quiz.id]);
        repairedCount++;
        console.log(`🔧 Repaired quiz: ${quiz.id}`);
      }
    }
    
    res.json({
      message: `Quiz data repair completed. Repaired ${repairedCount} quizzes.`,
      repairedCount
    });
  } catch (error) {
    console.error('Fix quiz data error:', error);
    res.status(500).json({ error: 'Failed to fix quiz data' });
  }
});

// Delete all quizzes (Admin)
app.delete('/api/admin/quizzes/all', authenticateAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM quizzes');
    res.json({ 
      message: `Successfully deleted all quizzes. ${result.affectedRows} quizzes removed.`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Delete all quizzes error:', error);
    res.status(500).json({ error: 'Failed to delete all quizzes' });
  }
});

// Clear all results (Admin)
app.delete('/api/results', authenticateAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM assessment_results');
    res.json({ 
      message: `Successfully cleared all results. ${result.affectedRows} results removed.`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Clear results error:', error);
    res.status(500).json({ error: 'Failed to clear results' });
  }
});

// Health check with detailed info (Admin)
app.get('/api/admin/health-check', authenticateAdmin, async (req, res) => {
  try {
    const healthReport = {
      timestamp: new Date().toISOString(),
      database: { connection: 'OK' },
      quizzes: { totalCount: 0, details: [] },
      results: { totalCount: 0 }
    };
    
    // Test database connection
    try {
      await pool.execute('SELECT 1');
      healthReport.database.connection = 'OK';
    } catch (dbError) {
      healthReport.database.connection = 'ERROR';
      healthReport.database.error = dbError.message;
    }
    
    // Check quizzes
    try {
      const [quizzes] = await pool.execute('SELECT id, name, questions FROM quizzes');
      healthReport.quizzes.totalCount = quizzes.length;
      
      for (const quiz of quizzes) {
        const quizStatus = {
          id: quiz.id,
          name: quiz.name,
          status: 'OK',
          issues: []
        };
        
        // Check questions
        try {
          let questions = [];
          if (quiz.questions === null || quiz.questions === '') {
            quizStatus.status = 'WARNING';
            quizStatus.issues.push('No questions found');
          } else if (typeof quiz.questions === 'string') {
            questions = JSON.parse(quiz.questions);
            if (!Array.isArray(questions)) {
              quizStatus.status = 'ERROR';
              quizStatus.issues.push('Questions is not an array');
            } else if (questions.length === 0) {
              quizStatus.status = 'WARNING';
              quizStatus.issues.push('Empty questions array');
            }
          } else if (!Array.isArray(quiz.questions)) {
            quizStatus.status = 'ERROR';
            quizStatus.issues.push('Questions field is not valid');
          }
        } catch (parseError) {
          quizStatus.status = 'ERROR';
          quizStatus.issues.push('Invalid JSON in questions field');
        }
        
        healthReport.quizzes.details.push(quizStatus);
      }
    } catch (quizzesError) {
      healthReport.quizzes.error = quizzesError.message;
    }
    
    // Check results
    try {
      const [results] = await pool.execute('SELECT COUNT(*) as count FROM assessment_results');
      healthReport.results.totalCount = results[0].count;
    } catch (resultsError) {
      healthReport.results.error = resultsError.message;
    }
    
    res.json(healthReport);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Debug endpoints for quiz data
app.get('/api/debug/quiz-summary', authenticateAdmin, async (req, res) => {
  try {
    const [quizzes] = await pool.execute('SELECT id, name, questions FROM quizzes');
    
    const summary = quizzes.map(quiz => {
      let questionCount = 0;
      let questionsType = typeof quiz.questions;
      let parseError = null;
      
      try {
        if (quiz.questions === null || quiz.questions === '') {
          questionCount = 0;
        } else if (typeof quiz.questions === 'string') {
          const parsed = JSON.parse(quiz.questions);
          if (Array.isArray(parsed)) {
            questionCount = parsed.length;
          } else {
            questionCount = -1; // Invalid format
          }
        } else if (Array.isArray(quiz.questions)) {
          questionCount = quiz.questions.length;
        } else {
          questionCount = -1; // Invalid format
        }
      } catch (e) {
        parseError = e.message;
        questionCount = -1;
      }
      
      return {
        id: quiz.id,
        name: quiz.name,
        questionCount,
        questionsType,
        parseError
      };
    });
    
    res.json(summary);
  } catch (error) {
    console.error('Debug quiz summary error:', error);
    res.status(500).json({ error: 'Failed to get quiz summary' });
  }
});

app.get('/api/debug/quiz-detailed/:id', authenticateAdmin, async (req, res) => {
  try {
    const [quiz] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    
    if (quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const quizData = quiz[0];
    const debug = {
      id: quizData.id,
      name: quizData.name,
      questionsType: typeof quizData.questions,
      questionsLength: quizData.questions ? quizData.questions.length : null,
      isString: typeof quizData.questions === 'string',
      isArray: Array.isArray(quizData.questions),
      isObject: typeof quizData.questions === 'object' && !Array.isArray(quizData.questions),
      isNull: quizData.questions === null
    };
    
    // Try to parse if string
    if (typeof quizData.questions === 'string') {
      try {
        const parsed = JSON.parse(quizData.questions);
        debug.parseSuccess = true;
        debug.parsedType = typeof parsed;
        debug.parsedIsArray = Array.isArray(parsed);
        debug.parsedLength = Array.isArray(parsed) ? parsed.length : null;
      } catch (e) {
        debug.parseSuccess = false;
        debug.parseError = e.message;
      }
    }
    
    res.json(debug);
  } catch (error) {
    console.error('Debug quiz detailed error:', error);
    res.status(500).json({ error: 'Failed to get quiz details' });
  }
});

// Import quiz pool from CSV (Admin)
app.post('/api/admin/import-quiz-pool', authenticateAdmin, async (req, res) => {
  try {
    const { csvData } = req.body;
    
    if (!csvData) {
      return res.status(400).json({ error: 'CSV data is required' });
    }
    
    const lines = csvData.trim().split('\n');
    const results = [];
    const summary = {
      totalQuizzes: 0,
      createdQuizzes: 0,
      updatedQuizzes: 0,
      processedQuestions: 0,
      skippedLines: 0,
      errors: 0
    };
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        summary.skippedLines++;
        continue;
      }
      
      try {
        // Parse CSV line: Quiz Code, Quiz Name, Question, Option A, Option B, Option C, Option D, Correct Answer
        const fields = parseCSVLine(line);
        
        if (fields.length < 8) {
          summary.skippedLines++;
          continue;
        }
        
        const [quizCode, quizName, question, optionA, optionB, optionC, optionD, correctAnswer] = fields;
        const options = [optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim()];
        const correct = parseInt(correctAnswer.trim());
        
        if (isNaN(correct) || correct < 0 || correct > 3) {
          summary.skippedLines++;
          continue;
        }
        
        // Check if quiz exists
        const [existingQuiz] = await pool.execute('SELECT questions FROM quizzes WHERE id = ?', [quizCode]);
        
        let currentQuestions = [];
        let action = 'created';
        
        if (existingQuiz.length > 0) {
          // Quiz exists, add to existing questions
          try {
            currentQuestions = JSON.parse(existingQuiz[0].questions || '[]');
          } catch (e) {
            currentQuestions = [];
          }
          action = 'updated';
        } else {
          // New quiz
          summary.totalQuizzes++;
        }
        
        // Add new question
        currentQuestions.push({
          question: question.trim(),
          options: options,
          correct: correct
        });
        
        // Update or create quiz
        if (existingQuiz.length > 0) {
          await pool.execute(`
            UPDATE quizzes SET questions = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [JSON.stringify(currentQuestions), quizCode]);
        } else {
          await pool.execute(`
            INSERT INTO quizzes (id, name, description, questions, points_per_question, is_custom)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            quizCode,
            quizName.trim(),
            `Imported quiz: ${quizName.trim()}`,
            JSON.stringify(currentQuestions),
            1,
            true
          ]);
        }
        
        // Update results tracking
        const existingResult = results.find(r => r.quizCode === quizCode);
        if (existingResult) {
          existingResult.questionsAdded++;
          existingResult.totalQuestions = currentQuestions.length;
        } else {
          results.push({
            quizCode,
            name: quizName.trim(),
            action: action,
            questionsAdded: 1,
            totalQuestions: currentQuestions.length
          });
          
          if (action === 'created') {
            summary.createdQuizzes++;
          } else {
            summary.updatedQuizzes++;
          }
        }
        
        summary.processedQuestions++;
        
      } catch (error) {
        console.error('Error processing line:', error);
        summary.errors++;
        results.push({
          line: i + 1,
          action: 'error',
          error: error.message
        });
      }
    }
    
    res.json({
      message: 'Quiz pool import completed',
      summary,
      results
    });
  } catch (error) {
    console.error('Import quiz pool error:', error);
    res.status(500).json({ error: 'Failed to import quiz pool' });
  }
});

// Helper function to parse CSV line with proper quote handling
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result.map(field => field.replace(/"/g, '').trim());
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
    console.log('🚀 Starting LTIMindtree Assessment Server...');
    
    // 1. Initialize database first
    console.log('📊 Step 1: Initializing database...');
    await initializeDatabase();

    // FIX 5: Call cleanup function during server startup
    await cleanupCorruptedData();

    // 2. Initialize proctoring module
    console.log('📹 Step 2: Initializing proctoring module...');
    await initializeProctoringModule();

    // 3. Create participants table
    console.log('👥 Step 3: Creating participants table...');
    await createParticipantsTable();

    // 4. Start the server
    console.log('🌐 Step 4: Starting HTTP server...');
    app.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on ${HOST}:${PORT}`);
      console.log(`📊 Health check: http://${HOST}:${PORT}/api/health`);
      console.log(`🔧 Admin panel: http://${HOST}:${PORT}/admin.html`);
      console.log(`📹 Proctoring API: http://${HOST}:${PORT}/api/proctoring`);
      console.log(`🎯 Assessment: http://${HOST}:${PORT}/assessment.html`);
      console.log(`🎉 Ready for production use!`);
      
      // Log all registered routes for debugging
      console.log('\n📋 Registered API Routes:');
      console.log('Authentication:');
      console.log('  POST /api/admin/login');
      console.log('Core Quiz Management:');
      console.log('  GET  /api/quizzes');
      console.log('  GET  /api/quizzes/:id');
      console.log('  POST /api/quizzes (Admin)');
      console.log('  PUT  /api/quizzes/:id (Admin)');
      console.log('  DELETE /api/quizzes/:id (Admin)');
      console.log('Question Management:');
      console.log('  POST /api/quizzes/:id/questions/single (Admin)');
      console.log('  POST /api/quizzes/:id/questions (Admin)');
      console.log('  PUT  /api/quizzes/:id/questions/:index (Admin)');
      console.log('  DELETE /api/quizzes/:id/questions/:index (Admin)');
      console.log('Results:');
      console.log('  POST /api/results');
      console.log('  GET  /api/results (Admin)');
      console.log('  GET  /api/results/recent (Admin)');
      console.log('  DELETE /api/results (Admin)');
      console.log('Statistics:');
      console.log('  GET  /api/stats (Admin)');
      console.log('Bucket Management:');
      console.log('  GET  /api/admin/buckets (Admin)');
      console.log('  GET  /api/admin/buckets/:id (Admin)');
      console.log('  POST /api/admin/buckets (Admin)');
      console.log('  PUT  /api/admin/buckets/:id (Admin)');
      console.log('  POST /api/admin/buckets/:id/questions (Admin)');
      console.log('  PUT  /api/admin/questions/:id (Admin)');
      console.log('  DELETE /api/admin/questions/:id (Admin)');
      console.log('  POST /api/admin/quizzes/from-bucket (Admin)');
      console.log('Proctoring:');
      console.log('  POST /api/proctoring/start');
      console.log('  POST /api/proctoring/log');
      console.log('  POST /api/proctoring/end');
      console.log('  GET  /api/proctoring/stats');
      console.log('  GET  /api/proctoring/sessions');
      console.log('  GET  /api/proctoring/session/:id');
      console.log('Admin Utilities:');
      console.log('  POST /api/admin/initialize-defaults (Admin)');
      console.log('  POST /api/admin/fix-quiz-data (Admin)');
      console.log('  POST /api/admin/repair-quiz/:id (Admin)');
      console.log('  DELETE /api/admin/quizzes/all (Admin)');
      console.log('  GET  /api/admin/health-check (Admin)');
      console.log('  POST /api/admin/import-quiz-pool (Admin)');
      console.log('Debug:');
      console.log('  GET  /api/debug/quiz-summary (Admin)');
      console.log('  GET  /api/debug/quiz-detailed/:id (Admin)');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
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