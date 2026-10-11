/**
 * Marcus, built in. Answers the New Ark website chat with no AI key, no credits and no outside service.
 *
 * It is the engine of last resort for /api/newark/chat: used when no AI provider is configured, and
 * whenever a configured provider fails, so the chat box on the site can never go dark.
 *
 * Stateless, like the route: the page sends the conversation so far and the stage of a callback
 * request is read back out of Marcus's own earlier questions.
 *
 *   reply(messages, saveTicket) -> { reply, saved }
 *     messages   [{ role: "user"|"assistant", content }]  ending with a user message
 *     saveTicket async ({ name, phone, address, service, urgency, summary }) -> { ok, ticket?, error? }
 */

const PHONE = "908-454-4043";

const T = {
  en: {
    what: "Sure. I can have the owner call you back. First, what do you need help with?",
    name: "I can have the owner call you back about that. What's your name?",
    nameAgain: "What name should the owner ask for? Just your name is fine.",
    phone: (n) => `Thanks, ${n}. What's the best number to reach you?`,
    phoneAgain: "I need a 10-digit phone number so the owner can reach you. What's the best number?",
    town: "And what town or address is the job at?",
    done: (n) => `Thank you, ${n}. The owner has your details and will call you back. If it's urgent, call ${PHONE}.`,
    failed: `I couldn't save that just now. Please call ${PHONE} so we don't miss you.`,
    offer: "Would you like the owner to call you back?",
    unknown: "I don't have that answer here, but the owner can answer it. Would you like the owner to call you back?",
    noThanks: `No problem. If you need anything else, ask me here or call ${PHONE}.`,
    water: `Call ${PHONE} right now, and shut off the main water valve if you can do it safely.`,
    gas: "Leave the building now. Then call 911 and your gas company from outside.",
  },
  es: {
    what: "Claro. Puedo pedirle al dueño que le llame. ¿En qué le podemos ayudar?",
    name: "Puedo pedirle al dueño que le llame. ¿Cuál es su nombre?",
    nameAgain: "¿Cuál es su nombre? Solo su nombre está bien.",
    phone: (n) => `Gracias, ${n}. ¿Cuál es el mejor número de teléfono para llamarle?`,
    phoneAgain: "Necesito un número de teléfono de 10 dígitos para que el dueño le llame. ¿Cuál es el mejor número de teléfono?",
    town: "¿En qué pueblo o dirección es el trabajo?",
    done: (n) => `Gracias, ${n}. El dueño tiene sus datos y le va a llamar. Si es urgente, llame al ${PHONE}.`,
    failed: `No pude guardar eso ahora. Por favor llame al ${PHONE}.`,
    offer: "¿Quiere que el dueño le llame?",
    unknown: "No tengo esa respuesta aquí, pero el dueño sí. ¿Quiere que el dueño le llame?",
    noThanks: `Está bien. Si necesita algo más, escríbame aquí o llame al ${PHONE}.`,
    water: `Llame al ${PHONE} ahora mismo, y cierre la llave principal del agua si puede hacerlo con seguridad.`,
    gas: "Salga del edificio ahora. Luego llame al 911 y a su compañía de gas desde afuera.",
  },
};

// What Marcus last asked, read from his own words. Order matters: most specific first.
const STAGES = [
  ["done", /has your details|tiene sus datos/i],
  ["phone", /best number|n[uú]mero de tel[eé]fono/i],
  ["town", /town or address|pueblo o direcci[oó]n/i],
  ["name", /your name|what name should|su nombre/i],
  ["what", /what do you need help with|en qu[eé] le podemos ayudar/i],
  ["offer", /call you back\?|que el due[nñ]o le llame\?/i],
];
const stageOf = (text) => { for (const [k, re] of STAGES) if (re.test(text || "")) return k; return null; };

const SPANISH = /[¿¡ñ]|\b(hola|buenos|buenas|necesito|gracias|usted|tiene[ns]?|puede[ns]?|quiero|ayuda|fuga|calentador|plomero|est[aá]|cu[aá]nto|d[oó]nde|por favor|llamar|ll[aá]meme|ba[nñ]o|cocina|agua|calefacci[oó]n|aire)\b/i;
const GAS = /smell(s|ing)? (of )?gas|gas smell|gas leak|leaking gas|\bsmoke\b|carbon monoxide|olor a gas|huele a gas|fuga de gas|\bhumo\b/i;
const WATER = /flood|burst|gushing|water (is )?(everywhere|pouring)|pouring|sewage|sewer (is )?back|backing up|no heat|sprinkler.*(went off|going off|discharg)|inundaci|tubo roto|tuber[ií]a rota|sin calefacci[oó]n|aguas negras/i;
const YES = /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|yes please|that works|sounds good|go ahead|s[ií]|claro|por favor)\b/i;
const NO = /^\s*(no|nope|nah|no thanks|no thank you|not now|no gracias)\b/i;
const ASKS = /^\s*(do|does|did|are|is|can|could|will|would|what|how|where|when|why|who|have|has|which)\b/i;
const PROBLEM = /leak|clog|broke|burst|not working|doesn'?t work|won'?t (turn|start|work|drain|flush|heat|cool)|stopped working|no hot water|backed up|dripping|running toilet|call me|call back|callback|give me a call|schedule|appointment|book (a|an)|come out|need (a|an|some|my|the|someone|help|to)|i want (a|an|to)|looking for|quote for/i;

