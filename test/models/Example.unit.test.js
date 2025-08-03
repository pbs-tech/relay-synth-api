const { expect } = require('chai');
const Example = require('../../models/Example');

describe('Example Model', () => {
    describe('Validation - Invalid Example', () => {
        let example;

        beforeEach(() => {
            example = new Example();
        });

        it('should be invalid if there is no note', async () => {
            try {
                await example.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.note).to.exist;
            }
        });

        it('should be invalid if there is no duration', async () => {
            try {
                await example.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.duration).to.exist;
            }
        });

        it('should be invalid if there is no interval', async () => {
            try {
                await example.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.interval).to.exist;
            }
        });
    });

    describe('Validation - Valid Example', () => {
        let example;

        beforeEach(() => {
            example = new Example({
                note: 'C4',
                duration: '8n',
                interval: '4n'
            });
        });

        it('should be valid with all required fields', async () => {
            const result = await example.validate();
            expect(result).to.be.undefined; // No errors
        });

        it('should have correct note property', () => {
            expect(example.note).to.be.a('string');
            expect(example.note).to.equal('C4');
        });

        it('should have correct duration property', () => {
            expect(example.duration).to.be.a('string');
            expect(example.duration).to.equal('8n');
        });

        it('should have correct interval property', () => {
            expect(example.interval).to.be.a('string');
            expect(example.interval).to.equal('4n');
        });
    });
});