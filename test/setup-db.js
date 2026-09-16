var mongoose = require('mongoose');
var { MongoMemoryServer } = require('mongodb-memory-server');

// Set up test environment variables
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-secret-key-for-testing';
process.env.NODE_ENV = 'test';

let mongoServer;

before(async () => {
    // Disconnect any existing connections first
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    console.log('connected to test db');
});
after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    console.log('disconnected from test db');
})
