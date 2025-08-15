# LTIMindtree Assessment Platform - Ubuntu Deployment Guide

## 🚀 Complete Deployment Guide for Ubuntu Server

This guide will help you deploy the LTIMindtree Assessment Platform on a fresh Ubuntu instance with your domain `https://events.learnlytica.in`.

### 📋 Prerequisites
- Fresh Ubuntu 20.04 LTS or 22.04 LTS server
- Domain: `events.learnlytica.in` pointing to your server's IP
- Root or sudo access
- At least 2GB RAM and 20GB storage

---

## 🔧 Step 1: Initial Server Setup

### 1.1 Update the System
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Essential Packages
```bash
sudo apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
```

### 1.3 Create Application User
```bash
sudo adduser ltimindtree
sudo usermod -aG sudo ltimindtree
su - ltimindtree
```

---

## 🗄️ Step 2: Install and Configure MySQL

### 2.1 Install MySQL Server
```bash
sudo apt install -y mysql-server
```

### 2.2 Secure MySQL Installation
```bash
sudo mysql_secure_installation
```
**Configuration:**
- Set root password: `X9085565r@` (or your preferred secure password)
- Remove anonymous users: `Y`
- Disallow root login remotely: `Y`
- Remove test database: `Y`
- Reload privilege tables: `Y`

### 2.3 Configure MySQL for Application
```bash
sudo mysql -u root -p
```

Run these SQL commands:
```sql
-- Create database
CREATE DATABASE ltimindtree_assessments;

-- Create application user
CREATE USER 'ltimindtree'@'localhost' IDENTIFIED BY 'X9085565r@';

-- Grant privileges
GRANT ALL PRIVILEGES ON ltimindtree_assessments.* TO 'ltimindtree'@'localhost';
FLUSH PRIVILEGES;

-- Verify database creation
SHOW DATABASES;

-- Exit MySQL
EXIT;
```

### 2.4 Test Database Connection
```bash
mysql -u ltimindtree -p ltimindtree_assessments
# Enter password: X9085565r@
# Type: EXIT; to exit
```

---

## 🟢 Step 3: Install Node.js and npm

### 3.1 Install Node.js 18.x LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3.2 Verify Installation
```bash
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x or higher
```

---

## 🌐 Step 4: Install and Configure Nginx

### 4.1 Install Nginx
```bash
sudo apt install -y nginx
```

### 4.2 Start and Enable Nginx
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx
```

### 4.3 Configure Firewall
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable
```

---

## 🔒 Step 5: Install SSL Certificate (Let's Encrypt)

### 5.1 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.2 Obtain SSL Certificate
```bash
sudo certbot --nginx -d events.learnlytica.in -d www.events.learnlytica.in
```

**Follow the prompts:**
- Enter email address for renewal notifications
- Agree to terms of service: `Y`
- Share email with EFF (optional): `Y` or `N`
- Choose redirect option: `2` (redirect HTTP to HTTPS)

---

## 📁 Step 6: Deploy Application Files

### 6.1 Create Application Directory
```bash
sudo mkdir -p /var/www/events.learnlytica.in
sudo chown -R ltimindtree:ltimindtree /var/www/events.learnlytica.in
cd /var/www/events.learnlytica.in
```

### 6.2 Upload Your Application Files
You can use SCP, SFTP, or Git to upload your files. Here's an example using SCP from your local machine:

```bash
# From your local machine (Windows), use PowerShell or WSL:
scp -r C:\Users\niran\Downloads\assessevent\* ltimindtree@your-server-ip:/var/www/events.learnlytica.in/

# Or use Git (recommended):
cd /var/www/events.learnlytica.in
git init
# Add your repository URL and clone/pull your code
```

### 6.3 Set Up Project Structure
```bash
cd /var/www/events.learnlytica.in

# Create the quiz subdirectory
mkdir -p quiz

# Your application files should already be in the correct location
# No need to move files to subdirectories since we're deploying at root

# Your structure should be:
# /var/www/events.learnlytica.in/
# ├── index.html (main entry point)
# ├── admin.html
# ├── assessment.html
# ├── server.js
# ├── package.json
# └── other files...
```

### 6.4 Create package.json if not exists
```bash
cd /var/www/events.learnlytica.in

# If package.json doesn't exist, create it:
cat > package.json << 'EOF'
{
  "name": "ltimindtree-assessment-platform",
  "version": "1.0.0",
  "description": "LTIMindtree Assessment Platform",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "cors": "^2.8.5",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "express-rate-limit": "^6.8.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
```

