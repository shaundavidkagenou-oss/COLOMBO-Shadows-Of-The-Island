// NPC voice recordings (console command `dialogs`, src/ui/DialogsWindow.js; played by src/audio/Voices.js).
// Pure data, no DOM: SoundBank (and vite.config.js through it) registers every slot below as a sound id, so recordings are
// saved, packed into sounds/ and built into the .exe exactly like the `sounds` window's.
//
// A slot is  dlg.<group>.<situation>  plus up to three more clips  dlg.<group>.<situation>.var1..var3  — every filled clip of a
// slot is used, in a shuffled order that never plays the same clip twice in a row.
// Which group's recording a speaker uses: the most specific group that has a clip for that situation —
//   context (police / paramedic / driver / shopkeeper in a robbery) → their walk of life (vendor, tourist, office worker …)
//   → elderly man / woman → man / woman → Everyone. With no recording anywhere along that chain the game keeps its
//   synthesised voice blip (talking) or stays silent (screams, pain…), as before.

export const VOICE_CLIPS = 4; // the slot's own clip + var1..var3

export const VOICE_GROUPS = [
  { id: 'any', name: 'Everyone', note: 'Fallback for every NPC that has no recording of its own for that situation' },
  { id: 'man', name: 'Men', note: 'Every adult man (unless a more specific group below has a clip)' },
  { id: 'woman', name: 'Women', note: 'Every adult woman (unless a more specific group below has a clip)' },
  { id: 'uncle', name: 'Elderly men', note: '“Uncle” — older men' },
  { id: 'aunty', name: 'Elderly women', note: '“Aunty” — older women' },
  { id: 'driver', name: 'Drivers', note: 'Anyone at the wheel: road rage through the window, dragged out of their car' },
  { id: 'police', name: 'Police officers', note: 'Orders (stop, hands up, you are under arrest…), chases, arrests' },
  { id: 'medic', name: 'Paramedics', note: '1990 Suwa Seriya crew at an injured person' },
  { id: 'shopkeeper', name: 'Shopkeepers', note: 'Shop counters and the store robberies (hands up / fights back)' },
  { id: 'vendor', name: 'Street vendors', note: 'Stall and cart sellers calling out to customers' },
  { id: 'tourist', name: 'Tourists', note: 'Visitors (usually English)' },
  { id: 'office', name: 'Office workers', note: 'Office / bank / clerical staff' },
  { id: 'worker', name: 'Labourers & workers', note: 'Construction, port and market workers' },
  { id: 'student', name: 'Students', note: 'University / college students (all adults)' },
  { id: 'security', name: 'Security guards', note: 'Guards at gates, banks and shops' },
  { id: 'fitness', name: 'Joggers', note: 'Runners and walkers on Galle Face / the lake' },
  { id: 'medical', name: 'Nurses & doctors', note: 'Hospital staff in the street' },
];
export const GROUP_BY_ID = Object.fromEntries(VOICE_GROUPS.map((g) => [g.id, g]));
// spec.profile (Appearance.js) → group
export const PROFILE_GROUP = { vendor: 'vendor', tourist: 'tourist', office: 'office', worker: 'worker', courier: 'worker', student: 'student', security: 'security', fitness: 'fitness', medical: 'medical', medic: 'medic', shopkeeper: 'shopkeeper', driver: 'driver' };

export const VOICE_SITS = [
  { id: 'talk', name: 'Talking', note: 'Small talk, chatting with friends, on the phone, giving directions, at the bus stop' },
  { id: 'greet', name: 'Greeting & thanks', note: 'Saying hello to the player, thanking, remembering a favour' },
  { id: 'laugh', name: 'Laughing', note: 'Laughing with friends' },
  { id: 'angry', name: 'Angry / insults', note: 'Pushed, stared at, arguing, road rage, refusing to talk' },
  { id: 'scared', name: 'Scared', note: 'Frightened by the player, a gun, a near miss, an accident' },
  { id: 'scream', name: 'Screaming', note: 'Gunfire, an explosion or someone hurt right next to them' },
  { id: 'run', name: 'Running away', note: 'Panicking and fleeing (“Run!”, “Get down!”, out of breath)' },
  { id: 'help', name: 'Calling for help', note: 'Shouting for help, calling the police / 119' },
  { id: 'hurt', name: 'Hurt / in pain', note: 'Punched, shot, knocked down, hit by a car' },
  { id: 'die', name: 'Dying', note: 'The last cry when killed' },
  { id: 'surrender', name: 'Hands up / begging', note: 'Gun pointed at them, store robbery (“Don’t shoot! Take it!”)' },
  { id: 'carjack', name: 'Car stolen', note: 'Dragged out of their own car / tuk-tuk / bus by the player' },
  { id: 'grenade', name: 'Grenade warning', note: 'A grenade lands nearby: police shout “Grenade! Get down!” as they dive or run for cover; bystanders yell it as they scatter' },
  { id: 'sell', name: 'Selling / calling out wares', note: 'Vendors calling out what they sell (the Fort station shoulder vendors: “Isso wade!”, “Kadala!”, “Cold drinks!”)' },
  { id: 'order', name: 'Orders', note: 'Police: stop, hands up, under arrest · paramedics: calls at the patient' },
];
export const SIT_BY_ID = Object.fromEntries(VOICE_SITS.map((s) => [s.id, s]));

// LINES categories (src/story/Lines.js and the police / EMS lines) → situation; anything unlisted counts as talking
export const LINE_SIT = {
  greet: 'greet', greetFriend: 'greet', thanks: 'greet', grateful: 'greet', rememberGood: 'greet',
  laugh: 'laugh',
  annoyed: 'angry', shoved: 'angry', argue: 'angry', stare: 'angry', refuse: 'angry', roadRage: 'angry', recognizeBad: 'angry',
  scared: 'scared', wary: 'scared', accident: 'scared',
  panic: 'run',
  helpShout: 'help', helpCall: 'help', report: 'help',
  surrender: 'surrender',
};

export const voiceId = (group, sit, n = 0) => `dlg.${group}.${sit}` + (n ? `.var${n}` : '');
// sound definitions for SoundBank (base slot carries .vars, like the sound variations)
export function voiceDefs() {
  const out = [];
  for (const g of VOICE_GROUPS) for (const s of VOICE_SITS) {
    const base = { id: voiceId(g.id, s.id), name: `${g.name} — ${s.name}`, cat: 'Dialogue', kind: 'shot', lvl: 0.6, dlg: true, group: g.id, sit: s.id, vars: [] };
    out.push(base);
    for (let n = 1; n < VOICE_CLIPS; n++) { const id = voiceId(g.id, s.id, n); base.vars.push(id); out.push({ id, name: `${g.name} — ${s.name} (clip ${n + 1})`, cat: 'Dialogue', kind: 'shot', lvl: 0.6, dlg: true, group: g.id, sit: s.id, varOf: base.id }); }
  }
  return out;
}
