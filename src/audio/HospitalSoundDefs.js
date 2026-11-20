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
// sound-board entries (SoundBank.SOUND_DEFS, cat 'Hospital'). A supplied recording replaces the synthesised placeholder.
export const HOSPITAL_SOUND_DEFS = [
  { id: 'hosp.ambience', name: 'Hospital — hall room tone: aircon, ventilation, distant voices (seamless loop)', cat: 'Hospital', kind: 'loop', lvl: 0.45 },
  { id: 'hosp.chatter', name: 'Hospital — reception chatter at the registration counter (positional loop)', cat: 'Hospital', kind: 'loop', lvl: 0.4 },
  { id: 'hosp.monitor', name: 'Hospital — patient monitor beeping in the ward (positional loop)', cat: 'Hospital', kind: 'loop', lvl: 0.3 },
  { id: 'hosp.step', name: 'Hospital — footstep on vinyl / terrazzo (staff and visitors)', cat: 'Hospital', lvl: 0.3 },
  { id: 'hosp.door.slide', name: 'Hospital — automatic sliding entrance doors (open / close)', cat: 'Hospital', lvl: 0.45 },
  { id: 'hosp.door.open', name: 'Hospital — room door opened (latch + swing)', cat: 'Hospital', lvl: 0.45 },
  { id: 'hosp.door.close', name: 'Hospital — room door closing (closer + latch)', cat: 'Hospital', lvl: 0.45 },
  { id: 'hosp.lift.ding', name: 'Hospital — lift arrival chime', cat: 'Hospital', lvl: 0.4 },
  { id: 'hosp.lift.doors', name: 'Hospital — lift doors opening / closing', cat: 'Hospital', lvl: 0.4 },
  { id: 'hosp.lift.motor', name: 'Hospital — lift travelling (motor hum, ~4 s)', cat: 'Hospital', lvl: 0.4 },
  { id: 'hosp.phone', name: 'Hospital — desk phone ringing at reception / nurses’ station', cat: 'Hospital', lvl: 0.35 },
  { id: 'hosp.announce', name: 'Hospital — PA chime + announcement', cat: 'Hospital', lvl: 0.5 },
  { id: 'hosp.trolley', name: 'Hospital — trolley / wheelchair rolling', cat: 'Hospital', lvl: 0.35 },
  { id: 'hosp.water', name: 'Hospital — water cooler (cup filled)', cat: 'Hospital', lvl: 0.4 },
  { id: 'hosp.sanitizer', name: 'Hospital — hand sanitiser dispenser', cat: 'Hospital', lvl: 0.4 },
  { id: 'hosp.bed', name: 'Hospital — bed creak (lying down / getting up)', cat: 'Hospital', lvl: 0.4 },
  { id: 'hosp.printer', name: 'Hospital — invoice printer at discharge', cat: 'Hospital', lvl: 0.35 },
  { id: 'hosp.amb.reverse', name: 'Hospital — ambulance reversing beeper (ED bay)', cat: 'Hospital', lvl: 0.45 },
  ...RECOVERY_LINES.map((l, i) => ({ id: 'hosp.line' + (i + 1), name: `Hospital — recovery line ${i + 1} (${l.who}): "${l.text}"`, cat: 'Hospital', lvl: 0.7 })),
  ...RECEPTION_LINES.map((t, i) => ({ id: 'hosp.reception' + (i + 1), name: `Hospital — receptionist line ${i + 1}: "${t}"`, cat: 'Hospital', lvl: 0.6 })),
];