### 6.5 Install Dependencies
```bash
cd /var/www/events.learnlytica.in
npm install
```

### 6.6 Create Environment Configuration
```bash
cd /var/www/events.learnlytica.in

# Create .env file
cat > .env << 'EOF'
# Database Configuration
DB_HOST=localhost
DB_USER=ltimindtree
DB_PASSWORD=X9085565r@
DB_NAME=ltimindtree_assessments

# Application Configuration
NODE_ENV=production
PORT=3000
JWT_SECRET=ltimindtree_assessment_secret_production_2024

# Domain Configuration
DOMAIN=events.learnlytica.in
EOF

# Secure the .env file
chmod 600 .env
```

### 6.7 Create Main Entry Point (index.html)
```bash
cd /var/www/events.learnlytica.in

# Create index.html as the main entry point
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LTIMindtree Assessment Platform</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        
        .container {
            text-align: center;
            max-width: 600px;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .logo {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            font-weight: 700;
        }
        
        p {
            font-size: 1.1rem;
            margin-bottom: 2rem;
            opacity: 0.9;
            line-height: 1.6;
        }
        
        .buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 1rem 2rem;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
            min-width: 200px;
        }
        
        .btn-primary {
            background: white;
            color: #667eea;
        }
        
        .btn-secondary {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 2px solid white;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
        }
        
        .features {
            margin-top: 3rem;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
        }
        
        .feature {
            padding: 1.5rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .feature-icon {
            font-size: 2rem;
            margin-bottom: 1rem;
        }
        
        .feature h3 {
            margin-bottom: 0.5rem;
        }
        
        .feature p {
            font-size: 0.9rem;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎯</div>
        <h1>LTIMindtree Assessment Platform</h1>
        <p>Welcome to the comprehensive assessment and quiz management system. Choose your access level below to get started.</p>
        
        <div class="buttons">
            <a href="assessment.html" class="btn btn-primary">
                📝 Take Assessment
            </a>
            <a href="admin.html" class="btn btn-secondary">
                ⚙️ Admin Dashboard
            </a>
        </div>
        
        <div class="features">
            <div class="feature">
                <div class="feature-icon">📊</div>
                <h3>Real-time Analytics</h3>
                <p>Track performance and generate detailed reports instantly</p>
            </div>
            <div class="feature">
                <div class="feature-icon">🔒</div>
                <h3>Secure Platform</h3>
                <p>Enterprise-grade security with JWT authentication</p>
            </div>
            <div class="feature">
                <div class="feature-icon">📱</div>
                <h3>Mobile Responsive</h3>
                <p>Access assessments from any device, anywhere</p>
            </div>
        </div>
    </div>
</body>
</html>
EOF
```

---

## ⚙️ Step 7: Configure Nginx for the Application

