import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # add backend/ to import path

from server import haversine_m, get_level


def test_haversine_zero():
    assert abs(haversine_m(0, 0, 0, 0)) < 1e-6


def test_haversine_paris_london():
    paris = (48.8566, 2.3522)
    london = (51.5074, -0.1278)
    d = haversine_m(paris[0], paris[1], london[0], london[1])
    # approx ~343 km
    assert 340_000 <= d <= 350_000


def test_get_level_thresholds():
    lvl0 = get_level(0)
    assert lvl0["level"] == 1
    assert lvl0["title"] == "Newcomer"

    lvl150 = get_level(150)
    assert lvl150["level"] == 2

    lvl500 = get_level(500)
    assert lvl500["level"] >= 3

    mid = get_level(275)
    assert 0.0 <= mid["progress"] <= 1.0
