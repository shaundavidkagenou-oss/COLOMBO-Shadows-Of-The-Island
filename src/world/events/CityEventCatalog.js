// 81st request — DYNAMIC CITY EVENTS: the game calendar and the catalogue of event types.
// The game's day counter (Atmosphere.day, 1, 2, 3 …) is mapped onto a calendar starting on Sunday 1 November 2026 (the
// month the hero room's wall calendar shows). Festivals fall on their dates in that calendar; regular events (concerts,
// markets, exhibitions, screenings, community mornings) recur on their weekdays. Everything shown in the phone app comes
// from instances the manager actually generated from these rules — there is no separate "display" list.
//
// Cultural notes (kept respectful and mainstream): Poya days are Buddhist full-moon holidays — a dansal is a free food /
// drink stall offered by volunteers, decorated with Buddhist flags and lanterns; Deepavali is the Hindu festival of lights
// (clay oil lamps, kolam patterns); Thai Pongal is the Tamil harvest festival; Avurudu is the Sinhala and Tamil New Year in
// April. No religious ritual is staged: these appear as community gatherings, decorations, music and food.
export const CAL0 = Date.UTC(2026, 10, 1); // day 1 = Sunday 1 November 2026
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dateOf(day) { const d = new Date(CAL0 + (day - 1) * 86400000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() }; }
export function dayOfDate(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - CAL0) / 86400000) + 1; }
export function dateLabel(day, long = false) { const t = dateOf(day); return long ? `${WD[t.wd]} ${t.d} ${MON[t.m - 1]} ${t.y}` : `${WD[t.wd]} ${t.d} ${MON[t.m - 1]}`; }
export function hourLabel(h) { h = ((h % 24) + 24) % 24; const H = Math.floor(h), M = Math.round((h - H) * 60) % 60; const hh = H % 12 === 0 ? 12 : H % 12; return `${hh}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; }

export const CATEGORIES = {
  cultural: { name: 'Cultural festival', icon: '✺', col: '#c9952b' },
  celebration: { name: 'Celebration', icon: '✦', col: '#d0533a' },
  performance: { name: 'Traditional performance', icon: '♫', col: '#8a4fbf' },
  community: { name: 'Community gathering', icon: '❖', col: '#2f8a5b' },
  sport: { name: 'Cricket & sport', icon: '◎', col: '#2f6fa8' },
  concert: { name: 'Concert', icon: '♪', col: '#d1306b' },
  exhibition: { name: 'Exhibition', icon: '▣', col: '#3d7f86' },
  seasonal: { name: 'Seasonal', icon: '❄', col: '#b8862b' },
};
// venues: stage / expo / screen need a 34×40 or 30×34 lawn (Galle Face Green north + south, the Museum grounds); the 20×30
// community gathering also fits Viharamahadevi Park and the Beira Lake front (measured with EventSites.findSite)
// templates: stage show / exhibition (stall rows) / big-screen / community gathering (marquee + dansal / food stall)
// prep, clean: game hours of set-up before the start and of clean-up after the end
export const TEMPLATES = {
  stage: { W: 34, D: 40, prep: 3, clean: 1.5 },
  expo: { W: 30, D: 34, prep: 2, clean: 1.25 },
  screen: { W: 30, D: 34, prep: 2, clean: 1 },
  gather: { W: 20, D: 30, prep: 1.25, clean: 0.75 },
};
// rule kinds: weekly (wd list, p chance), fixed (y-m-d dates), range (from..to with wd list)
// pal: palette used for canopies / cloths / banners; deco: decoration set; seats: seated audience; watch: what the crowd faces
export const TYPES = [
  { id: 'sunsetConcert', cat: 'concert', tpl: 'stage', title: 'Sunset Sessions at Galle Face', venues: ['gfgN'], rule: { weekly: [6], p: 0.95 }, start: 18, dur: 4, cap: [3000, 6000], pal: 'night', deco: 'concert', seats: false,
    desc: 'Open-air evening concert on the Green: local bands and singers on a full stage with line-array PA and a light show as the sun sets over the sea.', acts: ['Live bands from 6:30 PM', 'Food and drink stalls', 'Standing audience in front of the stage'], info: 'Free entry. Bag checks at the gate. No glass bottles. Gates open 5:30 PM.', sound: 'concert' },
  { id: 'bailaNight', cat: 'concert', tpl: 'stage', title: 'Colombo Baila Night', venues: ['gfgS'], rule: { weekly: [5], p: 0.85 }, start: 19, dur: 3.5, cap: [1500, 3200], pal: 'warm', deco: 'concert', seats: false,
    desc: 'A night of baila — Sri Lanka\'s much-loved dance music — with a live band and guest singers. Bring your dancing shoes.', acts: ['Live baila band', 'Guest singers', 'Dancing area in front of the stage'], info: 'Free entry. Family friendly until 10 PM.', sound: 'concert' },
  { id: 'folkEvening', cat: 'performance', tpl: 'stage', title: 'Folk Music & Dance Evening', venues: ['museum', 'gfgS'], rule: { weekly: [0], p: 0.9 }, start: 16.5, dur: 2.5, cap: [400, 800], pal: 'heritage', deco: 'heritage', seats: true,
    desc: 'Traditional folk songs and dance by community groups and students of the performing arts, with drummers and narration in Sinhala, Tamil and English.', acts: ['Drumming ensembles', 'Folk song and dance', 'Seated audience'], info: 'Free seating, first come first served. Programme at the information board.', sound: 'cultural' },
  { id: 'acousticThursday', cat: 'concert', tpl: 'stage', title: 'Acoustic Thursdays', venues: ['museum'], rule: { weekly: [4], p: 0.75 }, start: 19, dur: 2.5, cap: [300, 700], pal: 'night', deco: 'concert', seats: true,
    desc: 'An intimate seated concert of acoustic sets by Colombo singer-songwriters.', acts: ['Three acoustic sets', 'Seated audience'], info: 'Free entry with registration at the gate.', sound: 'concert', ticket: true },
  { id: 'foodFest', cat: 'celebration', tpl: 'expo', title: 'Colombo Street Food Festival', venues: ['gfgS', 'museum'], rule: { weekly: [6, 0], p: 0.6 }, start: 11, dur: 10, cap: [2000, 5000], pal: 'warm', deco: 'food', seats: false, stalls: 'food',
    desc: 'Kottu, hoppers, isso vadai, wade, kavum and fresh king coconut from stalls across the island, with a small stage for live music.', acts: ['Food stalls', 'Live acoustic music', 'Seating under the marquee'], info: 'Pay at the stalls. Please use the bins — the volunteers sort the waste.', sound: 'market' },
  { id: 'artFair', cat: 'exhibition', tpl: 'expo', title: 'Art & Craft Exhibition', venues: ['museum', 'gfgN'], rule: { weekly: [4, 5, 6], p: 0.55 }, start: 10, dur: 8, cap: [600, 1500], pal: 'gallery', deco: 'gallery', seats: false, stalls: 'art', ticket: true,
    desc: 'Painters, potters, batik makers and wood carvers show and sell their work under rows of stalls.', acts: ['Artists\' stalls', 'Batik and handloom', 'Live painting'], info: 'Entry free with registration at the desk. Photography allowed — ask the artist first.', sound: 'market' },
  { id: 'bookFair', cat: 'exhibition', tpl: 'expo', title: 'Book & Handicraft Fair', venues: ['museum', 'gfgN'], rule: { weekly: [3], p: 0.7 }, start: 9, dur: 8, cap: [500, 1300], pal: 'gallery', deco: 'gallery', seats: false, stalls: 'books',
    desc: 'Publishers, second-hand book sellers and handicraft makers — Sinhala, Tamil and English titles.', acts: ['Book stalls', 'Handicrafts', 'Children\'s books'], info: 'Free entry.', sound: 'market' },
  { id: 'cricketScreen', cat: 'sport', tpl: 'screen', title: 'Big-Screen Cricket: Sri Lanka vs Touring XI', venues: ['gfgS', 'gfgN'], rule: { weekly: [3, 0], p: 0.8 }, start: 14, dur: 5, cap: [800, 2200], pal: 'sport', deco: 'sport', seats: true,
    desc: 'Watch the match live on a giant LED screen with commentary over the PA — chairs, mats and food stalls.', acts: ['Live match on the big screen', 'Food and drink stalls', 'Chairs and mats'], info: 'Free entry. Seats are first come first served.', sound: 'sport' },
  { id: 'shramadana', cat: 'community', tpl: 'gather', title: 'Shramadana & Community Morning', venues: ['beira', 'vmp'], rule: { weekly: [0], p: 0.8 }, start: 7.5, dur: 3, cap: [80, 200], pal: 'green', deco: 'community', seats: true,
    desc: 'Neighbourhood volunteers meet for a shramadana (shared voluntary work) clean-up, followed by tea and a short community meeting.', acts: ['Clean-up teams', 'Tea and snacks', 'Community notices'], info: 'All welcome. Gloves and bags provided.', sound: 'community' },
  { id: 'wellness', cat: 'community', tpl: 'gather', title: 'Community Wellness Morning', venues: ['vmp', 'beira'], rule: { weekly: [1, 4], p: 0.65 }, start: 6.5, dur: 1.75, cap: [40, 110], pal: 'green', deco: 'community', seats: true,
    desc: 'Free health checks (blood pressure, sugar) by volunteer nurses and a gentle exercise session for all ages.', acts: ['Health check desk', 'Group exercise', 'Herbal porridge (kola kenda)'], info: 'Free. Please bring water.', sound: 'community' },
  // ---- seasonal / festivals (calendar dates in the game's calendar)
  { id: 'deepavali', cat: 'cultural', tpl: 'gather', title: 'Deepavali Festival of Lights', venues: ['beira', 'vmp'], rule: { fixed: ['2026-11-08', '2027-10-29'] }, start: 17.5, dur: 4, cap: [400, 900], pal: 'deepavali', deco: 'deepavali', seats: true,
    desc: 'A community Deepavali evening: rows of clay oil lamps, kolam patterns, sweets and music to celebrate the festival of lights.', acts: ['Oil-lamp lighting', 'Kolam display', 'Sweets and music'], info: 'All welcome. Please take care around the lamps.', sound: 'cultural' },
  { id: 'ilPoya', cat: 'cultural', tpl: 'gather', title: 'Il Poya Dansal & Bhakti Gee', venues: ['beira', 'vmp'], rule: { fixed: ['2026-11-24'] }, start: 17, dur: 4, cap: [500, 1500], pal: 'poya', deco: 'poya', seats: false, dansal: true,
    desc: 'On Il Full Moon Poya day volunteers run a dansal — free tea and food for everyone — under Buddhist flags and lanterns, with bhakti gee (devotional songs).', acts: ['Free dansal (tea and food)', 'Bhakti gee', 'Lanterns after dark'], info: 'Free for all. Please queue at the dansal.', sound: 'cultural' },
  { id: 'unduvapPoya', cat: 'cultural', tpl: 'gather', title: 'Unduvap Poya Dansal', venues: ['beira', 'vmp'], rule: { fixed: ['2026-12-23'] }, start: 17, dur: 4, cap: [500, 1500], pal: 'poya', deco: 'poya', seats: false, dansal: true,
    desc: 'A Poya-day dansal with free tea and food, Buddhist flags and lanterns.', acts: ['Free dansal', 'Lanterns'], info: 'Free for all. Please queue at the dansal.', sound: 'cultural' },
  { id: 'carols', cat: 'seasonal', tpl: 'stage', title: 'Christmas Carols by the Lake', venues: ['museum', 'gfgN'], rule: { range: ['2026-12-04', '2026-12-23'], wd: [5, 0], p: 1 }, start: 18.5, dur: 2.5, cap: [300, 800], pal: 'christmas', deco: 'christmas', seats: true,
    desc: 'Choirs from schools and churches across Colombo sing carols under the lights — a city tradition in December.', acts: ['Choirs', 'Carol singing', 'Seated audience'], info: 'Free entry.', sound: 'cultural' },
  { id: 'nye', cat: 'celebration', tpl: 'stage', title: 'New Year\'s Eve Countdown', venues: ['gfgN'], rule: { fixed: ['2026-12-31'] }, start: 20, dur: 4.5, cap: [8000, 15000], pal: 'night', deco: 'concert', seats: false,
    desc: 'Live music and the countdown to midnight on Galle Face Green.', acts: ['Live bands', 'Countdown at midnight'], info: 'Free entry. Heavy crowds expected — roads near the Green are restricted.', sound: 'concert' },
  { id: 'thaiPongal', cat: 'cultural', tpl: 'gather', title: 'Thai Pongal Harvest Celebration', venues: ['beira', 'vmp'], rule: { fixed: ['2027-01-15'] }, start: 8, dur: 4, cap: [200, 600], pal: 'harvest', deco: 'harvest', seats: true,
    desc: 'The Tamil harvest festival: kolam patterns, sugarcane and a shared pot of sweet pongal rice, with music.', acts: ['Kolam display', 'Sweet pongal', 'Music'], info: 'All welcome.', sound: 'cultural' },
  { id: 'independence', cat: 'celebration', tpl: 'stage', title: 'Independence Day Cultural Show', venues: ['gfgN', 'museum'], rule: { fixed: ['2027-02-04'] }, start: 16, dur: 3.5, cap: [1500, 4000], pal: 'heritage', deco: 'heritage', seats: true,
    desc: 'Songs and dances from every community of the island to mark Independence Day.', acts: ['Cultural performances', 'Seated audience'], info: 'Free entry. Security checks at the gate.', sound: 'cultural' },
  { id: 'avurudu', cat: 'seasonal', tpl: 'expo', title: 'Avurudu Festival', venues: ['gfgS', 'museum'], rule: { fixed: ['2027-04-14', '2027-04-15'] }, start: 9, dur: 9, cap: [1500, 4000], pal: 'harvest', deco: 'food', seats: false, stalls: 'avurudu',
    desc: 'Sinhala and Tamil New Year: stalls of kavum, kokis and milk rice, raban drumming and traditional games.', acts: ['Traditional sweets', 'Raban drumming', 'Traditional games'], info: 'Free entry.', sound: 'cultural' },
  { id: 'vesak', cat: 'cultural', tpl: 'expo', title: 'Vesak Lantern Exhibition', venues: ['gfgN', 'museum'], rule: { fixed: ['2027-05-20', '2027-05-21', '2027-05-22'] }, start: 17.5, dur: 5, cap: [3000, 8000], pal: 'poya', deco: 'vesak', seats: false, stalls: 'lanterns',
    desc: 'Hand-made Vesak lanterns (kudu) shown by community groups, with dansals and devotional songs.', acts: ['Lantern exhibition', 'Dansals', 'Bhakti gee'], info: 'Free. Heavy crowds after dark.', sound: 'cultural' },
];
export const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));
export const PALETTES = { // canopy / cloth / banner colours
  night: { a: '#1b1f3a', b: '#e0a33a', c: '#d1306b', text: '#ffffff', canopy: '#ffffff', cloth: '#1d1d1f' },
  warm: { a: '#b8372b', b: '#f2c14e', c: '#2a7f62', text: '#ffffff', canopy: '#f3e9d6', cloth: '#b8372b' },
  heritage: { a: '#6d1420', b: '#d6a640', c: '#1b2a4a', text: '#fbf3e0', canopy: '#f4ead2', cloth: '#6d1420' },
  gallery: { a: '#20343a', b: '#e9e4d8', c: '#c77d3a', text: '#ffffff', canopy: '#ffffff', cloth: '#ffffff' },
  sport: { a: '#123a7a', b: '#f2c230', c: '#ffffff', text: '#ffffff', canopy: '#1f4fa0', cloth: '#123a7a' },
  green: { a: '#1f6b45', b: '#cfe3b2', c: '#f2a93b', text: '#ffffff', canopy: '#e8f2df', cloth: '#1f6b45' },
  deepavali: { a: '#7a1c4b', b: '#f4a51c', c: '#e2462e', text: '#fff6e0', canopy: '#fbe2b8', cloth: '#7a1c4b' },
  poya: { a: '#0050a4', b: '#ffcc00', c: '#ff7f00', text: '#ffffff', canopy: '#ffffff', cloth: '#ffffff' },
  christmas: { a: '#14532d', b: '#b91c1c', c: '#e9c46a', text: '#ffffff', canopy: '#ffffff', cloth: '#b91c1c' },
  harvest: { a: '#8a5a12', b: '#f2c14e', c: '#2e7d32', text: '#fff8e1', canopy: '#fff1cf', cloth: '#8a5a12' },
};
// which rule days produce an instance (deterministic). Returns array of TYPES
export function typesOn(day, rng) {
  const t = dateOf(day), iso = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`; const out = [];
  for (const T of TYPES) { const r = T.rule;
    if (r.fixed) { if (r.fixed.includes(iso)) out.push(T); continue; }
    if (r.range) { if (iso >= r.range[0] && iso <= r.range[1] && r.wd.includes(t.wd) && rng() < (r.p ?? 1)) out.push(T); continue; }
    if (r.weekly && r.weekly.includes(t.wd) && rng() < (r.p ?? 1)) out.push(T); }
  return out;
}
export const FILLERS = ['bookFair', 'artFair', 'wellness', 'shramadana', 'cricketScreen']; // a quiet day still gets something