### 7.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/events.learnlytica.in
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name events.learnlytica.in www.events.learnlytica.in;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name events.learnlytica.in www.events.learnlytica.in;

    # SSL Configuration (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/events.learnlytica.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/events.learnlytica.in/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Root directory
    root /var/www/events.learnlytica.in;
    index index.html;

    # Main application at root
    location / {
        try_files $uri $uri/ /index.html;
        
        # Handle HTML files
        location ~ \.html$ {
            expires 1h;
            add_header Cache-Control "public, no-transform";
        }
        
        # Handle static files
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API proxy to Node.js backend
    location /api {
        proxy_pass http://localhost:3000/api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
        try_files $uri $uri/ =404;
    }

    # Security: Deny access to sensitive files
    location ~ /\.env {
        deny all;
    }
    
    location ~ /\.git {
        deny all;
    }
    
    location ~ /node_modules {
        deny all;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

### 7.2 Enable the Site
```bash
sudo ln -s /etc/nginx/sites-available/events.learnlytica.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔄 Step 8: Set Up Process Management with PM2

### 8.1 Install PM2 Globally
```bash
sudo npm install -g pm2
```

### 8.2 Create PM2 Ecosystem File
```bash
cd /var/www/events.learnlytica.in

cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'ltimindtree-assessment',
    script: 'server.js',
    cwd: '/var/www/events.learnlytica.in',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/pm2/ltimindtree-assessment-error.log',
    out_file: '/var/log/pm2/ltimindtree-assessment-out.log',
    log_file: '/var/log/pm2/ltimindtree-assessment.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF
```

### 8.3 Create Log Directory
```bash
sudo mkdir -p /var/log/pm2
sudo chown -R ltimindtree:ltimindtree /var/log/pm2
```

### 8.4 Start Application with PM2
```bash
cd /var/www/events.learnlytica.in
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 8.5 Configure PM2 to Start on Boot
```bash
# Run the command that PM2 outputs from the previous step
# It will look something like:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ltimindtree --hp /home/ltimindtree
```

---

## 🔧 Step 9: Final Configuration and Testing

### 9.1 Set Proper File Permissions
```bash
cd /var/www/events.learnlytica.in
sudo chown -R ltimindtree:www-data .
sudo find . -type f -exec chmod 644 {} \;
sudo find . -type d -exec chmod 755 {} \;
sudo chmod 600 .env
```

### 9.2 Test Database Connection
```bash
cd /var/www/events.learnlytica.in
node -e "
const mysql = require('mysql2/promise');
const config = {
  host: 'localhost',
  user: 'ltimindtree',
  password: 'X9085565r@',
  database: 'ltimindtree_assessments'
};
mysql.createConnection(config).then(() => {
  console.log('✅ Database connection successful!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
  process.exit(1);
});
"
```

### 9.3 Test Application Status
```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs ltimindtree-assessment --lines 50

# Check Nginx status
sudo systemctl status nginx

# Test API endpoint
curl -k https://localhost/api/health
```

### 9.4 Test Domain Access
```bash
# Test HTTP to HTTPS redirect
curl -I http://events.learnlytica.in

# Test HTTPS access
curl -I https://events.learnlytica.in

# Test API through domain
curl https://events.learnlytica.in/api/health
```

---

## 🔒 Step 10: Security and Monitoring Setup

### 10.1 Configure Firewall
```bash
# Allow only necessary ports
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw deny 3000  # Block direct access to Node.js
sudo ufw enable
sudo ufw status
```

### 10.2 Set Up Log Rotation
```bash
sudo nano /etc/logrotate.d/ltimindtree-assessment
```

Add this configuration:
```
/var/log/pm2/ltimindtree-assessment*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 ltimindtree ltimindtree
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 10.3 Create Monitoring Script
```bash
sudo nano /usr/local/bin/check-ltimindtree-app.sh
```

Add this script:
```bash
#!/bin/bash

# Check if PM2 process is running
if ! pm2 describe ltimindtree-assessment > /dev/null 2>&1; then
    echo "$(date): PM2 process not running, restarting..." >> /var/log/app-monitor.log
    pm2 restart ltimindtree-assessment
fi

# Check if application responds
if ! curl -sf https://events.learnlytica.in/api/health > /dev/null; then
    echo "$(date): Application not responding, restarting..." >> /var/log/app-monitor.log
    pm2 restart ltimindtree-assessment
fi
```

Make it executable and add to cron:
```bash
sudo chmod +x /usr/local/bin/check-ltimindtree-app.sh

# Add to crontab (check every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/check-ltimindtree-app.sh") | crontab -
```

---

## 📊 Step 11: Backup Strategy

### 11.1 Database Backup Script
```bash
sudo nano /usr/local/bin/backup-ltimindtree-db.sh
```

Add this script:
```bash
#!/bin/bash

BACKUP_DIR="/home/ltimindtree/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="ltimindtree_assessments"
DB_USER="ltimindtree"
DB_PASS="X9085565r@"

mkdir -p $BACKUP_DIR

# Create database backup
mysqldump -u $DB_USER -p$DB_PASS $DB_NAME > "$BACKUP_DIR/ltimindtree_db_$DATE.sql"

# Compress the backup
gzip "$BACKUP_DIR/ltimindtree_db_$DATE.sql"

# Keep only last 30 days of backups
find $BACKUP_DIR -name "ltimindtree_db_*.sql.gz" -mtime +30 -delete

echo "$(date): Database backup completed: ltimindtree_db_$DATE.sql.gz" >> /var/log/backup.log
```

Make it executable and add to cron:
```bash
sudo chmod +x /usr/local/bin/backup-ltimindtree-db.sh

# Add to crontab (daily backup at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-ltimindtree-db.sh") | crontab -
```

---

## 🚀 Step 12: Final Testing and Go-Live

### 12.1 Complete System Test
```bash
# Test all endpoints
echo "Testing main page..."
curl -I https://events.learnlytica.in/

echo "Testing API health..."
curl https://events.learnlytica.in/api/health

echo "Testing admin login..."
curl -X POST https://events.learnlytica.in/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ltimindtree2024"}'
```

### 12.2 Performance Test
```bash
# Install Apache Bench for testing
sudo apt install -y apache2-utils

# Test concurrent users
ab -n 100 -c 10 https://events.learnlytica.in/api/health
```

### 12.3 SSL Certificate Test
```bash
# Test SSL configuration
curl -I https://events.learnlytica.in/ | head -n 1
openssl s_client -connect events.learnlytica.in:443 -servername events.learnlytica.in < /dev/null 2>/dev/null | openssl x509 -noout -dates
```

---

## 📝 Step 13: Maintenance Commands

### 13.1 Application Management
```bash
# View application status
pm2 status

# View logs
pm2 logs ltimindtree-assessment

# Restart application
pm2 restart ltimindtree-assessment

# Stop application
pm2 stop ltimindtree-assessment

# Monitor application
pm2 monit
```

### 13.2 Database Management
```bash
# Connect to database
mysql -u ltimindtree -p ltimindtree_assessments

# Show database size
mysql -u ltimindtree -p -e "SELECT table_schema AS 'Database', ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)' FROM information_schema.tables WHERE table_schema='ltimindtree_assessments';"
```

### 13.3 System Monitoring
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check CPU usage
top

# Check nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Check application logs
tail -f /var/log/pm2/ltimindtree-assessment.log
```

---

## 🔄 Step 14: Updates and Deployment

### 14.1 Update Application
```bash
# Navigate to application directory
cd /var/www/events.learnlytica.in

# Pull latest changes (if using Git)
git pull origin main

# Install new dependencies
npm install

# Restart application
pm2 restart ltimindtree-assessment

# Check status
pm2 status
```

### 14.2 SSL Certificate Renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# The certificate will auto-renew via cron, but you can manually renew:
sudo certbot renew
sudo systemctl reload nginx
```

---

## 🎯 Final Access Points

After successful deployment, your application will be accessible at:

- **Main Application**: https://events.learnlytica.in/
- **Assessment Portal**: https://events.learnlytica.in/assessment.html
- **Admin Dashboard**: https://events.learnlytica.in/admin.html
- **API Health Check**: https://events.learnlytica.in/api/health

### Default Admin Credentials
- **Username**: admin
- **Password**: ltimindtree2024

**🔐 Important**: Change the admin password after first login!

---

## 🆘 Troubleshooting

### Common Issues and Solutions

1. **Application not starting**
   ```bash
   # Check logs
   pm2 logs ltimindtree-assessment
   
   # Check if port is in use
   sudo netstat -tlnp | grep :3000
   
   # Restart PM2
   pm2 restart all
   ```

2. **Database connection errors**
   ```bash
   # Check MySQL status
   sudo systemctl status mysql
   
   # Test connection
   mysql -u ltimindtree -p ltimindtree_assessments
   
   # Check .env file
   cat /var/www/events.learnlytica.in/.env
   ```

3. **Nginx errors**
   ```bash
   # Check configuration
   sudo nginx -t
   
   # Check logs
   sudo tail -f /var/log/nginx/error.log
   
   # Restart nginx
   sudo systemctl restart nginx
   ```

4. **SSL certificate issues**
   ```bash
   # Check certificate status
   sudo certbot certificates
   
   # Renew certificate
   sudo certbot renew --force-renewal
   ```

5. **Permission issues**
   ```bash
   # Fix file permissions
   cd /var/www/learnlytica.us
   sudo chown -R ltimindtree:www-data .
   sudo find . -type f -exec chmod 644 {} \;
   sudo find . -type d -exec chmod 755 {} \;
   ```

---

## 📞 Support

If you encounter any issues during deployment:

1. Check the application logs: `pm2 logs ltimindtree-assessment`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify all services are running: `sudo systemctl status nginx mysql`
4. Test database connectivity
5. Ensure all file permissions are correct

---

## 🎉 Congratulations!

Your LTIMindtree Assessment Platform is now successfully deployed and accessible at:
**https://learnlytica.us/quiz/**

The platform includes:
- ✅ Secure HTTPS access
- ✅ MySQL database with proper configuration
- ✅ Process management with PM2
- ✅ Nginx reverse proxy
- ✅ Automated backups
- ✅ SSL certificate auto-renewal
- ✅ System monitoring
- ✅ Security hardening

Enjoy your new assessment platform! 🚀
