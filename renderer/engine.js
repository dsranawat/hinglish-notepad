// ===================== UNICODE DEVANAGARI -> KRUTI DEV =====================
// Conversion logic copied verbatim from hindi-tool.html — do not modify without
// checking with the app owner first; it has been reviewed against real legal
// typing use and is treated as correct as-is.

const VOWEL_KD = { // independent vowels
  "अ":"v", "आ":"vk", "इ":"b", "ई":"bZ", "उ":"m", "ऊ":"Å", "ऋ":"_",
  "ए":",", "ऐ":",s", "ओ":"vks", "औ":"vkS"
};

const MATRA_KD = { // dependent vowel signs (matras) - applied AFTER consonant cluster in KD, except chhoti-i handled specially
  "ा":"k", "ि":"f", "ी":"h", "ु":"q", "ू":"w", "ृ":"`", "े":"s", "ै":"S", "ो":"ks", "ौ":"kS", "ॉ":"‚"
};

const ANUSVARA_ETC = { "ं":"a", "ँ":"¡", "ः":"%" };

const FULL_KD = { // full consonant form (with inherent 'a'), used when nothing follows in halant
  "क":"d","ख":"[k","ग":"x","घ":"?k","ङ":"³",
  "च":"p","छ":"N","ज":"t","झ":">","ञ":"¥",
  "ट":"V","ठ":"B","ड":"M","ढ":"<","ण":".k",
  "त":"r","थ":"Fk","द":"n","ध":"/k","न":"u",
  "प":"i","फ":"Q","ब":"c","भ":"Hk","म":"e",
  "य":";","र":"j","ल":"y","व":"o",
  "श":"'k","ष":"\"k","स":"l","ह":"g",
  "ळ":"G",
  "क़":"d+","ख़":"[+k","ग़":"x+","ज़":"t+","ड़":"M+","ढ़":"<+","फ़":"Q+","य़":";+"
};

const HALF_KD = { // half (conjunct) form, used when followed by another consonant via halant
  "क":"D","ख":"[","ग":"X","घ":"?","ङ":"³~",
  "च":"P","छ":"N~","ज":"T","झ":"÷","ञ":"¥~",
  "ट":"V~","ठ":"B~","ड":"M~","ढ":"<~","ण":".",
  "त":"R","थ":"F","द":")","ध":"è","न":"U",
  "प":"I","फ":"¶","ब":"C","भ":"H","म":"E",
  "य":";~","र":"j~","ल":"Y","व":"O",
  "श":"'","ष":"\"","स":"L","ह":"º"
};

// Hard-coded ligature conjuncts (unique glyphs, not simple half+full)
// Longest (most Unicode chars) first so greedy matching works.
const CONJUNCTS = [
  ["क्ष्", "{"], ["क्ष", "{k"],
  ["त्र्", "«"], ["त्र", "="],
  ["ज्ञ", "K"],
  ["श्र", "J"],
  ["द्य", "|"], ["द्व", "}"],
  ["छ्य", "Nî"], ["ट्य", "Vî"], ["ठ्य", "Bî"], ["ड्य", "Mî"], ["ढ्य", "<î"],
  ["ट्र", "Vª"], ["ड्र", "Mª"], ["ढ्र", "<ªª"], ["छ्र", "Nª"],
  ["क्र", "Ø"], ["फ्र", "Ý"], ["ग्र", "xz"], ["प्र", "ç"],
  ["द्र", "æ"], ["र्द्र", "nzZ"],
  ["ह्न", "à"], ["ह्य", "á"], ["ह्म", "ã"], ["ह्र", "ºz"], ["हृ", "â"],
  ["त्त्", "Ù"], ["त्त", "Ùk"], ["क्त", "ä"], ["न्न्", "™"], ["न्न", "é"], ["द्ध", ")"],
  ["दृ", "–"], ["कृ", "—"],
  ["रु", "#"], ["रू", ":"],
];

