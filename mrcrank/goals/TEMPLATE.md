# Issue #<ČÍSLO> — <krátký titulek>

issue: <ČÍSLO>

## Kontext

<Proč tohle issue existuje, odkaz na diskuzi/PR, co je špatně dnes.>

## Cíl

- <Lidsky, odrážkami: co má po splnění platit.>
- <Pozoruj hranice: co se NEmá změnit / co je mimo rozsah.>

## Akceptační testy

<Strojový kontrakt. Každý check je `run`, nebo `file` + `must_match` /
`must_not_match`. Regexy píš s jednoduchými backslashi. Cíl je splněn, jen
když projdou všechny. Spuštění: `node mrcrank/goal.mjs <ČÍSLO>`.>

```yaml acceptance
- name: celá testovací sada je zelená
  run: npm test
- name: <invariant>
  file: <cesta>
  must_match: "<regex zdroj>"
- name: <zákaz vzoru>
  file: <cesta>
  must_not_match: "<regex zdroj>"
```

## Poznámky pro příště

<Co ses naučil, na co si dát pozor, nečekané pasti — pro budoucí běhy.>
