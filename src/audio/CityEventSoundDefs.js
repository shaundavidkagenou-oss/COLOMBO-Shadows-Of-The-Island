// 81st request — DYNAMIC CITY EVENTS: the event slots on the existing `sounds` board (SoundBank / SoundsWindow — the same upload,
// file name, status, preview, replace, remove and persistence as every other slot). The player supplies every recording:
// nothing is synthesised, downloaded or substituted for these — an empty slot is silent (announcements then show their text
// as a subtitle). Each slot is played by src/world/CityEvents.js at the event that uses it: loops through PlaceSound.want()
// (positioned, distance attenuated, faded, released when the site unloads), one-shots through PlaceSound.shot() with per-slot
// cooldowns and a cap on simultaneous event voices.
const D = [];
const add = (id, name, cat, o = {}) => { const d = { id, name, cat, lvl: 0.5, fb: 'silent (upload a recording)', ...o }; D.push(d); return d; };

export const CE_CAT = {
  A: 'DYNAMIC CITY EVENTS — A · General ambience',
  B: 'DYNAMIC CITY EVENTS — B · Stage & performance',
  C: 'DYNAMIC CITY EVENTS — C · Crowd',
  D: 'DYNAMIC CITY EVENTS — D · Event infrastructure',
  E: 'DYNAMIC CITY EVENTS — E · Cultural & sporting',
  F: 'DYNAMIC CITY EVENTS — F · Safety & disruption',
};
const { A, B, C, D: Dc, E, F } = CE_CAT;
// A · general ambience (5)
add('ce.amb.crowd', 'Event crowd murmur (loop · a few hundred people talking on an open lawn; level follows the attendance)', A, { kind: 'loop', lvl: 0.5 });
add('ce.amb.festival', 'Festival ground ambience (loop · stalls, footsteps, children, distant music — exhibitions and festivals)', A, { kind: 'loop', lvl: 0.45 });
add('ce.amb.market', 'Food stall bustle (loop · frying, kottu chopping, sellers calling — food festival / Avurudu stalls)', A, { kind: 'loop', lvl: 0.45 });
add('ce.amb.evening', 'Evening event ambience (loop · open-air crowd after dark, insects, distant traffic)', A, { kind: 'loop', lvl: 0.4 });
add('ce.amb.community', 'Small gathering murmur (loop · a few dozen people — community mornings, shramadana, dansal queue)', A, { kind: 'loop', lvl: 0.45 });
// B · stage & performance (10)
for (let i = 1; i <= 4; i++) add(`ce.stage.set${i}`, `Stage music — concert set ${i} (loop · up to 2 min, through the PA; concerts play the sets in turn)`, B, { kind: 'loop', lvl: 0.75 });
add('ce.stage.baila', 'Stage music — baila band (loop · Baila Night)', B, { kind: 'loop', lvl: 0.75 });
add('ce.stage.acoustic', 'Stage music — acoustic set (loop · Acoustic Thursdays, small stage at exhibitions)', B, { kind: 'loop', lvl: 0.65 });
add('ce.stage.soundcheck', 'Sound check (“one, two — check, check” and test tones; during set-up when the PA is in)', B, { lvl: 0.55 });
add('ce.stage.mcWelcome', 'MC — welcome / introducing the next act', B, { lvl: 0.7, voice: 'Good evening Colombo! Welcome — please give a big hand for our next performers!' });
add('ce.stage.mcThanks', 'MC — thank you and goodnight (end of the programme)', B, { lvl: 0.7, voice: 'Thank you all for coming! Please leave by the gate, mind the cables, and get home safely. Goodnight!' });
add('ce.stage.feedback', 'Microphone feedback squeal (rare, short)', B, { lvl: 0.45 });
// C · crowd (7)
add('ce.crowd.applause', 'Applause (end of a song / act)', C, { lvl: 0.6 });
add('ce.crowd.cheer', 'Crowd cheer (an act comes on, a big moment)', C, { lvl: 0.6 });
add('ce.crowd.clap', 'Clapping along to the beat (loop · during upbeat songs)', C, { kind: 'loop', lvl: 0.45 });
add('ce.crowd.laugh', 'Crowd laughter (MC jokes, children\'s items)', C, { lvl: 0.5 });
add('ce.crowd.gasp', 'Crowd gasp / startled murmur (a disturbance near the event)', C, { lvl: 0.55 });
add('ce.crowd.alarm', 'Crowd alarmed, distant shouting (people hurrying away — mainstream, no screams of injury)', C, { lvl: 0.55 });
add('ce.crowd.leaving', 'Crowd leaving (loop · chatter and footsteps of people heading out after the event)', C, { kind: 'loop', lvl: 0.45 });
// D · event infrastructure (6)
add('ce.infra.generator', 'Generator hum (loop · the silent-type generator behind the stage / marquee)', Dc, { kind: 'loop', lvl: 0.35 });
add('ce.infra.setup', 'Set-up / take-down work (loop · truss clanking, cases rolling, pegs hammered — preparation and clean-up)', Dc, { kind: 'loop', lvl: 0.45 });
add('ce.infra.caseRoll', 'Road case rolling over the grass / a ramp (one-shot)', Dc, { lvl: 0.4 });
add('ce.infra.barrier', 'Barrier / fence section set down (metal clank, one-shot)', Dc, { lvl: 0.45 });
add('ce.infra.paHum', 'PA hum near the speakers (loop · faint buzz between acts)', Dc, { kind: 'loop', lvl: 0.25 });
add('ce.infra.radio', 'Staff walkie-talkie chatter (one-shot)', Dc, { lvl: 0.4 });
// E · cultural & sporting (10)
add('ce.cult.drums', 'Traditional drumming (loop · geta bera / thammattama — folk evenings, Independence Day)', E, { kind: 'loop', lvl: 0.7 });
add('ce.cult.folk', 'Folk song & dance music (loop · folk evenings)', E, { kind: 'loop', lvl: 0.65 });
add('ce.cult.bhakti', 'Bhakti gee — devotional songs (loop · Poya dansal, Vesak)', E, { kind: 'loop', lvl: 0.6 });
add('ce.cult.nadaswaram', 'Nadaswaram & thavil (loop · Deepavali, Thai Pongal)', E, { kind: 'loop', lvl: 0.6 });
add('ce.cult.raban', 'Raban drumming (loop · Avurudu)', E, { kind: 'loop', lvl: 0.65 });
add('ce.cult.carols', 'Christmas carols — choir (loop)', E, { kind: 'loop', lvl: 0.6 });
add('ce.cult.countdown', 'New Year countdown and cheer at midnight (one-shot)', E, { lvl: 0.75 });
add('ce.sport.commentary', 'Cricket commentary over the PA (loop · big-screen match)', E, { kind: 'loop', lvl: 0.6 });
add('ce.sport.roar', 'Crowd roar — a boundary or a wicket on the big screen (one-shot)', E, { lvl: 0.65 });
add('ce.sport.papare', 'Papare band (loop · big-screen match, between overs)', E, { kind: 'loop', lvl: 0.6 });
// F · safety & disruption (8)
add('ce.safe.annPause', 'Announcement — programme paused, please stay calm', F, { lvl: 0.75, voice: 'Ladies and gentlemen, please stay calm. The programme is paused for a few minutes. Please follow the instructions of the event staff.' });
add('ce.safe.annResume', 'Announcement — the programme will now continue', F, { lvl: 0.75, voice: 'Thank you for your patience. The programme will now continue.' });
add('ce.safe.annSuspend', 'Announcement — event suspended, please leave calmly by the exits', F, { lvl: 0.8, voice: 'Ladies and gentlemen, for your safety this event is suspended. Please leave calmly by the nearest exit and follow the staff.' });
add('ce.safe.annCancel', 'Announcement — event cancelled', F, { lvl: 0.8, voice: 'We are sorry — tonight\'s event has been cancelled. Please make your way out calmly. Thank you.' });
add('ce.safe.annInfo', 'Announcement — general information (lost property, first aid location; rare)', F, { lvl: 0.65, voice: 'A small reminder: first aid is at the white tent with the red cross, and lost property is at the information desk by the gate.' });
add('ce.safe.whistle', 'Security whistle (staff clearing a path)', F, { lvl: 0.55 });
add('ce.safe.megaphone', 'Security megaphone — “Move back please, keep the exits clear”', F, { lvl: 0.6, voice: 'Move back please — keep the exits clear!' });
add('ce.safe.musicCut', 'Music cut — the PA is powered down (thump and silence)', F, { lvl: 0.6 });

export const CE_SOUND_DEFS = D;
export const CE_CAT_INFO = {
  [A]: 'The bed of sound over an event site: one of these runs while you are near an event that is under way (crowd murmur scaled by attendance; festival / food-stall bustle at exhibitions and festivals; the evening bed after dark; the small-gathering murmur at community events).',
  [B]: 'What comes out of the stage PA: the concert sets (played in turn), the baila band, the acoustic set; the sound check while the PA is being set up; the MC between acts and at the end; a rare feedback squeal.',
  [C]: 'The audience: applause after a song, a cheer when an act comes on, clapping along, laughter; a gasp and alarmed shouting when something happens near the event; the leaving murmur while people head out.',
  [D]: 'The temporary infrastructure: the generator, set-up and take-down work (preparation and clean-up phases only), a case rolling, a barrier set down, the PA hum between acts, staff radios.',
  [E]: 'Music and sound of the cultural festivals and the big-screen cricket: drumming, folk music, bhakti gee, nadaswaram, raban, carols, the New Year countdown, the match commentary, the crowd roar at a boundary, the papare band.',
  [F]: 'When the event is disturbed: the PA announcements (paused / continuing / suspended / cancelled, general info), the security whistle and megaphone, the music being cut.',
};