const FAQ = [
  [/are you (a )?(real|human|person|robot|bot|ai)|am i (talking|chatting) (to|with) a/i, "I'm New Ark's AI front desk. I pass everything straight to the owner."],
  [/i (already |just )?(paid|sent (a |the |my )?payment)|paid\.? what/i, "Thank you. Please fill in the short \"I've sent a payment\" form in the Pay a bill section so your payment is matched to your invoice."],
  [/invoice|balance|status of|my (job|account|bill)\b/i, "I can't see invoices, balances or job status here, but the owner can. Would you like the owner to call you back?"],
  [/zelle|cash ?app|\bpay\b|payment|credit card|debit/i, "The Pay a bill section shows how to pay by Zelle, Cash App or card. After you pay, fill in the short \"I've sent a payment\" form there so it's matched to your invoice."],
  [/what photos|which photos|photos? should/i, "Send clear photos of the problem and of the space or equipment around it. You can add them right in the Get a free estimate form."],
  [/how (soon|long|fast|quick).*(estimate|proposal|quote)|when will i (get|hear)/i, "The owner prices every estimate himself, so I can't promise a time. You'll get an itemized proposal to review and sign online."],
  [/(estimate|quote).*(free|charge|cost)|(free|charge|cost).*(estimate|quote)/i, "Estimates are free. Send photos and details in the Get a free estimate section. It takes about 2 minutes."],
  [/how much|price|pricing|\bcost|\brates?\b|\bfee\b/i, "Pricing depends on the job, so I can't quote one here. Estimates are free: send photos and details in the Get a free estimate section."],
  [/come (out )?(today|tonight|now|tomorrow)|how (soon|fast|quick)|same day|right away/i, `I can't promise an arrival time here. Emergencies are answered 24 hours a day at ${PHONE}. Would you like the owner to call you back?`],
  [/emergenc/i, `Yes. Emergencies are answered 24 hours a day. If you have one right now, call ${PHONE}.`],
  [/hours|weekend|saturday|sunday|open (on|today|now|late)|when are you open/i, "Emergencies are answered 24 hours a day. Scheduled work is Monday to Saturday."],
  [/where.*(office|located|location|you)|your (office|address|location)/i, "Our office is at 412 Firth St., Phillipsburg, NJ 08865."],
  [/phone number|number to call|how (do|can) i (call|reach|contact)/i, `You can reach New Ark at ${PHONE}.`],
  [/licen[sc]e|insured|insurance|bonded|certified/i, "Yes. New Ark is licensed and insured: Master Plumber License #4646 and HVAC Contractor License #1783, State of New Jersey. It is also a certified small and minority business."],
  [/how long|how many years|in business|experience/i, "New Ark has been serving New Jersey for nearly 40 years."],
  [/public sector|government|municipal|union/i, "Yes. New Ark does public and private sector work and is an open and union shop. Past work includes the Joint Meeting of Essex & Union Counties in Elizabeth and Newark Access Station."],
  [/restaurant/i, "Yes. New Ark has worked on restaurants, including Benihana in Short Hills."],
  [/large building|high[- ]?rise|big building|medical|hospital/i, "Yes. New Ark's heating and air conditioning experience includes high-rise buildings, medical facilities and restaurants."],
  [/design/i, "Yes. New Ark designs and installs HVAC systems, including duct work and equipment, and designs and installs fire sprinkler systems."],
  [/commercial|business(es)?\b|residential|homes?\b/i, "Yes. New Ark does both commercial and residential work."],
  [/my town|what (areas?|towns?)|areas? (do )?you (serve|cover)|service area|do you (come|go|travel|serve|cover)|come to/i, "We're based in Phillipsburg and serve Northern and Western New Jersey. If you're not sure about your town, the owner can confirm. Would you like the owner to call you back?"],
  [/geotherm/i, "Yes. New Ark installs and maintains ground-source heating and cooling systems, for new construction and retrofits."],
  [/sprinkler|fire protection/i, "Yes. New Ark designs and installs fire sprinkler systems for homes and businesses, with regular inspections."],
  [/water heater/i, "Yes. Water heaters are part of our plumbing work. Would you like the owner to call you back?"],
  [/furnace|boiler|heating|\bheat\b|air condition|\bac\b|a\/c|hvac|duct|cooling/i, "Yes. New Ark installs and maintains furnaces, boilers, central air and duct work. Would you like the owner to call you back?"],
  [/drain|sewer|toilet|sink|faucet|pipe|plumb|bathroom|kitchen/i, "Yes. New Ark handles complete plumbing: kitchens, bathrooms, water heaters, drain and sewer lines, leaks and clogs. Would you like the owner to call you back?"],
  [/what (services|do you (do|offer))|services/i, "New Ark does plumbing, heating and air conditioning, geothermal systems and fire sprinklers, for homes and businesses."],
  [/^\s*(thanks|thank you|thx|great|perfect|awesome)\b/i, "You're welcome. Anything else I can help with?"],
  [/^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i, "Hi. What can I help you with?"],
];