// Punctuation, verified against the actual glyph outlines in the bundled
// assets/fonts/KrutiDev010.ttf (via fontkit cmap inspection + rendered comparison,
// not assumed) — plain ASCII punctuation cannot simply pass through, because in this
// font several of those byte slots are already used to draw unrelated Devanagari
// letters (comma is ए, period is half-ण, "?" is a digit-like glyph, '"' is ष, and
// "'" is श). Each entry below is the byte that this specific font actually renders
// as the intended punctuation mark; there is no glyph in the font shaped like a true
// double or single quote, so both use the closest available small raised mark.
const PUNCT_KD = {
  ",": "]",
  ".": "-",
  "?": "\\",
  "!": "!",
  '"': "*",
  "'": "^",
  // danda / double danda — the font has no real Unicode danda glyph at U+0964/U+0965
  // (both .notdef), but codepoint 65 ("A") is a clean single vertical stroke —
  // confirmed via fontkit + rendered comparison — with no other table entry using
  // it, so it's used here; doubled for the double-danda ("AA") the same way two
  // adjacent physical dandas would look.
  "।": "A",
  "॥": "AA"
};

const CONSONANTS = new Set(Object.keys(FULL_KD));
const HALANT = "्";
const NUKTA = "़";

function isConsonant(ch) { return CONSONANTS.has(ch); }

// Tokenize into syllable units: each unit is either
//  { type:'syllable', cluster:[consonants...], matra: <matra char or ''>, hasReph: bool }
//  { type:'vowel', ch }
//  { type:'other', ch }
function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (isConsonant(ch)) {
      let cluster = [ch];
      let j = i + 1;
      // absorb nukta directly on this consonant
      if (text[j] === NUKTA) { j++; }
      // absorb conjunct chain: halant + consonant, repeatedly
      while (text[j] === HALANT && isConsonant(text[j + 1])) {
        cluster.push(text[j + 1]);
        j += 2;
        if (text[j] === NUKTA) j++;
      }
      // trailing dangling halant (explicit half form at word end, e.g. "क्" alone)
      let danglingHalant = false;
      if (text[j] === HALANT && !isConsonant(text[j + 1])) {
        danglingHalant = true;
        j++;
      }
      // trailing matra / anusvara / visarga / chandrabindu
      let matra = '';
      if (!danglingHalant && MATRA_KD[text[j]]) { matra = text[j]; j++; }
      let trailing = '';
      if (ANUSVARA_ETC[text[j]]) { trailing = text[j]; j++; }
      tokens.push({ type: 'syllable', cluster, matra, danglingHalant, trailing });
      i = j;
    } else if (VOWEL_KD[ch]) {
      let j = i + 1;
      let trailing = '';
      if (ANUSVARA_ETC[text[j]]) { trailing = text[j]; j++; }
      tokens.push({ type: 'vowel', ch, trailing });
      i = j;
    } else {
      tokens.push({ type: 'other', ch });
      i += 1;
    }
  }
  return tokens;
}

function clusterToKD(cluster, danglingHalant) {
  // Try to match the whole cluster (joined by halant) against known ligature conjuncts first.
  const joined = cluster.join(HALANT);
  for (const [uni, kd] of CONJUNCTS) {
    const bare = uni.replace(/्$/, ''); // conjunct table entries may or may not include trailing halant
    if (bare === joined) return kd;
  }
  // Fallback: encode each consonant - half form for all but the last, full form for the last
  // (unless the whole cluster ends in a dangling halant, i.e. every member is a half form).
  let out = '';
  for (let k = 0; k < cluster.length; k++) {
    const isLast = k === cluster.length - 1;
    const useHalf = !isLast || danglingHalant;
    const c = cluster[k];
    if (useHalf) {
      out += HALF_KD[c] || (FULL_KD[c] + '~');
    } else {
      out += FULL_KD[c] || '';
    }
  }
  return out;
}

