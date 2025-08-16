// Proctoring Module for LTIMindtree Assessment Platform
const express = require('express');

function createProctoringRouter(pool) {
  const router = express.Router();

  // Proctoring Manager Class
  class ProctoringManager {
    constructor(dbPool) {
      this.pool = dbPool;
      this.activeSessions = new Map();
      this.initialize();
    }

    async initialize() {
      try {
        // Create proctoring sessions table
        await this.pool.execute(`
          CREATE TABLE IF NOT EXISTS proctoring_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(100) UNIQUE NOT NULL,
            user_email VARCHAR(255) NOT NULL,
            user_name VARCHAR(255) NOT NULL,
            assessment_id VARCHAR(50) NOT NULL,
            proctoring_level ENUM('basic', 'standard', 'advanced') DEFAULT 'basic',
            status ENUM('active', 'completed', 'terminated', 'paused') DEFAULT 'active',
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP NULL,
            violation_count INT DEFAULT 0,
            strict_mode BOOLEAN DEFAULT FALSE,
            settings JSON,
            metadata JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_session_id (session_id),
            INDEX idx_user_email (user_email),
            INDEX idx_assessment_id (assessment_id),
            INDEX idx_status (status),
            INDEX idx_start_time (start_time)
          )
        `);

        // Create violation logs table
        await this.pool.execute(`
          CREATE TABLE IF NOT EXISTS proctoring_violations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(100) NOT NULL,
            violation_type ENUM('tab_switch', 'window_blur', 'multiple_faces', 'no_face', 'suspicious_audio', 'right_click', 'copy_paste', 'fullscreen_exit', 'browser_dev_tools', 'external_monitor') NOT NULL,
            severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
            description TEXT,
            evidence JSON,
            auto_flagged BOOLEAN DEFAULT FALSE,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_session_id (session_id),
            INDEX idx_violation_type (violation_type),
            INDEX idx_severity (severity),
            INDEX idx_timestamp (timestamp),
            FOREIGN KEY (session_id) REFERENCES proctoring_sessions(session_id) ON DELETE CASCADE
          )
        `);

        console.log('📹 Proctoring tables initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize proctoring tables:', error);
      }
    }

    async startSession(sessionData) {
      try {
        const {
          sessionId,
          userEmail,
          userName,
          assessmentId,
          proctoringLevel = 'basic',
          strictMode = false,
          settings = {}
        } = sessionData;

        // Insert session into database
        await this.pool.execute(`
          INSERT INTO proctoring_sessions (
            session_id, user_email, user_name, assessment_id, 
            proctoring_level, strict_mode, settings, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `, [sessionId, userEmail, userName, assessmentId, proctoringLevel, strictMode, JSON.stringify(settings)]);

        // Store in memory for quick access
        this.activeSessions.set(sessionId, {
          ...sessionData,
          violations: [],
          startTime: new Date(),
          lastActivity: new Date()
        });

        console.log(`📹 Started proctoring session: ${sessionId} for ${userEmail}`);
        return { success: true, sessionId };
      } catch (error) {
        console.error('❌ Failed to start proctoring session:', error);
        throw error;
      }
    }

    async logViolation(sessionId, violationData) {
      try {
        const {
          violationType,
          severity = 'medium',
          description = '',
          evidence = {},
          autoFlagged = true
        } = violationData;

        // Log violation to database
        await this.pool.execute(`
          INSERT INTO proctoring_violations (
            session_id, violation_type, severity, description, evidence, auto_flagged
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [sessionId, violationType, severity, description, JSON.stringify(evidence), autoFlagged]);

        // Update session violation count
        await this.pool.execute(`
          UPDATE proctoring_sessions 
          SET violation_count = violation_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ?
        `, [sessionId]);

        // Update in-memory session
        const session = this.activeSessions.get(sessionId);
        if (session) {
          session.violations.push({
            type: violationType,
            severity,
            timestamp: new Date(),
            description,
            evidence
          });
          session.lastActivity = new Date();

          // Check if session should be terminated (strict mode)
          if (session.strictMode && session.violations.length >= 3) {
            await this.terminateSession(sessionId, 'violation_threshold_exceeded');
          }
        }

        console.log(`⚠️ Logged violation: ${violationType} for session ${sessionId}`);
        return { success: true, violationCount: session ? session.violations.length : 0 };
      } catch (error) {
        console.error('❌ Failed to log violation:', error);
        throw error;
      }
    }

    async endSession(sessionId, reason = 'completed') {
      try {
        // Update database
        await this.pool.execute(`
          UPDATE proctoring_sessions 
          SET status = ?, end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ?
        `, [reason === 'completed' ? 'completed' : 'terminated', sessionId]);

        // Remove from memory
        this.activeSessions.delete(sessionId);

        console.log(`📹 Ended proctoring session: ${sessionId} (${reason})`);
        return { success: true, reason };
      } catch (error) {
        console.error('❌ Failed to end proctoring session:', error);
        throw error;
      }
    }

    async terminateSession(sessionId, reason) {
      return this.endSession(sessionId, `terminated_${reason}`);
    }

    async getSession(sessionId) {
      try {
        const [sessions] = await this.pool.execute(`
          SELECT ps.*, COUNT(pv.id) as total_violations
          FROM proctoring_sessions ps
          LEFT JOIN proctoring_violations pv ON ps.session_id = pv.session_id
          WHERE ps.session_id = ?
          GROUP BY ps.id
        `, [sessionId]);

        if (sessions.length === 0) {
          return null;
        }

        const session = sessions[0];
        
        // Get violations
        const [violations] = await this.pool.execute(`
          SELECT * FROM proctoring_violations 
          WHERE session_id = ? 
          ORDER BY timestamp DESC
        `, [sessionId]);

        return {
          ...session,
          violations: violations.map(v => ({
            ...v,
            evidence: JSON.parse(v.evidence || '{}')
          }))
        };
      } catch (error) {
        console.error('❌ Failed to get session:', error);
        throw error;
      }
    }

    async getSessions(filters = {}) {
      try {
        let query = `
          SELECT ps.*, COUNT(pv.id) as total_violations
          FROM proctoring_sessions ps
          LEFT JOIN proctoring_violations pv ON ps.session_id = pv.session_id
        `;
        const params = [];
        const conditions = [];

        if (filters.status) {
          conditions.push('ps.status = ?');
          params.push(filters.status);
        }

        if (filters.assessment_id) {
          conditions.push('ps.assessment_id = ?');
          params.push(filters.assessment_id);
        }

        if (filters.user_email) {
          conditions.push('ps.user_email = ?');
          params.push(filters.user_email);
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY ps.id ORDER BY ps.start_time DESC LIMIT 100';

        const [sessions] = await this.pool.execute(query, params);
        return sessions.map(session => ({
          ...session,
          settings: JSON.parse(session.settings || '{}'),
          metadata: JSON.parse(session.metadata || '{}')
        }));
      } catch (error) {
        console.error('❌ Failed to get sessions:', error);
        throw error;
      }
    }

    async getStatistics(timeframe = '24h') {
      try {
        let timeCondition = '';
        if (timeframe === '24h') {
          timeCondition = 'WHERE ps.start_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
        } else if (timeframe === '7d') {
          timeCondition = 'WHERE ps.start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        }

        // Get session statistics
        const [sessionStats] = await this.pool.execute(`
          SELECT 
            COUNT(*) as total_sessions,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
            COUNT(CASE WHEN status LIKE 'terminated%' THEN 1 END) as terminated_sessions,
            COUNT(CASE WHEN violation_count > 0 THEN 1 END) as flagged_sessions,
            AVG(violation_count) as avg_violations
          FROM proctoring_sessions ps
          ${timeCondition}
        `);

        // Get violation statistics
        const [violationStats] = await this.pool.execute(`
          SELECT 
            COUNT(*) as total_violations,
            violation_type,
            COUNT(*) as count
          FROM proctoring_violations pv
          JOIN proctoring_sessions ps ON pv.session_id = ps.session_id
          ${timeCondition}
          GROUP BY violation_type
          ORDER BY count DESC
        `);

        const stats = sessionStats[0] || {
          total_sessions: 0,
          active_sessions: 0,
          completed_sessions: 0,
          terminated_sessions: 0,
          flagged_sessions: 0,
          avg_violations: 0
        };

        return {
          totalSessions: stats.total_sessions,
          activeSessions: stats.active_sessions,
          completedSessions: stats.completed_sessions,
          terminatedSessions: stats.terminated_sessions,
          flaggedSessions: stats.flagged_sessions,
          totalViolations: violationStats.reduce((sum, v) => sum + v.count, 0),
          averageViolations: Math.round(stats.avg_violations * 100) / 100,
          violationsByType: violationStats.map(v => ({
            type: v.violation_type,
            count: v.count
          })),
          timeframe
        };
      } catch (error) {
        console.error('❌ Failed to get statistics:', error);
        return {
          totalSessions: 0,
          activeSessions: 0,
          flaggedSessions: 0,
          totalViolations: 0,
          violationsByType: [],
          timeframe
        };
      }
    }
  }

  // Create proctoring manager instance
  const proctoringManager = new ProctoringManager(pool);

  // Routes
  // Start proctoring session
  router.post('/start', async (req, res) => {
    try {
      const sessionData = req.body;
      
      if (!sessionData.sessionId || !sessionData.userEmail || !sessionData.assessmentId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await proctoringManager.startSession(sessionData);
      res.json(result);
    } catch (error) {
      console.error('Start proctoring session error:', error);
      res.status(500).json({ error: 'Failed to start proctoring session' });
    }
  });

  // Log violation
  router.post('/log', async (req, res) => {
    try {
      const { sessionId, ...violationData } = req.body;
      
      if (!sessionId || !violationData.violationType) {
        return res.status(400).json({ error: 'Session ID and violation type are required' });
      }

      const result = await proctoringManager.logViolation(sessionId, violationData);
      res.json(result);
    } catch (error) {
      console.error('Log violation error:', error);
      res.status(500).json({ error: 'Failed to log violation' });
    }
  });

  // End proctoring session
  router.post('/end', async (req, res) => {
    try {
      const { sessionId, reason } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const result = await proctoringManager.endSession(sessionId, reason);
      res.json(result);
    } catch (error) {
      console.error('End proctoring session error:', error);
      res.status(500).json({ error: 'Failed to end proctoring session' });
    }
  });

  // Get proctoring statistics
  router.get('/stats', async (req, res) => {
    try {
      const timeframe = req.query.timeframe || '24h';
      const stats = await proctoringManager.getStatistics(timeframe);
      res.json(stats);
    } catch (error) {
      console.error('Get proctoring stats error:', error);
      res.status(500).json({ error: 'Failed to get proctoring statistics' });
    }
  });

  // Get proctoring sessions
  router.get('/sessions', async (req, res) => {
    try {
      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.assessment_id) filters.assessment_id = req.query.assessment_id;
      if (req.query.user_email) filters.user_email = req.query.user_email;

      const sessions = await proctoringManager.getSessions(filters);
      res.json(sessions);
    } catch (error) {
      console.error('Get proctoring sessions error:', error);
      res.status(500).json({ error: 'Failed to get proctoring sessions' });
    }
  });

  // Get specific session
  router.get('/session/:id', async (req, res) => {
    try {
      const session = await proctoringManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (error) {
      console.error('Get proctoring session error:', error);
      res.status(500).json({ error: 'Failed to get proctoring session' });
    }
  });

  return { router, proctoringManager };
}

module.exports = createProctoringRouter;