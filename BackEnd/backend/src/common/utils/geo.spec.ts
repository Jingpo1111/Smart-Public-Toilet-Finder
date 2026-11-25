import { boundingBox, distanceInfo, haversineMeters, isWithinCambodia } from './geo';
import { nameSimilarity, normalizeName } from './similarity';
import { publicDisplayName } from './display-name';
import { parseDurationToSeconds } from './duration';

describe('geo utilities', () => {
  it('computes Haversine distances', () => {
    expect(haversineMeters(11.5564, 104.9282, 11.5564, 104.9282)).toBe(0);
    // ~1 degree of latitude ≈ 111.2 km
    expect(haversineMeters(11, 104.9, 12, 104.9) / 1000).toBeCloseTo(111.2, 0);
    // Phnom Penh → Siem Reap ≈ 231 km straight line
    expect(haversineMeters(11.5564, 104.9282, 13.3671, 103.8448) / 1000).toBeGreaterThan(225);
    expect(haversineMeters(11.5564, 104.9282, 13.3671, 103.8448) / 1000).toBeLessThan(237);
  });

  it('bounding box contains every point within the radius', () => {
    const box = boundingBox(11.5564, 104.9282, 1000);
    for (const [dLat, dLng] of [[0.0089, 0], [-0.0089, 0], [0, 0.0091], [0, -0.0091]]) {
      const lat = 11.5564 + dLat;
      const lng = 104.9282 + dLng;
      if (haversineMeters(11.5564, 104.9282, lat, lng) <= 1000) {
        expect(lat).toBeGreaterThanOrEqual(box.minLat);
        expect(lat).toBeLessThanOrEqual(box.maxLat);
        expect(lng).toBeGreaterThanOrEqual(box.minLng);
        expect(lng).toBeLessThanOrEqual(box.maxLng);
      }
    }
  });

  it('labels distances as approximate straight-line', () => {
    expect(distanceInfo(123.6)).toMatchObject({ meters: 124, type: 'STRAIGHT_LINE_APPROXIMATE' });
    expect(distanceInfo(1).note).toMatch(/not walking/);
  });

  it('checks Cambodia bounds', () => {
    expect(isWithinCambodia(11.5564, 104.9282)).toBe(true);
    expect(isWithinCambodia(13.75, 100.5)).toBe(false); // Bangkok
  });
});

describe('text utilities', () => {
  it('normalises names and measures similarity', () => {
    expect(normalizeName('Wat Phnom Public Toilet!')).toBe('wat phnom');
    expect(nameSimilarity('Wat Phnom Public Toilet', 'WAT PHNOM WC')).toBe(1);
    expect(nameSimilarity('Central Market North WC', 'Central Market North Toilet')).toBe(1);
    expect(nameSimilarity('Riverside Park', 'Olympic Stadium')).toBeLessThan(0.3);
    expect(nameSimilarity('បង្គន់វត្តភ្នំ', 'វត្តភ្នំ')).toBeGreaterThan(0.6);
  });

  it('creates privacy-preserving display names', () => {
    expect(publicDisplayName('Sokha Chan')).toBe('Sokha C.');
    expect(publicDisplayName('Dara')).toBe('Dara');
    expect(publicDisplayName('  ')).toBe('ToiletGo user');
  });

  it('parses durations', () => {
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('7d')).toBe(604800);
    expect(parseDurationToSeconds('3600')).toBe(3600);
    expect(() => parseDurationToSeconds('soon')).toThrow();
  });
});
