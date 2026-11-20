import asyncio

from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.admin.support_dashboard_routes import (
    preserve_ticket_sla_deadline,
    ticket_sla_info,
)


async def main() -> None:
    await mongo_database.connect()
    db = mongo_database.database()
    ticket = await db["support_tickets"].find_one({"id": "SUP-950477"})
    if not ticket:
        print({"ticket": "SUP-950477", "found": False})
    else:
        await preserve_ticket_sla_deadline(db, ticket)
        sla = ticket_sla_info(ticket)
        print({
            "ticket": ticket["id"],
            "status": ticket.get("status"),
            "created_at": ticket.get("created_at"),
            "resolved_at": ticket.get("resolved_at"),
            "sla_due_at": ticket.get("sla_due_at"),
            "sla_status": sla["status"],
            "hours_target": sla["hours_target"],
        })
    await mongo_database.close()


if __name__ == "__main__":
    asyncio.run(main())
