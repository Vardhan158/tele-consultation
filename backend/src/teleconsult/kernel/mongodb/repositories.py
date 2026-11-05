"""Typed repository accessors; no application route imports these yet."""
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.kernel.mongodb.repository import MongoRepository


def users() -> MongoRepository:
    return MongoRepository(mongo_database.database()["users"])


def patients() -> MongoRepository:
    return MongoRepository(mongo_database.database()["patients"])


def doctors() -> MongoRepository:
    return MongoRepository(mongo_database.database()["doctors"])


def appointments() -> MongoRepository:
    return MongoRepository(mongo_database.database()["appointments"])


def consultation_sessions() -> MongoRepository:
    return MongoRepository(mongo_database.database()["consultation_sessions"])
