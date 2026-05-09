#!/bin/bash

echo "🚀 WeConnect Environment Setup"
echo "================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Install server dependencies
echo ""
echo "📦 Installing server dependencies..."
cd server
npm install
cd ..

# Install client dependencies
echo ""
echo "📦 Installing client dependencies..."
cd client
npm install
cd ..

# Install mobile dependencies
echo ""
echo "📦 Installing mobile dependencies..."
cd mobile
npm install
cd ..

echo ""
echo "✅ All dependencies installed successfully!"

# Check MySQL connection
echo ""
echo "🗄️  Checking database connection..."
cd server
node -e "
import { createDatabase } from './src/db/index.js';
const db = createDatabase();
db.init().then(() => {
  console.log('✅ Database connection successful');
  process.exit(0);
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
  console.log('💡 Make sure MySQL is running and credentials are correct in server/.env');
  process.exit(1);
});
"
cd ..

echo ""
echo "🎉 Environment setup complete!"
echo ""
echo "To start the application:"
echo "1. Start the server: cd server && npm run dev"
echo "2. Start the client: cd client && npm run dev"
echo "3. Start the mobile app: cd mobile && npm start"
echo ""
echo "📱 Client will be available at: http://localhost:5173"
echo "🚀 Server will be available at: http://localhost:4000"
echo "📱 Mobile QR code will be shown in terminal"