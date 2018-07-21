from redis

ENV GO_VERSION=1.9 \
    GOROOT=/goroot \
    GOPATH=/gopath 

ENV PATH $PATH:$GOROOT/bin:$GOPATH/bin

RUN apt-get update -y && \

    # Install needed packages
    apt-get install --no-install-recommends -y -q curl build-essential ca-certificates && \

    # Install go
    mkdir /goroot && curl https://storage.googleapis.com/golang/go${GO_VERSION}.linux-amd64.tar.gz | tar xvzf - -C /goroot --strip-components=1 && \
    mkdir /gopath && \

    # remove apt cache from image
    apt-get clean all
    RUN apt-get install -y git
    RUN go get -u github.com/labstack/echo
    RUN go get -u github.com/dgrijalva/jwt-go
    RUN go get -u github.com/go-redis/redis
    RUN go get -u gopkg.in/mgo.v2
    RUN go get -u gopkg.in/Shopify/sarama.v1
    CMD redis-server --daemonize yes && go run /src/matchmaker.go
