// Sketch only: writes realistic-looking sample data. Replaced by the snapshot fetcher later.
const fs = require('fs');
const days = [
  { date: '2026-11-03', label: 'Tue', rain: [[0,5,0.0],[5,8,0.1],[8,10,0.0],[10,16,0.0],[16,19,0.2],[19,24,0.6]], wind: 14 },
  { date: '2026-11-04', label: 'Wed', rain: [[0,9,1.2],[9,14,0.8],[14,24,0.3]], wind: 28 },
  { date: '2026-11-05', label: 'Thu', rain: [[0,6,0.4],[6,11,0.0],[11,15,0.0],[15,24,0.5]], wind: 18 },
  { date: '2026-11-06', label: 'Fri', rain: [[0,24,0.9]], wind: 22 },
  { date: '2026-11-07', label: 'Sat', rain: [[0,8,0.2],[8,17,0.0],[17,24,0.3]], wind: 12 },
];
const out = {
  sample: true,
  town: { name: 'Limerick', county: 'Limerick', lat: 52.66, lon: -8.63 },
  fetchedAt: '2026-11-03T05:02:00Z',
  forecastSource: 'Met Éireann open forecast (sample figures for the sketch)',
  sun: { rise: '07:22', set: '16:41', change: '-3 min 12 s of light since yesterday' },
  days: days.map(d => {
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const seg = d.rain.find(([a, b]) => h >= a && h < b);
      hours.push({ h, rain: seg[2], wind: Math.round(d.wind + ((h * 7) % 5) - 2) });
    }
    return { date: d.date, label: d.label, hours };
  }),
  warnings: [{
    type: 'Wind', level: 'yellow',
    headline: 'Status Yellow - Wind warning for Clare, Cork, Kerry, Limerick',
    description: 'Southwest winds of mean speed 50 to 65 km/h with gusts of 90 to 110 km/h.',
    onset: 'Wed 4 Nov 06:00', expiry: 'Wed 4 Nov 21:00', issued: 'Tue 3 Nov 02:14',
    note: 'Sample wording for the sketch. The real page will show Met Éireann warnings unaltered.'
  }],
  activities: [
    { id: 'washing', name: 'Washing out', icon: '👕', tag: 'A grand drying day',
      windows: [
        { day: 'Tue', time: '10:00 to 16:00', score: 'good', hours: 6, reason: 'Dry for 6 hours with a light breeze, good drying wind.' },
        { day: 'Sat', time: '08:00 to 17:00', score: 'good', hours: 9, reason: 'Dry for 9 hours and calm, a full line of washing.' },
        { day: 'Thu', time: '11:00 to 15:00', score: 'okay', hours: 4, reason: 'Dry for 4 hours, but cloudy so slow to dry.' } ],
      wait: null },
    { id: 'mow', name: 'Mow the lawn', icon: '🌱', tag: 'Leave the mower till the grass dries',
      windows: [
        { day: 'Sat', time: '10:00 to 16:00', score: 'good', hours: 6, reason: 'Six dry hours after a dry morning, so the grass has dried.' },
        { day: 'Thu', time: '12:00 to 15:00', score: 'okay', hours: 3, reason: 'Dry from 11:00, so the grass is still damp early on.' } ],
      wait: null },
    { id: 'cycle', name: 'Cycle', icon: '🚲', tag: 'Bring a coat, leave the mower',
      windows: [
        { day: 'Tue', time: '10:00 to 16:00', score: 'good', hours: 6, reason: 'Dry and a light wind, under 20 km/h.' },
        { day: 'Sat', time: '09:00 to 16:00', score: 'good', hours: 7, reason: 'Dry and the calmest day of the week.' } ],
      wait: null },
    { id: 'paint', name: 'Paint the fence', icon: '🎨', tag: 'Patience pays off',
      windows: [
        { day: 'Sat', time: '09:00 to 16:00', score: 'good', hours: 7, reason: 'Dry for 7 hours, so the paint can cure.' } ],
      wait: 'Nothing good before Saturday. Worth waiting, or do the prep and sanding now.' },
    { id: 'walk', name: 'Walk the dog', icon: '🐕', tag: 'The dog does not care',
      windows: [
        { day: 'Tue', time: '10:00 to 16:00', score: 'good', hours: 6, reason: 'Dry all day, and light until 16:41.' } ],
      wait: null },
  ]
};
fs.writeFileSync(__dirname + '/../site/data/sample.json', JSON.stringify(out, null, 1));
console.log('wrote site/data/sample.json');
