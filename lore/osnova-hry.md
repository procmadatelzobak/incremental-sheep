# Osnova příběhu a postupu hry

Tato osnova popisuje implementovanou hru. Literární [Bible Farmářova](README.md)
zůstává příběhovou předlohou; starší technický návrh je v
[archivu](../_archiv/REWRITE-SPEC-v3.md). Naměřené časy a předpoklady popisuje
[zpráva o ekonomice](../docs/balance-report.md).

„A přece jich nebylo dosti.“ Farmář se mění v Pastýře, Pána Stád a nakonec
v Toho, Jenž Střihá. Mění se způsob hromadění, ale Touha zůstává nádobou bez dna.
Příběh se připomíná krátkými zápisy po skutečných herních událostech v Kronice.

| Fáze a kniha | Co hráč objeví a rozhoduje | Skutečná podmínka postupu |
|---|---|---|
| 1. [Stvoření](01-kniha-stvoreni.md) | První stádo, životní cyklus, vlna a kredity. Geny jsou vidět od začátku. | Vydělat celkem 1 500 kreditů. |
| 2. [Množení](02-kniha-mnozeni.md) | Mléko po oplodnění; výběr jehňat mění μ a σ. Vyšší přísnost obětuje počet pro kvalitu. | Zásobit mlékem a dokončit šlechtitelský program. |
| 3. [Královská](03-kniha-kralovska.md) | Monopol a zpracování: suroviny lze prodat, nebo jimi stavět obchodní síť. Textilní profil prospívá vlně za cenu pomalejšího dospívání. | Dokončit obchodní síť ze sukna a sýra. |
| 4. [Nesmrtelnosti](04-kniha-nesmrtelnosti.md) | Pastýř získává čas. Připraví mléčný elixír a našetří na jeho dokončení. Nesmrtelný je Farmář; ovce dál stárnou a umírají. | Dokončit práci na elixíru a zaplatit jeho výrobu. Biologický cyklus se zrychlí. |
| 5. [Moudrých ovcí](05-kniha-moudrych-ovci.md) | Inteligence produkuje spotřebovávaný výpočet. Rostou genetické stropy; porážka dodává kosti, kůže a mozky. | Dokončit výzkum vědomí za výpočetní výkon. |
| 6. [Exodu](06-kniha-exodu.md) | Každé stádo má vlastní svět. Parcela potřebuje skutečné osídlení; prostor a životní podpora jsou různé věci. | Koupit, osídlit a dokončit projekty Měsíce, Marsu a Jupiteru. |
| 7. [Sféry](07-kniha-sfery.md) | Pán Stád obestaví Slunce. Materiálové geny a stavitelé zrychlují práci; kosti, kůže a sukno skutečně mizí ve stavbě. | Dokončit a převzít první Dysonovu sféru. |
| 8. [Rozmnožení sfér](08-kniha-rozmnozeni-sfer.md) | Další hvězdy vyžadují i energii prvních sfér. Laser zrychluje stavbu s klesajícím přínosem. | Dokončit celkem pět sfér. |
| 9. [Soudců](09-kniha-soudcu.md) | Výpočetní, textilní a materiálovou práci poskytují tři různé osídlené světy. Soudci mohou automaticky přepínat cíle šlechtění; přísnost volí hráč. | Dokončit společný koordinační projekt. |
| 10. [Černé díry](10-kniha-cerne-diry.md) | Ten, Jenž Střihá, posílá skutečné suroviny do centrálního skladu. Jeho dopravu nelze koupit za neomezené kredity. | Naplnit sklad a ručně zažehnout reset, nebo při dostatku Vědění zvolit singularitu. |
| 11. [Zjevení](11-kniha-zjeveni.md) | Touha není další měna. Hráč uvidí konec a odemkne Předmluvu. | Zjevení zůstává zobrazené; nový cyklus je samostatná dobrovolná akce. |

## Stádo, svět a práce

Kapacita od Exodu je minimum z nakoupeného prostoru (hustota, půda a modifikátory)
a místní životní podpory přepočtené na velikost ovcí. Větší ovce produkují materiál,
ale potřebují více podpory. Její rozšíření vyžaduje kredity, práci a suroviny.
Kyslík z knih je součástí podpory, nikoli další samostatnou měnou.

Pracoviště plně obsadí 1 000 dospělých ovcí. Další ovce zvyšují dodávky;
propustnost práce zlepšují geny, prostředí, stavitelé a přenesené Vědění.
Měsíc prospívá textilu, Mars výpočtu, Jupiter masu za cenu pomalejší porodnosti.
Soudci odměňují rozdělení rolí, nikoli pouhé přejmenování tří skupin na Zemi.

## Behemot a návraty

[Behemot](behemot/behemot_emporio_lore.md) nabízí tři volitelné nástroje:
inkubátor pro oddělené šlechtění, mlékoturbínu a materiálový rozvaděč.
Platí se surovinami a vlastnictví přežívá reset. Náhodné bedny, vztahové osy,
přetížení a generické bonusy dílna nepoužívá.

Černá díra obnoví stáda a pozemky, ale zachová Vědění, perky, nástroje,
Kroniku a nastavenou automatizaci. Paměť urychluje projekty i energii sfér.
Nová hra dosáhne hranice 160 celoživotního Vědění po pěti resetech; naplnění
skladu v šestém běhu dovolí Zjevení. Neexistuje samostatný podsystém stroje času
ani ukazatel štěstí. Nový cyklus po Zjevení přidá 100 Vědění a nezapočítá falešný
černoděrový reset.

První selekce, elixír, chytré ovce, odchod ze Země, sféry, Soudci, návraty
z černé díry i absurdní počty mají krátké příběhové odměny. Po posledním
hromadění následuje [Předmluva](00-predmluva.md): víc ovcí nikdy nestačilo.