export function unicodeToKrutiDev(text) {
  const tokens = tokenize(text);
  let out = '';
  for (const t of tokens) {
    if (t.type === 'other') { out += (PUNCT_KD[t.ch] !== undefined ? PUNCT_KD[t.ch] : t.ch); continue; }
    if (t.type === 'vowel') { out += VOWEL_KD[t.ch] + (ANUSVARA_ETC[t.trailing] || ''); continue; }
    // syllable
    let reph = false;
    let cluster = t.cluster;
    if (cluster.length > 1 && cluster[0] === 'र') {
      reph = true;
      cluster = cluster.slice(1);
    }
    let body = clusterToKD(cluster, t.danglingHalant);
    if (t.matra === 'ि') {
      body = 'f' + body; // chhoti-i moves before the consonant cluster
    } else if (t.matra) {
      body = body + MATRA_KD[t.matra];
    }
    if (t.trailing) body += ANUSVARA_ETC[t.trailing];
    if (reph) body += 'Z';
    out += body;
  }
  return out;
}

// ===================== HINGLISH (ROMAN) -> DEVANAGARI =====================

// Common English words used verbatim in Indian legal/everyday Hinglish, typed in their
// normal English spelling (e.g. "court", "case") rather than phonetically respelled.
// Checked before WORD_DICT and before the phonetic engine, since letter-by-letter
// phonetic transliteration mangles English spelling conventions (e.g. "court" is not
// pronounced the way its letters would suggest phonetically). Not exhaustive — any
// English word not listed here still transliterates phonetically rather than being
// recognized as English; see README for this caveat.
export const ENGLISH_LOANWORDS = {
  "court":"कोर्ट","case":"केस","order":"ऑर्डर","affidavit":"एफिडेविट","summon":"समन",
  "notice":"नोटिस","bail":"बेल","judge":"जज","lawyer":"लॉयर","police":"पुलिस",
  "station":"स्टेशन","report":"रिपोर्ट","file":"फाइल","date":"डेट","hearing":"हियरिंग",
  "witness":"विटनेस","evidence":"एविडेंस","section":"सेक्शन","act":"एक्ट","form":"फॉर्म",
  "signature":"सिग्नेचर","original":"ओरिजिनल","copy":"कॉपी","stamp":"स्टाम्प",
  "register":"रजिस्टर","complaint":"कंप्लेंट","statement":"स्टेटमेंट"
};

