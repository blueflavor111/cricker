# cricker

Matchups and analytics for live cricket. Starting with Test cricket: batter vs
bowler head-to-heads built from [Cricsheet](https://cricsheet.org) ball-by-ball data.

## Setup

```sh
pip install -e '.[dev]'
pytest
```

## Load Cricsheet data

```sh
mkdir -p data/raw
curl -Lo data/raw/tests_json.zip https://cricsheet.org/downloads/tests_json.zip
unzip -q data/raw/tests_json.zip -d data/raw/tests
cricker-ingest data/raw/tests data/cricker.duckdb
```

Re-running `cricker-ingest` only adds matches that aren't loaded yet.

## Head-to-head

```sh
cricker-matchup data/cricker.duckdb "TM Head" "JJ Bumrah"
```

Players are looked up by Cricsheet name or registry id. Balls faced exclude
wides; dismissals count only those credited to the bowler.

Cricsheet data is licensed under the
[Open Data Commons Attribution License](https://cricsheet.org/register/).
