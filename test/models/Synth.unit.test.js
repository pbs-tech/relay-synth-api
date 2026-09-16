const { expect } = require('chai');
const Synth = require('../../models/Synth');

describe('Synth Model', () => {
    describe('Validation - Invalid Synth', () => {
        let synth;

        beforeEach(() => {
            synth = new Synth();
        });

        it('should be invalid if there are no parameters', async () => {
            try {
                await synth.validate();
                throw new Error('Validation should have failed');
            } catch (err) {
                expect(err.errors.parameters).to.exist;
            }
        });
    });

    describe('Validation - Valid Synth', () => {
        let synth;
        const params = {
            oscillator: {
                type: 'sawtooth'
            },
            envelope: {
                attack: 0.25,
                decay: 0.25,
                sustain: 1.0,
                release: 1.0
            }
        };

        beforeEach(() => {
            synth = new Synth({ parameters: params });
        });

        it('should be valid with parameters', async () => {
            const result = await synth.validate();
            expect(result).to.be.undefined; // No errors
        });

        it('should have correct parameters structure', () => {
            expect(synth.parameters).to.be.an('object');
            expect(synth.parameters.oscillator.type).to.equal('sawtooth');
            expect(synth.parameters.envelope.attack).to.equal(0.25);
            expect(synth.parameters.envelope.decay).to.equal(0.25);
            expect(synth.parameters.envelope.sustain).to.equal(1.0);
            expect(synth.parameters.envelope.release).to.equal(1.0);
        });
    });
});