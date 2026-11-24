// 74th request — National Hospital: the recovery lines, the receptionist's lines and the Hospital section of the sounds
// board (pure data: SoundBank.js imports this file, HospitalAudio.js plays the entries).
export const RECOVERY_LINES = [
  { who: 'Nurse', role: 'nurse', text: "Easy... you're at the hospital. Take your time getting up." },
  { who: 'Doctor', role: 'doctor', text: "You're finally awake. We've finished treating you. You should be alright." },
  { who: 'Nurse', role: 'nurse', text: "You were brought here unconscious. You're lucky someone got you medical attention." },
  { who: 'Doctor', role: 'doctor', text: "Welcome back. Your treatment is complete. We've processed your hospital bill." },
];
export const RECEPTION_LINES = [
  'Good day. Registration is here — please have a seat, the doctor will call your number.',
  'Visiting hours are from four to six in the evening. The wards are on the first floor.',
  'The Emergency Department is through the doors on the right. The pharmacy counter is on your left.',
];
// sound-board entries (SoundBank.SOUND_DEFS, cat 'Hospitals' — 75th: renamed, plus the garden block in PlaceSoundDefs.js). A supplied recording replaces the synthesised placeholder.
export const HOSPITAL_SOUND_DEFS = [
  { id: 'hosp.ambience', name: 'Hospital — hall room tone: aircon, ventilation, distant voices (seamless loop)', cat: 'Hospitals', kind: 'loop', lvl: 0.45 },
  { id: 'hosp.chatter', name: 'Hospital — reception chatter at the registration counter (positional loop)', cat: 'Hospitals', kind: 'loop', lvl: 0.4 },
  { id: 'hosp.monitor', name: 'Hospital — BPM machine (patient monitor): heartbeat beep at a bed with a patient (loop · plays only while that monitor is on)', cat: 'Hospitals', kind: 'loop', lvl: 0.3 },
  ...[1, 2, 3].map((n) => ({ id: 'hosp.door.auto' + n, name: `Hospital — electric sliding door opening, variation ${n}`, cat: 'Hospitals', lvl: 0.45 })),
  { id: 'hosp.door.slide', name: 'Hospital — electric sliding door closing', cat: 'Hospitals', lvl: 0.45 },
  { id: 'hosp.door.open', name: 'Hospital — room door opened (latch + swing)', cat: 'Hospitals', lvl: 0.45 },
  { id: 'hosp.door.close', name: 'Hospital — room door closing (closer + latch)', cat: 'Hospitals', lvl: 0.45 },
  { id: 'hosp.lift.ding', name: 'Hospital — lift arrival chime', cat: 'Hospitals', lvl: 0.4 },
  { id: 'hosp.lift.doors', name: 'Hospital — lift doors opening / closing', cat: 'Hospitals', lvl: 0.4 },
  { id: 'hosp.lift.up', name: 'Hospital — lift travelling up / down (loop while the car moves · fades away on arrival, then the chime)', cat: 'Hospitals', kind: 'loop', lvl: 0.45 },
  { id: 'hosp.phone', name: 'Hospital — desk phone ringing at reception / nurses’ station', cat: 'Hospitals', lvl: 0.35 },
  { id: 'hosp.announce', name: 'Hospital — PA chime + announcement', cat: 'Hospitals', lvl: 0.5 },
  { id: 'hosp.trolley', name: 'Hospital — trolley / wheelchair rolling', cat: 'Hospitals', lvl: 0.35 },
  { id: 'hosp.trolley.pull', name: 'Hospital — ambulance stretcher pulled out (rails, legs unfolding and locking)', cat: 'Hospitals', lvl: 0.5 },
  { id: 'hosp.cpr', name: 'Hospital — CPR: chest compressions (loop while the paramedic compresses)', cat: 'Hospitals', kind: 'loop', lvl: 0.45 },
  { id: 'hosp.cover', name: 'Hospital — sheet unfolded and laid over a body', cat: 'Hospitals', lvl: 0.4 },
  ...[1, 2, 3].map((n) => ({ id: 'pc.click' + n, name: `Hospital — computer mouse click, variation ${n} (staff at the PCs)`, cat: 'Hospitals', lvl: 0.25 })),
  ...[1, 2, 3].map((n) => ({ id: 'pc.key' + n, name: `Hospital — keyboard: one key press, variation ${n} (staff typing)`, cat: 'Hospitals', lvl: 0.22 })),
  { id: 'hosp.water', name: 'Hospital — water cooler (cup filled)', cat: 'Hospitals', lvl: 0.4 },
  { id: 'hosp.sanitizer', name: 'Hospital — hand sanitiser dispenser', cat: 'Hospitals', lvl: 0.4 },
  { id: 'hosp.bed', name: 'Hospital — bed creak (lying down / getting up)', cat: 'Hospitals', lvl: 0.4 },
  { id: 'hosp.printer', name: 'Hospital — invoice printer at discharge', cat: 'Hospitals', lvl: 0.35 },
  { id: 'hosp.amb.reverse', name: 'Hospital — ambulance reversing beeper (ED bay)', cat: 'Hospitals', lvl: 0.45 },
  { id: 'hosp.emsRefuse', name: 'Hospital — paramedic: "We won\u2019t be able to treat him here — we can\u2019t get to him."', cat: 'Hospitals', lvl: 0.7 },
  ...RECOVERY_LINES.map((l, i) => ({ id: 'hosp.line' + (i + 1), name: `Hospital — recovery line ${i + 1} (${l.who}): "${l.text}"`, cat: 'Hospitals', lvl: 0.7 })),
  ...RECEPTION_LINES.map((t, i) => ({ id: 'hosp.reception' + (i + 1), name: `Hospital — receptionist line ${i + 1}: "${t}"`, cat: 'Hospitals', lvl: 0.6 })),
];
