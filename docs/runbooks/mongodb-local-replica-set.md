# Local MongoDB replica set

The application does not modify MongoDB infrastructure automatically.

For local transaction testing, run a single-node replica set:

docker run --name kaizentrix-mongodb-rs -p 27017:27017 -d mongo:8 mongod --replSet rs0 --bind_ip_all
docker exec kaizentrix-mongodb-rs mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"

Use a development-only URI with the replica-set name:

MONGODB_ENABLED=true
MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0
MONGODB_DATABASE=kaizentrix_care_dev

The foundation endpoint /health/mongodb/transactions executes an insert/delete
inside a transaction and reports whether the deployment actually supports it.
It is disabled when MONGODB_ENABLED is false.
