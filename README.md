# Incremental Sheep

Inkrementální/idle hra o množení a šlechtění ovcí. Běží **celá v prohlížeči** —
žádný backend, žádná databáze. Postup se ukládá do `localStorage` a dá se
exportovat/importovat jako textový string.

## Hratelnost (v1 — MVP)

- Koupíš první pár (1 samec + 1 samice). Ovce se samy množí.
- Každá ovce má **geny** (plodnost, délka života, rychlost a kvalita vlny,
  velikost, délka březosti, poměry životních fází). Potomek = **průměr rodičů +
  mutace**, která může překročit oba rodiče → **šlechtěním** (výběrem, kdo se
  množí a koho pošleš na porážku) tlačíš geny nahoru.
- Životní cyklus: **dítě → dospělec → starý → smrt stářím**. Vlnu dávají dospělí
  (víc) i staří (míň). **Maso** je jen z porážky (smrt stářím maso nedá).
- Vlna i maso se automaticky prodávají za **kredity**. Za ně kupuješ další ovce,
  vylepšení (nůžky, námluvy, obchod, beran), **rozšíření ohrádky** (strop populace)
  a odemykáš pravidla **auto-porážky**.
- Samec (čtvereček) / samice (kolečko) v 2D ohrádce, která roste s kapacitou.
- Při obrovském stádu hra přepne na **populační režim** (statistické kohorty,
  ohrádka = heatmapa), aby běžela i v galaktických číslech.

Porážet ručně: zaškrtni „Klikni na ovci pro porážku" a klikni na ovci.

## Spuštění lokálně

```bash
python3 -m http.server 8080
# otevři http://localhost:8080
```

## Nasazení v sinuhetcloud

Repo obsahuje `sinuhetcloud.conf` — manager appku najde scanem, naklonuje na
runner a spustí jako statický web (`python3 -m http.server ${PORT}`), stejně jako
`relativistic-biliard`. Vystaví ji na `incremental-sheep.sinuhetcloud.coitus.cz`.

## Struktura

- `index.html`, `styles.css` — UI kostra
- `src/config.js` — laditelné konstanty (geny, ceny, sazby, strop populace)
- `src/genetics.js` — geny, dědičnost (průměr + mutace)
- `src/sheep.js` — model jednotlivce, životní fáze
- `src/simulation.js` — herní tick (stárnutí, množení, vlna, smrt, porážka)
- `src/population.js` — agregátní populační model (overflow nad strop)
- `src/economy.js` — ceny, vylepšení, kapacita
- `src/render.js` — Canvas (ohrádka, kolečka/čtverečky, heatmapa)
- `src/ui.js` — HUD a ovládací panel
- `src/save.js` — export/import string, localStorage, offline progress
- `src/format.js` — formátování velkých čísel
- `src/main.js` — bootstrap a herní smyčka
