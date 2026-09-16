const { expect } = require('chai');
const User = require('../../models/User');

describe('User Model', () => {
    describe('Validation - Invalid User', () => {
        let user;

        beforeEach(() => {
            user = new User();
        });

        it('should be invalid if no email', async () => {
            try {
                await user.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.email).to.exist;
            }
        });

        it('should be invalid if no password', async () => {
            try {
                await user.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.password).to.exist;
            }
        });
    });

    describe('Validation - Valid User', () => {
        let user;

        beforeEach(() => {
            user = new User({
                email: 'test@outlook.com',
                password: 'Testing123!'
            });
        });

        it('should be valid with email and password', async () => {
            const result = await user.validate();
            expect(result).to.be.undefined; // No errors
        });

        it('should have correct email', () => {
            expect(user.email).to.equal('test@outlook.com');
        });

        it('should have correct password before hashing', () => {
            expect(user.password).to.equal('Testing123!');
        });

        it('should have default totalScore of 0', () => {
            expect(user.totalScore).to.equal(0);
        });

        it('should have empty tutorialsCompleted array', () => {
            expect(user.tutorialsCompleted).to.be.an('array').that.is.empty;
        });
    });

    describe('Password hashing functionality', () => {
        let user;

        beforeEach(() => {
            user = new User({
                email: 'test@outlook.com',
                password: 'Testing123!'
            });
        });

        it('should hash password correctly', async () => {
            const hashedPassword = await user.hashPassword('Testing123!');
            expect(hashedPassword).to.not.equal('Testing123!');
            expect(hashedPassword).to.be.a('string');
            expect(hashedPassword.length).to.be.greaterThan(10);
        });

        it('should validate correct password', async () => {
            const hashedPassword = await user.hashPassword('Testing123!');
            user.password = hashedPassword;
            
            const isValid = await user.isValidPassword('Testing123!');
            expect(isValid).to.be.true;
        });

        it('should reject incorrect password', async () => {
            const hashedPassword = await user.hashPassword('Testing123!');
            user.password = hashedPassword;
            
            const isValid = await user.isValidPassword('WrongPassword');
            expect(isValid).to.be.false;
        });
    });
});