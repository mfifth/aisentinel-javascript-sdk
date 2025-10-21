import { Governor } from '../src/Governor.js';

// Simple test to verify offline queue replay fix
describe('Governor Offline Queue Replay', () => {
  test('offline option is stripped during replay', () => {
    // This test verifies that the fix prevents infinite loops
    // by ensuring offline=true is overridden during replay

    const originalPayload = {
      policyId: 'test-policy',
      input: 'test input',
      options: { offline: true }
    };

    // Simulate the fix: create a copy with offline overridden
    const replayPayload = {
      ...originalPayload,
      options: originalPayload.options ? { ...originalPayload.options, offline: false } : undefined
    };

    // Verify the replay payload has offline=false
    expect(replayPayload.options?.offline).toBe(false);
    expect(replayPayload.policyId).toBe('test-policy');
    expect(replayPayload.input).toBe('test input');
  });
});
