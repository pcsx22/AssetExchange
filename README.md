# AssetExchange
A hobby project for building realtime application with microservice architecture. Redis is used as in-memory database, kafka as message passing broker, services are mostly written in GO and web layer is written in nodejs which is actually a contrived github project.

# Setup
1. Start kafka container with docker-compose, there's a kafka.yaml file available
2. Run docker-compose.yaml
3. Start the web layer by running npn install inside web directory

All these steps can be automated and deployed with kubernetes to add fault tolerant property but the problem is that I'm lazy :)
