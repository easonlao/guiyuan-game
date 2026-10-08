import { describe, it, expect } from 'vitest';
import { MockStorage } from '../../src/adapters/MockStorage.js';

describe('Storage Adapters (Layer 2)', () => {
  it('MockStorage: should store and retrieve structured data', () => {
    const storage = new MockStorage();
    const testData = { userId: 'player-1', highScore: 99 };

    storage.setItem('user_profile', testData);
    expect(storage.getItem('user_profile')).toEqual(testData);

    storage.removeItem('user_profile');
    expect(storage.getItem('user_profile')).toBeNull();

    storage.setItem('k1', 'v1');
    storage.setItem('k2', 'v2');
    storage.clear();
    expect(storage.getItem('k1')).toBeNull();
    expect(storage.getItem('k2')).toBeNull();
  });
});
