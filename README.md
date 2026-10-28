# cricker

Matchups and analytics for Test cricket. The Match Centre replays a Test ball
by ball and, at every delivery, shows the score, the batter v bowler contest
with its history and how much evidence is behind it, how the innings compares
with past innings at the ground, and the full scorecard, all as they stood at
that moment. Built from [Cricsheet](https://cricsheet.org) ball-by-ball data.

- [docs/DATA.md](docs/DATA.md): sources, identity, and the definition of every statistic
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it fits together and how to extend it

## Run the Match Centre

The five Tests of India's 2024/25 tour of Australia are bundled, so this needs
nothing else:

```sh
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # stat definitions, replay correctness, SQL v replay crosscheck
npm run build      # static site in web/dist
```

Keyboard: ← → ball, Shift+← → over, [ ] previous/next wicket, Space play.

## Build data

```sh
pip install -e '.[dev]'
pytest

mkdir -p data/raw
curl -Lo data/raw/tests_json.zip https://cricsheet.org/downloads/tests_json.zip
unzip -q data/raw/tests_json.zip -d data/raw/tests
curl -Lo data/raw/names.csv https://cricsheet.org/register/names.csv
cricker-ingest data/raw/tests data/cricker.duckdb --names data/raw/names.csv

# A match bundle for the web app (also updates web/public/data/index.json)
cricker-bundle data/cricker.duckdb data/raw/tests 1426557 web/public/data/1426557.json \
  --annotations annotations/1426557.json
```

Re-running `cricker-ingest` only adds matches that aren't loaded yet. After a
schema change, delete the DuckDB file and ingest again.

## Head-to-head from the command line

```sh
cricker-matchup data/cricker.duckdb "TM Head" "JJ Bumrah"
```

Players are looked up by Cricsheet name or registry id. Balls faced exclude
wides; dismissals count only those credited to the bowler.

Cricsheet data is licensed under the
[Open Data Commons Attribution License](https://cricsheet.org/register/).
