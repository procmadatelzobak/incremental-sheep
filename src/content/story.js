// Short, one-time rewards for actual mechanical events. No economic effects.
import { behemotSay } from './behemot.js';

export function defaultStory(carry = null) {
  const source = carry?.story || carry;
  return { seen: { ...source?.seen }, events: [...(source?.events || [])].slice(-128) };
}
export function emitStory(state, id, text) {
  if (!state) return null;
  const story = state.story || (state.story = defaultStory());
  if (story.seen[id]) return null;
  const event = { id, text, at: state.meta?.totalGameTime || 0, run: state.prestige?.runs || 0 };
  story.seen[id] = true;
  story.events.push(event);
  if (story.events.length > 128) story.events.shift();
  (state._storyUp || (state._storyUp = [])).push(event);
  return event;
}
export const hasSeenStory = (state, id) => !!state.story?.seen[id];
export const getStoryEvents = state => state.story?.events || [];
export const storySummary = state => ({ total: getStoryEvents(state).length, last: getStoryEvents(state).at(-1) || null });

export function updateStory(state) {
  if (!state) return [];
  const story = state.story || (state.story = defaultStory());
  const fresh = [];
  const when = (id, condition, text) => {
    if (!story.seen[id] && condition) { const event = emitStory(state, id, text); if (event) fresh.push(event); }
  };
  const groups = state.groups || [], phase = state.phase || 1;
  const count = g => ['M', 'F'].reduce((n, sex) => n + ['child', 'adult', 'old'].reduce((m, stage) => m + (g.counts?.[sex]?.[stage] || 0), 0), 0);
  const pop = groups.reduce((n, g) => n + count(g), 0), runs = state.prestige?.runs || 0;
  when('first_selection', state.stats?.selected > 0,
    'I ponechal Farmář některá jehňata a jiná neponechal. A v příštím vrhu poznal, že jeho rozhodnutí nezemřelo s nimi.');
  when('immortality', state.flags?.immortal,
    'Vypil mléko věčnosti. Farmář se stal Pastýřem a pravil: teď už budu mít dost času. A čas mlčel.');
  when('intelligent_sheep', groups.some(g => g.genes?.intelligence?.mu >= 5),
    'Ovce vyřešily první výpočet. Vyšlo jim, že ovcí není dosti. Pastýř prohlásil výsledek za vědecký.');
  when('earth_departure', groups.some(g => g.worldId && g.worldId !== 'earth' && count(g) >= 1),
    'První stádo stanulo pod cizím nebem. Louka už byla koupena; teprve teď se ukázalo, že se na ní musí také dýchat.');
  when('spheres_1', state.projects?.dyson?.count >= 1,
    'Z kostí učinil nosníky, z kůže plachty a obestavěl Slunce. Nazvali jej Pánem Stád. Radost vydržela jeden nádech.');
  when('spheres_5', state.projects?.dyson?.count >= 5,
    'Páté Slunce zmizelo za vlnou. Jedna sféra byla jen první sféra. A přece jich nebylo dosti.');
  when('judges_phase_9', phase >= 9,
    'I ustanovil Soudce: Myslitele, Tkalce a Stavitele. Poprvé nechtěl stejné ovce. Chtěl, aby každá uměla něco jiného.');
  when('blackhole_run_1', runs >= 1,
    'Sklad se zhroutil. Ze všech ovcí zbyla prázdná louka a hrst Vědění. A přece prošel dveřmi zpátky.');
  when('blackhole_run_3', runs >= 3,
    'Co kdysi trvalo věky, vykonal potřetí bez zaváhání. Behemot poznal kroky za vraty. „zas ty. já to věděl.“');
  when('blackhole_run_5', runs >= 5,
    'Popáté přinesl Vědění na počátek. Znal každou zkratku. Jen nevěděl, kam vlastně spěchá.');
  when('revelation_phase_11', phase === 11,
    'Ten, Jenž Střihá, přestal počítat. Touha byla nádoba bez dna; žádné stádo ji nemohlo naplnit. A napsal Předmluvu.');
  when('pop_1e6', pop >= 1e6, 'Milion ovcí zakryl louku. A přece jich nebylo dosti.');
  when('pop_1e12', pop >= 1e12, 'Bilion ovcí. Účetní došel na konec stránky a přidal stránku. A přece jich nebylo dosti.');
  when('pop_1e18', pop >= 1e18, 'Trilion ovcí. Číslo už nikdo nevyslovoval; stačilo poručit, aby rostlo. A přece jich nebylo dosti.');
  when('touha_bottomless', runs >= 1 || phase >= 4, 'Neboť Touha je nádoba bez dna, a kdo do ní lije, slyší jen příslib dalšího lití.');
  when('epithet_arc', state.meta?.epithet && state.meta.epithet !== 'Farmář', `A lid mu dal nové jméno: ${state.meta?.epithet}. On se však vrátil k počítání.`);
  if (fresh.length && state.behemot) behemotSay(state, 'milestone');
  return fresh;
}