// Common whole-word overrides for high frequency / ambiguous words (checked first, longest match).
export const WORD_DICT = {
  "hai":"है","hain":"हैं","hoon":"हूँ","hun":"हूँ","ho":"हो","tha":"था","thi":"थी","the":"थे",
  "nahi":"नहीं","nahin":"नहीं","haan":"हाँ","aur":"और","ya":"या","ki":"की","ka":"का","ke":"के",
  "ko":"को","se":"से","me":"में","mein":"में","par":"पर","hi":"ही","bhi":"भी","to":"तो",
  "kya":"क्या","kyun":"क्यों","kyunki":"क्योंकि","kaise":"कैसे","kab":"कब","kahan":"कहाँ","kaun":"कौन",
  "yeh":"यह","ye":"ये","woh":"वह","wo":"वह","iska":"इसका","uska":"उसका","apna":"अपना","apne":"अपने",
  "main":"मैं","hum":"हम","tum":"तुम","aap":"आप","unhe":"उन्हें","unko":"उनको","usne":"उसने","maine":"मैंने",
  "kar":"कर","karna":"करना","karta":"करता","karti":"करती","karte":"करते","kiya":"किया","kiye":"किए","hoga":"होगा","hogi":"होगी",
  "diya":"दिया","liya":"लिया","gaya":"गया","gayi":"गई","jaise":"जैसे","liye":"लिए","waqt":"वक़्त",
  "sab":"सब","sabhi":"सभी","kuch":"कुछ","koi":"कोई","is":"इस","us":"उस","in":"इन","un":"उन",
  "namaste":"नमस्ते","dhanyavad":"धन्यवाद","shukriya":"शुक्रिया",
  // legal / everyday-legal vocabulary
  "adalat":"अदालत","vakil":"वकील","kanoon":"कानून","kanooni":"कानूनी","nyay":"न्याय","nyayalaya":"न्यायालय",
  "appeal":"अपील","hukum":"हुक्म","aadesh":"आदेश","yachika":"याचिका","gawah":"गवाह",
  "saboot":"सबूत","dastavez":"दस्तावेज़","samman":"सम्मन","zamanat":"ज़मानत","sunwai":"सुनवाई",
  "vivaad":"विवाद","samjhauta":"समझौता","anubandh":"अनुबंध","dhara":"धारा","paksh":"पक्ष","pratipaksh":"प्रतिपक्ष",
  "anusar":"अनुसार","mera":"मेरा","meri":"मेरी","mere":"मेरे","tera":"तेरा","teri":"तेरी","tere":"तेरे",
  "hamara":"हमारा","hamari":"हमारी","hamare":"हमारे","uska":"उसका","uski":"उसकी","uske":"उसके",
  "padh":"पढ़","padhna":"पढ़ना","padha":"पढ़ा","padhi":"पढ़ी","padhe":"पढ़े","padhte":"पढ़ते","padhkar":"पढ़कर",
  "likh":"लिख","likhna":"लिखना","likha":"लिखा","likhi":"लिखी","likhe":"लिखे","likhte":"लिखते",
  "raha":"रहा","rahi":"रही","rahe":"रहे","rehna":"रहना","kaha":"कहा","kahi":"कही","kahe":"कहे","kehna":"कहना",
  "diya":"दिया","dena":"देना","liya":"लिया","lena":"लेना","gaya":"गया","gayi":"गई","jana":"जाना",
  "samay":"समय","waqt":"वक़्त","aaj":"आज","kal":"कल","abhi":"अभी","phir":"फिर","lekin":"लेकिन","magar":"मगर",
  "bahut":"बहुत","zaroor":"ज़रूर","zaroorat":"ज़रूरत","pata":"पता","matlab":"मतलब","baat":"बात",
  "sahi":"सही","galat":"गलत","theek":"ठीक","thik":"ठीक",
  "sahab":"साहब","saheb":"साहब","kripya":"कृपया","taiyar":"तैयार","taiyaar":"तैयार",
  "rakhiye":"रखिए","rakhna":"रखना","rakha":"रखा","rakhi":"रखी","rakhe":"रखे",
  "aapka":"आपका","aapki":"आपकी","aapke":"आपके","unka":"उनका","unki":"उनकी","unke":"उनके",
  "iske":"इसके","iski":"इसकी","uske":"उसके","jaisa":"जैसा","jaisi":"जैसी","waisa":"वैसा","waisi":"वैसी",
  "pesh":"पेश","peshi":"पेशी","faisla":"फैसला","faisala":"फैसला","hukm":"हुक्म","jamanat":"ज़मानत",
  "vakalatnama":"वकालतनामा","muvakkil":"मुवक्किल","gawahi":"गवाही","bayaan":"बयान","bayan":"बयान",
  "arzi":"अर्ज़ी","darkhast":"दरख़ास्त","shikayat":"शिकायत","fauran":"फ़ौरन","jald":"जल्द","jaldi":"जल्दी",
  "zaroor":"ज़रूर","mumkin":"मुमकिन","namumkin":"नामुमकिन","asaan":"आसान","mushkil":"मुश्किल",
  "sunna":"सुनना","suna":"सुना","suni":"सुनी","sune":"सुने","bolna":"बोलना","bola":"बोला","boli":"बोली",
  "dena":"देना","dekhna":"देखना","dekha":"देखा","dekhi":"देखी","dekhe":"देखे","milna":"मिलना","mila":"मिला",
  "chahiye":"चाहिए","chahta":"चाहता","chahti":"चाहती","chahte":"चाहते","zaruri":"ज़रूरी",
  // anusvara (nasal sound) corrections — plain phonetic typing tends to drop these
  "pahunchega":"पहुंचेगा","pahunchna":"पहुंचना","pahuncha":"पहुंचा","pahunchi":"पहुंची",
  "manzoor":"मंजूर","honge":"होंगे","bhoolen":"भूलें","bhoolna":"भूलना",
  "rahenge":"रहेंगे","karenge":"करेंगे","denge":"देंगे","lenge":"लेंगे",
  "zamin":"ज़मीन","pasand":"पसंद","purana":"पुराना","sakta":"सकता",
  // common retroflex words, pre-seeded so the t'/d'/n'/th'/dh'/sh' marker is rarely needed day-to-day
  "beta":"बेटा","beti":"बेटी","beton":"बेटों","ladka":"लड़का","ladki":"लड़की","ladke":"लड़के",
  "pahad":"पहाड़","sadak":"सड़क","bada":"बड़ा","badi":"बड़ी","bade":"बड़े",
  "thoda":"थोड़ा","thodi":"थोड़ी","mota":"मोटा","chota":"छोटा","choti":"छोटी",
  "gaadi":"गाड़ी","gaon":"गांव","ghar":"घर","sath":"साथ","aadha":"आधा",
  "andar":"अंदर","bahar":"बाहर","teen":"तीन","sthiti":"स्थिति",
  // short/long-vowel corrections found in regression testing
  "achhe":"अच्छे","lagana":"लगाना","bataiye":"बताइए","hume":"हमें","bhai":"भाई",
  "humari":"हमारी","agla":"अगला","mahine":"महीने","pati":"पति","makan":"मकान",
  "jama":"जमा","warna":"वरना",
  // "samman" already means summon (सम्मन) above for legal typing; "sammaan" (long aa)
  // is kept as a distinct spelling for the "respect/honor" sense so both coexist
  "sammaan":"सम्मान","dono":"दोनों","paksho":"पक्षों","hazir":"हाज़िर"
};

