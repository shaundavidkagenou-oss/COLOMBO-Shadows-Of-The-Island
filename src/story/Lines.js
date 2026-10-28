// Ambient NPC lines. Each: { si|ta|en: original text, tr: English subtitle (omitted for English) }.
// Kept to short, common, everyday phrases to stay accurate.
export const LINES = {
  greet: [
    { si: 'ආයුබෝවන්!', tr: 'Ayubowan! (Greetings!)' },
    { si: 'කොහොමද?', tr: 'How are you?' },
    { si: 'හොඳයි, ස්තූතියි.', tr: 'Good, thank you.' },
    { ta: 'வணக்கம்!', tr: 'Vanakkam! (Hello!)' },
    { ta: 'எப்படி இருக்கீங்க?', tr: 'How are you?' },
    { en: 'Morning, machan!' },
    { en: 'Hello, hello! All good?' },
  ],
  thanks: [{ si: 'ස්තූතියි!', tr: 'Thank you!' }, { ta: 'நன்றி!', tr: 'Thank you!' }, { en: 'Thanks, ah!' }],
  annoyed: [
    { si: 'මොකද?', tr: 'What is it?' },
    { si: 'මොකක්ද කරන්නේ?', tr: 'What are you doing?' },
    { si: 'පිස්සුද?', tr: 'Are you mad?' },
    { ta: 'என்ன?', tr: 'What?' },
    { en: 'Aiyo, what is this?' },
    { en: 'What men, watch it!' },
    { en: 'Go, go. Don\'t bother me.' },
  ],
  scared: [{ si: 'අනේ!', tr: 'Oh no!' }, { si: 'පරිස්සමින්!', tr: 'Careful!' }, { ta: 'கவனம்!', tr: 'Careful!' }, { en: 'Aiyo! Somebody help!' }, { en: 'Are you crazy? Slow down!' }],
  okay: [{ si: 'කමක් නෑ.', tr: 'No problem.' }, { ta: 'பரவாயில்லை.', tr: "It's okay." }, { en: 'Okay, okay. No problem.' }],
  rain: [{ si: 'වැස්ස එනවා.', tr: 'The rain is coming.' }, { ta: 'மழை வருது.', tr: 'The rain is coming.' }, { en: 'Monsoon again. My shoes are finished.' }],
  bus: [{ si: 'බස් එක පරක්කුයි.', tr: 'The bus is late.' }, { en: 'This 138 never comes on time.' }, { en: 'Full bus again. Next one, maybe.' }],
  chat: [
    { en: 'They say the old shops on Main Street are being bought up.' },
    { en: 'Cricket tonight? Who is batting first?' },
    { en: 'Price of dhal has gone up again.' },
    { en: 'My cousin works at the port. Night shifts only.' },
    { si: 'ඉක්මනට එන්න.', tr: 'Come quickly.' },
    { en: 'Kottu at the corner place after work?' },
    { en: 'Did you see the new towers near Galle Face? Huge.' },
    { en: 'Traffic at Kollupitiya was terrible this morning.' },
    { ta: 'நன்றி, அப்புறம் பார்க்கலாம்.', tr: 'Thanks, see you later.' },
  ],
  vendor: [{ en: 'Isso vadai! Hot hot!' }, { en: 'King coconut, very fresh!' }, { en: 'Rambutan, mangosteen, good price!' }, { en: 'Come, come, have a look.' }],
  phone: [{ en: 'Yes, yes, I am coming. Five minutes.' }, { en: 'Amma, I told you, I will be late.' }, { si: 'හොඳයි, හොඳයි.', tr: 'Okay, okay.' }],
  shoved: [{ si: 'පිස්සුද?', tr: 'Are you mad?' }, { en: 'Hey! What is your problem?' }, { en: 'Don\'t push, men!' }, { ta: 'என்ன இது?', tr: 'What is this?' }],
  directions: [{ en: 'Fort station? Straight down, then left at the clock tower.' }, { en: 'Galle Face is that way, by the sea.' }, { en: 'Pettah market — just follow the crowd!' }, { en: 'Lotus Tower? You can\'t miss it, look up!' }],
};
export function pick(list, r = Math.random) { return list[Math.floor(r() * list.length)]; }
export function lineText(l) { return l.si || l.ta || l.en; }
export function lineLang(l) { return l.si ? 'si' : l.ta ? 'ta' : 'en'; }
