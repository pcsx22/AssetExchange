# AssetExchange
A hobby project for building realtime application with microservice architecture. The objective of the application is to make asset exchange platoform like like coinbase,koinex but it's far from being a fully fledged application. Talking about technologies used, Redis is used as in-memory database, kafka as message passing broker, Mongo as persistent database, backend services are mostly written in GO and web layer is written in nodeJS which is actually a contrived github project which I reused.

# Setup
1. Start kafka container with docker-compose, there's a kafka.yaml file available
2. Run docker-compose.yaml
3. Start the web layer by running npn install inside web directory

All these steps can be automated and deployed with kubernetes to add fault tolerant property but the problem is that I'm lazy :)