// Consonant clusters, longest first, matched greedily. Matching is case-insensitive —
// the input word is lowercased before this table is consulted (see transliterateWord) —
// so normal English capitalization (proper nouns, sentence starts) never changes the
// output. A trailing apostrophe is the explicit, opt-in way to reach a retroflex
// consonant (ट/ठ/ड/ढ/ण/ष) that plain typing can't otherwise produce: t' d' n' th' dh'
// sh'. These entries are listed here, ahead of their plain (non-apostrophe)
// counterparts, because matchLongest below returns the first table entry that matches
// at a given position — not a true longest-match search — so whichever spelling of a
// given prefix appears earlier in this array is the one that wins.
const CONS_MAP = [
  ["ksh","क्ष"], ["gy","ज्ञ"], ["jn","ज्ञ"], ["shr","श्र"], ["tr","त्र"],
  ["th'","ठ"], ["dh'","ढ"], ["sh'","ष"], ["t'","ट"], ["d'","ड"], ["n'","ण"],
  ["kh","ख"], ["gh","घ"], ["chh","छ"], ["ch","च"], ["jh","झ"],
  ["ny","ञ"], ["th","थ"], ["dh","ध"],
  ["ph","फ"], ["bh","भ"], ["sh","श"],
  ["k","क"], ["g","ग"], ["j","ज"], ["t","त"], ["d","द"], ["n","न"],
  ["p","प"], ["f","फ"], ["b","ब"], ["m","म"], ["y","य"], ["r","र"],
  ["l","ल"], ["v","व"], ["w","व"], ["s","स"], ["h","ह"],
  ["q","क़"], ["z","ज़"], ["x","क्स"]
];

const VOWEL_MAP_INITIAL = [ // when a vowel starts a syllable (independent form)
  ["aa","आ"], ["ee","ई"], ["oo","ऊ"], ["ai","ऐ"], ["au","औ"],
  ["a","अ"], ["i","इ"], ["u","उ"], ["e","ए"], ["o","ओ"]
];

