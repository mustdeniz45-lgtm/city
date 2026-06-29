import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # add backend/ to import path

from server import build_seed


def test_build_seed_shape():
    s = build_seed()
    assert isinstance(s, dict)
    assert set(["cities", "pois", "quests"]) <= set(s.keys())
    assert len(s["cities"]) >= 1
    assert len(s["pois"]) >= 1
    assert len(s["quests"]) >= 1

    ids = [c["id"] for c in s["cities"]]
    assert "gaziantep" in ids

    for c in s["cities"]:
        assert "id" in c and "name" in c and "lat" in c and "lng" in c
