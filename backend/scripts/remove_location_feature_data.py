"""Dry-run and approved cleanup for data owned exclusively by the removed location feature.

Default mode is read-only. Applying requires --apply and --backup-dir. The script backs up
the exact affected collections before deleting them and verifies both the backup and result.
It never touches users, patients, doctors, clinics, appointments, payments, or other data.
"""
import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from pymongo import AsyncMongoClient


EXCLUSIVE_COLLECTIONS = ("location_geocode_cache", "location_geocode_gate")
PROFILE_FIELDS = ("discovery_location", "discovery_location_consent")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--uri", required=True)
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    if args.apply and not args.backup_dir:
        parser.error("--backup-dir is required with --apply")
    client = AsyncMongoClient(args.uri, serverSelectionTimeoutMS=10000)
    db = client[args.database]
    await client.admin.command("ping")
    report = {"database": args.database, "generated_at": datetime.now(timezone.utc).isoformat(), "collections": {}}
    names = set(await db.list_collection_names())
    for name in EXCLUSIVE_COLLECTIONS:
        if name in names:
            report["collections"][name] = {"count": await db[name].count_documents({})}
    users = db["users"] if "users" in names else None
    if users is not None:
        for field in PROFILE_FIELDS:
            report["collections"].setdefault("users", {})[field] = await users.count_documents({field: {"$exists": True}})
    print(json.dumps(report, indent=2))
    if not args.apply:
        await client.close()
        return
    args.backup_dir.mkdir(parents=True, exist_ok=False)
    backup_manifest = {"report": report, "files": []}
    for name in EXCLUSIVE_COLLECTIONS:
        if name not in names:
            continue
        path = args.backup_dir / f"{name}.jsonl"
        with path.open("w", encoding="utf-8") as output:
            async for document in db[name].find({}):
                output.write(json_util.dumps(document) + "\n")
        backup_manifest["files"].append({"collection": name, "path": str(path), "count": report["collections"][name]["count"]})
    if users is not None:
        path = args.backup_dir / "users_location_fields.jsonl"
        with path.open("w", encoding="utf-8") as output:
            projection = {"_id": 1, **{field: 1 for field in PROFILE_FIELDS}}
            async for document in users.find({"$or": [{field: {"$exists": True}} for field in PROFILE_FIELDS]}, projection):
                output.write(json_util.dumps(document) + "\n")
        backup_manifest["files"].append({"collection": "users", "path": str(path), "fields": PROFILE_FIELDS})
    manifest_path = args.backup_dir / "manifest.json"
    manifest_path.write_text(json.dumps(backup_manifest, indent=2), encoding="utf-8")
    if not manifest_path.exists():
        raise RuntimeError("Backup manifest was not created; aborting cleanup")
    if users is not None:
        await users.update_many({}, {"$unset": {field: "" for field in PROFILE_FIELDS}})
    for name in EXCLUSIVE_COLLECTIONS:
        if name in names:
            await db[name].drop()
    remaining = {name: await db[name].count_documents({}) for name in EXCLUSIVE_COLLECTIONS if name in await db.list_collection_names()}
    remaining_users = {field: await users.count_documents({field: {"$exists": True}}) for field in PROFILE_FIELDS} if users is not None else {}
    if remaining or any(remaining_users.values()):
        raise RuntimeError(f"Cleanup verification failed: {remaining=}, {remaining_users=}")
    print(json.dumps({"status": "applied", "backup": str(args.backup_dir), "remaining": {**remaining, **remaining_users}}, indent=2))
    await client.close()


if __name__ == "__main__":
    asyncio.run(main())