const VOWEL_MAP_MATRA = [ // when a vowel follows a consonant (dependent form / matra)
  ["aa","ा"], ["ee","ी"], ["oo","ू"], ["ai","ै"], ["au","ौ"],
  ["a",""], ["i","ि"], ["u","ु"], ["e","े"], ["o","ो"]
];

function matchLongest(str, i, table) {
  for (const [k, v] of table) {
    if (str.startsWith(k, i)) return [k, v];
  }
  return null;
}

export function transliterateWord(word) {
  word = word.toLowerCase(); // case-insensitive by default; see CONS_MAP comment above
  let out = '';
  let i = 0;
  const n = word.length;
  let lastWasConsonant = false;
  while (i < n) {
    // explicit anusvara / visarga / chandrabindu markers
    if (word[i] === 'M' && lastWasConsonant === false) { /* fallthrough to normal m handling below */ }
    if (word.startsWith("ं", i) || word.startsWith("H", i) && lastWasConsonant) {
      // 'H' after a syllable = visarga
      out += 'ः'; i++; lastWasConsonant = false; continue;
    }
    const consMatch = matchLongest(word, i, CONS_MAP);
    if (consMatch) {
      const [key, dev] = consMatch;
      i += key.length;
      // look ahead for a vowel to attach as matra; else inherent 'a' (silent)
      const vMatch = matchLongest(word, i, VOWEL_MAP_MATRA);
      if (vMatch) {
        let matra = vMatch[1];
        const atWordEnd = (i + vMatch[0].length) === n;
        // word-final single "i" / "u" is usually meant as long ी / ू in casual Hinglish spelling
        if (atWordEnd && vMatch[0] === 'i') matra = 'ी';
        else if (atWordEnd && vMatch[0] === 'u') matra = 'ू';
        out += dev + matra;
        i += vMatch[0].length;
      } else if (word[i] === 'M') {
        out += dev + 'ं'; i++;
      } else if (word[i] === '~' && word[i+1] === 'n') {
        out += dev + 'ँ'; i += 2;
      } else {
        out += dev; // inherent 'a', silent - matches natural Hindi spelling
      }
      lastWasConsonant = true;
      continue;
    }
    const vInit = matchLongest(word, i, VOWEL_MAP_INITIAL);
    if (vInit) {
      out += vInit[1];
      i += vInit[0].length;
      lastWasConsonant = false;
      continue;
    }
    if (word[i] === 'M') { out += 'ं'; i++; lastWasConsonant = false; continue; }
    // unrecognized character - pass through
    out += word[i];
    i++;
    lastWasConsonant = false;
  }
  return out;
}

export function hinglishToDevanagari(text) {
  // Danda / double-danda: a separate character-level pass, deliberately kept out
  // of the [A-Za-z']+ word regex below (that regex is specifically for the
  // retroflex apostrophe marker). "/" or "|" -> । (danda); doubled, "//" or "||"
  // -> ॥ (double danda) — checked first so a doubled marker isn't left as two
  // single dandas. "." is never touched here; it stays a literal ASCII period.
  text = text.replace(/\/\//g, '॥').replace(/\|\|/g, '॥').replace(/\//g, '।').replace(/\|/g, '।');

  // split preserving whitespace/punctuation as separators. Apostrophe is included
  // as a word character so a retroflex marker like "t'" stays attached to its word
  // instead of being split off as separate punctuation before transliterateWord
  // ever sees it (see CONS_MAP).
  return text.replace(/[A-Za-z']+/g, (word) => {
    const lower = word.toLowerCase();
    if (ENGLISH_LOANWORDS[lower]) return ENGLISH_LOANWORDS[lower];
    if (WORD_DICT[lower]) return WORD_DICT[lower];
    return transliterateWord(word);
  });
}

export function hinglishToKrutiDev(text) {
  return unicodeToKrutiDev(hinglishToDevanagari(text));
}
