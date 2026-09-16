// server/server.js

'use strict';
const express = require('express');
const cors = require('cors');

const bodyParser = require('body-parser')
const mongoose = require('mongoose');
const winston = require('winston');
const passport = require('passport');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const port = 8000;

require('dotenv').config();
require('./auth/auth');

app.use(bodyParser.json());
app.use(cors({credentials: true, origin: true}));
app.use(express.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(compression());
app.use(helmet());

const authRoute = require('./routes/auth_routes');
const usersRoute = require('./routes/user');
const lessonsRoute = require('./routes/tutorial');
const synthsRoute = require('./routes/synth');
const examplesRoute = require('./routes/example');
const leaderboardRoute = require('./routes/leaderboard');




app.use('/',authRoute);
app.use('/user', passport.authenticate('jwt', { session : false }), usersRoute);
app.use('/tutorials', passport.authenticate('jwt', { session : false }),lessonsRoute);
app.use('/synths',passport.authenticate('jwt', { session : false }), synthsRoute);
app.use('/examples', passport.authenticate('jwt', { session : false }),examplesRoute);
app.use('/leaderboard',passport.authenticate('jwt', { session : false }), leaderboardRoute)
app.get(`/`, (req, res) => {
    res.send({
        message: `API is live`
    });
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta:  { service: 'user-service'},
    transports: [
        new winston.transports.File({filename: 'error.log', level: 'error'}),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add( new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Only connect to DB if not in test environment
if (process.env.NODE_ENV !== 'test') {
    mongoose.connect(process.env.DB_CONNECTION || 'mongodb://localhost:27017/relay-synth-api')
    .then(() => console.log('connected to DB!'))
    .catch(err => console.error('DB connection error:', err));
}


app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.json({ error: err });
});


app.listen(process.env.APP_PORT || port, function() {
    console.log(`Up and running on ${process.env.APP_PORT}`);
});

module.exports = app;
