"""One-time backfill: recompute v2 quest completion for all existing users.

Useful right after deploying the flexible-quest engine — users who already
satisfy the new requirements (because of their accumulated check-ins / dishes)
should be auto-credited for the quests they've effectively finished.
"""
from __future__ import annotations

import asyncio
import sys
from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402
import repo  # noqa: E402

CITY_ID = "gaziantep"


async def main():
    dry = "--dry-run" in sys.argv
    sb = get_supabase()
    progs = sb.table("progress").select("*").limit(2000).execute().data or []
    print(f"📊 Scanning {len(progs)} progress rows…")

    # Local import to avoid touching server module load order
    from server import _recompute_quest_completion

    awarded_total = 0
    updated_users = 0
    for user in progs:
        completed_before = list(user.get("completed_quests") or [])
        new_ids, xp_added = await _recompute_quest_completion(user, CITY_ID)
        if new_ids:
            updated_users += 1
            awarded_total += xp_added
            print(f"  {user['device_id'][:40]:40s} → +{xp_added} XP · new: {new_ids}")
            if not dry:
                await repo.progress_upsert(user["device_id"], user)
        else:
            # Was the v2 evaluator stricter on a previously-completed legacy quest?
            still = user.get("completed_quests") or []
            if still != completed_before:
                print(f"  ⚠️  {user['device_id']} list changed unexpectedly")

    print(f"\n🎉 Done. {updated_users} users credited · {awarded_total} XP total.")


if __name__ == "__main__":
    asyncio.run(main())
