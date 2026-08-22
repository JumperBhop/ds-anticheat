# DS Anti-Cheat — Push-/Multiaccount-Erkennung aus öffentlichen Weltdaten

Ein Analyse-Tool für **Die Stämme**, das aus den **offiziellen, öffentlichen** Datei-Exporten einer Welt verdächtige **Push-/Feeder-/Proxy-Muster** herausfiltert — als Hinweisliste zur Prüfung/Meldung an InnoGames.

> **Nur öffentliche Daten.** Es werden ausschließlich die von InnoGames selbst bereitgestellten `map/*.txt`-Dateien genutzt. Keine Server-Interna, keine privaten Daten, kein Eingriff ins Spiel.
>
> **Verdacht, kein Beweis.** Die Ausgabe sind Muster, die geprüft werden sollten — keine endgültige Feststellung.

## Idee

Ein **Proxy** (Futter-Account) adelt seine Dörfer **einseitig an einen Main** ab, ist dabei aber **kampf-inaktiv** (niedrige/keine ODA). Ein **normales Kriegsopfer** verliert zwar auch einseitig Dörfer, hat aber **hohe ODA** (hat gekämpft). Genau daran trennt das Tool **Push** von **Krieg**.

## Genutzte Datenquellen (öffentlich)

- `map/player.txt` — Spieler, Punkte, Stamm
- `map/conquer.txt` — Adelungen (wer, wann, von wem)
- `map/kill_att.txt` — ODA (Angriffs-Aktivität)

## Signale / Score

Ein Feeder→Main-Paar wird als verdächtig gewertet, wenn:
- der Feeder **≥ N Dörfer einseitig** an denselben Main verliert (`MIN_FLOW`, Standard 3),
- **keine/kaum Gegen-Adelungen** existieren (`MAX_REV`, Standard 0),
- der Main **≥ X %** aller Feeder-Verluste bekommt (`CONC`, Standard 75 %),
- und der Feeder **kampf-inaktiv** ist (ODA `< ODA_MULE`, Standard 20 000) → **„Proxy-Verdacht"**.

Paare mit hoher Feeder-ODA werden als **„kriegsähnlich"** markiert (möglicher normaler Krieg) und niedriger gewichtet. Verdächtige Paare werden zu **Clustern** zusammengefasst.

## Nutzung

```bash
node detect.js de256
```

Optionale Schwellen per Umgebungsvariable:
```bash
MIN_FLOW=4 CONC=0.8 ODA_MULE=10000 DAYS=30 node detect.js de256
```
(`DAYS` = nur die letzten N Tage betrachten.)

Ausgabe in `reports/`:
- `report-<welt>-<datum>.html` — lesbarer Bericht (zum Weitergeben)
- `report-<welt>-<datum>.json` — maschinenlesbar
- `snapshots/player-<welt>-<datum>.txt` — Tages-Snapshot (für spätere Wachstumsanalyse)

## Cross-Welt-Erkennung (stärkstes Signal)

Spieler-IDs sind **welt-übergreifend gleich** (globale Accounts). Tritt dieselbe Main←Feeder-Beziehung in **mehreren Welten** auf, ist Zufall praktisch ausgeschlossen = klares Pushing.

```bash
node crossworld.js de250 de251 de252 de253 de254 de255 de256 de257
```
Ohne Argumente wird ein Standardbereich gescannt. Erzeugt eine **professionelle Beweis-Website** unter `site/`:
- `site/index.html` — Übersicht, gepushte Mains, Cross-Welt-Beziehungen, Filter
- `site/methodik.html` — Methodik, Datenquellen, Grenzen
- `site/data.json` — maschinenlesbar

> **Nicht öffentlich posten.** Die Website enthält echte Spielernamen auf Verdachtsbasis. Sie ist zum **direkten Weitergeben an InnoGames** gedacht — nicht zum öffentlichen Anprangern (Persönlichkeitsrecht/üble Nachrede). Deshalb ist `site/` bewusst aus dem Repo ausgeschlossen.

## Grenzen (ehrlich)

- **Verdacht ≠ Beweis.** Stamm-interne Umstrukturierung oder Account-Übergaben können ähnlich aussehen.
- Die IP-/Geräte-/Zahlungs-Ebene (das, was Multiaccounts wirklich beweist) ist **nur InnoGames** zugänglich. Dieses Tool liefert die **öffentlich sichtbare** Vorstufe: „Wo lohnt sich ein genauer Blick?".
- Regelmäßig laufen lassen (die Snapshots ermöglichen später Wachstums-/Zeitanalysen als zusätzliches Signal).

## Für InnoGames

Der HTML-Report kann direkt an den Support/das Anti-Cheat-Team weitergegeben werden. Er priorisiert nach Score, damit die auffälligsten Fälle zuerst geprüft werden können.
