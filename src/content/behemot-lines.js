// ===========================================================================
//  Behemot — hlášky (Etapa 2). Kurátorovaný výběr z lore (behemot_hlasky_*.json)
//  v jeho jazyce (moravsky, technicky, protivně). Klíče = herní události.
//  Drženo jako JS modul (zero-dep, funguje v prohlížeči i v Node testech).
// ===========================================================================
export const LINES = {
  openShop: [
    'No co zas chceš, rychle, než mi to tady začne žrát data.',
    'Vítej v obchodě, šáhni jenom na to, na co máš suroviny.',
    'Behemot Emporio, žádný kredity, žádný účtenky, žádný divný otázky.',
    'Tak dělej, buď kup, nebo aspoň nepřekážej.',
    'Jestli si přišel jenom čumět, tak se čumí za roh.',
    'Tak se ukaž, farmáři, kolik máš vlny a kolik odvahy.',
    'Modal votevřenej, bordel vyskládanej, svědomí vypnutý.',
    'Vstup povolen, rozum dobrovolně odlož u dveří.',
  ],
  repeatVisit: [
    'Už zas? To tě stádo poslalo, nebo doma nikdo nezvedá telefon?',
    'No podívejme, zákazník se vrátil, takže minule zřejmě přežil.',
    'Zase ty. To bude buď obchod, nebo další tragédie.',
    'Tak co, už sis rozmyslel, že kredity sou na nic?',
    'Zase potřebuješ něco, co by normální člověk nepotřeboval. Výborně.',
    'Vracet se do Emporia je první příznak pokroku nebo úrazu hlavy.',
  ],
  notEnoughResources: [
    'Nemáš na to ani vlnu, ani charakter.',
    'S tímhle rozpočtem si můžeš kópit tak akorát pocit hanby.',
    'Nejdřív něco vyprodukuj, pak předstírej kapitalistu.',
    'Chybí suroviny. A podle výrazu možná aj plán.',
    'Kdybych bral výmluvy, byl bys bohatej.',
    'Přines víc vlny, masa nebo čehokoli, co nevypadá jak dobrý úmysl.',
  ],
  purchaseSuccess: [
    'No vidíš, dyž chceš, umíš nebýt úplně k ničemu.',
    'Prodáno. Následky sou tvoje, suroviny moje.',
    'Tak, máš to. Neolizovat, neohřívat, neukazovat úřadům.',
    'Výborně, teď už to nemám já, takže problém se přesunul.',
    'Prodáno bez záruky, bez lítosti a bez dalšího vysvětlování.',
    'Konečně zákazník, kerej pochopil barter dřív než po západu slunce.',
  ],
  suspiciousPurchase: [
    'Tohle bych doma neotevíral, pokud tam máš eště domov.',
    'Návod nečti, akorát bys zjistil, co všechno porušuješ.',
    'Vypadá to nebezpečně, protože to nebezpečný je. Konečně poctivej marketing.',
    'Kdyby se někdo ptal, neznáme se a nikdy si tady nebyl.',
    'Nezkoušej to na oblíbené ovci, začni na té, co se tváří blbě.',
    'Koupils to, takže právně vzato si optimista.',
  ],
  soldOut: [
    'Není. Sežrali to rychlejší a míň ukecaní zákazníci.',
    'Další kus bude, až zase něco spadne z náklaďáku.',
    'Není skladem. Sklad taky někdy potřebuje oddych od šílenství.',
    'Konec zásob, začátek výmluv.',
    'Vyprodáno. Blahopřeju k pozdnímu zájmu.',
    'Není. A ne, nepůjdu se podívat dozadu, vzadu je tma a důkazy.',
  ],
  restock: [
    'Přivezl sem novej bordel, půlka smrdí a půlka bzučí.',
    'Naskladněno. Něco z pastviny, něco z laborky, něco se neptej.',
    'Doplnil sem zásoby, než si toho všimli lidi s reflexní vestó.',
    'Sklad zase vypadá jak po malý válce, takže máme otevřeno.',
    'Zboží doplněno. Kdyby něco tikalo, neotáčej s tím.',
  ],
  spamClicking: [
    'Neklikej na to jak korporátní opica na školení.',
    'Tlačítko není ovce, nemusíš ho nahánět.',
    'Spamování není strategie, je to zvuk zoufalství.',
    'Klid, kovboji, obchod není buben.',
    'Klikni jednou a počkej, tvl, nejsme v závodě botů.',
  ],
  idleInShop: [
    'Hodláš to kópit, nebo mi tady budeš vypalovat obrazovku?',
    'Stojíš v obchodě jak aktualizace na devadesáti sedmi procentech.',
    'Čas běží, ovce žerou, ty koukáš. Krásnej management.',
    'To zboží se samo nekoupí, bohužel pro oba.',
    'Kdyby civění vyrábělo vlnu, si magnát.',
  ],
  impossibleAction: [
    'Na todle eště nemáš ani stádo, ani morální úpadek.',
    'Tohle ti neprodám, dokud nebudeš větší problém.',
    'Tady seš eště malej pán, počkej na větší katastrofy.',
    'Odemkne se to pozdějc, až bude pozdějc horší nápad.',
  ],
  // nálada dle vztahových os (Etapa 3): vysoké Přetížení = "tense", vysoká Důvěra = "warm"
  tense: [
    'Nešahej na to, eště to začne fungovat.',
    'Ty seš zas chytrej jak kalkulačka bez baterek.',
    'Mám toho dneska až po krk, tak buď rychlej.',
    'Tvoje odvaha je obdivuhodná a tvůj úsudek trestuhodnej.',
    'Čumíš na to jak ovce na daňový přiznání.',
  ],
  warm: [
    'No, ty už aspoň víš, kde se platí věcma a ne sliby.',
    'Dobrý. S tebó se obchodně nenudím, a to je vod Behemota poklona.',
    'Vidíš, dyž chceš, umíš to. Skoro civilizovaný.',
    'Tobě bych prodal i to, co normálně schovávám dozadu.',
  ],
  // Behemot komentuje, jak Emporio (a ty) přerostlo původní garáž (Etapa 4)
  gameStageProgress: [
    'Začínal si s loukó, teď řešíš kontinenty. Normální vývoj šílence.',
    'Už to není farma, to je projekt, co měl někdo zarazit v první poradě.',
    'Dřív si kupoval seno, teď kupuješ fyzikální výjimky. Hezký sešup.',
    'Z pastýře se stal operátor katastrofy. Kariérní růst, no.',
    'Čím dál postupuješ, tím víc věcí vyžaduje olovo, chlad a mlčení.',
    'Tohle už není garáž, to je distribuovanej bordel přes půl reality.',
  ],
};
