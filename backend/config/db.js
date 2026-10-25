
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is missing from the .env file');
        }

        const connection = await mongoose.connect(
            process.env.MONGODB_URI,
            {
                serverSelectionTimeoutMS: 10000
            }
        );

        console.log('✅ MongoDB Atlas connected successfully');
        console.log(`📡 Database host: ${connection.connection.host}`);
        console.log(`🗄️ Database name: ${connection.connection.name}`);

        return connection;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        throw error;
    }
};

module.exports = connectDB;
