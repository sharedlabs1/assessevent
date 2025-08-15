# LTIMindtree Assessment Platform - MySQL Setup Guide

## 🚀 Complete Setup Instructions

### Prerequisites

* **MySQL Server** (8.0 or higher)
* **Node.js** (14.0 or higher)
* **npm** (comes with Node.js)

### Step 1: MySQL Installation

#### Windows:

1. Download MySQL Installer from [mysql.com](https://dev.mysql.com/downloads/installer/)
2. Run installer and select "Developer Default"
3. Set root password during installation
4. Start MySQL service

#### Linux (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install mysql-server
sudo mysql_secure_installation
```

#### macOS:

```bash
brew install mysql
brew services start mysql
mysql_secure_installation
```

### Step 2: Backend Server Setup

1. **Create project directory:**

```bash
mkdir ltimindtree-backend
cd ltimindtree-backend
```

2. **Initialize Node.js project:**

```bash
npm init -y
```

3. **Install dependencies:**

```bash
npm install express mysql2 cors bcrypt jsonwebtoken express-rate-limit dotenv
npm install -D nodemon
```

4. **Create server file:**
   * Copy the "MySQL Backend API Server" code to `server.js`
5. **Create environment file:**
   * Copy the "Environment Configuration Template" to `.env`
   * Update with your MySQL credentials
6. **Update package.json:**
   * Copy the "Backend Package Configuration" content to `package.json`

### Step 3: Database Setup

The backend will automatically create the database and tables on first run. Make sure MySQL is running and credentials in `.env` are correct.

### Step 4: Frontend Configuration

1. **Update API URL in frontend:**

   * Find this line in the platform code:

   ```javascript
   const API_BASE_URL = 'http://localhost:3000/api';
   ```

   * Update with your server URL (for production use your domain)
2. **Save the platform HTML file** (e.g., `index.html`)

### Step 5: Start the System

1. **Start backend server:**

```bash
cd ltimindtree-backend
npm start
```

2. **Open frontend:**
   * Open `index.html` in web browser
   * Or serve via web server for production

### Step 6: Test Setup

1. **Check server health:**
   * Visit: `http://localhost:3000/api/health`
   * Should return: `{"status":"OK","timestamp":"..."}`
2. **Test admin login:**
   * Username: `admin`
   * Password: `ltimindtree2024`
3. **Create test quiz:**
   * Login as admin
   * Create a test quiz to verify database connection

## 🌐 Production Deployment

### Cloud Database Options:

* **AWS RDS** (MySQL)
* **Google Cloud SQL**
* **Azure Database for MySQL**
* **DigitalOcean Managed MySQL**

### Server Hosting Options:

* **AWS EC2**
* **Google Compute Engine**
* **Azure Virtual Machines**
* **DigitalOcean Droplets**
* **Heroku** (for quick deployment)

### Production Environment Variables:

```bash
DB_HOST=your-cloud-mysql-host
DB_USER=your-production-user
DB_PASSWORD=super-secure-password
DB_NAME=ltimindtree_assessments
JWT_SECRET=your-256-bit-secret-key
PORT=443
NODE_ENV=production
```

### SSL/HTTPS Setup:

1. Obtain SSL certificate (Let's Encrypt recommended)
2. Configure reverse proxy (Nginx/Apache)
3. Update frontend API_BASE_URL to use HTTPS

## 📊 Event Day Checklist

### Before August 21st:

* [ ] Setup MySQL database
* [ ] Deploy backend server
* [ ] Configure frontend with production API URL
* [ ] Create all 10+ assessment tracks
* [ ] Test all individual track links
* [ ] Verify email restriction (@ltimindtree.com)
* [ ] Test result export functionality
* [ ] Setup monitoring/logging

### During Event (5 PM - 10 PM IST):

* [ ] Monitor server performance
* [ ] Watch database connections
* [ ] Check admin dashboard for real-time stats
* [ ] Export intermediate reports as needed
* [ ] Support users with direct track links

### After Event:

* [ ] Export final results in required format
* [ ] Backup all data
* [ ] Clear production database by August 25th
* [ ] Send confirmation to stakeholders

## 🔧 Troubleshooting

### Common Issues:

1. **Database Connection Failed:**
   * Check MySQL service is running
   * Verify credentials in `.env` file
   * Ensure database user has proper privileges
2. **API Calls Failing:**
   * Check backend server is running
   * Verify API_BASE_URL in frontend
   * Check CORS configuration
3. **Admin Login Not Working:**
   * Verify backend server is running
   * Check browser network tab for errors
   * Ensure JWT_SECRET is set in .env
4. **Quiz Creation Fails:**
   * Check admin authentication token
   * Verify all required fields are filled
   * Check server logs for database errors

### Performance Optimization:

For high load (2000-3000 concurrent users):

* Use connection pooling (already configured)
* Enable MySQL query cache
* Add database indexes (already included)
* Use CDN for static assets
* Consider load balancer for multiple servers

## 📞 Support

For technical issues during setup or event:

1. Check server logs: `tail -f server.log`
2. Monitor database: `SHOW PROCESSLIST;` in MySQL
3. Check browser console for frontend errors
4. Verify network connectivity between components

## 🎯 Success Metrics

Your platform is ready when:

* ✅ Admin can login and create quizzes
* ✅ Individual track links work correctly
* ✅ Users can complete assessments
* ✅ Results save to MySQL database
* ✅ Export functions work properly
* ✅ System handles expected load

**Ready for August 21st Assessment Event!** 🚀
