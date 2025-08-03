const { expect } = require('chai');
const Tutorial = require('../../models/Tutorial');

describe('Tutorial Model', () => {
    describe('Validation - Invalid Tutorial', () => {
        let tutorial;

        beforeEach(() => {
            tutorial = new Tutorial();
        });

        it('should be invalid if no level number', async () => {
            try {
                await tutorial.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.number).to.exist;
            }
        });

        it('should be invalid if no name', async () => {
            try {
                await tutorial.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.name).to.exist;
            }
        });

        it('should be invalid if no category', async () => {
            try {
                await tutorial.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.category).to.exist;
            }
        });

        it('should be invalid if no text', async () => {
            try {
                await tutorial.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.text).to.exist;
            }
        });

        it('should be invalid if no pointsAvailable', async () => {
            try {
                await tutorial.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.pointsAvailable).to.exist;
            }
        });

        it('should be invalid if no difficulty', async () => {
            try {
                await tutorial.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.difficulty).to.exist;
            }
        });
    });

    describe('Validation - Valid Tutorial', () => {
        let tutorial;

        beforeEach(() => {
            tutorial = new Tutorial({
                number: 1,
                name: "Sine Waves",
                category: "Waveforms",
                text: "This is a lesson about sine waves and what they are useful for",
                pointsAvailable: 100,
                difficulty: "Easy"
            });
        });

        it('should be valid with all required fields', async () => {
            const result = await tutorial.validate();
            expect(result).to.be.undefined; // No errors
        });

        it('should have correct number', () => {
            expect(tutorial.number).to.equal(1);
        });

        it('should have correct name', () => {
            expect(tutorial.name).to.equal('Sine Waves');
        });

        it('should have correct category', () => {
            expect(tutorial.category).to.equal('Waveforms');
        });

        it('should have correct text', () => {
            expect(tutorial.text).to.equal('This is a lesson about sine waves and what they are useful for');
        });

        it('should have correct pointsAvailable', () => {
            expect(tutorial.pointsAvailable).to.equal(100);
        });

        it('should have correct difficulty', () => {
            expect(tutorial.difficulty).to.equal('Easy');
        });
    });
});