const tenDigits = (s) => {
  const d = String(s || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? d : null;
};
const cleanName = (s) => String(s || "")
  .replace(/[(+]?\d[\d\s().-]{6,}/g, " ")
  .replace(/^\s*(hi|hello|hey)[,.!]?\s+/i, "")
  .replace(/^\s*(my name is|my name's|this is|it'?s|i am|i'?m|me llamo|mi nombre es|soy)\s+/i, "")
  .replace(/[.,!]+$/g, "").replace(/\s+/g, " ").trim();
const serviceOf = (s) =>
  /water heater|hot water|calentador/i.test(s) ? "Plumbing"
  : /geotherm/i.test(s) ? "Geothermal"
  : /sprinkler|fire protection/i.test(s) ? "Fire Protection"
  : /furnace|boiler|heat|air condition|\bac\b|a\/c|hvac|duct|cooling|thermostat|calefacci|aire/i.test(s) ? "HVAC"
  : /leak|clog|drain|sewer|toilet|sink|faucet|pipe|plumb|water|bath|kitchen|fuga|ba[nñ]o|agua|tuber/i.test(s) ? "Plumbing"
  : "Other";

// Everything the visitor has told Marcus during the callback request that is open right now.
function collect(messages) {
  let from = 0;
  for (let i = 0; i < messages.length; i++) if (messages[i].role === "assistant" && stageOf(messages[i].content) === "done") from = i + 1;
  const m = messages.slice(from);
  const out = { name: "", phone: null, town: "", summary: "" };
  let firstName = -1;
  for (let i = 0; i < m.length - 1; i++) {
    if (m[i].role !== "assistant" || m[i + 1].role !== "user") continue;
    const st = stageOf(m[i].content), ans = m[i + 1].content;
    if (st === "name") { if (firstName < 0) firstName = i; if (cleanName(ans)) out.name = cleanName(ans); out.phone = tenDigits(ans) || out.phone; }
    if (st === "phone") out.phone = tenDigits(ans) || out.phone;
    if (st === "town") out.town = ans;
  }
  // What they need: the last thing they said before Marcus asked for a name, skipping a bare "yes".
  for (let i = (firstName < 0 ? m.length : firstName) - 1; i >= 0; i--) {
    if (m[i].role === "user" && !YES.test(m[i].content)) { out.summary = m[i].content; break; }
  }
  return out;
}

async function reply(messages, saveTicket) {
  const last = messages[messages.length - 1].content;
  const prev = [...messages].reverse().find((m) => m.role === "assistant");
  const stage = stageOf(prev && prev.content);
  const t = messages.some((m) => m.role === "user" && SPANISH.test(m.content)) ? T.es : T.en;

  if (GAS.test(last)) return { reply: t.gas, saved: null };
  if (WATER.test(last)) return { reply: t.water, saved: null };

  if (stage === "what") return { reply: t.name, saved: null };

  if (stage === "name") {
    const n = cleanName(last);
    if (!n || n.length > 60 || /\?/.test(last)) return { reply: t.nameAgain, saved: null };
    return { reply: tenDigits(last) ? t.town : t.phone(n), saved: null };
  }

  if (stage === "phone") return { reply: tenDigits(last) ? t.town : t.phoneAgain, saved: null };

  if (stage === "town") {
    const c = collect(messages);
    if (!c.name) return { reply: t.nameAgain, saved: null };
    if (!c.phone) return { reply: t.phoneAgain, saved: null };
    const out = await saveTicket({
      name: c.name.slice(0, 120), phone: c.phone, address: String(c.town || "").slice(0, 300),
      service: serviceOf(c.summary), urgency: "Within 48 hours", summary: c.summary || "Asked for a call back.",
    });
    return out && out.ok ? { reply: t.done(c.name), saved: out.ticket || true } : { reply: t.failed, saved: null };
  }

  if (stage === "offer") {
    if (NO.test(last)) return { reply: t.noThanks, saved: null };
    if (YES.test(last)) {
      // After "I don't have that answer", their question is already the reason for the call.
      const unknown = /don't have that answer|no tengo esa respuesta/i.test(prev.content);
      return { reply: unknown ? t.name : t.what, saved: null };
    }
  }

  if (t === T.es) return { reply: t.name, saved: null };
  if (PROBLEM.test(last) && !ASKS.test(last)) return { reply: t.name, saved: null };
  for (const [re, answer] of FAQ) if (re.test(last)) return { reply: answer, saved: null };
  if (PROBLEM.test(last)) return { reply: t.name, saved: null };
  return { reply: t.unknown, saved: null };
}

module.exports = { reply, stageOf, collect, FAQ, T };
