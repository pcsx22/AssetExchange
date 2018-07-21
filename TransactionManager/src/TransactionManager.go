package main

import (
	"os"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
	"net/http"
	"io/ioutil"
	"encoding/json"
	"gopkg.in/mgo.v2"
	"github.com/labstack/gommon/log"
	"gopkg.in/Shopify/sarama.v1"
	"time"
	"fmt"
)

const(
	CHANNEL_LENGTH= 4
)

type Order struct {
	OrderID       string `json:"order_id"`
	OrderQuantity string `json:"order_quantity"`
	MatchedID     string `json:"matched_id"`
	UserID        string `json:"user_id"`
	OrderPrice    float64 `json:"order_price"`
	OrderType     string `json:"order_type"`
	AssetType     string `json:"asset_type"`
}

func initMongo() *mgo.Session {
	log.Print(os.Getenv("DB_ENDPOINT"), " - ", os.Getenv("DB_CREDENTIAL"))
	mongoUrl := "mongodb://" + os.Getenv("DB_CREDENTIAL") + "@" + os.Getenv("DB_ENDPOINT")
	session, err := mgo.Dial(mongoUrl)
	if err != nil{
		panic(err)
	}
	session.SetMode(mgo.Monotonic, true)
	return session
}

func main(){
	hostPort := ":" + os.Getenv("TM_PORT")
	broker := os.Getenv("KAFKA_ENDPOINT")
	log.Print("BROKER: ", broker)
	producerClient, err := newProducer(broker)
	topicTest := "HelloWorld"
	defer producerClient.Close()
	if err != nil {
		panic(err)
	}
	consumerClient, err := newConsumer(broker)
	defer consumerClient.Close()
	if err != nil {
		panic(err)
	}
	log.Print("Prod Client: ", producerClient,"\n Consumer Client: ", consumerClient)
	go messageProducerTest(producerClient, topicTest)
	subscribeTest(consumerClient, topicTest)
	server := echo.New()
	server.Debug = true
	server.Use(middleware.Logger())
	server.Use(middleware.Recover())
	server.Use(middleware.CORS())
	mongoClient := initMongo()
	defer mongoClient.Close()
	coll := mongoClient.DB("test").C("ValidatedOrders")
	server.POST("/transaction/save", func(c echo.Context) error{
		jsonRequest, err := ioutil.ReadAll(c.Request().Body)
		if err != nil {
			panic(err)
			return c.String(500,"Invalid Request")
		}
		var body []map[string]map[string]interface{}
		if err := json.Unmarshal(jsonRequest, &body); err != nil {
			panic(err)
			return c.String(500,"Invalid json format")
		}
		for _,obj := range body {
			for _,order := range obj {
				orderObj := &Order{OrderID:order["order_id"].(string), OrderQuantity:order["order_quantity"].(string),
					MatchedID: order["matched_id"].(string), UserID: order["user_id"].(string) }
				log.Print("Order: ", order)
				err = coll.Insert(&orderObj)
				if err != nil {
					panic(err)
				}
				log.Print("Inserted Successfully")
			}
		}

		return c.String(http.StatusOK,"TM: Order Received\n")
	})

	server.Logger.Fatal(server.Start(hostPort))
}

func newProducer(broker string) (sarama.AsyncProducer, error) {
	config := sarama.NewConfig()
	config.Producer.Partitioner = sarama.NewRandomPartitioner
	config.Producer.Return.Successes = true
	producer, err := sarama.NewAsyncProducer([]string{broker}, config)
	return producer, err
}

func newConsumer(broker string) (sarama.Consumer, error) {
	config := sarama.NewConfig()
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Consumer.Return.Errors = true
	consumer, err := sarama.NewConsumer([]string{broker}, config)
	return consumer, err
}

func messageProducerTest(producerClient sarama.AsyncProducer, topic string) {
	for {

		time.Sleep(5000 * time.Millisecond)

		msg := &sarama.ProducerMessage{
			Topic: topic,
			Partition: -1,
			Value: sarama.StringEncoder("Something Cool"),
		}
		select {
		case producerClient.Input() <- msg:
			fmt.Println("Produce message", msg)
		case err := <-producerClient.Errors():
			fmt.Println("Failed to produce message:", err)
		}
	}
}

func subscribeTest(consumer sarama.Consumer, topic string) {
	partitionList, err := consumer.Partitions(topic) //get all partitions on the given topic
	if err != nil {
		fmt.Println("Error retrieving partitionList ", err)
	}
	initialOffset := sarama.OffsetOldest //get offset for the oldest message on the topic

	for _, partition := range partitionList {
		pc, _ := consumer.ConsumePartition(topic, partition, initialOffset)

		go func(pc sarama.PartitionConsumer) {
			for {
				time.Sleep(3000 * time.Millisecond)
				for message := range pc.Messages() {
					log.Print("Message Received: ", string(message.Value[:]))
				}
				if err := pc.Errors(); err != nil {
					panic(err)
				}
			}
		}(pc)
	}
}