"""Tests for the Kültür Yolu Champion quest (q-gaz-111) after the 53-POI fix."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-explorer-game.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def quest(api):
    r = api.get(f"{BASE_URL}/api/quests/q-gaz-111", timeout=30)
    assert r.status_code == 200, f"quest fetch failed: {r.status_code} {r.text[:200]}"
    return r.json()


class TestQuestDefinition:
    def test_title(self, quest):
        assert quest.get("title") == "Kültür Yolu Champion", f"got title={quest.get('title')}"

    def test_requirements_shape(self, quest):
        reqs = (quest.get("trivia") or {}).get("requirements") or quest.get("requirements") or {}
        # Support both flattened or under trivia
        if not reqs:
            reqs = quest.get("requirements", {})
        assert reqs, f"no requirements found in quest: keys={list(quest.keys())}"
        groups = reqs.get("category_groups") or []
        assert len(groups) == 1, f"expected exactly 1 category_group, got {len(groups)}: {groups}"
        g = groups[0]
        assert g.get("key") == "ky53", f"expected key=ky53, got {g.get('key')}"
        assert g.get("need") == 53, f"expected need=53, got {g.get('need')}"
        from_ids = g.get("from_ids") or []
        assert len(from_ids) == 53, f"expected from_ids length 53, got {len(from_ids)}"
        # All ids should start with poi-gaz-0 (ky_seq 1..53 -> zero-padded)
        bad = [i for i in from_ids if not i.startswith("poi-gaz-0")]
        assert not bad, f"unexpected ids not starting with poi-gaz-0: {bad}"
        forbidden = {
            "poi-gaz-054-zeugma-mosaic-museum",
            "poi-gaz-083-yesemek-open-air-museum",
            "poi-gaz-105-sahinbey-millet-mosque",
        }
        overlap = forbidden.intersection(set(from_ids))
        assert not overlap, f"quest still contains forbidden ky_seq>53 ids: {overlap}"

    def test_ky_visit_all_absent(self, quest):
        reqs = (quest.get("trivia") or {}).get("requirements") or quest.get("requirements") or {}
        if not reqs:
            reqs = quest.get("requirements", {})
        val = reqs.get("ky_visit_all")
        assert val in (None, False), f"ky_visit_all should be absent or false, got {val}"


class TestQuestProgressZero:
    @pytest.fixture(scope="class")
    def progress(self, api):
        r = api.get(f"{BASE_URL}/api/quests/q-gaz-111/progress", params={"device_id": "demo"}, timeout=30)
        assert r.status_code == 200, f"progress fetch failed: {r.status_code} {r.text[:200]}"
        return r.json()

    def test_progress_single_entry(self, progress):
        arr = progress.get("progress") or []
        assert len(arr) == 1, f"expected 1 progress entry, got {len(arr)}: {arr}"

    def test_progress_entry_shape(self, progress):
        entry = progress["progress"][0]
        assert entry.get("label") == "Kültür Yolu places", f"label={entry.get('label')}"
        assert entry.get("current") == 0, f"current={entry.get('current')}"
        assert entry.get("need") == 53, f"need={entry.get('need')}"
        cands = entry.get("candidates") or []
        assert len(cands) == 53, f"expected 53 candidates, got {len(cands)}"

    def test_candidates_are_canonical(self, progress):
        entry = progress["progress"][0]
        cands = entry.get("candidates") or []
        # candidates might be list of ids or list of dicts
        ids = []
        for c in cands:
            if isinstance(c, str):
                ids.append(c)
            elif isinstance(c, dict):
                ids.append(c.get("id") or c.get("poi_id"))
        bad = [i for i in ids if i and not i.startswith("poi-gaz-0")]
        assert not bad, f"non-canonical candidate ids: {bad}"


class TestQuestProgressRealDevice:
    def test_current_capped(self, api):
        r = api.get(
            f"{BASE_URL}/api/quests/q-gaz-111/progress",
            params={"device_id": "dev_1781112987199_80ro378w"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        arr = data.get("progress") or []
        assert arr, "no progress array"
        entry = arr[0]
        current = entry.get("current")
        assert isinstance(current, int), f"current not int: {current!r}"
        assert current <= 53, f"current should be <= 53, got {current}"
